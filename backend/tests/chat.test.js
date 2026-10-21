import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Message from '../models/Message.js';
import { buildConversationId, saveMessage, getUserConversations, getConversationMessages, markAsRead } from '../controllers/chatController.js';
import { authorizeConversation, createChatMessage } from '../services/chatService.js';
import { deleteProduct } from '../controllers/productController.js';
import { mongoCollections, resetMongo } from './mongoMock.js';

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return payload; },
});

const userId = () => new mongoose.Types.ObjectId().toString();
const addUser = (id, name) => User.create({
  _id: id,
  name,
  email: `${name.toLowerCase()}@iitk.ac.in`,
  password: 'hashed-password',
});
const addProduct = (id, sellerId, name = 'Cycle') => Product.create({
  _id: id,
  name,
  category: 'cycles',
  new_price: 10,
  old_price: 20,
  description: name,
  image: '/images/test.png',
  sellerId,
  sellerName: 'Seller',
});

test('messages are grouped separately by product thread in MongoDB', async () => {
  resetMongo();
  const senderId = userId();
  const receiverId = userId();
  const productOne = userId();
  const productTwo = userId();

  for (const [productId, text] of [[productOne, 'First product message'], [productTwo, 'Second product message']]) {
    await saveMessage({
      conversationId: buildConversationId(senderId, receiverId, productId),
      senderId,
      senderName: 'Alice',
      receiverId,
      productId,
      text,
    });
  }

  const senderThreads = await getUserConversations({ user: { id: senderId }, query: {} }, { json: (data) => data });
  const receiverThreads = await getUserConversations({ user: { id: receiverId }, query: {} }, { json: (data) => data });
  assert.equal(senderThreads.conversations.length, 2);
  assert.equal(receiverThreads.conversations.length, 2);
});

test('only conversation participants can read an existing product thread', async () => {
  resetMongo();
  const buyerId = userId();
  const sellerId = userId();
  const outsiderId = userId();
  const productId = userId();
  await addUser(buyerId, 'Buyer');
  await addUser(sellerId, 'Seller');
  await addUser(outsiderId, 'Outsider');
  await addProduct(productId, sellerId);
  const { conversationId } = await createChatMessage({
    sender: { id: buyerId, name: 'Buyer' }, receiverId: sellerId, productId, text: 'Hello',
  });

  const archived = makeResponse();
  await deleteProduct({ params: { id: productId }, user: { id: sellerId } }, archived);
  assert.equal(archived.statusCode, 200);
  assert.ok(mongoCollections.Product[0].archivedAt);

  assert.equal(await authorizeConversation(conversationId, buyerId), true);
  assert.equal(await authorizeConversation(conversationId, sellerId), true);
  assert.equal(await authorizeConversation(conversationId, outsiderId), false);

  const denied = makeResponse();
  await getConversationMessages({ params: { conversationId }, query: {}, user: { id: outsiderId } }, denied);
  assert.equal(denied.statusCode, 404);
});

test('chat send derives sender identity, blocks unauthorized participants, and creates one notification', async () => {
  resetMongo();
  const senderId = userId();
  const sellerId = userId();
  const outsiderId = userId();
  const productId = userId();
  await addUser(senderId, 'Sender');
  await addUser(sellerId, 'Seller');
  await addUser(outsiderId, 'Outsider');
  await addProduct(productId, sellerId, 'Lamp');

  await assert.rejects(createChatMessage({
    sender: { id: outsiderId, name: 'Outsider' }, receiverId: senderId, productId, text: 'Spoof',
  }));
  assert.equal(mongoCollections.Message.length, 0);

  const result = await createChatMessage({
    sender: { id: senderId, name: 'Sender' }, receiverId: sellerId, productId, text: '  Is it available?  ',
  });
  assert.equal(result.message.senderId, senderId);
  assert.equal(result.message.text, 'Is it available?');
  assert.equal(mongoCollections.Notification.length, 1);
  assert.equal(mongoCollections.Notification[0].recipientId, sellerId);

  await assert.rejects(createChatMessage({
    sender: { id: senderId, name: 'Sender' }, receiverId: sellerId, productId, text: 'x'.repeat(2001),
  }));
});

test('chat history pagination is bounded and mark-read remains receiver scoped', async () => {
  resetMongo();
  const buyerId = userId();
  const sellerId = userId();
  const productId = userId();
  await addProduct(productId, sellerId);
  const conversationId = buildConversationId(buyerId, sellerId, productId);
  for (let index = 0; index < 3; index += 1) {
    await saveMessage({
      conversationId,
      senderId: buyerId,
      senderName: 'Buyer',
      receiverId: sellerId,
      productId,
      text: `Message ${index}`,
    });
  }
  await saveMessage({
    conversationId,
    senderId: sellerId,
    senderName: 'Seller',
    receiverId: buyerId,
    productId,
    text: 'Seller reply',
  });

  const result = makeResponse();
  await getConversationMessages({
    params: { conversationId }, query: { page: '1', limit: '2' }, user: { id: sellerId },
  }, result);
  assert.equal(result.body.messages.length, 2);
  assert.equal(result.body.total, 4);

  const readResponse = makeResponse();
  await markAsRead({ params: { conversationId }, user: { id: sellerId } }, readResponse);
  assert.equal(mongoCollections.Message.filter((message) => message.receiverId === sellerId).every((message) => message.read), true);
  assert.equal(mongoCollections.Message.filter((message) => message.receiverId === buyerId).every((message) => !message.read), true);
});
