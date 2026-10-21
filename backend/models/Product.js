import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: ['coolers', 'mattresses', 'cycles', 'academics', 'appliances', 'others'],
    },
    new_price: { type: Number, required: true },
    old_price: { type: Number, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true },
    images: [{ type: String }],
    hall: { type: String, required: true, default: 'Hall 1' },
    condition: {
      type: String,
      enum: ['Brand New', 'Barely Used', 'Heavily Used'],
      default: 'Barely Used',
    },
    defects: [{ type: String }],
    status: {
      type: String,
      enum: ['available', 'sold'],
      default: 'available',
    },
    soldAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    sellerId: { type: String, required: true },
    sellerName: { type: String, required: true },
    clientRequestId: { type: String, default: undefined },
    clientRequestHash: { type: String, default: undefined },
    seedKey: { type: String, default: undefined },
  },
  { timestamps: true }
);

productSchema.index(
  { sellerId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } }
);
productSchema.index({ seedKey: 1 }, { unique: true, partialFilterExpression: { seedKey: { $type: 'string' } } });
productSchema.index({ status: 1, soldAt: 1, archivedAt: 1 });

export default mongoose.models.Product || mongoose.model('Product', productSchema);
