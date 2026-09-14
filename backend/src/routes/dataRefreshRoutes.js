import { Router } from 'express';
import { getDataRefreshOverview } from '../controllers/dataRefreshController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles, INTERNAL_ROLES } from '../middleware/authorize.js';

export const dataRefreshRouter = Router();
dataRefreshRouter.get('/overview', authenticate, authorizeRoles(...INTERNAL_ROLES), getDataRefreshOverview);
