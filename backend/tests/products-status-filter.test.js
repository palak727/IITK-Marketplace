import test from 'node:test';
import assert from 'node:assert/strict';
import { getProducts } from '../controllers/productController.js';
import { resetMongo } from './mongoMock.js';
import Product from '../models/Product.js';

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return payload; },
});

const seedProducts = async () => {
  const products = [
    { name: 'Avail', status: 'available' },
    { name: 'Reserved', status: 'reserved', reservedBy: 'u1', reservedUntil: new Date(Date.now() + 60_000) },
    { name: 'Sold', status: 'sold' },
  ];
  for (const product of products) {
    await Product.create({
      ...product,
      category: 'others',
      new_price: 10,
      old_price: 20,
      description: product.name,
      image: '/images/test.png',
      sellerId: 'seller',
      sellerName: 'Seller',
    });
  }
};

test('MongoDB listing status filter excludes sold items by default and supports explicit status', async () => {
  resetMongo();
  await seedProducts();

  const defaultRes = makeResponse();
  await getProducts({ query: {} }, defaultRes);
  assert.deepEqual(defaultRes.body.products.map((p) => p.name).sort(), ['Avail', 'Reserved']);

  const availableRes = makeResponse();
  await getProducts({ query: { status: 'available' } }, availableRes);
  assert.deepEqual(availableRes.body.products.map((p) => p.name), ['Avail']);

  const reservedRes = makeResponse();
  await getProducts({ query: { status: 'reserved' } }, reservedRes);
  assert.deepEqual(reservedRes.body.products.map((p) => p.name), ['Reserved']);

  const soldRes = makeResponse();
  await getProducts({ query: { status: 'sold' } }, soldRes);
  assert.deepEqual(soldRes.body.products.map((p) => p.name), ['Sold']);
});
