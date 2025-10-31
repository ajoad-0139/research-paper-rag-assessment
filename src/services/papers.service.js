import { PDFParse } from 'pdf-parse';
import { QdrantClient } from '@qdrant/js-client-rest';
import axios from 'axios';
import paper from '../models/paper.model.js';

export const extractPdf = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  await parser.destroy();

  const rawPdf = data.pages.map((p) => p.text).join('\n');
  return { rawPdf, rawText: data.pages };
};

export const createOverlappingChunks = (
  text,
  chunkSize = 1000,
  overlap = 200
) => {
  if (!text || typeof text !== 'string') return [];

  const cleaned = text
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const chunks = [];
  let start = 0;
  const textLength = cleaned.length;

  while (start < textLength) {
    const end = Math.min(start + chunkSize, textLength);
    const chunk = cleaned.slice(start, end);
    chunks.push(chunk);
    // move forward but retain overlap
    start += chunkSize - overlap;
  }

  return chunks;
};

export const pushEmbeddingsToQdrant = async ({
  embeddings,
  payload,
  collectionName,
}) => {
  if (!embeddings || embeddings.length === 0)
    throw new Error('No embeddings provided');

  const client = new QdrantClient({ host: 'localhost', port: 6333 });

  // 1️⃣ Check if collection exists
  const collectionsResp = await client.getCollections();
  const collectionsArray = collectionsResp.collections || [];
  const collectionExists = collectionsArray.find(
    (c) => c.name === collectionName
  );

  // 2️⃣ Create collection if not exists
  if (!collectionExists) {
    await client.createCollection(collectionName, {
      vectors: { type: 'float', size: 768, distance: 'Cosine' },
    });
    console.log(`✅ Collection '${collectionName}' created`);
  }

  // 3️⃣ Prepare points
  const points = [];
  embeddings.forEach((embed, idx) => {
    const { chunk, vector } = embed;
    points.push({
      id: idx,
      vector,
      payload: { ...payload, chunk },
    });
  });

  // 4️⃣ Upsert points
  await client.upsert(collectionName, {
    points,
  });

  console.log(`✅ ${points.length} points upserted to '${collectionName}'`);
};

export const savePaper = async ({
  fileName,
  citations,
  paperSegments,
  pageCount,
}) => {
  const createdPaper = await paper.create({
    fileName,
    citations,
    paperSegments,
    pageCount,
  });
  console.log(createdPaper);
  return createdPaper;
};

// citations part ////////////////////////////////////////////////////

export const getCitations = async (rawText) => {
  const { paperMethodology, paperSegments } = await extractMethodology(rawText);
  const paperTitle = await extractTitle(rawText[0].text);

  return {
    citations: {
      methodology: paperMethodology,
      title: paperTitle,
    },
    paperSegments,
  };
};

export const extractTitle = async (firstPage) => {
  try {
    const prompt = `
    You are an assistant that finds title from the first page of a research paper.
    You will be provided the first page, and your job is to extract the title of the paper.
    Return the title directly as a string;

    Here is the first page: ${firstPage}
    `;

    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-r1:latest',
      prompt,
      stream: false,
    });

    // Extract the raw text response
    const rawResponse = response.data?.response;
    console.log(rawResponse);

    return rawResponse;
  } catch (err) {
    console.error('❌ Error calling deepseek-r1:', err.message);
    return null;
  }
};

export const extractMethodology = async (rawText) => {
  if (!Array.isArray(rawText) || rawText.length === 0) {
    throw new Error('Invalid rawText input');
  }

  // 1️⃣ Combine all text into a single string
  const fullText = rawText.map((p) => p.text).join('\n');

  // 2️⃣ Define section headers (case-insensitive)
  const sectionRegex =
    /(abstract|introduction|background|related work|methodology|methods|approach|experiments|results|discussion|conclusion)/gi;

  // 3️⃣ Prepare array of segments with header + content
  const segmentsArray = [];
  let lastIndex = 0;
  let match;

  while ((match = sectionRegex.exec(fullText)) !== null) {
    const header = match[0];
    const startIndex = match.index;

    // If there’s a previous section, push its content
    if (lastIndex !== 0) {
      const content = fullText.slice(lastIndex, startIndex).trim();
      if (segmentsArray.length > 0) {
        segmentsArray[segmentsArray.length - 1].content = content;
      }
    }

    // Push new section header
    segmentsArray.push({ header: header.toLowerCase(), content: '' });
    lastIndex = sectionRegex.lastIndex;
  }

  // Handle the final section (from last match to end of file)
  if (segmentsArray.length > 0) {
    segmentsArray[segmentsArray.length - 1].content = fullText
      .slice(lastIndex)
      .trim();
  }

  // 4️⃣ Find the "Methodology" section
  const methodology = segmentsArray.find(
    (s) =>
      s.header.includes('methodology') ||
      s.header.includes('methods') ||
      s.header.includes('approach')
  );

  if (!methodology) {
    console.warn('⚠️ No methodology section found');
    return null;
  }

  // 5️⃣ Clean the methodology section using DeepSeek
  try {
    const prompt = `
You are an assistant that cleans up research paper text.
Clean and filter the following methodology section.
Remove references, figure/table captions, and unrelated content.
Return only the coherent methodology description — no extra commentary.

Here is the methodology:
${methodology.content}
`;

    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-r1:latest',
      prompt,
      stream: false,
    });

    const cleanedText = response.data?.response;

    return {
      paperMethodology: cleanedText,
      paperSegments: segmentsArray,
    };
  } catch (err) {
    console.error('❌ Error calling deepseek-r1:', err.message);
    return null;
  }
};

////////////////////////////////////////////

export const fetchAllPapers = async () => {
  const papers = paper.find();
  return papers;
};
