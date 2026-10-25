import mongoose from 'mongoose';
import { MAX_PRODUCT_IMAGES } from '../utils/productImageConfig.js';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      enum: ['coolers', 'mattresses', 'cycles', 'academics', 'appliances', 'others'],
    },
    new_price: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000,
     },
    old_price: {
      type: Number,
      min: 0,
      max: 1000000,
     },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
     },
    images: {
      type: [String],
      required: true,
      validate: {
        validator: images =>
        images.length >= 1 && images.length <= MAX_PRODUCT_IMAGES,
        message: `A listing must contain 1–${MAX_PRODUCT_IMAGES} images.`,
      },
    },
    condition: {
      type: String,
      trim: true,
      enum: ['Brand New', 'Barely Used', 'Heavily Used'],
      default: 'Barely Used',
    },
    defects: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'No defects',
    },
    status: {
      type: String,
      enum: ['available', 'sold'],
      default: 'available',
    },
    soldAt: { type: Date, default: null },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientRequestId: String,
  },
  { timestamps: true }
);

productSchema.index(
  { sellerId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } }
);
productSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.Product || mongoose.model('Product', productSchema);
