import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

export const MAX_MESSAGE_LENGTH = 2000;

export class ChatError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const buildConversationId = (userA, userB, productId = '') => {
  const users = [String(userA), String(userB)].sort().join('_');
  return productId ? `${users}_${productId}` : users;
};

const getProduct = async (productId) => {
  if (!mongoose.isValidObjectId(productId)) return null;
  return Product.findById(productId).lean();
};

const getUser = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) return null;
  return User.findById(userId).select('name').lean();
};

const hasPreviousBuyerMessage = async (conversationId, sellerId, buyerId, productId) => {
  return Boolean(await Message.exists({
    conversationId,
    productId,
    $or: [
      { senderId: buyerId, receiverId: sellerId },
      { senderId: sellerId, receiverId: buyerId },
    ],
  }));
};

export const saveMessage = async (messageData) => {
  const payload = {
    ...messageData,
    senderId: String(messageData.senderId),
    receiverId: String(messageData.receiverId),
    productId: messageData.productId ? String(messageData.productId) : '',
    text: messageData.text.trim(),
    read: false,
  };
  const message = await Message.create(payload);
  return message.toObject();
};

export const createChatMessage = async ({ sender, receiverId, productId, text, expectedConversationId }) => {
  const senderId = String(sender?.id || sender?._id || '');
  const targetId = typeof receiverId === 'string' ? receiverId.trim() : '';
  const cleanProductId = typeof productId === 'string' ? productId.trim() : '';
  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!senderId || !targetId || !cleanProductId || !cleanText) {
    throw new ChatError('A recipient, listing, and message text are required.');
  }
  if (targetId === senderId) throw new ChatError('You cannot message yourself.');
  if (cleanText.length > MAX_MESSAGE_LENGTH) throw new ChatError(`Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);

  const [receiver, product] = await Promise.all([getUser(targetId), getProduct(cleanProductId)]);
  if (!product) throw new ChatError('Listing not found.', 404);
  if (product.seedKey) throw new ChatError('This sample listing is not linked to an active seller.', 409);
  if (!receiver) throw new ChatError('Recipient not found.', 404);
  const sellerId = String(product.sellerId || '');
  if (!sellerId || (targetId !== sellerId && senderId !== sellerId)) {
    throw new ChatError('Messages about this listing must include its seller.', 403);
  }

  const conversationId = buildConversationId(senderId, targetId, cleanProductId);
  if (expectedConversationId && expectedConversationId !== conversationId) {
    throw new ChatError('Conversation does not match these participants and listing.', 403);
  }
  if (senderId === sellerId && !(await hasPreviousBuyerMessage(conversationId, sellerId, targetId, cleanProductId))) {
    throw new ChatError('The buyer must start this listing conversation.', 403);
  }

  const message = await saveMessage({
    conversationId,
    senderId,
    senderName: sender.name,
    receiverId: targetId,
    receiverName: receiver.name || '',
    productId: cleanProductId,
    text: cleanText,
  });

  try {
    const eventKey = `message:${message._id || message.id}`;
    const notificationPayload = {
      recipientId: targetId,
      senderId,
      senderName: sender.name,
      type: 'message',
      message: `${sender.name || 'A student'} sent you a message about ${product.name || 'a listing'}.`,
      conversationId,
      productId: cleanProductId,
      eventKey,
    };
    await Notification.findOneAndUpdate(
      { eventKey },
      { $setOnInsert: { ...notificationPayload, read: false } },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error('Chat notification creation failed:', error.message);
  }

  return { conversationId, message };
};

export const authorizeConversation = async (conversationId, userId) => {
  if (typeof conversationId !== 'string' || conversationId.length > 256) return false;
  const message = await Message.findOne({
    conversationId,
    $or: [{ senderId: String(userId) }, { receiverId: String(userId) }],
  }).lean();
  if (!message) return false;
  if (buildConversationId(message.senderId, message.receiverId, message.productId || '') !== conversationId) return false;
  if (message.productId) {
    const product = await getProduct(String(message.productId));
    if (product) {
      const participants = [String(message.senderId), String(message.receiverId)];
      if (!participants.includes(String(product.sellerId))) return false;
    }
  }
  return true;
};

export const getMessagePage = async (conversationId, userId, page = 1, limit = 50) => {
  const filter = {
    conversationId,
    $or: [{ senderId: String(userId) }, { receiverId: String(userId) }],
  };
  const [items, total] = await Promise.all([
    Message.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Message.countDocuments(filter),
  ]);
  return { messages: items.reverse(), total };
};