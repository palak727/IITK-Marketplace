import express from 'express';
import {
  getUserConversations, // <-- 1. Import this
  getConversationMessages,
  getUnreadCount,
  markAsRead,
  saveMessage,
  buildConversationId,
  sendMessageRest,
} from '../controllers/chatController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

export const setupChatRoutes = (r) => {
  // <-- 2. Add the route to fetch all chats/messages where the user is sender or receiver
  r.get('/my-conversations', authMiddleware, getUserConversations);

  r.get('/unread', authMiddleware, getUnreadCount);
  r.get('/conversation/:conversationId', authMiddleware, getConversationMessages);
  r.post('/conversation/:conversationId/read', authMiddleware, markAsRead);
  r.post('/send', authMiddleware, sendMessageRest);
  r.post('/conversation/:conversationId/message', authMiddleware, sendMessageRest);
};

setupChatRoutes(router);

export default router;
export { saveMessage, buildConversationId };