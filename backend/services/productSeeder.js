import { createHash } from 'node:crypto';
import Product from '../models/Product.js';
import { seedProducts } from '../data/seedProducts.js';

const hashSeedProduct = (product, index) =>
  createHash('sha256').update(JSON.stringify({ index, product })).digest('hex');

export const seedSampleProducts = async () => {
  await Product.init();
  let inserted = 0;
  for (const [index, product] of seedProducts.entries()) {
    const seedKey = hashSeedProduct(product, index);
    const result = await Product.updateOne(
      { seedKey },
      {
        $setOnInsert: {
          ...product,
          sellerId: `seed-${seedKey}`,
          seedKey,
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    inserted += result.upsertedCount;
  }
  return { inserted, skipped: seedProducts.length - inserted };
};
