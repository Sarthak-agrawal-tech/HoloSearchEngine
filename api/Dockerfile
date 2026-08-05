# ── Stage 1: Build Rust binary ──
FROM rust:1.79-slim AS builder
WORKDIR /app

# Copy only build files (leverage Docker cache)
COPY api/Cargo.toml api/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release 2>/dev/null || true

# Now copy real source and rebuild (only changed files recompile)
COPY api/src ./src
RUN cargo build --release

# ── Stage 2: Minimal runtime ──
FROM debian:bookworm-slim
WORKDIR /app

# Runtime deps: OpenSSL + CA certs (reqwest needs these for HTTPS)
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

# Copy compiled binary from builder
COPY --from=builder /app/target/release/anime-search-api ./

EXPOSE 8080
CMD ["./anime-search-api"]