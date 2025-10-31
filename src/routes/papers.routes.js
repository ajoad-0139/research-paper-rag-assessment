import { Router } from 'express';
import {
  getAPaper,
  getAllPapers,
  removeAPaper,
  uploadAPaper,
  viewAPaperStats,
} from '../controllers/papers.controller.js';
import { upload } from '../config/multer.js';

const router = Router();

router.route('').get(getAllPapers);
router.route('/upload').post(upload.single('file'), uploadAPaper);
router.route('/:id').get(getAPaper).delete(removeAPaper);
router.route('/:id/stats').get(viewAPaperStats);

export default router;
