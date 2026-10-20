import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Message from '../models/Message.js';
import { generateToken } from '../middleware/auth.js';
import { buildConversationId, createChatMessage } from '../services/chatService.js';
import { setupSocketHandlers } from '../socket/chatSocket.js';
import { mongoCollections, resetMongo } from './mongoMock.js';

const makeSocketServer = () => {
  const server = { broadcasts: [], middleware: null, connectionHandler: null };
  server.use = (handler) => { server.middleware = handler; };
  server.on = (event, handler) => { if (event === 'connection') server.connectionHandler = handler; };
  server.emit = (event, payload) => server.broadcasts.push({ room: '', event, payload });
  server.to = (room) => ({ emit: (event, payload) => server.broadcasts.push({ room, event, payload }) });
  return server;
};

const connectSocket = async (server, id, user) => {
  const socket = {
    id,
    handshake: { auth: { token: generateToken({ id: user._id }) } },
    rooms: new Set(),
    handlers: {},
    on(event, handler) { this.handlers[event] = handler; },
    join(room) { this.rooms.add(room); },
  };
  await new Promise((resolve, reject) => server.middleware(socket, (error) => error ? reject(error) : resolve()));
  server.connectionHandler(socket);
  return socket;
};

const setupUsersAndProduct = async () => {
  resetMongo();
  const users = await Promise.all(['A', 'B', 'C'].map((name) => User.create({
    name,
    email: `${name.toLowerCase()}@iitk.ac.in`,
    password: 'hashed-password',
  })));
  const product = await Product.create({
    name: 'Lamp',
    category: 'appliances',
    new_price: 10,
    old_price: 20,
    description: 'Lamp',
    image: '/images/lamp.png',
    sellerId: String(users[1]._id),
    sellerName: 'B',
  });
  return { users, product };
};

test('socket room join rejects a nonparticipant and send acknowledges persisted messages', async () => {
  const { users, product } = await setupUsersAndProduct();
  const [buyer, seller, outsider] = users;
  const conversationId = buildConversationId(buyer._id, seller._id, product._id);
  await createChatMessage({
    sender: { id: String(buyer._id), name: buyer.name },
    receiverId: String(seller._id),
    productId: String(product._id),
    text: 'Start',
  });

  const io = makeSocketServer();
  setupSocketHandlers(io);
  const outsiderSocket = await connectSocket(io, 'socket-c-tab', outsider);
  let joinResult;
  await outsiderSocket.handlers['chat:join']({ conversationId }, (result) => { joinResult = result; });
  assert.equal(joinResult.success, false);
  assert.equal(outsiderSocket.rooms.has(conversationId), false);

  const sender = await connectSocket(io, 'socket-a-tab', buyer);
  let sendResult;
  await sender.handlers['chat:send']({
    receiverId: String(seller._id), productId: String(product._id), text: 'Persist me',
  }, (result) => { sendResult = result; });
  assert.equal(sendResult.success, true);
  assert.equal(sendResult.message.senderId, String(buyer._id));
  assert.equal(mongoCollections.Message.at(-1).text, 'Persist me');
  assert.equal(io.broadcasts.filter((event) => event.event === 'chat:message').length, 1);
});

test('socket persistence failure acknowledges failure and does not broadcast', async () => {
  const { users, product } = await setupUsersAndProduct();
  const [senderUser, receiver] = users;
  const io = makeSocketServer();
  setupSocketHandlers(io);
  const sender = await connectSocket(io, 'socket-a-fail', senderUser);
  const originalCreate = Message.create;
  Message.create = async () => { throw new Error('injected persistence failure'); };

  try {
    let sendResult;
    await sender.handlers['chat:send']({
      receiverId: String(receiver._id), productId: String(product._id), text: 'Do not broadcast',
    }, (result) => { sendResult = result; });
    assert.equal(sendResult.success, false);
    assert.equal(io.broadcasts.filter((event) => event.event === 'chat:message').length, 0);
  } finally {
    Message.create = originalCreate;
  }
});

test('multiple sockets keep a user online until the final device disconnects', async () => {
  const { users } = await setupUsersAndProduct();
  const io = makeSocketServer();
  const onlineUsers = setupSocketHandlers(io);
  const first = await connectSocket(io, 'socket-a-first', users[0]);
  const second = await connectSocket(io, 'socket-a-second', users[0]);
  const userId = String(users[0]._id);
  assert.equal(onlineUsers.get(userId).size, 2);

  first.handlers.disconnect();
  assert.equal(onlineUsers.get(userId).size, 1);
  assert.equal(io.broadcasts.filter((event) => event.event === 'user:online' && event.payload.userId === userId && !event.payload.online).length, 0);

  second.handlers.disconnect();
  assert.equal(onlineUsers.has(userId), false);
  assert.equal(io.broadcasts.filter((event) => event.event === 'user:online' && event.payload.userId === userId && !event.payload.online).length, 1);
});
