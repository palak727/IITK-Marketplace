import { getAuthenticatedUser } from '../middleware/auth.js';
import { authorizeConversation, ChatError, createChatMessage } from '../services/chatService.js';
import User from '../models/User.js';

export const setupSocketHandlers = (io) => {
  const onlineUsers = new Map();
  const messageWindows = new Map();

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const user = await getAuthenticatedUser(token);
      if (!user) return next(new Error('Invalid or expired token'));
      socket.user = user;
      return next();
    } catch {
      return next(new Error('Authentication service unavailable'));
    }
  });

  io.on('connection', (socket) => {
    const userId = String(socket.user.id);
    const sockets = onlineUsers.get(userId) || new Set();
    const wasOffline = sockets.size === 0;
    sockets.add(socket.id);
    onlineUsers.set(userId, sockets);
    socket.join(`user:${userId}`);
    if (wasOffline) io.emit('user:online', { userId, online: true });

    User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() }).catch((error) => {
      console.error('Unable to update online user state:', error.message);
    });

    socket.on('chat:join', async (payload, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const conversationId = typeof payload?.conversationId === 'string' ? payload.conversationId : '';
      try {
        if (!(await authorizeConversation(conversationId, userId))) {
          return reply({ success: false, error: 'Conversation not found.' });
        }
        await socket.join(conversationId);
        return reply({ success: true });
      } catch (error) {
        console.error('Chat room authorization failed:', error.message);
        return reply({ success: false, error: 'Unable to join this conversation.' });
      }
    });

    socket.on('chat:send', async (payload, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const now = Date.now();
      const window = messageWindows.get(userId) || { count: 0, resetAt: now + 60_000 };
      if (now >= window.resetAt) {
        window.count = 0;
        window.resetAt = now + 60_000;
      }
      if (window.count >= 30) return reply({ success: false, error: 'Too many messages. Please wait before sending more.' });
      window.count += 1;
      messageWindows.set(userId, window);
      try {
        const result = await createChatMessage({
          sender: socket.user,
          receiverId: payload?.receiverId,
          productId: payload?.productId,
          text: payload?.text,
        });
        await socket.join(result.conversationId);
        io.to(result.conversationId).emit('chat:message', result.message);
        io.to(`user:${String(result.message.receiverId)}`).emit('chat:notification', {
          conversationId: result.conversationId,
        });
        return reply({ success: true, message: result.message });
      } catch (error) {
        if (!(error instanceof ChatError)) console.error('Socket message persistence failed:', error);
        return reply({
          success: false,
          error: error instanceof ChatError ? error.message : 'Unable to send this message right now.',
        });
      }
    });

    socket.on('disconnect', () => {
      const currentSockets = onlineUsers.get(userId);
      currentSockets?.delete(socket.id);
      if (!currentSockets?.size) {
        onlineUsers.delete(userId);
        messageWindows.delete(userId);
        io.emit('user:online', { userId, online: false });
        User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() }).catch((error) => {
          console.error('Unable to update offline user state:', error.message);
        });
      }
    });
  });

  return onlineUsers;
};
