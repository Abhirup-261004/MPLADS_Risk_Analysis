import { Router } from 'express';
import { generateReport, getReports } from '../controllers/reportController.js';
import { authenticate } from '../middleware/authenticate.js';

export const reportRouter = Router();
reportRouter.get('/', authenticate, getReports);
reportRouter.post('/generate', authenticate, generateReport);
