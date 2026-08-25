import { verifyToken } from '../middleware/auth.js';
import { buildConversationId, saveMessage } from '../controllers/chatController.js';
import User from '../models/User.js';
import { isMemoryMode } from '../store/memoryStore.js';

export const setupSocketHandlers = (io) => {
  const onlineUsers = new Map();

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const user = verifyToken(token);
    if (!user) return next(new Error('Invalid or expired token'));
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    onlineUsers.set(userId, socket.id);
    io.emit('user:online', { userId, online: true });

    if (!isMemoryMode()) {
      User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() }).catch(() => {});
    }

    socket.on('chat:join', ({ conversationId }) => {
      socket.join(conversationId);
    });

    socket.on('chat:send', async ({ receiverId, productId, text, product }) => {
      const conversationId = buildConversationId(userId, receiverId, productId);
      const message = await saveMessage({
        conversationId,
        senderId: userId,
        senderName: socket.user.name,
        receiverId,
        receiverName: product?.sellerName || 'IITKian',
        productId: productId || '',
        text,
      }).catch(() => null);

      const payload = message || {
        conversationId,
        senderId: userId,
        senderName: socket.user.name,
        receiverId,
        productId,
        text,
        createdAt: new Date(),
      };

      io.to(conversationId).emit('chat:message', { ...payload, product });

      const receiverSocket = onlineUsers.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('chat:notification', payload);
      }
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      io.emit('user:online', { userId, online: false });
      if (!isMemoryMode()) {
        User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() }).catch(() => {});
      }
    });
  });

  return onlineUsers;
};
