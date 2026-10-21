import multer from 'multer';
import { MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES, PRODUCT_IMAGE_TYPE_SET } from '../utils/productImageConfig.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_PRODUCT_IMAGES, fields: 20 },
  fileFilter: (req, file, cb) => {
    if (PRODUCT_IMAGE_TYPE_SET.has(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error('Unsupported image type.');
      error.code = 'UNSUPPORTED_IMAGE_TYPE';
      error.status = 400;
      cb(error, false);
    }
  },
});
