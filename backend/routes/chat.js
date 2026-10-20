import express from 'express';
import {
  getUserConversations,
  getConversationMessages,
  getUnreadCount,
  markAsRead,
  sendMessageRest,
} from '../controllers/chatController.js';
import { authMiddleware } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();
const chatSendLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });

export const setupChatRoutes = (r) => {
  r.get('/my-conversations', authMiddleware, getUserConversations);

  r.get('/unread', authMiddleware, getUnreadCount);
  r.get('/conversation/:conversationId', authMiddleware, getConversationMessages);
  r.post('/conversation/:conversationId/read', authMiddleware, markAsRead);
  r.post('/send', chatSendLimit, authMiddleware, sendMessageRest);
};

setupChatRoutes(router);

export default router;