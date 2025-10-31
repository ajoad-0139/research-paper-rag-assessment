import axios from 'axios';
import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'research-papers';
const EMBED_ENDPOINT = 'http://localhost:11434/api/embeddings';
const LLM_ENDPOINT = 'http://localhost:11434/api/generate';
const EMBED_MODEL = 'nomic-embed-text';
const LLM_MODEL = 'deepseek-r1:latest';

const qdrantClient = new QdrantClient({ url: QDRANT_URL });

export const embedQuery = async (text) => {
  if (!text) throw new Error('Text required for embedding');
  const resp = await axios.post(EMBED_ENDPOINT, {
    model: EMBED_MODEL,
    prompt: text,
  });

  return resp.data.embedding;
};

export const searchQdrantTopK = async (vector, topK = 5) => {
  if (!vector) throw new Error('Vector required for search');

  const searchResult = await qdrantClient.search(QDRANT_COLLECTION, {
    vector,
    limit: topK,
    with_payload: true,
    with_vector: true,
  });

  return searchResult;
};

const normalizeSearchResults = (results, expected_papers = []) => {
  const seen = new Set();
  const items = [];

  // Normalize expected_papers to a set of basenames (lowercase, trimmed)
  const expectedSet = new Set(
    (expected_papers || [])
      .filter(Boolean)
      .map((p) => p.toString().toLowerCase().trim().split(/[/\\]/).pop())
  );
  const filterEnabled = expectedSet.size > 0;

  for (const r of results) {
    const payload = r.payload || {};
    const nested = payload.payload || {};

    // Robust fileName extraction (handle payload.fileName or nested payload)
    const fileNameRaw = payload.fileName ?? nested.fileName ?? null;
    const fileName = fileNameRaw ? fileNameRaw.toString() : null;
    const fileNameBase = fileName
      ? fileName.split(/[/\\]/).pop().toLowerCase().trim()
      : null;

    // If expected_papers provided, skip chunks that don't belong to any expected file
    if (filterEnabled) {
      if (!fileNameBase || !expectedSet.has(fileNameBase)) {
        continue;
      }
    }

    const paperId = payload.paperId ?? nested.paperId ?? null;

    // Use ?? chain to avoid mixing || and ??
    const chunkText =
      r.chunk ??
      payload.chunk ??
      nested.chunk ??
      payload.text ??
      nested.text ??
      null;

    // Dedupe by file + chunk snippet
    const key = `${fileNameBase ?? 'unknown'}::${(chunkText || '').slice(
      0,
      120
    )}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      pointId: r.id,
      score: r.score,
      fileName,
      paperId,
      payload,
      chunk: chunkText,
    });
  }

  return items;
};

const buildPrompt = (question, topChunks) => {
  // topChunks: array of objects (normalized) with fields such as:
  // { idx, chunk, fileName, paperId, score, payload: { citations: { title, methodology } } }
  // We expect the caller to pass the exact topChunks array.

  // Safety: ensure chunks are stringified as JSON for the model to parse reliably
  const chunksJson = JSON.stringify(topChunks, null, 2);

  const prompt = `
You are a strict, precise research assistant. You are GIVEN exactly three things below:
1) A QUESTION.
2) A JSON array named "topChunks" containing retrieved document chunks (each item contains metadata).
3) A set of INSTRUCTIONS you must follow EXACTLY.

Important: Use ONLY the textual content inside each chunk object's "chunk" field to derive the answer. You may consult the chunk's metadata (fileName, payload.citations.title, payload.citations.methodology, score) only to build citations and compute voting/mean scores — but NOT as the primary answer content. Do NOT use any external knowledge or hallucinations.

QUESTION:
${question}

topChunks (array of JSON objects). Structure example for each object:
{
  "idx": 1,
  "chunk": "...text snippet from the paper...",
  "fileName": "paper3_nlp_transformers.pdf",
  "paperId": "64ab...",
  "score": 0.8923,
  "payload": {
    "citations": {
      "title": "Attention is All You Need",
      "methodology": "We propose self-attention..."
    }
  }
}
--- BEGIN topChunks JSON ---
${chunksJson}
--- END topChunks JSON ---

INSTRUCTIONS (Follow these steps exactly):

1) Read ALL items in the topChunks array. Use ONLY the "chunk" strings to construct the answer. Do not invent facts. If the information needed to answer the question is NOT present in the chunk texts, respond with a short honest answer such as: "I don't know based on the provided snippets."

2) Decide which chunk(s) you actually used to build the answer. Use those used chunks to determine citations and scoring (do NOT use chunks you did not use).

3) For each distinct source file (payload/fileName) that you used:
   a) Determine the representative "paper_title" by majority voting among that file's chunks: pick the title that appears most often in that file's payload.citations.title fields. If there is a tie, pick the title from the chunks with the higher mean score.
   b) Determine the representative "section" by majority voting among the chunks for that file. If the majority of chunks indicate methodology content (or payload.citations.methodology exists and matches chunk content), set "section" to "Methodology". If unclear, set "section" to "Unknown".
   c) Compute "relevance_score" = the arithmetic mean of the 'score' values of the chunks from that file that you actually used to answer the question. Round this mean to two decimal places (e.g., 0.89).

4) Build the "citations" array: one object per used source with the structure:
   {
     "paper_title": "<title-from-majority-vote>",
     "section": "<section-from-majority-vote-or-Unknown>",
     "relevance_score": <mean_score_rounded_to_2_decimals>
   }

5) Build "sources_used": a deduplicated array of fileName strings for the sources listed in "citations".

6) In the "answer" string: cite inline where you relied on a source, using this format: [Source: <filename>]. Use the chunk text as the evidence for claims you make.

7) Output MUST BE EXACTLY one valid JSON object and NOTHING ELSE (no explanations, no surrounding markdown). The JSON keys must be: "answer", "citations", "sources_used".

8) If you cannot find any relevant chunks to answer, return:
{
  "answer": "I don't know based on the provided snippets.",
  "citations": [],
  "sources_used": []
}

EXTRA: If you used multiple chunks from the same file, include that file only once in "sources_used" and compute the mean score across those used chunks.

Now produce the JSON object as specified.
`;

  return prompt;
};

export const runQueryPipeline = async (queryObj, options = {}) => {
  const question = queryObj.question;
  const topK = options.topK || 6;

  if (!question) throw new Error('question required in queryObj');

  const queryVector = await embedQuery(question);

  const rawResults = await searchQdrantTopK(queryVector, topK);
  //   return rawResults;
  const normalized = normalizeSearchResults(
    rawResults || [],
    queryObj.expected_papers
  );
  //   return normalized;

  if (normalized.length === 0) {
    return {
      answer: 'No relevant chunks found in the vector store.',
      citations: [],
      sources_used: [],
    };
  }

  const prompt = buildPrompt(question, normalized);

  const llmResp = await axios.post(LLM_ENDPOINT, {
    model: LLM_MODEL,
    prompt,
    stream: false,
    temperature: 0.0,
  });

  const rawText = llmResp.data?.response || '';

  return {
    answer: rawText,
  };
};
