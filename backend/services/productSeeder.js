import { createHash } from 'node:crypto';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { seedProducts } from '../data/seedProducts.js';

const hashSeedProduct = (product, index) =>
  createHash('sha256').update(JSON.stringify({ index, product })).digest('hex');

export const seedSampleProducts = async (sellerIdsByName = {}) => {
  const sellerNames = [...new Set(seedProducts.map((product) => product.sellerName))];
  const missingSeller = sellerNames.find((name) => !sellerIdsByName[name]);
  if (missingSeller) throw new Error(`No User ID was supplied for seeded seller ${missingSeller}.`);

  const sellerIds = [...new Set(sellerNames.map((name) => String(sellerIdsByName[name])))];
  const sellers = await User.find({ _id: { $in: sellerIds } }).select('_id emailVerified').lean();
  const eligibleSellerIds = new Set(sellers.filter((user) => user.emailVerified !== false).map((user) => String(user._id)));
  if (sellerIds.some((sellerId) => !eligibleSellerIds.has(sellerId))) {
    throw new Error('Every seeded listing must be linked to an existing, verified User.');
  }

  await Product.init();
  let inserted = 0;
  for (const [index, product] of seedProducts.entries()) {
    const seedKey = hashSeedProduct(product, index);
    const sellerId = String(sellerIdsByName[product.sellerName]);
    const existing = await Product.findOne({
      $or: [{ seedKey }, { name: product.name, sellerName: product.sellerName }],
    }).select('_id status').lean();
    let result = { upsertedCount: 0 };
    if (existing) {
      await Product.updateOne(
        { _id: existing._id },
        {
          $set: {
            sellerId,
            ...(existing.status === 'reserved' ? { status: 'available' } : {}),
          },
          $unset: { reservedBy: '', reservedUntil: '', reservationRequestId: '' },
        }
      );
    } else {
      result = await Product.updateOne(
        { seedKey },
        { $setOnInsert: { ...product, sellerId, seedKey } },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    }
    const linkedProduct = await Product.findOne({
      $or: [{ seedKey }, { name: product.name, sellerName: product.sellerName }],
    }).select('sellerId').lean();
    if (String(linkedProduct?.sellerId) !== sellerId) {
      throw new Error(`Seeded listing ${product.name} is not linked to its seller User.`);
    }
    inserted += result.upsertedCount;
  }
  return { inserted, skipped: seedProducts.length - inserted };
};
