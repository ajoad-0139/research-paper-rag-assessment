// controllers/query.controller.js
import { runQueryPipeline } from '../services/query.service.js';

export const makeAQuery = async (req, res) => {
  try {
    const queryObj = req.body; // expects { id, question, expected_papers, ... }

    if (!queryObj || !queryObj.question) {
      return res
        .status(400)
        .json({ error: 'Invalid query format. "question" required.' });
    }

    // optional: allow client to override topK
    const topK = Number(req.query.k) || 6;

    const result = await runQueryPipeline(queryObj, { topK });

    return res.status(200).json(result);
  } catch (err) {
    console.error('makeAQuery error', err);
    return res.status(500).json({ error: err.message });
  }
};
