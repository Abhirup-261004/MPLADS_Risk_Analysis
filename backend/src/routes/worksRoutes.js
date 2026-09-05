import { Router } from 'express';
import { getFilterOptions, getWorkById, getWorks, markUnderReview } from '../controllers/worksController.js';
import { authenticate } from '../middleware/authenticate.js';

export const worksRouter = Router();
worksRouter.get('/filters', authenticate, getFilterOptions);
worksRouter.get('/', authenticate, getWorks);
worksRouter.get('/:workId', authenticate, getWorkById);
worksRouter.patch('/:workId/review', authenticate, markUnderReview);
