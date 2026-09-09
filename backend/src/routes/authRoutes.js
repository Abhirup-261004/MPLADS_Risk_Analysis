import { Router } from 'express';
import { changePassword, getCurrentUser, login, register, updateProfile, updateSettings } from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';

export const authRouter = Router();
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.get('/me', authenticate, getCurrentUser);
authRouter.patch('/profile', authenticate, updateProfile);
authRouter.patch('/settings', authenticate, updateSettings);
authRouter.patch('/password', authenticate, changePassword);
