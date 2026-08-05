from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI(title="Embedding Service")

# Load model once at startup
model = SentenceTransformer("all-MiniLM-L6-v2")

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    vector: list[float]

@app.post("/embed")
async def embed(req: EmbedRequest):
    """Convert text to embedding vector."""
    vec = model.encode(req.text).tolist()
    return EmbedResponse(vector=vec)

@app.get("/health")
async def health():
    return {"status": "ok", "model": "all-MiniLM-L6-v2", "dim": 384}