use axum::{extract::Query, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{Index, IndexReader, TantivyDocument};
use tower_http::cors::{Any, CorsLayer};

// ── Request / Response types ──

#[derive(Deserialize)]
struct SearchParams {
    q: String,
    #[serde(default = "default_page")]
    page: usize,
    #[serde(default = "default_page_size")]
    page_size: usize,
}

fn default_page() -> usize { 1 }
fn default_page_size() -> usize { 10 }

#[derive(Serialize, Clone)]
struct SearchResult {
    title: String,
    url: String,
    excerpt: String,
    rrf_score: f64,
    qdrant_score: f64,
    tantivy_score: f64,
}

#[derive(Serialize)]
struct SearchResponse {
    results: Vec<SearchResult>,
    total: usize,
    page: usize,
    page_size: usize,
    total_pages: usize,
    query: String,
}

// ── Qdrant REST response shapes ──

#[derive(Deserialize)]
struct QdrantResponse {
    result: Vec<QdrantHit>,
}

#[derive(Deserialize)]
struct QdrantHit {
    score: f64,
    payload: Option<HashMap<String, serde_json::Value>>,
}

// ── Embedding service response ──

#[derive(Deserialize)]
struct EmbedResponse {
    vector: Vec<f64>,
}

// ── App state (shared across requests) ──

struct AppState {
    reader: IndexReader,
    schema: Schema,
    title_field: Field,
    body_field: Field,
    url_field: Field,
    excerpt_field: Field,
    embedding_url: String,
    qdrant_url: String,
    collection: String,
    http: reqwest::Client,
}

// ── Main ──

#[tokio::main]
async fn main() {
    let index_path = std::env::var("TANTIVY_PATH")
        .unwrap_or_else(|_| "../tantivy_index".to_string());

    println!("Opening Tantivy index: {}", index_path);

    let index = Index::open_in_dir(&index_path).expect("Failed to open Tantivy index");
    let schema = index.schema();
    let reader = index.reader().expect("Failed to create reader");
    reader.reload().expect("Failed to reload searcher");

    let title_field = schema.get_field("title").unwrap();
    let body_field = schema.get_field("body").unwrap();
    let url_field = schema.get_field("url").unwrap();
    let excerpt_field = schema.get_field("excerpt").unwrap();

    let state = Arc::new(AppState {
        reader,
        schema,
        title_field,
        body_field,
        url_field,
        excerpt_field,
        embedding_url: std::env::var("EMBEDDING_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8000".to_string()),
        qdrant_url: std::env::var("QDRANT_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:6333".to_string()),
        collection: std::env::var("QDRANT_COLLECTION")
            .unwrap_or_else(|_| "anime_pages".to_string()),
        http: reqwest::Client::new(),
    });

    let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any);

    let app = Router::new()
        .route("/search", get(search_handler))
        .layer(cors)
        .with_state(state);

    let addr = "0.0.0.0:8080";
    println!("API listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// ── Search handler ──

const MAX_FETCH: usize = 50; // how many results to fetch internally for pagination

#[axum::debug_handler]
async fn search_handler(
    Query(params): Query<SearchParams>,
    state: axum::extract::State<Arc<AppState>>,
) -> impl IntoResponse {
    let query_str = params.q.trim().to_string();
    let page = params.page.max(1);
    let page_size = params.page_size.min(50).max(1);

    if query_str.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(SearchResponse {
                results: vec![],
                total: 0,
                page,
                page_size,
                total_pages: 0,
                query: query_str,
            }),
        );
    }

    // Step 1: Embed the query via Python microservice
    let query_vector = match embed_query(&state, &query_str).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[WARN] Embedding failed: {}", e);
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(SearchResponse {
                    results: vec![],
                    total: 0,
                    page,
                    page_size,
                    total_pages: 0,
                    query: query_str,
                }),
            );
        }
    };

    // Step 2: Search Qdrant (fetch enough for pagination)
    let qdrant_hits = match search_qdrant(&state, &query_vector, MAX_FETCH).await {
        Ok(h) => h,
        Err(e) => {
            eprintln!("[WARN] Qdrant search failed: {}", e);
            vec![]
        }
    };

    // Step 3: Search Tantivy (fetch enough for pagination)
    let tantivy_hits = search_tantivy(&state, &query_str, MAX_FETCH);

    // Step 4: RRF fusion of all results
    let fused = fuse_results(&qdrant_hits, &tantivy_hits, 60, MAX_FETCH);

    let total = fused.len();
    let total_pages = total.div_ceil(page_size).min(5);

    // Step 5: Slice for the requested page
    let start = (page - 1) * page_size;
    let end = start + page_size;
    let page_results: Vec<SearchResult> = fused
        .into_iter()
        .skip(start)
        .take(page_size)
        .collect();

    (
        StatusCode::OK,
        Json(SearchResponse {
            results: page_results,
            total,
            page,
            page_size,
            total_pages,
            query: query_str,
        }),
    )
}

// ── Embedding ──

async fn embed_query(state: &AppState, text: &str) -> Result<Vec<f64>, String> {
    let resp = state
        .http
        .post(format!("{}/embed", state.embedding_url))
        .json(&serde_json::json!({"text": text}))
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    let body: EmbedResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(body.vector)
}

// ── Qdrant search ──

async fn search_qdrant(
    state: &AppState,
    vector: &[f64],
    limit: usize,
) -> Result<Vec<(String, String, String, f64)>, String> {
    let url = format!(
        "{}/collections/{}/points/search",
        state.qdrant_url, state.collection
    );

    let resp = state
        .http
        .post(&url)
        .json(&serde_json::json!({
            "vector": vector,
            "limit": limit,
            "with_payload": true
        }))
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    let body: QdrantResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let mut results = Vec::new();
    for hit in body.result {
        let payload = hit.payload.unwrap_or_default();
        let title = payload
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("(unknown)")
            .to_string();
        let url = payload
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let excerpt = payload
            .get("excerpt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        results.push((title, url, excerpt, hit.score));
    }

    Ok(results)
}

// ── Tantivy search ──

fn search_tantivy(
    state: &AppState,
    query_str: &str,
    limit: usize,
) -> Vec<(String, String, String, f64)> {
    let searcher = state.reader.searcher();
    let query_parser = QueryParser::for_index(
        &searcher.index(),
        vec![state.title_field, state.body_field],
    );

    let query = match query_parser.parse_query(query_str) {
        Ok(q) => q,
        Err(_) => return vec![],
    };

    let top_docs = match searcher.search(&query, &TopDocs::with_limit(limit).order_by_score()) {
        Ok(d) => d,
        Err(_) => return vec![],
    };

    let mut results = Vec::new();
    for (score, doc_address) in top_docs {
        if let Ok(doc) = searcher.doc::<TantivyDocument>(doc_address) {
            let title = doc
                .get_first(state.title_field)
                .and_then(|v| v.as_str())
                .unwrap_or("(unknown)")
                .to_string();
            let url = doc
                .get_first(state.url_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let excerpt = doc
                .get_first(state.excerpt_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            // FIXED: Cast tantivy f32 score to f64 to avoid type mismatches
            results.push((title, url, excerpt, score as f64));
        }
    }

    results
}

// ── RRF Fusion ──

fn fuse_results(
    qdrant: &[(String, String, String, f64)],
    tantivy: &[(String, String, String, f64)],
    k: usize,
    limit: usize,
) -> Vec<SearchResult> {
    let k = k as f64;
    // Map tracking: URL -> (rrf_score, title, url, excerpt, qdrant_score, tantivy_score)
    let mut scores: HashMap<String, (f64, String, String, String, f64, f64)> = HashMap::new();

    // Qdrant ranks
    for (rank, (title, url, excerpt, score)) in qdrant.iter().enumerate() {
        let rrf = 1.0 / (k + (rank + 1) as f64);
        scores.insert(
            url.clone(),
            (rrf, title.clone(), url.clone(), excerpt.clone(), *score, 0.0),
        );
    }

    // Tantivy ranks — merge
    for (rank, (title, url, excerpt, score)) in tantivy.iter().enumerate() {
        let rrf_add = 1.0 / (k + (rank + 1) as f64);
        let entry = scores.entry(url.clone()).or_insert_with(|| {
            (0.0, title.clone(), url.clone(), excerpt.clone(), 0.0, 0.0)
        });
        
        entry.0 += rrf_add;       // Accumulate total Reciprocal Rank Fusion score
        entry.5 = *score;         // Keep the baseline tantivy score
    }

    // Convert hashmap values into vector elements
    let mut merged: Vec<SearchResult> = scores
        .into_values()
        .map(|(rrf_score, title, url, excerpt, qdrant_score, tantivy_score)| SearchResult {
            title,
            url,
            excerpt,
            rrf_score,
            qdrant_score,
            tantivy_score,
        })
        .collect();

    // Sort descending by RRF score
    merged.sort_by(|a, b| b.rrf_score.partial_cmp(&a.rrf_score).unwrap_or(std::cmp::Ordering::Equal));

    // Truncate to matching requested bounds
    merged.truncate(limit);
    merged
}
