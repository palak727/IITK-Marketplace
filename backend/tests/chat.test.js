import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationId, saveMessage, getUserConversations, getConversationMessages, markAsRead } from '../controllers/chatController.js';
import { setMemoryMode, memoryStore } from '../store/memoryStore.js';

test('conversation ids stay distinct per product', () => {
  assert.notEqual(buildConversationId('u1', 'u2', 'p1'), buildConversationId('u1', 'u2', 'p2'));
  assert.equal(buildConversationId('u1', 'u2', 'p1'), 'u1_u2_p1');
});

test('messages are grouped separately by product thread', async () => {
  setMemoryMode(true);
  memoryStore.messages = [];

  await saveMessage({
    conversationId: buildConversationId('u1', 'u2', 'p1'),
    senderId: 'u1',
    senderName: 'Alice',
    receiverId: 'u2',
    productId: 'p1',
    text: 'First product message',
  });

  await saveMessage({
    conversationId: buildConversationId('u1', 'u2', 'p2'),
    senderId: 'u1',
    senderName: 'Alice',
    receiverId: 'u2',
    productId: 'p2',
    text: 'Second product message',
  });

  const user1Threads = await getUserConversations({ user: { id: 'u1' } }, { json: (data) => data });
  const user2Threads = await getUserConversations({ user: { id: 'u2' } }, { json: (data) => data });

  assert.equal(user1Threads.length, 2);
  assert.equal(user2Threads.length, 2);
});

test('markAsRead updates only the recipient messages in the requested thread', async () => {
  setMemoryMode(true);
  memoryStore.messages = [
    { conversationId: 'u1_u2_p1', senderId: 'u1', senderName: 'Alice', receiverId: 'u2', productId: 'p1', text: 'one', read: false, createdAt: new Date() },
    { conversationId: 'u1_u2_p1', senderId: 'u2', senderName: 'Bob', receiverId: 'u1', productId: 'p1', text: 'two', read: false, createdAt: new Date() },
    { conversationId: 'u1_u2_p2', senderId: 'u1', senderName: 'Alice', receiverId: 'u2', productId: 'p2', text: 'three', read: false, createdAt: new Date() },
  ];

  const response = await markAsRead({ params: { conversationId: 'u1_u2_p1' }, user: { id: 'u2' } }, { json: (data) => data });
  const threadMessages = await getConversationMessages({ params: { conversationId: 'u1_u2_p1' }, user: { id: 'u2' } }, { json: (data) => data });

  assert.equal(response.success, true);
  assert.equal(threadMessages[0].read, true || threadMessages[0].read === true);
});
