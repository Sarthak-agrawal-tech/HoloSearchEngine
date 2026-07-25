import json
from pathlib import Path

import tantivy

DATA_PATH = Path(__file__).parent / "crawler" / "data" / "crawl-results.json"
INDEX_PATH = Path(__file__).parent / "tantivy_index"

# --- Schema: defines what fields each document has and how they're indexed ---
schema_builder = tantivy.SchemaBuilder()
schema_builder.add_integer_field("doc_id", stored=True, indexed=True)
schema_builder.add_text_field("title", stored=True)
schema_builder.add_text_field("body", stored=True)
schema_builder.add_text_field("url", stored=True, tokenizer_name="raw")
schema_builder.add_text_field("excerpt", stored=True, tokenizer_name="raw")
schema = schema_builder.build()

"""
Schema decisions:
- title + body: indexed=True (full-text search), stored=True (return in results)
  These are the fields queries search against.
- url + excerpt: stored=True only (returned with results, not searchable)
  No reason to search by URL in a keyword query.
- doc_id: integer field for potential cross-referencing, not used in queries.
"""

# Creates index. If path already has an index, it opens it.
# But since INDEX_PATH is new, this creates a fresh one.
index = tantivy.Index(schema, path=str(INDEX_PATH))

writer = index.writer()

with open(DATA_PATH, encoding="utf-8") as f:
    pages = json.load(f)

indexed = 0
skipped = 0

for i, page in enumerate(pages):
    url = page["url"]
    text = page["textContent"]

    # Same filter as embed.py — keep document sets identical
    if not text or len(text.strip()) < 50:
        skipped += 1
        continue
    if "/character/" in url:
        skipped += 1
        continue
    if "/anime/season" in url or "/anime/upcoming" in url:
        skipped += 1
        continue
    if url.count("/") > 5:
        skipped += 1
        continue

    writer.add_document(
        tantivy.Document(
            doc_id=i,
            title=page["title"],
            body=text.strip(),
            url=url,
            excerpt=page["excerpt"] or "",
        )
    )
    indexed += 1
    print(f"[INDEX] {page['title']}")

writer.commit()
print(f"\nDone. {indexed} pages indexed, {skipped} skipped.")