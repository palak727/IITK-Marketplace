import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotification, getNotifications, markNotificationRead } from '../controllers/notificationController.js';
import { mongoCollections, resetMongo } from './mongoMock.js';

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return payload; },
});

test('notifications are recipient-scoped and event creation is idempotent', async () => {
  resetMongo();
  const event = {
    recipientId: 'recipient-a', senderId: 'sender', type: 'product',
    message: 'A listing you discussed has been marked sold.', productId: 'product-a', eventKey: 'sold:product-a:123',
  };
  await createNotification(event);
  await createNotification(event);
  await createNotification({ ...event, recipientId: 'recipient-b', eventKey: 'sold:product-b:456' });
  assert.equal(mongoCollections.Notification.length, 2);

  const own = response();
  await getNotifications({ user: { id: 'recipient-a' }, query: {} }, own);
  assert.equal(own.body.total, 1);
  assert.equal(own.body.notifications[0].recipientId, 'recipient-a');

  const otherUserRead = response();
  await markNotificationRead({ params: { id: mongoCollections.Notification[0]._id }, user: { id: 'recipient-b' } }, otherUserRead);
  assert.equal(otherUserRead.statusCode, 404);
  assert.equal(mongoCollections.Notification[0].read, false);

  const recipientRead = response();
  await markNotificationRead({ params: { id: mongoCollections.Notification[0]._id }, user: { id: 'recipient-a' } }, recipientRead);
  assert.equal(recipientRead.body.success, true);
  assert.equal(mongoCollections.Notification[0].read, true);
});
