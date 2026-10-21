import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import User from '../models/User.js';
import Product from '../models/Product.js';
import cloudinary from '../config/cloudinary.js';
import { createProduct, deleteProduct, getProductById, getProducts, updateProduct, updateProductStatus, validateImageBuffer } from '../controllers/productController.js';
import { runProductCleanup } from '../services/productLifecycle.js';
import { seedProducts } from '../data/seedProducts.js';
import { seedSampleProducts } from '../services/productSeeder.js';
import { ensureSeedUsers, requireSeedConfiguration } from '../seed.js';
import { createChatMessage } from '../services/chatService.js';
import { MAX_PRODUCT_IMAGES, PRODUCT_IMAGE_TYPES } from '../utils/productImageConfig.js';
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
const makePng = async (background = '#fff') => sharp({ create: { width: 1, height: 1, channels: 3, background } }).png().toBuffer();

test('seed requires production authorization and hashes only new-user passwords', async () => {
  resetMongo();
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    allowProduction: process.env.ALLOW_PRODUCTION_SEED,
    password: process.env.SEED_USER_PASSWORD,
  };
  try {
    delete process.env.SEED_USER_PASSWORD;
    assert.throws(requireSeedConfiguration, /SEED_USER_PASSWORD is required/);
    process.env.NODE_ENV = 'production';
    process.env.SEED_USER_PASSWORD = 'seed-test-password-123';
    delete process.env.ALLOW_PRODUCTION_SEED;
    assert.throws(requireSeedConfiguration, /ALLOW_PRODUCTION_SEED=true/);
    process.env.ALLOW_PRODUCTION_SEED = 'true';
    assert.doesNotThrow(requireSeedConfiguration);

    const firstRun = await ensureSeedUsers();
    assert.ok(firstRun.every(({ created }) => created));
    assert.notEqual(firstRun[0].user.password, process.env.SEED_USER_PASSWORD);
    assert.equal(await bcrypt.compare(process.env.SEED_USER_PASSWORD, firstRun[0].user.password), true);

    const originalHash = firstRun[0].user.password;
    const secondRun = await ensureSeedUsers();
    assert.ok(secondRun.every(({ created }) => !created));
    assert.equal(secondRun[0].user.password, originalHash);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.allowProduction === undefined) delete process.env.ALLOW_PRODUCTION_SEED;
    else process.env.ALLOW_PRODUCTION_SEED = previous.allowProduction;
    if (previous.password === undefined) delete process.env.SEED_USER_PASSWORD;
    else process.env.SEED_USER_PASSWORD = previous.password;
    resetMongo();
  }
});

test('seeding relinks existing listings and they support seller chat', async () => {
  resetMongo();
  const sellerNames = [...new Set(seedProducts.map((product) => product.sellerName))];
  const sellers = await Promise.all(sellerNames.map((sellerName) => {
    const name = sellerName.replace(/ \(Y22\)$/, '');
    return User.create({ name, email: `${name.toLowerCase().replaceAll(' ', '.')}@iitk.ac.in`, password: 'hashed', emailVerified: true, hall: 'Hall 1' });
  }));
  const sellerIds = Object.fromEntries(sellerNames.map((name, index) => [name, String(sellers[index]._id)]));

  const firstRun = await seedSampleProducts(sellerIds);
  const lamp = mongoCollections.Product.find((item) => item.name.startsWith('Philips LED Desk Study Lamp'));
  const ananya = sellers[sellerNames.indexOf('Ananya Roy (Y22)')];
  const original = { image: lamp.image, description: lamp.description, new_price: lamp.new_price, old_price: lamp.old_price, status: lamp.status, sellerName: lamp.sellerName };
  lamp.sellerId = 'seed-old-placeholder';
  const legacyReserved = mongoCollections.Product.find((item) => item.name.startsWith('Kurlon'));
  legacyReserved.status = 'reserved';
  legacyReserved.reservedBy = 'old-buyer';
  legacyReserved.reservedUntil = new Date();
  legacyReserved.reservationRequestId = 'old-request';

  const secondRun = await seedSampleProducts(sellerIds);
  assert.equal(firstRun.inserted, seedProducts.length);
  assert.equal(secondRun.inserted, 0);
  assert.equal(secondRun.skipped, seedProducts.length);
  assert.equal(lamp.sellerId, String(ananya._id));
  assert.deepEqual(Object.fromEntries(Object.keys(original).map((key) => [key, lamp[key]])), original);
  assert.equal(legacyReserved.status, 'available');
  assert.equal(Object.hasOwn(legacyReserved, 'reservedBy'), false);
  assert.equal(Object.hasOwn(legacyReserved, 'reservedUntil'), false);
  assert.equal(Object.hasOwn(legacyReserved, 'reservationRequestId'), false);
  const existingSold = mongoCollections.Product.find((item) => item.status === 'sold');
  assert.ok(existingSold, 'seeding should preserve an intentionally sold listing');
  assert.equal(mongoCollections.Product.every((product) => sellers.some((seller) => String(seller._id) === product.sellerId)), true);

  const publicDetail = response();
  await getProductById({ params: { id: String(lamp._id) } }, publicDetail);
  assert.equal(publicDetail.body.sellerId, String(ananya._id));
  assert.equal(Object.hasOwn(publicDetail.body, 'seedKey'), false);

  const buyer = await User.create({ name: 'Buyer', email: 'buyer@iitk.ac.in', password: 'hashed', emailVerified: true, hall: 'Hall 2' });
  const chat = await createChatMessage({
    sender: { id: String(buyer._id), name: buyer.name },
    receiverId: String(ananya._id),
    productId: String(lamp._id),
    text: 'Is this lamp available?',
  });
  assert.ok(chat.message._id);

});

test('public product filters hide sold listings', async () => {
  resetMongo();
  await addProduct({ name: 'Cooler', category: 'coolers', status: 'available', new_price: 250 });
  await addProduct({ name: 'Cycle', category: 'cycles', status: 'sold', new_price: 100 });
  await addProduct({ name: 'Fan', category: 'appliances', status: 'available', new_price: 50 });

  const res = response();
  await getProducts({ query: { status: 'available' } }, res);
  assert.deepEqual(res.body.products.map((product) => product.name).sort(), ['Cooler', 'Fan']);

  const defaultList = response();
  await getProducts({ query: {} }, defaultList);
  assert.deepEqual(defaultList.body.products.map((product) => product.name).sort(), ['Cooler', 'Fan']);

  const soldSearch = response();
  await getProducts({ query: { search: 'Cycle', status: 'sold' } }, soldSearch);
  assert.equal(soldSearch.body.total, 0);
  const soldDetail = response();
  await getProductById({ params: { id: String(mongoCollections.Product.find((item) => item.name === 'Cycle')._id) } }, soldDetail);
  assert.equal(soldDetail.statusCode, 404);
});

test('seller can create multiple listings and idempotent retries reject changed payloads', async () => {
  resetMongo();
  const listingBody = (name, clientRequestId, price = 100) => ({
    name, category: 'others', new_price: price, old_price: 150,
    description: 'A test listing', image: '/images/test.png', clientRequestId,
    sellerId: 'attacker-controlled',
  });
  const create = async (body) => {
    const res = response();
    await createProduct({ body, user: { id: 'seller-a', name: 'Seller', hall: 'Hall 1' } }, res);
    return res;
  };

  const first = await create(listingBody('First listing', 'request-key-0001'));
  const retry = await create(listingBody('First listing', 'request-key-0001'));
  const conflict = await create(listingBody('Different listing', 'request-key-0001'));
  const second = await create(listingBody('Second listing', 'request-key-0002'));
  assert.equal(first.statusCode, 201);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body._id, first.body._id);
  assert.equal(conflict.statusCode, 409);
  assert.equal(second.statusCode, 201);
  assert.equal(mongoCollections.Product.length, 2);
  assert.ok(mongoCollections.Product.every((item) => item.sellerId === 'seller-a'));
});

test('listing creation accepts multiple images and rejects invalid files', async () => {
  resetMongo();
  const previousCloudinaryConfig = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map((key) => process.env[key]);
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  try {
    const png = await makePng('#fff');
    const secondPng = await makePng('#000');
    const body = { name: 'Two image listing', category: 'others', new_price: 100, old_price: 150, description: 'Has two photos.' };
    const created = response();
    await createProduct({ body, files: [png, secondPng].map((buffer) => ({ buffer, size: buffer.length, mimetype: 'image/png' })), user: { id: 'seller-a', name: 'Seller', hall: 'Hall 1' } }, created);
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.images.length, 2);
    assert.equal(created.body.image, created.body.images[0]);

    const invalid = response();
    await createProduct({ body: { ...body, name: 'Invalid file listing' }, files: [
      { buffer: png, size: png.length, mimetype: 'image/png' },
      { buffer: Buffer.from('not an image'), size: 12, mimetype: 'image/png' },
    ], user: { id: 'seller-a', name: 'Seller', hall: 'Hall 1' } }, invalid);
    assert.equal(invalid.statusCode, 400);
    assert.equal(mongoCollections.Product.length, 1);
  } finally {
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].forEach((key, index) => {
      if (previousCloudinaryConfig[index] === undefined) delete process.env[key];
      else process.env[key] = previousCloudinaryConfig[index];
    });
  }
});

test('only JPEG, PNG, and WebP content is accepted, including spoofed GIF MIME types', async () => {
  assert.deepEqual(PRODUCT_IMAGE_TYPES, ['image/jpeg', 'image/png', 'image/webp']);
  const image = { create: { width: 2, height: 2, channels: 3, background: '#fff' } };
  const jpeg = await sharp(image).jpeg().toBuffer();
  const png = await sharp(image).png().toBuffer();
  const webp = await sharp(image).webp().toBuffer();
  for (const [buffer, mime] of [[jpeg, 'image/jpeg'], [png, 'image/png'], [webp, 'image/webp']]) {
    assert.equal(await validateImageBuffer(buffer, mime), true, `${mime} should be accepted`);
  }

  const gif = Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64');
  assert.equal(await validateImageBuffer(gif, 'image/gif'), false);
  assert.equal(await validateImageBuffer(gif, 'image/png'), false, 'spoofing the MIME type must not allow GIF content');
});

test('a listing contains at most four images across existing and new images', async () => {
  resetMongo();
  const four = Array.from({ length: MAX_PRODUCT_IMAGES }, (_, index) => `/images/${index}.png`);
  const created = response();
  await createProduct({
    body: { name: 'Four images', category: 'others', new_price: 100, old_price: 150, description: 'At the limit.', images: four },
    user: { id: 'seller-a', name: 'Seller', hall: 'Hall 1' },
  }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.images.length, 4);
  assert.equal(created.body.image, four[0]);

  const five = response();
  await createProduct({
    body: { name: 'Five images', category: 'others', new_price: 100, old_price: 150, description: 'Over the limit.', images: [...four, '/images/fifth.png'] },
    user: { id: 'seller-a', name: 'Seller', hall: 'Hall 1' },
  }, five);
  assert.equal(five.statusCode, 400);

  const product = await addProduct({ images: four.slice(0, 3), image: four[0] });
  const png = await makePng();
  const update = response();
  await updateProduct({
    params: { id: String(product._id) },
    body: { images: four.slice(0, 3) },
    files: [png, png].map((buffer) => ({ buffer, size: buffer.length, mimetype: 'image/png' })),
    user: { id: 'seller-a' },
  }, update);
  assert.equal(update.statusCode, 400, 'three saved images plus two uploads must be rejected');
  assert.deepEqual(product.images, four.slice(0, 3));
});

test('editing removes selected images and appends replacements without changing the primary image', async () => {
  resetMongo();
  const cloudinaryKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const previousCloudinaryConfig = cloudinaryKeys.map((key) => process.env[key]);
  cloudinaryKeys.forEach((key) => delete process.env[key]);
  try {
    const savedImages = ['/images/first.png', '/images/remove.png', '/images/third.png', '/images/fourth.png'];
    const product = await addProduct({ images: savedImages, image: savedImages[0] });
    const png = await makePng();
    const result = response();
    await updateProduct({
      params: { id: String(product._id) },
      body: { images: ['/images/first.png', '/images/third.png', '/images/fourth.png'] },
      files: [{ buffer: png, size: png.length, mimetype: 'image/png' }],
      user: { id: 'seller-a' },
    }, result);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.images, ['/images/first.png', '/images/third.png', '/images/fourth.png', `data:image/png;base64,${png.toString('base64')}`]);
    assert.equal(result.body.image, '/images/first.png');
  } finally {
    cloudinaryKeys.forEach((key, index) => {
      if (previousCloudinaryConfig[index] === undefined) delete process.env[key];
      else process.env[key] = previousCloudinaryConfig[index];
    });
  }
});

test('editing without image fields preserves the gallery, including legacy single-image listings', async () => {
  resetMongo();
  const gallery = await addProduct({ images: ['/images/one.png', '/images/two.png'], image: '/images/one.png' });
  const changed = response();
  await updateProduct({ params: { id: String(gallery._id) }, body: { name: 'Renamed listing' }, user: { id: 'seller-a' } }, changed);
  assert.deepEqual(changed.body.images, ['/images/one.png', '/images/two.png']);
  assert.equal(changed.body.image, '/images/one.png');

  const legacy = await addProduct({ name: 'Legacy listing', images: [], image: '/images/legacy.png' });
  const legacyChanged = response();
  await updateProduct({ params: { id: String(legacy._id) }, body: { name: 'Updated legacy listing' }, user: { id: 'seller-a' } }, legacyChanged);
  assert.deepEqual(legacyChanged.body.images, ['/images/legacy.png']);
  assert.equal(legacyChanged.body.image, '/images/legacy.png');
});

test('failed listing creation removes images uploaded to Cloudinary', async () => {
  resetMongo();
  const env = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map((key) => process.env[key]);
  const originalUpload = cloudinary.uploader.upload;
  const originalDestroy = cloudinary.uploader.destroy;
  const originalCreate = Product.create;
  const removed = [];
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  cloudinary.uploader.upload = async () => ({ secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/iitk_marketplace/test.png', public_id: 'iitk_marketplace/test' });
  cloudinary.uploader.destroy = async (publicId) => { removed.push(publicId); };
  Product.create = async () => { throw new Error('injected database failure'); };
  try {
    const png = await makePng();
    const result = response();
    await createProduct({
      body: { name: 'Upload then fail', category: 'others', new_price: 100, old_price: 150, description: 'Failure cleanup.' },
      files: [{ buffer: png, size: png.length, mimetype: 'image/png' }],
      user: { id: 'seller-a', name: 'Seller', hall: 'Hall 1' },
    }, result);
    assert.equal(result.statusCode, 500);
    assert.deepEqual(removed, ['iitk_marketplace/test']);
  } finally {
    Product.create = originalCreate;
    cloudinary.uploader.upload = originalUpload;
    cloudinary.uploader.destroy = originalDestroy;
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].forEach((key, index) => {
      if (env[index] === undefined) delete process.env[key];
      else process.env[key] = env[index];
    });
  }
});

test('failed Cloudinary upload removes earlier images from the same request', async () => {
  resetMongo();
  const env = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map((key) => process.env[key]);
  const originalUpload = cloudinary.uploader.upload;
  const originalDestroy = cloudinary.uploader.destroy;
  const removed = [];
  let calls = 0;
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  cloudinary.uploader.upload = async () => {
    calls += 1;
    if (calls === 2) throw new Error('injected upload failure');
    return { secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/iitk_marketplace/first.png', public_id: 'iitk_marketplace/first' };
  };
  cloudinary.uploader.destroy = async (publicId) => { removed.push(publicId); };
  try {
    const png = await makePng();
    const result = response();
    await createProduct({
      body: { name: 'Upload failure', category: 'others', new_price: 100, old_price: 150, description: 'Failure cleanup.' },
      files: [png, png].map((buffer) => ({ buffer, size: buffer.length, mimetype: 'image/png' })),
      user: { id: 'seller-a', name: 'Seller', hall: 'Hall 1' },
    }, result);
    assert.equal(result.statusCode, 500);
    assert.deepEqual(removed, ['iitk_marketplace/first']);
    assert.equal(mongoCollections.Product.length, 0);
  } finally {
    cloudinary.uploader.upload = originalUpload;
    cloudinary.uploader.destroy = originalDestroy;
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].forEach((key, index) => {
      if (env[index] === undefined) delete process.env[key];
      else process.env[key] = env[index];
    });
  }
});

test('concurrent listing retries with one idempotency key create only one listing', async () => {
  resetMongo();
  const body = { name: 'One listing', category: 'others', new_price: 100, old_price: 150, description: 'Test', image: '/images/test.png', clientRequestId: 'concurrent-key-01' };
  const results = await Promise.all([1, 2].map(async () => {
    const res = response();
    await createProduct({ body: { ...body }, user: { id: 'seller-a', name: 'Seller' } }, res);
    return res;
  }));
  assert.equal(mongoCollections.Product.length, 1);
  assert.deepEqual(results.map((res) => res.statusCode).sort(), [200, 201]);
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

test('seller removal archives a listing and retains its chat history', async () => {
  resetMongo();
  const product = await addProduct();
  const removed = response();
  await deleteProduct({ params: { id: String(product._id) }, user: { id: 'seller-a' } }, removed);
  assert.equal(removed.statusCode, 200);
  assert.ok(mongoCollections.Product[0].archivedAt);
  assert.equal(mongoCollections.Product.length, 1);
});

test('only the seller can mark an available listing sold, and sold listings are hidden', async () => {
  resetMongo();
  const product = await addProduct({ sellerId: 'seller-a', status: 'available' });
  const unauthorized = response();
  await updateProductStatus({ params: { id: String(product._id) }, body: { status: 'sold' }, user: { id: 'seller-b', name: 'Other seller' } }, unauthorized);
  assert.equal(unauthorized.statusCode, 403);
  const sold = response();
  await updateProductStatus({ params: { id: String(product._id) }, body: { status: 'sold' }, user: { id: 'seller-a', name: 'Seller' } }, sold);
  assert.equal(sold.body.status, 'sold');
  assert.ok(sold.body.soldAt instanceof Date);
  const listing = response();
  await getProducts({ query: { search: 'Test listing' } }, listing);
  assert.equal(listing.body.total, 0);
  const detail = response();
  await getProductById({ params: { id: String(product._id) } }, detail);
  assert.equal(detail.statusCode, 404);
});

test('scheduled cleanup archives only old sold listings with a sale date', async () => {
  resetMongo();
  const now = new Date();
  const oldDate = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const oldSold = await addProduct({ status: 'sold', soldAt: oldDate });
  const missingSoldDate = await addProduct({ status: 'sold', soldAt: null });
  const oldAvailable = await addProduct({ status: 'available', soldAt: oldDate });
  const result = await runProductCleanup(now);
  assert.equal(result.archivedCount, 1);
  assert.ok(mongoCollections.Product.find((item) => String(item._id) === String(oldSold._id)).archivedAt);
  assert.equal(mongoCollections.Product.find((item) => String(item._id) === String(missingSoldDate._id)).archivedAt, null);
  assert.equal(mongoCollections.Product.find((item) => String(item._id) === String(oldAvailable._id)).archivedAt, null);
  const archivedAt = mongoCollections.Product.find((item) => String(item._id) === String(oldSold._id)).archivedAt;
  await runProductCleanup(now);
  assert.equal(mongoCollections.Product.find((item) => String(item._id) === String(oldSold._id)).archivedAt.getTime(), archivedAt.getTime());
});

test('image upload validation rejects MIME spoofing and malformed image bytes', async () => {
  const validPng = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
  assert.equal(await validateImageBuffer(validPng, 'image/png'), true);
  assert.equal(await validateImageBuffer(Buffer.from('not a png'), 'image/png'), false);
  assert.equal(await validateImageBuffer(Buffer.from([137, 80, 78, 71]), 'image/png'), false);
  assert.equal(await validateImageBuffer(Buffer.alloc(0), 'image/png'), false);
});
