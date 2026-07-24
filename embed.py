import json
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
points = []
for i, page in enumerate(pages):
    text = page["textContent"]
    if not text or len(text.strip()) < 50:
        print(f"[SKIP] {page['title']} — too short ({len(text or '')} chars)")
        continue

    url = page["url"]

    # Skip character profile pages (no meaningful synopsis)
    if "/character/" in url:
        print(f"[SKIP] {page['title']} — character page")
        continue

    # Skip season listing pages (semantic soup — cover too many topics)
    if "/anime/season" in url or "/anime/upcoming" in url:
        print(f"[SKIP] {page['title']} — season/upcoming page")
        continue

    # Skip sub-pages like /anime/{id}/characters, /anime/{id}/stats, etc.
    if url.count("/") > 5:
        print(f"[SKIP] {page['title']} — sub-page ({url})")
        continue

    vector = model.encode(text).tolist()
    payload = {
        "url": page["url"],
        "title": page["title"],
        "excerpt": page["excerpt"],
        "textLength": page["textLength"],
        "wordCount": page["wordCount"],
    }

    points.append(models.PointStruct(id=i, vector=vector, payload=payload))
    print(f"[EMBED] {page['title']}  ({page['wordCount']} words)")

client.upsert(collection_name=COLLECTION, points=points)
print(f"\nDone. {len(points)} vectors upserted to Qdrant.")