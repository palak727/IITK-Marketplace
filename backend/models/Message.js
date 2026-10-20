import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    receiverId: { type: String, required: true },
    receiverName: { type: String, default: '' },
    productId: { type: String, default: '' },
    text: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, read: 1 });

export default mongoose.models.Message || mongoose.model('Message', messageSchema);
