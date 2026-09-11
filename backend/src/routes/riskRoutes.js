import { Router } from 'express';
import { analyzeWithAi, getAgencyRisk, getAgencyRiskProfile, getAnalytics, getMapIntelligence, getRiskCenter } from '../controllers/riskController.js';
import {
  clearWorkReview,
  escalateWorkReview,
  getReviewById,
  getReviewQueue,
  getWorkAuditTrail,
  holdWork,
  releaseHold,
  requestAgencySuspension,
  submitAppeal,
} from '../controllers/riskWorkflowController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles, MINISTRY_ROLES, REVIEWER_ROLES } from '../middleware/authorize.js';

export const riskRouter = Router();

// Standard risk intelligence routes
riskRouter.get('/center', authenticate, getRiskCenter);
riskRouter.get('/analytics', authenticate, getAnalytics);
riskRouter.get('/agencies', authenticate, getAgencyRisk);
riskRouter.get('/agencies/:agencyKey', authenticate, getAgencyRiskProfile);
riskRouter.get('/map-intelligence', authenticate, getMapIntelligence);
riskRouter.post('/ai-analyst', authenticate, analyzeWithAi);

// Fraud Response & Risk Action Workflow routes
riskRouter.get('/review-queue', authenticate, getReviewQueue);
riskRouter.get('/reviews/:id', authenticate, getReviewById);
riskRouter.post('/reviews/:id/clear', authenticate, authorizeRoles(...REVIEWER_ROLES), clearWorkReview);
riskRouter.post('/reviews/:id/escalate', authenticate, authorizeRoles(...REVIEWER_ROLES), escalateWorkReview);
riskRouter.post('/works/:workId/hold', authenticate, authorizeRoles(...REVIEWER_ROLES), holdWork);
riskRouter.post('/works/:workId/release', authenticate, authorizeRoles(...REVIEWER_ROLES), releaseHold);
riskRouter.get('/works/:workId/audit', authenticate, getWorkAuditTrail);
riskRouter.post('/works/:workId/appeal', authenticate, submitAppeal);
riskRouter.post('/agencies/:agencyKey/suspension-request', authenticate, authorizeRoles(...MINISTRY_ROLES), requestAgencySuspension);

