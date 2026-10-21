import express from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProductStatus,
  updateProduct,
  deleteProduct,
  getSellerProducts,
} from '../controllers/productController.js';
import { authMiddleware } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { upload } from '../middleware/upload.js';
import { MAX_PRODUCT_IMAGES } from '../utils/productImageConfig.js';

const router = express.Router();
const writeLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });

export const setupProductRoutes = (r) => {
  r.get('/', getProducts);
  r.get('/seller/mine', authMiddleware, getSellerProducts);
  r.get('/:id', getProductById);
  r.post('/', writeLimit, authMiddleware, upload.array('files', MAX_PRODUCT_IMAGES), createProduct);
  r.patch('/:id', writeLimit, authMiddleware, upload.array('files', MAX_PRODUCT_IMAGES), updateProduct);
  r.patch('/:id/status', writeLimit, authMiddleware, updateProductStatus);
  r.delete('/:id', writeLimit, authMiddleware, deleteProduct);
};

setupProductRoutes(router);

export default router;
