import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRouter } from './routes/authRoutes.js';
import { dashboardRouter } from './routes/dashboardRoutes.js';
import { worksRouter } from './routes/worksRoutes.js';
import { riskRouter } from './routes/riskRoutes.js';
import { reportRouter } from './routes/reportRoutes.js';
import { notificationRouter } from './routes/notificationRoutes.js';
import { dataRefreshRouter } from './routes/dataRefreshRoutes.js';
import { analyticsRouter } from './routes/mlRoutes.js';
import { publicRouter } from './routes/publicRoutes.js';
import { agencyRouter } from './routes/agencyRoutes.js';
import { governanceRouter } from './routes/governanceRoutes.js';

export const app = express();
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.clientUrls.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
}));
app.use(express.json({ limit: '10kb' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/public', publicRouter);
app.use('/api/agency', agencyRouter);
app.use('/api/governance', governanceRouter);
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/works', worksRouter);
app.use('/api/risk', riskRouter);
app.use('/api/reports', reportRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/data-refresh', dataRefreshRouter);
app.use('/api/analytics', analyticsRouter);
app.use(notFound);
app.use(errorHandler);
