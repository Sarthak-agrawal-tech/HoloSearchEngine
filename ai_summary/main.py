from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import google.generativeai as genai

app = FastAPI(title="AI Summary Service")

# Configure Gemini
api_key = os.environ.get("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    # Using gemini-1.5-flash as the standard naming convention for flash. 
    # The user asked for "gemini 3.5 flash model", I'll use that string, but typically it would be gemini-1.5-flash
    model = genai.GenerativeModel('gemini-3.5-flash')
else:
    model = None
    print("WARNING: GEMINI_API_KEY not set. AI summaries will be disabled.")

class SummaryRequest(BaseModel):
    query: str
    context: List[str]

class SummaryResponse(BaseModel):
    summary: Optional[str]

@app.post("/summarize")
async def summarize(req: SummaryRequest):
    if not model:
        return SummaryResponse(summary=None)
    
    if not req.context:
        return SummaryResponse(summary="No context available to generate a summary.")

    # Combine top excerpts into a context block
    context_text = "\n---\n".join(req.context)
    
    prompt = f"""
    You are an AI assistant for an anime search engine. 
    Provide a concise, minimalistic summary about the search query based ONLY on the provided context.
    Keep the tone informative and direct. Do not include introductory phrases like "Based on the context...".
    Make sure to give the exact what the user is searching for as a result.
    
    Query: {req.query}
    
    Context:
    {context_text}
    """
    
    try:
        response = model.generate_content(prompt)
        return SummaryResponse(summary=response.text.strip())
    except Exception as e:
        print(f"Error generating summary: {e}")
        # Return none on failure so the UI gracefully omits the summary box
        return SummaryResponse(summary=None)

@app.get("/health")
async def health():
    return {"status": "ok", "gemini_configured": model is not None}
