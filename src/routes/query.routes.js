import { Router } from 'express';
import { makeAQuery } from '../controllers/query.controller.js';

const router = Router();

router.route('').post(makeAQuery);

export default router;
