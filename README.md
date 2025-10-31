Research Paper RAG — Quick Start & Run Manual

A compact README to run your Express + MongoDB + Qdrant + local-LLM stack, test the main endpoints, and troubleshoot common issues. This is an MVP-focused manual — enough to get the app running and test the main flows (upload papers, index embeddings, run a query, view/download paper stats).

1 — Prerequisites

Node.js (v18+ recommended)

npm or yarn

MongoDB (running and accessible)

Docker (to run Qdrant) or a running Qdrant instance

Your local LLM service running at http://localhost:11434 that exposes:

POST /api/generate (LLM text generation)

POST /api/embeddings (embedding generation)

(Optional) git to clone the repo

2 — Important defaults used in the project

Change these in your .env if needed.

PORT=5000
MONGO_URI=mongodb://localhost:27017/researchdb
QDRANT_HOST=http://localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=research-papers
LLM_ENDPOINT=http://localhost:11434/api/generate
EMBED_ENDPOINT=http://localhost:11434/api/embeddings
EMBED_MODEL=nomic-embed-text
LLM_MODEL=deepseek-r1:latest

3 — Install & run

Install dependencies

npm install

# or

yarn

Start MongoDB (if not already running)

Start Qdrant (Docker)

# Example: persistent storage mapped to host path

docker run -d \
 --name qdrant \
 -p 6333:6333 \
 -v /path/to/qdrant_storage:/qdrant/storage \
 qdrant/qdrant

If you prefer ephemeral (no storage persist):

docker run -d --name qdrant -p 6333:6333 qdrant/qdrant

Start your local LLM / embedding service

Ensure your LLM is reachable at http://localhost:11434 and supports the expected endpoints:

POST /api/generate → respond with JSON containing response (text)

POST /api/embeddings → respond with { embedding: [...] }

This repo expects deepseek-r1:latest and nomic-embed-text (model names are passed to your local service), but adapt to your LLM.

Start the Express app

npm run dev

# or

node src/index.js

(Adjust the start command to match your package.json.)

4 — API quick reference
Upload a paper (ingest + index)
POST /api/papers/upload
Form: multipart/form-data
Field: file (the PDF)

Example (curl):

curl -v -F "file=@./papers/paper_3.pdf" http://localhost:5000/api/papers/upload

Response: saved paper info + embeddings upload result.

Get one paper (and automatically clean & organize segments)
GET /api/papers/:id

Example:

GET http://localhost:5000/api/papers/6904e9fc25d40775f452a73f

Note: use path param :id (not ?id=). Controller uses req.params.id.

Delete a paper + its vectors
DELETE /api/papers/:id

Example:

DELETE http://localhost:5000/api/papers/6904e9fc25d40775f452a73f

This deletes the MongoDB doc and all Qdrant vectors with payload.paperId === id.

Make sure the collection name in controller matches the actual Qdrant collection (default: research-papers).

View / download paper stats & segments CSV
GET /api/papers/:id/stats

Query params:

download=true → returns a CSV attachment containing segments (increments download counter)

limitSegments=N → when download requested, limit rows in CSV

Examples:

JSON stats:

GET http://localhost:5000/api/papers/6904e9fc25d40775f452a73f/stats

CSV download:

GET "http://localhost:5000/api/papers/6904e9fc25d40775f452a73f/stats?download=true&limitSegments=10"

Run a query (RAG)
POST /api/query
Content-Type: application/json
Body example:
{
"id": 1,
"question": "What is the main goal of the paper 'Attention is All You Need'?",
"expected_papers": ["paper_3.pdf"], // optional: restrict search
"difficulty": "easy",
"type": "single-paper"
}

The pipeline:

Embeds the query via local embed endpoint.

Searches Qdrant (collection: research-papers) — optional filter by expected_papers.

Builds prompt using top-k chunks and calls local LLM (/api/generate).

Returns the LLM raw reply and metadata (topChunks, sources_used), or structured JSON if you enable parsing.

5 — Common troubleshooting & tips
PowerShell curl error

PowerShell aliases curl to Invoke-WebRequest. Use:

Invoke-RestMethod -Uri "http://localhost:6333/collections" -Method GET

# Or use Git Bash / WSL for regular curl

Qdrant Not Found: Collection 'X' doesn't exist!

Run:

curl http://localhost:6333/collections

Confirm the collection name returned (e.g. "research-papers") and use that exact name when calling delete/count/search. Hyphens and underscores are different.

find() vs findById() gotcha

Model.find({ \_id: id }) → returns an array.

Model.findById(id) → returns a single document.

If you expect a single document, use findById(id) and then paper.paperSegments will be accessible.

Embedding/LLM APIs return format

Embedding endpoint must return an embedding at response.data.embedding (or adjust getEmbedding util accordingly).

Local LLM generation endpoint used in this repo expects response text in response.data.response. Adjust parsing if your LLM returns differently.

Reset Qdrant (dev)

Delete all collections (soft reset):

curl -X DELETE "http://localhost:6333/collections"

In PowerShell:

Invoke-RestMethod -Uri "http://localhost:6333/collections" -Method DELETE

Full reset (wipe persistent storage):

docker stop qdrant
docker rm qdrant
rm -rf /path/to/qdrant_storage
docker run -d --name qdrant -p 6333:6333 -v /path/to/qdrant_storage:/qdrant/storage qdrant/qdrant

Qdrant client method differences

Different versions of @qdrant/js-client-rest may have slightly different method signatures (e.g., search(collection, { vector, limit }), delete(collection, { filter }), count(collection, { filter })). If you see errors, check the package docs or use client.getCollections() to confirm connection.

6 — Where to plug things in (code references)

src/routes/papers.route.js — paper upload, get, delete, stats endpoints

src/controllers/papers.controller.js — uploadAPaper, getAPaper, removeAPaper, viewAPaperStats

src/services/papers.service.js — extractPdf, createOverlappingChunks, pushEmbeddingsToQdrant, extractTitle, extractMethodology

src/utils/embed.js — getEmbedding() util (calls local /api/embeddings)

src/services/query.service.js — runQueryPipeline() (embed query → search Qdrant → prompt LLM)

src/services/cleanup.service.js — cleanSegmentsWithLLM() (rewrites merged segments via LLM)

7 — Quick "smoke" tests

Qdrant is up:

curl http://localhost:6333/collections

LLM is up:

curl -X POST http://localhost:11434/api/generate -H "Content-Type: application/json" -d '{"model":"deepseek-r1:latest","prompt":"hello"}'

Expect a JSON reply with response.

Embedding endpoint:

curl -X POST http://localhost:11434/api/embeddings -H "Content-Type: application/json" -d '{"model":"nomic-embed-text","prompt":"Test embedding"}'

Expect JSON including an embedding array.

Upload a PDF (ingest & index):

curl -v -F "file=@./papers/sample.pdf" http://localhost:5000/api/papers/upload

Query (quick):

curl -X POST http://localhost:5000/api/query -H "Content-Type: application/json" -d '{"id":1,"question":"What is the methodology?","expected_papers":["paper_3.pdf"],"type":"single-paper"}'

View stats:

curl http://localhost:5000/api/papers/<paperId>/stats

8 — Minimal troubleshooting checklist

MongoDB connection string correct → check logs on startup.

Qdrant listening on port 6333 and collection name matches controller.

Local LLM endpoints respond with the fields expected by the code (response / embedding).

Use findById(id) to access paper.paperSegments.

If a route isn't hit, confirm that route file is mounted in app.js and you're using the correct method & URL (path param vs query param).

9 — Useful commands recap

# Install

npm install

# Start server (dev)

npm run dev

# Check qdrant collections

curl http://localhost:6333/collections

# Delete all qdrant collections (dev)

curl -X DELETE "http://localhost:6333/collections"

# Inspect one paper

curl http://localhost:5000/api/papers/<paperId>

# Run query

curl -X POST http://localhost:5000/api/query -H
