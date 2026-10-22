import multer from 'multer';
import { MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES } from '../utils/productImageConfig.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_PRODUCT_IMAGES, fields: 20 },
});
