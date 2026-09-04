import { Router } from 'express';
import { getCurrentUser, login, register } from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';

export const authRouter = Router();
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.get('/me', authenticate, getCurrentUser);
