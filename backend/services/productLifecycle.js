import Product from '../models/Product.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
const configuredRetentionDays = Number(process.env.SOLD_PRODUCT_RETENTION_DAYS || 30);
const retentionDays = Number.isSafeInteger(configuredRetentionDays) && configuredRetentionDays > 0 ? configuredRetentionDays : 30;
const cleanupIntervalMs = Number(process.env.PRODUCT_CLEANUP_INTERVAL_MS || 3600000);
let cleanupTimer;

export const runProductCleanup = async (now = new Date()) => {
  const soldBefore = new Date(now.getTime() - retentionDays * DAY_MS);
  const candidates = await Product.find({
    status: 'sold',
    archivedAt: null,
    soldAt: { $type: 'date', $lte: soldBefore },
  }).sort({ soldAt: 1 }).limit(BATCH_SIZE).select('_id').lean();

  let archivedCount = 0;
  for (const product of candidates) {
    const result = await Product.updateOne(
      { _id: product._id, status: 'sold', archivedAt: null, soldAt: { $lte: soldBefore } },
      { $set: { archivedAt: now } }
    );
    archivedCount += result.modifiedCount || 0;
  }

  logger.info(`Product cleanup completed: ${archivedCount} old sold listings archived.`, 'cleanup');
  return { archivedCount };
};

export const startProductCleanup = () => {
  if (cleanupTimer) return cleanupTimer;
  const interval = Number.isSafeInteger(cleanupIntervalMs) && cleanupIntervalMs > 0
    ? cleanupIntervalMs
    : 60 * 60 * 1000;
  cleanupTimer = setInterval(() => {
    runProductCleanup().catch((error) => logger.error('Product cleanup failed', 'cleanup', error));
  }, interval);
  cleanupTimer.unref?.();
  runProductCleanup().catch((error) => logger.error('Initial product cleanup failed', 'cleanup', error));
  return cleanupTimer;
};
