// govAdmin.routes.js
// Routes for Government MPLADS Admin operational workspace

import { Router } from 'express';
import {
  getDashboardData,
  getWorks,
  getWorkById,
  validateWork,
  correctWork,
  getFundTracking,
  getReviewQueue,
  assignReview,
  requestClarification,
  clearReview,
  escalateReview,
  getImports,
  getImportById,
  getFailedRows,
  getSourceHealth,
  getReports,
  getNotifications,
} from '../controllers/govAdmin.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles, INTERNAL_ROLES } from '../middleware/authorize.js';

const router = Router();

// All routes require authentication and government_admin (or internal) role
router.use(authenticate, authorizeRoles('government_admin'));

// Dashboard
router.get('/dashboard', getDashboardData);

// Works management
router.get('/works', getWorks);
router.get('/works/:workId', getWorkById);
router.post('/works/:workId/validate', validateWork);
router.patch('/works/:workId/correct', correctWork);

// Fund tracking
router.get('/fund-tracking', getFundTracking);

// Review Queue
router.get('/review-queue', getReviewQueue);
router.post('/reviews/:reviewId/assign', assignReview);
router.post('/reviews/:reviewId/clarification', requestClarification);
router.post('/reviews/:reviewId/clear', clearReview);
router.post('/reviews/:reviewId/escalate', escalateReview);

// Data imports
router.get('/imports', getImports);
router.get('/imports/:importId', getImportById);
router.get('/imports/:importId/failed-rows', getFailedRows);
router.get('/source-health', getSourceHealth);

// Reports
router.get('/reports', getReports);

// Notifications
router.get('/notifications', getNotifications);

export const govAdminRouter = router;

