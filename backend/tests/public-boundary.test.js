import test from 'node:test';
import assert from 'node:assert/strict';
import { authMiddleware } from '../middleware/auth.js';
import { getProducts, getProductById } from '../controllers/productController.js';
import { setupProductRoutes } from '../routes/products.js';
import { setupChatRoutes } from '../routes/chat.js';
import Product from '../models/Product.js';
import { resetMongo } from './mongoMock.js';

const rejectResponse = () => {
  let statusCode = 200;
  return {
    status(code) { statusCode = code; return this; },
    json() { return statusCode; },
    get statusCode() { return statusCode; },
  };
};

const controllerResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return payload; },
  get() { return undefined; },
});

test('authMiddleware rejects missing bearer tokens', async () => {
  const res = rejectResponse();
  let called = false;
  await authMiddleware({ headers: {} }, res, () => { called = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test('public product reads work without authentication context', async () => {
  resetMongo();
  const product = await Product.create({
    name: 'Public',
    category: 'others',
    new_price: 10,
    old_price: 20,
    description: 'Public listing',
    image: '/images/public.png',
    sellerId: 'seller',
    sellerName: 'Seller',
  });
  const listRes = controllerResponse();
  await getProducts({ query: {} }, listRes);
  assert.equal(listRes.body.products.length, 1);

  const detailRes = controllerResponse();
  await getProductById({ params: { id: String(product._id) } }, detailRes);
  assert.equal(detailRes.body.name, 'Public');
});

test('product mutations and private chat routes register authentication middleware', () => {
  const productRoutes = new Map();
  const chatRoutes = new Map();
  const recorder = (routes) => Object.fromEntries(
    ['get', 'post', 'patch', 'delete'].map((method) => [method, (path, ...handlers) => {
      routes.set(`${method.toUpperCase()} ${path}`, handlers);
    }])
  );

  setupProductRoutes(recorder(productRoutes));
  setupChatRoutes(recorder(chatRoutes));

  for (const route of [
    'GET /seller/mine',
    'POST /',
    'POST /upload',
    'POST /:id/reserve',
    'PATCH /:id',
    'PATCH /:id/status',
    'DELETE /:id',
  ]) {
    assert.ok(productRoutes.get(route)?.includes(authMiddleware), `${route} must require authentication`);
  }

  for (const route of [
    'GET /my-conversations',
    'GET /unread',
    'GET /conversation/:conversationId',
    'POST /conversation/:conversationId/read',
    'POST /send',
  ]) {
    assert.ok(chatRoutes.get(route)?.includes(authMiddleware), `${route} must require authentication`);
  }
});
