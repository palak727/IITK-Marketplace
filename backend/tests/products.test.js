import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import sharp from 'sharp';
import Product from '../models/Product.js';
import { createProduct, deleteProduct, getProductById, getProducts, reserveProduct, updateProduct, updateProductStatus, validateImageBuffer } from '../controllers/productController.js';
import { seedProducts } from '../data/seedProducts.js';
import { seedSampleProducts } from '../services/productSeeder.js';
import { mongoCollections, resetMongo } from './mongoMock.js';

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return payload; },
  get() { return undefined; },
});

const addProduct = (overrides = {}) => Product.create({
  name: 'Test listing',
  category: 'others',
  new_price: 100,
  old_price: 150,
  description: 'A test listing',
  image: '/images/test.png',
  sellerId: 'seller-a',
  sellerName: 'Seller',
  ...overrides,
});

const waitForNotifications = () => new Promise((resolve) => setImmediate(resolve));

test('product list excludes sold listings and applies category, pagination, and sorting in MongoDB', async () => {
  resetMongo();
  await addProduct({ name: 'Cooler', category: 'coolers', status: 'available', new_price: 250 });
  await addProduct({ name: 'Cycle', category: 'cycles', status: 'sold', new_price: 100 });
  await addProduct({ name: 'Fan', category: 'appliances', status: 'available', new_price: 50 });

  const res = response();
  await getProducts({ query: { category: 'coolers', sort: 'price-low', page: '1', limit: '10' } }, res);
  assert.equal(res.body.products.length, 1);
  assert.equal(res.body.products[0].name, 'Cooler');
  assert.equal(res.body.total, 1);
  assert.equal(res.body.page, 1);
  assert.equal(res.body.limit, 10);

  const defaultList = response();
  await getProducts({ query: {} }, defaultList);
  assert.deepEqual(defaultList.body.products.map((product) => product.name).sort(), ['Cooler', 'Fan']);
});

test('search uses MongoDB product fields and returns matching listings', async () => {
  resetMongo();
  await addProduct({ name: 'Bookshelf', description: 'Wooden storage', category: 'others' });
  await addProduct({ name: 'Cooler', description: 'Portable room cooler', category: 'coolers' });

  const res = response();
  await getProducts({ query: { search: 'cooler' } }, res);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.products[0].name, 'Cooler');
});

test('reserveProduct rejects sold items and conflicting reservations', async () => {
  resetMongo();
  const sold = await addProduct({ name: 'Sold', status: 'sold' });
  const reserved = await addProduct({
    name: 'Reserved',
    status: 'reserved',
    reservedBy: 'u2',
    reservedUntil: new Date(Date.now() + 60_000),
  });

  const soldResponse = response();
  await reserveProduct({ params: { id: String(sold._id) }, user: { id: 'u1' } }, soldResponse);
  assert.match(soldResponse.body.message, /already sold/);

  const conflictResponse = response();
  await reserveProduct({ params: { id: String(reserved._id) }, user: { id: 'u1' } }, conflictResponse);
  assert.match(conflictResponse.body.message, /already reserved/);
});

test('only the listing owner can edit or delete a product', async () => {
  resetMongo();
  const product = await addProduct({ status: 'available' });

  const editResponse = response();
  await updateProduct({ params: { id: String(product._id) }, body: { name: 'Changed cycle' }, user: { id: 'seller-b' } }, editResponse);
  assert.equal(editResponse.statusCode, 403);
  assert.equal(mongoCollections.Product[0].name, 'Test listing');

  const deleteResponse = response();
  await deleteProduct({ params: { id: String(product._id) }, user: { id: 'seller-b' } }, deleteResponse);
  assert.equal(deleteResponse.statusCode, 403);
  assert.equal(mongoCollections.Product.length, 1);
});

test('reservation excludes seller, allows only one buyer, and releases expired holds', async () => {
  resetMongo();
  const product = await addProduct({ sellerId: 'seller-a', status: 'available' });

  const self = response();
  await reserveProduct({ params: { id: String(product._id) }, user: { id: 'seller-a', name: 'Seller' } }, self);
  assert.equal(self.statusCode, 403);

  const results = await Promise.all(['buyer-a', 'buyer-b'].map(async (id) => {
    const res = response();
    await reserveProduct({ params: { id: String(product._id) }, user: { id, name: id } }, res);
    return res;
  }));
  assert.equal(results.filter((res) => res.statusCode === 200).length, 1);
  assert.ok(['buyer-a', 'buyer-b'].includes(mongoCollections.Product[0].reservedBy));

  mongoCollections.Product[0].reservedUntil = new Date(Date.now() - 1000);
  const nextBuyer = mongoCollections.Product[0].reservedBy === 'buyer-a' ? 'buyer-b' : 'buyer-a';
  const expired = response();
  await reserveProduct({ params: { id: String(product._id) }, user: { id: nextBuyer, name: nextBuyer } }, expired);
  assert.equal(expired.statusCode, 200);
  assert.equal(expired.body.reservedBy, nextBuyer);
  assert.ok(expired.body.reservedUntil > new Date());
});

test('seller status updates cannot reopen sold listings and clear reservation fields', async () => {
  resetMongo();
  const product = await addProduct({
    status: 'reserved',
    reservedBy: 'buyer-a',
    reservedUntil: new Date(Date.now() + 60_000),
  });
  mongoCollections.Message.push({
    conversationId: 'buyer-a_seller-a',
    senderId: 'buyer-a',
    receiverId: 'seller-a',
    productId: String(product._id),
    createdAt: new Date(),
  });

  const sold = response();
  await updateProductStatus({ params: { id: String(product._id) }, body: { status: 'sold' }, user: { id: 'seller-a', name: 'Seller' } }, sold);
  assert.equal(sold.statusCode, 200);
  assert.equal(sold.body.status, 'sold');
  assert.equal(sold.body.reservedBy, null);
  assert.equal(sold.body.reservedUntil, null);
  await waitForNotifications();
  assert.equal(mongoCollections.Notification.some((item) => item.recipientId === 'buyer-a'), true);

  const reopened = response();
  await updateProductStatus({ params: { id: String(product._id) }, body: { status: 'available' }, user: { id: 'seller-a' } }, reopened);
  assert.equal(reopened.statusCode, 409);
});

test('reading a listing lazily releases an expired reservation', async () => {
  resetMongo();
  const product = await addProduct({
    status: 'reserved',
    reservedBy: 'buyer-a',
    reservedUntil: new Date(Date.now() - 1000),
  });

  const res = response();
  await getProductById({ params: { id: String(product._id) } }, res);
  assert.equal(res.body.status, 'available');
  assert.equal(res.body.reservedBy, null);
  assert.equal(res.body.reservedUntil, null);
  await waitForNotifications();
  assert.equal(mongoCollections.Notification.length, 1);
});

test('listing input rejects malformed prices and bounded pagination/search', async () => {
  resetMongo();
  const createResponse = response();
  await createProduct({
    body: { name: 'Cooler', category: 'coolers', new_price: 'Infinity', description: '', image: '' },
    user: { id: 'seller-a', name: 'Seller', hall: 'Hall 1' },
  }, createResponse);
  assert.equal(createResponse.statusCode, 400);

  const pageResponse = response();
  await getProducts({ query: { page: '0' } }, pageResponse);
  assert.equal(pageResponse.statusCode, 400);

  const searchResponse = response();
  await getProducts({ query: { search: 'x'.repeat(101) } }, searchResponse);
  assert.equal(searchResponse.statusCode, 400);
});

test('image upload validation rejects MIME spoofing and malformed image bytes', async () => {
  const validPng = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
  assert.equal(await validateImageBuffer(validPng, 'image/png'), true);
  assert.equal(await validateImageBuffer(Buffer.from('not a png'), 'image/png'), false);
  assert.equal(await validateImageBuffer(Buffer.from([137, 80, 78, 71]), 'image/png'), false);
  assert.equal(await validateImageBuffer(Buffer.alloc(0), 'image/png'), false);
});

test('sample products seed idempotently without changing existing product edits or seller identity', async () => {
  resetMongo();
  const first = await seedSampleProducts();
  const originalSeed = seedProducts[0];
  const seededProduct = mongoCollections.Product.find((product) => product.seedKey);
  assert.equal(first.inserted, seedProducts.length);
  assert.equal(first.skipped, 0);
  assert.equal(seededProduct.name, originalSeed.name);
  assert.equal(seededProduct.image, originalSeed.image);
  assert.deepEqual(seededProduct.images, originalSeed.images);
  assert.equal(mongoose.isValidObjectId(seededProduct.sellerId), false);

  const reservation = response();
  await reserveProduct({ params: { id: String(seededProduct._id) }, user: { id: 'buyer-a', name: 'Buyer' } }, reservation);
  assert.equal(reservation.statusCode, 409);
  assert.equal(reservation.body.message, 'This sample listing is not linked to an active seller.');

  seededProduct.status = 'sold';
  const second = await seedSampleProducts();
  assert.deepEqual(second, { inserted: 0, skipped: seedProducts.length });
  assert.equal(mongoCollections.Product.length, seedProducts.length);
  assert.equal(seededProduct.status, 'sold');
});
