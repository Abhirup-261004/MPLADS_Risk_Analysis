import { Router } from 'express';
import {
  deleteNotification,
  getNotificationById,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from '../controllers/notificationController.js';
import { authenticate } from '../middleware/authenticate.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);
notificationRouter.get('/', getNotifications);
notificationRouter.patch('/read-all', markAllNotificationsRead);
notificationRouter.get('/:id', getNotificationById);
notificationRouter.patch('/:id/read', markNotificationRead);
notificationRouter.patch('/:id/unread', markNotificationUnread);
notificationRouter.delete('/:id', deleteNotification);
