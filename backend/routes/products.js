import express from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  reserveProduct,
  updateProductStatus,
  updateProduct,
  deleteProduct,
  getSellerProducts,
  uploadImage,
} from '../controllers/productController.js';
import { authMiddleware } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();
const writeLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });

export const setupProductRoutes = (r) => {
  r.get('/', getProducts);
  r.get('/seller/mine', authMiddleware, getSellerProducts);
  r.get('/:id', getProductById);
  r.post('/', writeLimit, authMiddleware, createProduct);
  r.post('/upload', writeLimit, authMiddleware, upload.single('image'), uploadImage);
  r.post('/:id/reserve', writeLimit, authMiddleware, reserveProduct);
  r.patch('/:id', writeLimit, authMiddleware, updateProduct);
  r.patch('/:id/status', writeLimit, authMiddleware, updateProductStatus);
  r.delete('/:id', writeLimit, authMiddleware, deleteProduct);
};

setupProductRoutes(router);

export default router;
