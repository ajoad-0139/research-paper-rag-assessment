import {
  createOverlappingChunks,
  extractPdf,
  pushEmbeddingsToQdrant,
  getCitations,
  savePaper,
  fetchAllPapers,
} from '../services/papers.service.js';
import { getEmbedding } from '../utils/embed.js';
import Paper from '../models/paper.model.js';
import { organizeSegments } from '../services/paperDetails.service.js';
import { QdrantClient } from '@qdrant/js-client-rest';

export const uploadAPaper = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF file required' });
  const { rawPdf, rawText } = await extractPdf(req.file.buffer);
  const fileName = req.file.originalname;
  const { citations, paperSegments } = await getCitations(rawText);
  const savedPaper = await savePaper({
    fileName,
    citations,
    paperSegments,
    pageCount: rawText.length || 0,
  });

  // return res.json({ payload });

  const overlappingChunks = await createOverlappingChunks(rawPdf);

  const embeddings = await getEmbedding(overlappingChunks);
  const payload = {
    citations,
    fileName,
    paperId: savedPaper._id,
  };
  await pushEmbeddingsToQdrant({
    embeddings,
    payload,
    collectionName: 'research-papers',
  });
  res.status(200).json({ embeddings, payload });
};
export const getAllPapers = async (req, res) => {
  const papers = await fetchAllPapers();
  res.status(200).json({ papers });
};

export const getAPaper = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ err: 'paper id is required' });
  const paper = await Paper.findById(id);
  paper.views = paper.views + 1;
  await paper.save();
  if (paper.isCleaned) return res.status(200).json({ paper });

  const cleanedUpSegments = await organizeSegments(paper.paperSegments);
  paper.paperSegments = cleanedUpSegments;
  paper.isCleaned = true;
  await paper.save();
  console.log(paper);
  res.status(200).json({ paper });
};

export const removeAPaper = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Paper ID is required' });
  }

  const qdrantClient = new QdrantClient({ url: 'http://localhost:6333' });

  const paper = await Paper.findById(id);
  if (!paper) {
    return res.status(404).json({ error: 'Paper not found' });
  }

  await qdrantClient.delete('research-papers', {
    filter: {
      must: [{ key: 'paperId', match: { value: id } }],
    },
  });

  console.log(` Deleted vectors for paper ${id} from Qdrant.`);

  await Paper.findByIdAndDelete(id);
  console.log(` Deleted paper ${id} from MongoDB.`);

  return res.status(200).json({
    message: 'Paper and its vectors deleted successfully',
    deletedPaperId: id,
  });
};

export const viewAPaperStats = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Paper ID is required' });
  }

  const paper = await Paper.findById(id);
  if (!paper) {
    return res.status(404).json({ error: 'Paper not found' });
  }
  const { views, downloads } = paper;
  res.status(200).json({
    views,
    downloads,
  });
};
