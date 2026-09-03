import json
import re
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer

DATA_PATH = Path(__file__).parent/ "crawler" / "data" / "crawl-results.json"
QDRANT_URL = "http://localhost:6333"
COLLECTION = "anime_pages"
MODEL_NAME = "all-MiniLM-L6-v2"  # 384-dim, good for search

# Load model
print(f"Loading model {MODEL_NAME}...")
model = SentenceTransformer(MODEL_NAME)

# Load data
print(f"Loading {DATA_PATH}...")
with open(DATA_PATH,encoding="utf-8") as f:
    pages = json.load(f)
print(f"Loaded {len(pages)} pages")

# Connect to Qdrant
client = QdrantClient(url=QDRANT_URL)

# Delete collection if exists (clean slate)
try:
    client.delete_collection(COLLECTION)
except Exception:
    pass

# Create collection
VECTOR_SIZE = model.get_sentence_embedding_dimension()
client.create_collection(
    collection_name=COLLECTION,
    vectors_config=models.VectorParams(
        size=VECTOR_SIZE,
        distance=models.Distance.COSINE,
    ),
)
print(f"Created collection '{COLLECTION}' (vector size={VECTOR_SIZE})")

# Embed and upsert
# ... (Keep your setup, loading, and collection creation code exactly the same)

# Embed and upsert in batches
BATCH_SIZE = 64
batch_pages = []
seen_anime_ids = set()
point_id_counter = 0

print("\nProcessing and upserting pages...")

for i, page in enumerate(pages):
    text = page.get("textContent", "")
    if not text or len(text.strip()) < 50:
        print(f"[SKIP] {page.get('title')} — too short ({len(text or '')} chars)")
        continue

    url = page.get("url", "")

    # Skip character profile pages
    if "/character/" in url:
        print(f"[SKIP] {page.get('title')} — character page")
        continue

    # Skip season listing pages
    if "/anime/season" in url or "/anime/upcoming" in url:
        print(f"[SKIP] {page.get('title')} — season/upcoming page")
        continue

    # Skip sub-pages like /anime/{id}/characters
    if url.count("/") > 5:
        print(f"[SKIP] {page.get('title')} — sub-page ({url})")
        continue

    # Deduplicate by numeric anime ID
    anime_id_match = re.search(r'/anime/(\d+)', url)
    if anime_id_match:
        anime_id = anime_id_match.group(1)
        if anime_id in seen_anime_ids:
            print(f"[SKIP] {page.get('title')} — duplicate anime ID {anime_id}")
            continue
        seen_anime_ids.add(anime_id)

    # Collect valid pages for batch processing
    batch_pages.append(page)

    # When the batch is full, process and upload it
    if len(batch_pages) == BATCH_SIZE or (i == len(pages) - 1 and len(batch_pages) > 0):
        # Extract texts for this batch
        texts_to_embed = [p["textContent"] for p in batch_pages]
        
        # Batch encode (significantly faster than one-by-one)
        vectors = model.encode(texts_to_embed, show_progress_bar=False).tolist()
        
        # Build PointStructs for this batch
        batch_points = []
        for page_data, vector in zip(batch_pages, vectors):
            payload = {
                "url": page_data["url"],
                "title": page_data["title"],
                "excerpt": page_data["excerpt"],
                "textLength": page_data["textLength"],
                "wordCount": page_data["wordCount"],
            }
            batch_points.append(
                models.PointStruct(id=point_id_counter, vector=vector, payload=payload)
            )
            point_id_counter += 1

        # Upsert the batch with an explicit timeout safeguard
        client.upsert(
            collection_name=COLLECTION, 
            points=batch_points,
            timeout=60  # Gives Qdrant 60 seconds to process just this batch
        )
        print(f"[BATCH UPSERT] Uploaded {len(batch_points)} vectors (Total: {point_id_counter})")
        
        # Clear the batch for the next iteration
        batch_pages = []

print(f"\nDone. Successfully upserted {point_id_counter} vectors to Qdrant.")
