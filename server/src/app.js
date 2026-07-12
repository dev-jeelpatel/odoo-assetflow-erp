import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

import authRoutes from './modules/auth/auth.routes.js';
import departmentRoutes from './modules/org/departments.routes.js';
import categoryRoutes from './modules/org/categories.routes.js';
import userRoutes from './modules/org/users.routes.js';
import assetRoutes from './modules/assets/assets.routes.js';
import allocationRoutes from './modules/allocations/allocations.routes.js';
import transferRoutes from './modules/transfers/transfers.routes.js';
import bookingRoutes from './modules/bookings/bookings.routes.js';
import maintenanceRoutes from './modules/maintenance/maintenance.routes.js';
import auditRoutes from './modules/audits/audits.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import reportRoutes from './modules/reports/reports.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import activityRoutes from './modules/activity/activity.routes.js';

export function createApp() {
  const app = express();

  const allowedOrigins = [
    config.clientOrigin,           // from .env → http://localhost:3000
    'http://localhost:3001',        // Next.js fallback when 3000 is busy
    'http://localhost:3002',        // extra safety net
    'http://192.168.29.140:3000',   // LAN access
    'http://192.168.29.140:3001',
  ];
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman) or matched origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/v1/health', (req, res) => res.json({ data: { status: 'ok', time: new Date().toISOString() } }));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/departments', departmentRoutes);
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/assets', assetRoutes);
  app.use('/api/v1/allocations', allocationRoutes);
  app.use('/api/v1/transfers', transferRoutes);
  app.use('/api/v1/bookings', bookingRoutes);
  app.use('/api/v1/maintenance', maintenanceRoutes);
  app.use('/api/v1/audits', auditRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/activity-logs', activityRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
