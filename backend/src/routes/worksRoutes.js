import { Router } from 'express';
import { getWorkById, getWorks, markUnderReview } from '../controllers/worksController.js';
import { authenticate } from '../middleware/authenticate.js';

export const worksRouter = Router();
worksRouter.get('/', authenticate, getWorks);
worksRouter.get('/:workId', authenticate, getWorkById);
worksRouter.patch('/:workId/review', authenticate, markUnderReview);
