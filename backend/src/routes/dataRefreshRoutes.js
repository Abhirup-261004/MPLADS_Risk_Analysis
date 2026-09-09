import { Router } from 'express';
import { getDataRefreshOverview } from '../controllers/dataRefreshController.js';
import { authenticate } from '../middleware/authenticate.js';

export const dataRefreshRouter = Router();
dataRefreshRouter.get('/overview', authenticate, getDataRefreshOverview);
