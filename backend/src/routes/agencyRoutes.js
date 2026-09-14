import { Router } from 'express';
import { createAgencySubmission, getAgencyWorkspace, reviseAgencySubmission, updateAgencyProfile } from '../controllers/agencyController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize.js';

export const agencyRouter = Router();
agencyRouter.use(authenticate, authorizeRoles('agency'));
agencyRouter.get('/workspace', getAgencyWorkspace);
agencyRouter.post('/submissions', createAgencySubmission);
agencyRouter.patch('/submissions/:id', reviseAgencySubmission);
agencyRouter.patch('/profile', updateAgencyProfile);
