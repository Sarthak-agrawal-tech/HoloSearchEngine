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
    Frontend[Next.js React Frontend\n:3000]:::frontend
    RustAPI[Rust Axum API\n:8080]:::rust
    EmbedService[Python Embed Service\n:8000]:::python
    AIService[Python AI Summary Service\n:8001]:::python
    
    Qdrant[(Qdrant Vector DB\n:6333)]:::db
    Tantivy[(Tantivy Index\nLocal Disk)]:::db
    Gemini[Google Gemini API]:::external

    User -->|Searches / Types| Frontend
    Frontend -->|GET /search| RustAPI
    Frontend -->|GET /search/autocomplete| RustAPI

    %% Autocomplete Flow
    RustAPI -->|Prefix Query (Title)| Tantivy

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