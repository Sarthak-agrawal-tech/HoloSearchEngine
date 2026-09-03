# 🦊 Holo Anime Search Engine

Holo is a blazingly fast, hybrid search engine for anime built with Rust, Python, and Next.js. It combines the power of semantic vector search (Qdrant) with exact keyword matching (Tantivy) to deliver highly relevant results. It also features instant autocomplete and AI-powered search overviews using Google Gemini.

---

## ✨ Features

- **Hybrid Search Algorithm**: Uses Reciprocal Rank Fusion (RRF) to merge vector embeddings (contextual meaning) and BM25 (exact keyword match).
- **Instant Autocomplete**: Ultra-fast prefix matching on anime titles powered directly by the Rust/Tantivy backend.
- **AI Overviews**: Google-style search summaries generated on the fly via the Gemini 3.5 Flash model.
- **Microservice Architecture**: Decoupled Rust API, Python embedding engine, Python AI service, and Next.js frontend.
- **Custom Web Crawler**: Headless crawling of MyAnimeList to build a proprietary dataset.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    %% Define Node Styles
    classDef frontend fill:#3b82f6,stroke:#1e40af,stroke-width:2px,color:#fff
    classDef rust fill:#f97316,stroke:#c2410c,stroke-width:2px,color:#fff
    classDef python fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
    classDef db fill:#64748b,stroke:#334155,stroke-width:2px,color:#fff
    classDef external fill:#a855f7,stroke:#7e22ce,stroke-width:2px,color:#fff

    User([User / Browser]):::frontend
    Frontend[Next.js React Frontend<br>:3000]:::frontend
    RustAPI[Rust Axum API<br>:8080]:::rust
    EmbedService[Python Embed Service<br>:8000]:::python
    AIService[Python AI Summary Service<br>:8001]:::python
    
    Qdrant[(Qdrant Vector DB<br>:6333)]:::db
    Tantivy[(Tantivy Index<br>Local Disk)]:::db
    Gemini[Google Gemini API]:::external

    User -->|Searches / Types| Frontend
    Frontend -->|GET /search| RustAPI
    Frontend -->|GET /search/autocomplete| RustAPI

    %% Autocomplete Flow
    RustAPI -->|Prefix Query - Title| Tantivy

    %% Full Search Flow
    RustAPI -->|1. POST /embed| EmbedService
    EmbedService -.->|Returns 384-d vector| RustAPI
    
    RustAPI -->|2. Vector Search| Qdrant
    RustAPI -->|3. BM25 Search| Tantivy
    
    RustAPI -->|4. Reciprocal Rank Fusion| RustAPI
    
    RustAPI -->|5. POST /summarize| AIService
    AIService -->|Calls LLM| Gemini
    Gemini -.->|Returns Contextual Summary| AIService
    AIService -.->|Returns AI Summary| RustAPI


graph TD
    %% Styling and Configuration
    classDef frontend fill:#E3F2FD,stroke:#1E88E5,stroke-width:2px,color:#000;
    classDef backend fill:#FFE0B2,stroke:#F57C00,stroke-width:2px,color:#000;
    classDef microservice fill:#E8F5E9,stroke:#43A047,stroke-width:2px,color:#000;
    classDef database fill:#EDE7F6,stroke:#5E35B1,stroke-width:2px,color:#000;

    %% Client / Frontend Layer
    subgraph Client Layer
        FE[Next.js Frontend<br><i>localhost:3000</i>] :::frontend
    end

    %% Core Backend Layer
    subgraph Core Engine [Rust Backend Layer]
        API[Rust API Backend<br><i>localhost:8080</i>] :::backend
        RRF{Reciprocal Rank<br>Fusion RRF} :::backend
    end

    %% Microservices Layer
    subgraph Microservices [Python Microservices]
        EMB_SVC[Embedding Service<br><i>localhost:8000</i><br>all-MiniLM-L6-v2] :::microservice
        AI_SVC[AI Summary Service<br><i>localhost:8001</i><br>Gemini 3.5 Flash] :::microservice
    end

    %% Database / Index Layer
    subgraph Data Layer [Storage & Search Indexes]
        QD[(Qdrant Vector DB<br><i>localhost:6333</i>)] :::database
        TV[[Tantivy Index<br><i>Local Disk</i>]] :::database
    end

    %% Data Pipeline Interaction
    subgraph Setup Pipeline [Ingestion Data Pipeline]
        PL[pipeline.py] :::microservice
    end

    %% Pipeline Data Flow
    PL -->|1. Vectorize Web Data| EMB_SVC
    PL -->|2. Populate Vectors| QD
    PL -->|3. Build Text Index| TV

    %% Frontend Interactions
    FE -->|GET /search/autocomplete<br>Prefix Search| API
    FE -->|GET /search<br>Hybrid Search Query| API

    %% 2. Instant Autocomplete Routing
    API -->|High-Speed Prefix Search under 5ms| TV

    %% 1. Hybrid Search Routing
    API -->|Convert Text to Vector| EMB_SVC
    EMB_SVC -->|384-d Vector| API
    API -->|Semantic Search| QD
    API -->|Keyword Search BM25| TV

    %% Merging Results
    QD -->|Semantic Matches| RRF
    TV -->|Exact Keyword Matches| RRF
    RRF -->|Top 5 Ranking Anime Excerpts| API

    %% 3. AI Overviews Routing
    API -->|Send Top 5 Excerpts| AI_SVC
    AI_SVC -->|Generate 2-3 Sentence Overview| API

    %% Final Return
    API -->|Return JSON: Results + Metadata + AI Summary| FE

```