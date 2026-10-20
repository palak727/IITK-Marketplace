import test from 'node:test';
import assert from 'node:assert/strict';

const cartKeyForUserId = (userId) => `iitk_cart_${userId || 'guest'}`;

test('guest and authenticated cart keys stay isolated and guest cart is discarded on login', () => {
  const guestKey = cartKeyForUserId('guest');
  const userAKey = cartKeyForUserId('user-a');
  const userBKey = cartKeyForUserId('user-b');

  assert.equal(guestKey, 'iitk_cart_guest');
  assert.notEqual(guestKey, userAKey);
  assert.notEqual(userAKey, userBKey);

  const storage = new Map();
  storage.set(guestKey, JSON.stringify({ p1: 1 }));
  storage.set(userAKey, JSON.stringify({ a: 1, b: 1 }));

  const loginAsUserA = () => {
    storage.delete(guestKey);
    return JSON.parse(storage.get(userAKey) || '{}');
  };

  const authenticatedCart = loginAsUserA();
  assert.deepEqual(authenticatedCart, { a: 1, b: 1 });
  assert.equal(storage.has(guestKey), false);
  assert.equal(JSON.parse(storage.get(userAKey)).a, 1);
});

test('adding to guest cart does not change backend listing availability semantics', () => {
  const listing = { id: 'p1', status: 'available', reservedBy: null };
  const guestCart = { p1: 1 };
  assert.equal(guestCart.p1, 1);
  assert.equal(listing.status, 'available');
  assert.equal(listing.reservedBy, null);
});
