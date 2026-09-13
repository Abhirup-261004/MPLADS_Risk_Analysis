import { Router } from 'express';
import { getPublicAnalytics, getPublicFilters, getPublicMap, getPublicOverview, getPublicWork, getPublicWorks } from '../controllers/publicController.js';

export const publicRouter = Router();
publicRouter.get('/overview', getPublicOverview);
publicRouter.get('/filters', getPublicFilters);
publicRouter.get('/works', getPublicWorks);
publicRouter.get('/works/:workId', getPublicWork);
publicRouter.get('/map', getPublicMap);
publicRouter.get('/analytics', getPublicAnalytics);
