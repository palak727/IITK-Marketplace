import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
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
import { logger, reportError } from './utils/logger.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';

dotenv.config();

export const app = express();
export const httpServer = createServer(app);

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => {
    try {
      return new URL(origin.trim()).origin;
    } catch {
      return origin.trim();
    }
  })
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(rateLimitMiddleware);

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins.length ? allowedOrigins : true, credentials: true },
});
app.set('onlineUsers', setupSocketHandlers(io));
app.use((req, res, next) => { req.io = io; next(); });

// Connect to MongoDB (falls back to in-memory mode if unavailable)
connectDB()
  .then((connected) => {
    if (connected) {
      logger.info('Connected to MongoDB successfully', 'db');
    } else {
      logger.info('Running in memory mode (MongoDB unavailable)', 'db');
    }
  })
  .catch((err) => {
    logger.error('MongoDB connection error', 'db', err);
  });


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

app.get('/ready', async (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    ready,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notifications', notificationRouter);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  reportError('Unhandled application error', 'server', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;

export const startServer = (port = PORT) => {
  return httpServer.listen(port, '0.0.0.0', () => {
    logger.info(`Server running on http://0.0.0.0:${port}`, 'server');
  });
};

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}

export default app;
