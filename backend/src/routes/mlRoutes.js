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
  getAnalyticsHealth,
} from '../controllers/mlController.js';

export const analyticsRouter = Router();

// The browser reaches FastAPI only through this authenticated Express proxy.
analyticsRouter.use(authenticate);
analyticsRouter.use(authorizeRoles(...INTERNAL_ROLES));

analyticsRouter.get('/health', getAnalyticsHealth);
analyticsRouter.post('/categorize-work', categorizeWork);
analyticsRouter.post('/disbursement-risk', getDisbursementRisk);
analyticsRouter.post('/cost-anomaly', getCostAnomaly);
analyticsRouter.get('/vendor-risk/:vendorId', getVendorRisk);
analyticsRouter.get('/mp-risk/:mpIdentifier', getMpRisk);
analyticsRouter.get('/state-risk/:state', getStateRisk);
analyticsRouter.get('/dashboard-summary', getDashboardSummary);
