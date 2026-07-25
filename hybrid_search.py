import sys
from pathlib import Path

import tantivy
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer


QDRANT_URL = "http://localhost:6333"
QDRANT_COLLECTION = "anime_pages"
TANTIVY_PATH = Path(__file__).parent / "tantivy_index"
MODEL_NAME = "all-MiniLM-L6-v2"
TOP_K = 10
RRF_K = 60  # Standard RRF constant


schema_builder = tantivy.SchemaBuilder()
schema_builder.add_integer_field("doc_id", stored=True, indexed=True)
schema_builder.add_text_field("title", stored=True)
schema_builder.add_text_field("body", stored=True)
schema_builder.add_text_field("url", stored=True, tokenizer_name="raw")
schema_builder.add_text_field("excerpt", stored=True, tokenizer_name="raw")
schema = schema_builder.build()


# --- Load Tantivy index (existing, not creating) ---
tantivy_index = tantivy.Index(schema, path=str(TANTIVY_PATH))
tantivy_searcher = tantivy_index.searcher()

# --- Load embedding model ---
model = SentenceTransformer(MODEL_NAME)

# --- Connect to Qdrant ---
qdrant = QdrantClient(url=QDRANT_URL)

# --- Query ---
query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else input("Query: ")
print(f"\nQuery: \"{query}\"\n")

# =============================================
# 1. QDRANT SEARCH (semantic)
# =============================================
query_vector = model.encode(query).tolist()
qdrant_results = qdrant.query_points(
    collection_name=QDRANT_COLLECTION,
    query=query_vector,
    limit=TOP_K,
)
response = qdrant_results.points;
print("=== Qdrant (semantic) ===")
for i, hit in enumerate(response, 1):
    p = hit.payload
    print(f"  {i:>2}. [{hit.score:.3f}] {p['title']}")

# =============================================
# 2. TANTIVY SEARCH (keyword / BM25)
# =============================================
"""
Tantivy's parse_query runs the query string through its query parser.
Fields=["title", "body"] means it searches both fields.
By default, multiple terms are OR-ed, which is what we want.
"""
tantivy_query = tantivy_index.parse_query(query, ["title", "body"])
tantivy_results = tantivy_searcher.search(tantivy_query, limit=TOP_K)

print("\n=== Tantivy (keyword BM25) ===")
# Store tantivy results in a dict keyed by URL for later RRF
tantivy_by_url = {}
for i, (score, doc_address) in enumerate(tantivy_results.hits, 1):
    doc = tantivy_searcher.doc(doc_address)
    title = doc["title"][0]
    url = doc["url"][0]
    tantivy_by_url[url] = {"title": title, "rank": i}
    print(f"  {i:>2}. [BM25={score:.2f}] {title}")

# =============================================
# 3. RRF FUSION
# =============================================
"""
RRF formula: for each document, score = sum of 1/(k + rank_in_system)
over all search systems. If a document doesn't appear in a system,
it contributes 0 for that system.
"""
rrf_scores = {}  # url -> (score, title)

# Add Qdrant ranks
for rank, hit in enumerate(response, 1):
    url = hit.payload["url"]
    title = hit.payload["title"]
    score = 1.0 / (RRF_K + rank)
    rrf_scores[url] = {"score": score, "title": title}

# Add Tantivy ranks (or merge if already present)
for url, data in tantivy_by_url.items():
    q_rank = None
    for rank, hit in enumerate(response, 1):
        if hit.payload["url"] == url:
            q_rank = rank
            break
    tantivy_rank = data["rank"]

    # Start fresh RRF for this URL: Qdrant contribution + Tantivy contribution
    rrf = 0.0
    if q_rank:
        rrf += 1.0 / (RRF_K + q_rank)
    rrf += 1.0 / (RRF_K + tantivy_rank)

    rrf_scores[url] = {"score": rrf, "title": data["title"]}

# Sort by RRF score descending
fused = sorted(rrf_scores.items(), key=lambda x: -x[1]["score"])

print("\n=== Hybrid (RRF fused) ===")
for rank, (url, data) in enumerate(fused[:TOP_K], 1):
    print(f"  {rank:>2}. [RRF={data['score']:.4f}] {data['title']}")