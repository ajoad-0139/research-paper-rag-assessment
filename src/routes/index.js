import { Router } from 'express';
import papers from './papers.routes.js';
import analytics from './analytics.routes.js';
import history from './history.routes.js';
import query from './query.routes.js';

const router = Router();

router.use('/papers', papers);
router.use('/analytics', analytics);
router.use('/queries/history', history);
router.use('/query', query);

export default router;
