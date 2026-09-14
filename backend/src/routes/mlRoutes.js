import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles, INTERNAL_ROLES } from '../middleware/authorize.js';
import {
  categorizeWork,
  getDisbursementRisk,
  getCostAnomaly,
  getVendorRisk,
  getMpRisk,
  getStateRisk,
  getDashboardSummary,
} from '../controllers/mlController.js';

export const mlRouter = Router();

// Require JWT authentication on all ML proxy routes
mlRouter.use(authenticate);
mlRouter.use(authorizeRoles(...INTERNAL_ROLES));

mlRouter.post('/categorize-work', categorizeWork);
mlRouter.post('/disbursement-risk', getDisbursementRisk);
mlRouter.post('/cost-anomaly', getCostAnomaly);
mlRouter.get('/vendor-risk/:vendorId', getVendorRisk);
mlRouter.get('/mp-risk/:mpIdentifier', getMpRisk);
mlRouter.get('/state-risk/:state', getStateRisk);
mlRouter.get('/dashboard-summary', getDashboardSummary);
