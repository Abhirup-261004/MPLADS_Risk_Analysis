import { Router } from 'express';
import { getOverview } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/authenticate.js';

export const dashboardRouter = Router();
dashboardRouter.get('/overview', authenticate, getOverview);
