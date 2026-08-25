import test from 'node:test';
import assert from 'node:assert/strict';
import { getProducts, reserveProduct } from '../controllers/productController.js';
import { setMemoryMode, memoryStore } from '../store/memoryStore.js';

test('product list excludes sold items and returns the complete filtered list', async () => {
  setMemoryMode(true);
  memoryStore.products = [
    { _id: 'p1', id: 'p1', name: 'Cooler', status: 'available', category: 'coolers', hall: 'Hall 1', condition: 'Barely Used' },
    { _id: 'p2', id: 'p2', name: 'Cycle', status: 'sold', category: 'cycles', hall: 'Hall 2', condition: 'Brand New' },
    { _id: 'p3', id: 'p3', name: 'Lamp', status: 'available', category: 'appliances', hall: 'Hall 3', condition: 'Barely Used' },
  ];

  const res = {
    json(payload) {
      assert.equal(payload.products.length, 2);
      assert.equal(payload.total, 2);
      assert.equal('page' in payload, false);
      return payload;
    },
  };

  await getProducts({ query: {} }, res);
});

test('search ranking orders the most relevant product first', async () => {
  setMemoryMode(true);
  memoryStore.products = [
    { _id: 'p1', id: 'p1', name: 'Bookshelf', description: 'wooden storage', category: 'others', hall: 'Hall 1', status: 'available', createdAt: new Date('2025-01-01') },
    { _id: 'p2', id: 'p2', name: 'Cooler', description: 'portable room cooler', category: 'coolers', hall: 'Hall 2', status: 'available', createdAt: new Date('2025-02-01') },
  ];

  const res = { json(payload) { return payload; } };
  const result = await getProducts({ query: { search: 'cooler' } }, res);

  assert.equal(result.products[0].name, 'Cooler');
});

test('reserveProduct rejects sold items and conflicting reservations', async () => {
  setMemoryMode(true);
  memoryStore.products = [
    { _id: 'p10', id: 'p10', name: 'Laptop', status: 'sold', category: 'others', hall: 'Hall 1', reservedBy: 'u99' },
    { _id: 'p11', id: 'p11', name: 'Cycle', status: 'reserved', category: 'cycles', hall: 'Hall 2', reservedBy: 'u2' },
  ];

  let soldResponse;
  await reserveProduct({ params: { id: 'p10' }, user: { id: 'u1' } }, {
    status(code) { this.code = code; return this; },
    json(data) { soldResponse = data; },
  });
  assert.equal(soldResponse.message.includes('already sold'), true);

  let conflictResponse;
  await reserveProduct({ params: { id: 'p11' }, user: { id: 'u1' } }, {
    status(code) { this.code = code; return this; },
    json(data) { conflictResponse = data; },
  });
  assert.equal(conflictResponse.message.includes('already reserved'), true);
});
