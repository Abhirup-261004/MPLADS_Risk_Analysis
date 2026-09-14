import { Router } from 'express';
import { generateReport, getReports } from '../controllers/reportController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles, INTERNAL_ROLES } from '../middleware/authorize.js';

export const reportRouter = Router();
reportRouter.get('/', authenticate, authorizeRoles(...INTERNAL_ROLES), getReports);
reportRouter.post('/generate', authenticate, authorizeRoles(...INTERNAL_ROLES), generateReport);
