import Notification from '../models/Notification.js';
import mongoose from 'mongoose';

const MAX_PAGE_SIZE = 50;

export const createNotification = async ({
  recipientId,
  senderId = '',
  senderName = '',
  type = 'message',
  message,
  conversationId = '',
  productId = '',
  eventKey,
}) => {
  const payload = {
    recipientId: String(recipientId),
    senderId: String(senderId),
    senderName,
    type,
    message,
    conversationId,
    productId,
    ...(eventKey ? { eventKey } : {}),
    read: false,
    createdAt: new Date(),
  };

  if (eventKey) {
    const doc = await Notification.findOneAndUpdate(
      { eventKey },
      { $setOnInsert: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return doc.toObject();
  }
  const doc = await Notification.create(payload);
  return doc.toObject();
};

export const getNotifications = async (req, res) => {
  const userId = req.user.id || req.user._id;
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    return res.status(400).json({ message: 'Invalid notification pagination.' });
  }

  try {
    const filter = { recipientId: String(userId) };
    const [items, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
    ]);
    return res.json({ notifications: items, total, page, limit });
  } catch (error) {
    console.error('Notification list failed:', error);
    return res.status(500).json({ message: 'Unable to load notifications right now.' });
  }
};

export const markNotificationRead = async (req, res) => {
  const userId = req.user.id || req.user._id;
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Notification not found' });
    const item = await Notification.findOneAndUpdate(
      { _id: id, recipientId: userId },
      { $set: { read: true } },
      { new: true }
    );

    if (!item) return res.status(404).json({ message: 'Notification not found' });
    return res.json({ success: true, notification: item });
  } catch (error) {
    console.error('Notification read update failed:', error);
    return res.status(500).json({ message: 'Unable to update this notification right now.' });
  }
};

export const getUnreadNotificationCount = async (req, res) => {
  const userId = req.user.id || req.user._id;

  try {
    const count = await Notification.countDocuments({ recipientId: userId, read: false });
    return res.json({ count });
  } catch (error) {
    console.error('Unread notification count failed:', error);
    return res.status(500).json({ message: 'Unable to load notification count right now.' });
  }
};
