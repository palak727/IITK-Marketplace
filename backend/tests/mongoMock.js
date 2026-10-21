import mongoose from 'mongoose';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import OTPVerification from '../models/OTPVerification.js';

const collections = {
  User: [],
  Product: [],
  Message: [],
  Notification: [],
  OTPVerification: [],
};
mongoose.connection.readyState = 1;

const equal = (left, right) => {
  if (left instanceof Date || right instanceof Date) return new Date(left).getTime() === new Date(right).getTime();
  return String(left) === String(right);
};

const compare = (left, right) => {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return new Date(left).getTime() - new Date(right).getTime();
};

const matchesValue = (value, expected) => {
  if (expected instanceof RegExp) return expected.test(String(value ?? ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    return Object.entries(expected).every(([operator, operand]) => {
      if (operator === '$regex') return new RegExp(operand, expected.$options || '').test(String(value ?? ''));
      if (operator === '$options') return true;
      if (operator === '$ne') return !equal(value, operand);
      if (operator === '$in') return operand.some((item) => equal(value, item));
      if (operator === '$nin') return !operand.some((item) => equal(value, item));
      if (operator === '$lte') return value != null && compare(value, operand) <= 0;
      if (operator === '$lt') return value != null && compare(value, operand) < 0;
      if (operator === '$gte') return value != null && compare(value, operand) >= 0;
      if (operator === '$gt') return value != null && compare(value, operand) > 0;
      if (operator === '$exists') return Boolean(value !== undefined) === operand;
      if (operator === '$type') return operand === 'string'
        ? typeof value === 'string'
        : operand === 'date' && value instanceof Date;
      return false;
    });
  }
  return equal(value, expected);
};

const matches = (document, filter = {}) => Object.entries(filter).every(([key, expected]) => {
  if (key === '$or') return expected.some((item) => matches(document, item));
  if (key === '$and') return expected.every((item) => matches(document, item));
  return matchesValue(document[key], expected);
});

const addDocumentMethods = (document) => {
  if (!document) return document;
  Object.defineProperty(document, 'toObject', {
    enumerable: false,
    value: () => ({ ...document }),
  });
  return document;
};

class MockQuery {
  constructor(execute) {
    this.execute = execute;
    this.sortOrder = null;
    this.offset = 0;
    this.maxItems = Infinity;
  }

  select() { return this; }
  lean() { return this; }
  sort(order) { this.sortOrder = order; return this; }
  skip(offset) { this.offset = offset; return this; }
  limit(count) { this.maxItems = count; return this; }
  then(resolve, reject) { return Promise.resolve().then(() => this.executeList()).then(resolve, reject); }
  catch(reject) { return this.then(undefined, reject); }

  async executeList() {
    let result = await this.execute();
    if (!Array.isArray(result)) return result;
    if (this.sortOrder) {
      const entries = Object.entries(this.sortOrder);
      result.sort((left, right) => {
        for (const [key, direction] of entries) {
          const a = left[key];
          const b = right[key];
          if (equal(a, b)) continue;
          const comparison = a < b ? -1 : 1;
          return comparison * direction;
        }
        return 0;
      });
    }
    return result.slice(this.offset, this.offset + this.maxItems);
  }
}

const applyUpdate = (document, update, isInsert = false) => {
  for (const [operator, values] of Object.entries(update)) {
    if (operator === '$set' || (operator === '$setOnInsert' && isInsert)) Object.assign(document, values);
    else if (operator === '$unset') for (const key of Object.keys(values)) delete document[key];
    else if (operator === '$inc') {
      for (const [key, value] of Object.entries(values)) document[key] = (document[key] || 0) + value;
    } else if (!operator.startsWith('$')) document[operator] = values;
  }
  document.updatedAt = new Date();
};

const newDocument = (name, values) => {
  const document = {
    _id: new mongoose.Types.ObjectId().toString(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...values,
  };
  if (name === 'Product') {
    document.status ??= 'available';
    document.condition ??= 'Barely Used';
    document.hall ??= 'Hall 1';
    document.images ??= [];
    document.defects ??= [];
    document.soldAt ??= null;
    document.archivedAt ??= null;
  }
  if (name === 'Message') document.read ??= false;
  if (name === 'Notification') document.read ??= false;
  return addDocumentMethods(document);
};

const installModel = (Model) => {
  const name = Model.modelName;
  const documents = collections[name];
  const find = (filter = {}) => new MockQuery(() => documents.filter((item) => matches(item, filter)));

  Model.find = find;
  Model.findOne = (filter = {}) => new MockQuery(() => documents.find((item) => matches(item, filter)) || null);
  Model.findById = (id) => new MockQuery(() => documents.find((item) => equal(item._id, id)) || null);
  Model.exists = async (filter = {}) => documents.some((item) => matches(item, filter)) ? { _id: 'exists' } : null;
  Model.countDocuments = async (filter = {}) => documents.filter((item) => matches(item, filter)).length;
  Model.create = async (values) => {
    if (name === 'Product' && typeof values.clientRequestId === 'string' && documents.some((item) =>
      item.sellerId === values.sellerId && item.clientRequestId === values.clientRequestId
    )) {
      const error = new Error('duplicate idempotency key');
      error.code = 11000;
      throw error;
    }
    const document = newDocument(name, values);
    documents.push(document);
    return document;
  };
  Model.updateOne = async (filter, update, options = {}) => {
    let document = documents.find((item) => matches(item, filter));
    let upsertedCount = 0;
    if (!document && options.upsert) {
      const base = Object.fromEntries(Object.entries(filter).filter(([, value]) => value === null || typeof value !== 'object'));
      document = newDocument(name, base);
      applyUpdate(document, update, true);
      documents.push(document);
      upsertedCount = 1;
    } else if (document) {
      applyUpdate(document, update);
    }
    return { matchedCount: document && !upsertedCount ? 1 : 0, modifiedCount: document && !upsertedCount ? 1 : 0, upsertedCount };
  };
  Model.updateMany = async (filter, update) => {
    const found = documents.filter((item) => matches(item, filter));
    found.forEach((item) => applyUpdate(item, update));
    return { matchedCount: found.length, modifiedCount: found.length };
  };
  Model.deleteOne = async (filter) => {
    const index = documents.findIndex((item) => matches(item, filter));
    if (index < 0) return { deletedCount: 0 };
    documents.splice(index, 1);
    return { deletedCount: 1 };
  };
  Model.findOneAndUpdate = (filter, update, options = {}) => new MockQuery(() => {
    let document = documents.find((item) => matches(item, filter));
    if (!document && options.upsert) {
      const base = Object.fromEntries(Object.entries(filter).filter(([, value]) => value === null || typeof value !== 'object'));
      document = newDocument(name, base);
      applyUpdate(document, update, true);
      documents.push(document);
      return document;
    }
    if (!document) return null;
    const before = { ...document };
    applyUpdate(document, update);
    return options.new ? document : before;
  });
  Model.findByIdAndUpdate = (id, update) => Model.findOneAndUpdate({ _id: id }, update, { new: true });
  Model.init = async () => Model;
};

installModel(User);
installModel(Product);
installModel(Message);
installModel(Notification);
installModel(OTPVerification);

Message.aggregate = async (pipeline) => {
  const userId = pipeline[0].$match.$or[0].senderId;
  const userMessages = collections.Message
    .filter((item) => item.senderId === userId || item.receiverId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const threads = new Map();
  for (const message of userMessages) {
    if (!threads.has(message.conversationId)) {
      threads.set(message.conversationId, {
        latest: message,
        unread: userMessages.some((item) =>
          item.conversationId === message.conversationId && item.receiverId === userId && !item.read
        ),
      });
    }
  }
  const sorted = Array.from(threads, ([conversationId, thread]) => ({ conversationId, ...thread }))
    .sort((a, b) => b.latest.createdAt - a.latest.createdAt);
  const facet = pipeline.find((stage) => stage.$facet)?.$facet;
  const skip = facet.items.find((stage) => Object.hasOwn(stage, '$skip')).$skip;
  const limit = facet.items.find((stage) => Object.hasOwn(stage, '$limit')).$limit;
  const items = sorted.slice(skip, skip + limit).map(({ conversationId, latest, unread }) => ({
    conversationId,
    otherUserId: latest.senderId === userId ? latest.receiverId : latest.senderId,
    otherUserName: latest.senderId === userId ? latest.receiverName : latest.senderName,
    productId: latest.productId,
    lastMessage: latest.text,
    updatedAt: latest.createdAt,
    unread,
  }));
  return [{ items, total: sorted.length ? [{ count: sorted.length }] : [] }];
};

export const mongoCollections = collections;
export const resetMongo = (initial = {}) => {
  for (const [name, documents] of Object.entries(collections)) {
    documents.splice(0, documents.length, ...(initial[name] || []).map((values) => newDocument(name, values)));
  }
};
