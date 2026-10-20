import Message from '../models/Message.js';
import {
  authorizeConversation,
  buildConversationId,
  ChatError,
  createChatMessage,
  getMessagePage,
  saveMessage,
} from '../services/chatService.js';

const MAX_PAGE_SIZE = 50;
const getUserId = (user) => String(user?.id || user?._id || '');
const parsePagination = (query = {}) => {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  return Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(limit) && limit > 0 && limit <= MAX_PAGE_SIZE
    ? { page, limit }
    : null;
};

export { buildConversationId, saveMessage };

export const getUserConversations = async (req, res) => {
  const pagination = parsePagination(req.query);
  if (!pagination) return res.status(400).json({ message: 'Invalid conversation pagination.' });
  const userId = getUserId(req.user);
  try {
    const [result] = await Message.aggregate([
      { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          latest: { $first: '$$ROOT' },
          unread: { $max: { $cond: [{ $and: [{ $eq: ['$receiverId', userId] }, { $eq: ['$read', false] }] }, 1, 0] } },
        },
      },
      { $sort: { 'latest.createdAt': -1 } },
      {
        $facet: {
          items: [
            { $skip: (pagination.page - 1) * pagination.limit },
            { $limit: pagination.limit },
            {
              $project: {
                _id: 0,
                conversationId: '$_id',
                otherUserId: { $cond: [{ $eq: ['$latest.senderId', userId] }, '$latest.receiverId', '$latest.senderId'] },
                otherUserName: { $cond: [{ $eq: ['$latest.senderId', userId] }, '$latest.receiverName', '$latest.senderName'] },
                productId: '$latest.productId',
                lastMessage: '$latest.text',
                updatedAt: '$latest.createdAt',
                unread: { $gt: ['$unread', 0] },
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);
    const conversations = result?.items || [];
    const total = result?.total?.[0]?.count || 0;
    return res.json({ conversations, total, ...pagination });
  } catch (error) {
    console.error('Conversation list failed:', error);
    return res.status(500).json({ message: 'Unable to load conversations right now.' });
  }
};

export const getConversationMessages = async (req, res) => {
  const { conversationId } = req.params;
  const pagination = parsePagination(req.query);
  if (!pagination) return res.status(400).json({ message: 'Invalid message pagination.' });
  const userId = getUserId(req.user);
  try {
    if (!(await authorizeConversation(conversationId, userId))) return res.status(404).json({ message: 'Conversation not found.' });
    const result = await getMessagePage(conversationId, userId, pagination.page, pagination.limit);
    return res.json({ ...result, ...pagination });
  } catch (error) {
    console.error('Conversation history failed:', error);
    return res.status(500).json({ message: 'Unable to load conversation history right now.' });
  }
};

export const getUnreadCount = async (req, res) => {
  const userId = getUserId(req.user);
  try {
    const count = await Message.countDocuments({ receiverId: userId, read: false });
    return res.json({ count });
  } catch (error) {
    console.error('Unread count failed:', error);
    return res.status(500).json({ message: 'Unable to load unread messages right now.' });
  }
};

export const markAsRead = async (req, res) => {
  const { conversationId } = req.params;
  const userId = getUserId(req.user);
  try {
    if (!(await authorizeConversation(conversationId, userId))) return res.status(404).json({ message: 'Conversation not found.' });
    await Message.updateMany({ conversationId, receiverId: userId, read: false }, { $set: { read: true } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Mark conversation read failed:', error);
    return res.status(500).json({ message: 'Unable to mark conversation as read right now.' });
  }
};

export const sendMessageRest = async (req, res) => {
  try {
    const result = await createChatMessage({
      sender: req.user,
      receiverId: req.body?.receiverId,
      productId: req.body?.productId,
      text: req.body?.text,
      expectedConversationId: req.params.conversationId,
    });
    if (req.io) {
      req.io.to(result.conversationId).emit('chat:message', result.message);
      req.io.to(`user:${String(result.message.receiverId)}`).emit('chat:notification', { conversationId: result.conversationId });
    }
    return res.status(201).json(result.message);
  } catch (error) {
    if (error instanceof ChatError) return res.status(error.status).json({ message: error.message });
    console.error('Message send failed:', error);
    return res.status(500).json({ message: 'Unable to send this message right now.' });
  }
};