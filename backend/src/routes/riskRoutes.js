import { Router } from 'express';
import { analyzeWithAi, getAgencyRisk, getAnalytics, getMapIntelligence, getRiskCenter } from '../controllers/riskController.js';
import { authenticate } from '../middleware/authenticate.js';

export const riskRouter = Router();
riskRouter.get('/center', authenticate, getRiskCenter);
riskRouter.get('/analytics', authenticate, getAnalytics);
riskRouter.get('/agencies', authenticate, getAgencyRisk);
riskRouter.get('/map-intelligence', authenticate, getMapIntelligence);
riskRouter.post('/ai-analyst', authenticate, analyzeWithAi);
