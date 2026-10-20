import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: String, required: true, index: true },
    senderId: { type: String, default: '' },
    senderName: { type: String, default: '' },
    type: {
      type: String,
      enum: ['message', 'product', 'system'],
      default: 'message',
    },
    message: { type: String, required: true },
    conversationId: { type: String, default: '' },
    productId: { type: String, default: '' },
    eventKey: { type: String, default: undefined },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ eventKey: 1 }, { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } });
notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
