import sys
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

QDRANT_URL = "http://localhost:6333"
COLLECTION = "anime_pages"
MODEL_NAME = "all-MiniLM-L6-v2"
TOP_K = 5

model = SentenceTransformer(MODEL_NAME)
client = QdrantClient(url=QDRANT_URL)

if len(sys.argv) > 1:
    query = " ".join(sys.argv[1:])
else:
    query = input("Enter a search query: ")

print(f"\nQuery: \"{query}\"\n")

vector = model.encode(query).tolist()

response = client.query_points(
    collection_name=COLLECTION,
    query=vector,
    limit=TOP_K,
)

results = response.points;
for i, hit in enumerate(results, 1):
    p = hit.payload
    title = p.get('title', 'Untitled')
    excerpt = p.get('excerpt') or ('no excerpt')
    url = p.get('url', 'No URL Available')
    print(f"{i}. [{hit.score:.3f}] {title}")
    print(f"   {excerpt}")
    print(f"   {url}")
    print()