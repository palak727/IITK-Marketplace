import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';

import authRouter from './routes/auth.js';
import productRouter from './routes/products.js';
import chatRouter from './routes/chat.js';
import notificationRouter from './routes/notifications.js';
import { setupSocketHandlers } from './socket/chatSocket.js';
import { logger } from './utils/logger.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { validateJWTConfig } from './middleware/auth.js';
import { isMailerConfigured } from './services/mailer.js';
import { startProductCleanup } from './services/productLifecycle.js';

export const app = express();
export const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((origin) => {
    if (isProduction) {
      if (!URL.canParse(origin)) {
        throw new Error('FRONTEND_URL must contain valid HTTPS origins separated by commas.');
      }

      const parsed = new URL(origin);
      if (parsed.protocol !== 'https:') {
        throw new Error('FRONTEND_URL must contain valid HTTPS origins separated by commas.');
      }
      return parsed.origin;
    }

    if (!URL.canParse(origin)) return origin;
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : origin;
  });
if (!isProduction && allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}
const allowOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS'));
};

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(cors({
  origin: allowOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(rateLimitMiddleware);

const io = new Server(httpServer, {
  cors: { origin: allowOrigin, credentials: true },
});
app.set('onlineUsers', setupSocketHandlers(io));
app.use((req, res, next) => { req.io = io; next(); });

const imagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'public', 'images');
if (fs.existsSync(imagesDir)) {
  app.use('/images', express.static(imagesDir));
}

// Root path route handler to prevent 404s on main domain visits
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'iitk-marketplace-api',
    message: 'Welcome to the IITK Marketplace API',
    docs: '/health',
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'iitk-marketplace-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

const readinessHandler = (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  const configurationReady = !isProduction || (
    Boolean(process.env.JWT_SECRET) && Boolean(process.env.FRONTEND_URL) && isMailerConfigured()
  );
  const ready = databaseReady && configurationReady;
  res.status(ready ? 200 : 503).json({
    ready,
    database: databaseReady ? 'connected' : 'disconnected',
    configuration: configurationReady ? 'valid' : 'incomplete',
    timestamp: new Date().toISOString(),
  });
};
app.get('/ready', readinessHandler);
app.get('/readiness', readinessHandler);

app.use('/api/products', express.json({ limit: '8mb' }), productRouter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notifications', notificationRouter);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled application error', 'server', err);
  let status = 500;
  let message = 'Internal server error.';

  if (err.code === 'UNSUPPORTED_IMAGE_TYPE') {
    status = 400;
    message = 'Only JPEG, PNG, and WebP images are supported.';
  } else if (err.name === 'MulterError') {
    status = 400;
    message = 'Image upload is invalid or exceeds the upload limits.';
  } else if (err.status === 413 && req.originalUrl.startsWith('/api/products')) {
    status = 400;
    message = 'Product request exceeds the image upload limits.';
  } else if (err.status === 413) {
    status = 413;
    message = 'Request payload is too large.';
  } else if (err.status === 400) {
    status = 400;
    message = 'Request payload is invalid.';
  }

  res.status(status).json({ message });
});

const PORT = process.env.PORT || 5000;

export const startServer = async (port = PORT) => {
  if (isProduction) {
    validateJWTConfig();
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required in production.');
    if (!allowedOrigins.length) throw new Error('FRONTEND_URL must explicitly list allowed production origins.');
  }
  await connectDB();
7  startProductCleanup();
  return httpServer.listen(port, '0.0.0.0', () => {
    logger.info(`Server running on http://0.0.0.0:${port}`, 'server');
  });
};

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer().catch((error) => {
    logger.error('Server startup failed', 'server', error);
    process.exitCode = 1;
  });
}

export default app;
