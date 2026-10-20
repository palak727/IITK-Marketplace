import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import Product from '../models/Product.js';
import { getConversationMessages } from '../controllers/chatController.js';
import { authorizeConversation, createChatMessage } from '../services/chatService.js';
import { deleteProduct } from '../controllers/productController.js';
import { mongoCollections, resetMongo } from './mongoMock.js';

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return payload; },
});

test('participants retain chat history after listing deletion and outsiders stay blocked', async () => {
  resetMongo();
  const [seller, buyer, outsider] = await Promise.all([
    User.create({ name: 'Seller', email: 'seller@iitk.ac.in', password: 'hashed-password' }),
    User.create({ name: 'Buyer', email: 'buyer@iitk.ac.in', password: 'hashed-password' }),
    User.create({ name: 'Outsider', email: 'outsider@iitk.ac.in', password: 'hashed-password' }),
  ]);
  const product = await Product.create({
    name: 'Cycle',
    category: 'cycles',
    new_price: 10,
    old_price: 20,
    description: 'Cycle',
    image: '/images/cycle.png',
    sellerId: String(seller._id),
    sellerName: 'Seller',
  });

  const { conversationId } = await createChatMessage({
    sender: { id: String(buyer._id), name: 'Buyer' },
    receiverId: String(seller._id),
    productId: String(product._id),
    text: 'Is this still available?',
  });

  const deleteRes = makeResponse();
  await deleteProduct({ params: { id: String(product._id) }, user: { id: String(seller._id) } }, deleteRes);
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(mongoCollections.Product.length, 0);

  assert.equal(await authorizeConversation(conversationId, String(buyer._id)), true);
  assert.equal(await authorizeConversation(conversationId, String(seller._id)), true);
  assert.equal(await authorizeConversation(conversationId, String(outsider._id)), false);

  const history = makeResponse();
  await getConversationMessages({ params: { conversationId }, query: {}, user: { id: String(buyer._id) } }, history);
  assert.equal(history.statusCode, 200);
  assert.equal(history.body.messages.length, 1);

  const denied = makeResponse();
  await getConversationMessages({ params: { conversationId }, query: {}, user: { id: String(outsider._id) } }, denied);
  assert.equal(denied.statusCode, 404);
});
