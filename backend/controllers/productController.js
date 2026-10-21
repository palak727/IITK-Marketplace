import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import Product from '../models/Product.js';
import Message from '../models/Message.js';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import { createNotification } from './notificationController.js';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_PRODUCT_IMAGES,
  MAX_TOTAL_INLINE_IMAGE_BYTES,
  MAX_TOTAL_UPLOAD_BYTES,
  PRODUCT_IMAGE_DATA_URL,
  PRODUCT_IMAGE_TYPE_SET,
  SHARP_IMAGE_TYPES,
} from '../utils/productImageConfig.js';

const MAX_PRICE = 100000000;
const MAX_PAGE_SIZE = 50;
const PRODUCT_CATEGORIES = ['coolers', 'mattresses', 'cycles', 'academics', 'appliances', 'others'];
const PRODUCT_STATUSES = ['available', 'sold'];
const IDEMPOTENCY_FIELDS = ['name', 'category', 'new_price', 'old_price', 'description', 'image', 'images', 'hall', 'condition', 'defects'];
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';
const getPID = (p) => (p._id ? p._id.toString() : p.id ? p.id.toString() : String(p));
const cleanString = (value) => typeof value === 'string' ? value.trim() : '';
const validImage = (value) => typeof value === 'string' && value.length <= 7 * 1024 * 1024 && (
  /^https:\/\//i.test(value) || /^\/images\/[\w./-]+$/.test(value) ||
  PRODUCT_IMAGE_DATA_URL.test(value)
);
export const validateImageBuffer = async (buffer, declaredMime) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return false;
  try {
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !PRODUCT_IMAGE_TYPE_SET.has(detected.mime) || detected.mime !== declaredMime) return false;
    const decoder = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' });
    const { width, height, format } = await decoder.metadata();
    const decodedMime = SHARP_IMAGE_TYPES[format];
    if (decodedMime !== detected.mime) return false;
    await decoder.stats();
    return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 &&
      width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION && width * height <= MAX_IMAGE_PIXELS;
  } catch {
    return false;
  }
};

const validateInlineImages = async (values) => {
  const images = values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => typeof value === 'string' && value.startsWith('data:image/'));
  for (const image of images) {
    const match = PRODUCT_IMAGE_DATA_URL.exec(image);
    if (!match || !await validateImageBuffer(Buffer.from(match[2], 'base64'), match[1].toLowerCase())) return false;
  }
  return true;
};
const parseImageList = (value) => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // A single legacy image URL is also accepted.
  }
  return [value];
};
const validateImageList = (images) => {
  if (images.length > MAX_PRODUCT_IMAGES || images.some((image) => !validImage(image))) return false;
  const inlineBytes = images.reduce((total, image) => {
    if (!image.startsWith('data:image/')) return total;
    const base64 = image.slice(image.indexOf(',') + 1);
    return total + Math.floor(base64.length * 3 / 4);
  }, 0);
  return inlineBytes <= MAX_TOTAL_INLINE_IMAGE_BYTES;
};
const uploadProductImages = async (files = []) => {
  if (!Array.isArray(files) || files.length > MAX_PRODUCT_IMAGES ||
      files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_UPLOAD_BYTES) {
    const error = new Error('Select up to 4 images with a combined size under 12 MB.');
    error.status = 400;
    throw error;
  }
  for (const file of files) {
    if (!await validateImageBuffer(file.buffer, file.mimetype)) {
      const error = new Error('One or more images are unsupported, invalid, or exceed safe dimensions.');
      error.status = 400;
      throw error;
    }
  }
  if (!isCloudinaryConfigured()) {
    return {
      images: files.map((file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`),
      publicIds: [],
    };
  }

  const images = [];
  const publicIds = [];
  try {
    for (const file of files) {
      const data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const uploaded = await cloudinary.uploader.upload(data, { folder: 'iitk_marketplace' });
      images.push(uploaded.secure_url);
      publicIds.push(uploaded.public_id);
    }
    return { images, publicIds };
  } catch (error) {
    await Promise.allSettled(publicIds.map((publicId) => cloudinary.uploader.destroy(publicId)));
    throw error;
  }
};
const deleteUploadedImages = async (publicIds) => {
  await Promise.allSettled(publicIds.map((publicId) => cloudinary.uploader.destroy(publicId)));
};
const parsePage = (value, fallback) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
};
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hashListingPayload = (payload, fileDigests = []) => {
  const fields = Object.fromEntries(IDEMPOTENCY_FIELDS.map((field) => [field, payload[field]]));
  const content = JSON.stringify(fields);
  return createHash('sha256').update(fileDigests.length ? JSON.stringify({ content, fileDigests }) : content).digest('hex');
};
const toPublicProduct = (product) => {
  const publicProduct = typeof product?.toObject === 'function' ? product.toObject() : { ...product };
  delete publicProduct.clientRequestId;
  delete publicProduct.clientRequestHash;
  delete publicProduct.seedKey;
  return publicProduct;
};

const reportNotification = (data, io) => {
  createNotification(data).then((notification) => {
    if (io && data.type !== 'message') {
      io.to(`user:${String(data.recipientId)}`).emit('notification:new', { notificationId: String(notification._id || '') });
    }
  }).catch((error) => console.error('Business notification failed:', error.message));
};

const notifyInterestedBuyersOfSale = async ({ productId, sellerId, sellerName, eventTime, io }) => {
  const recipients = new Set();
  try {
    const messages = await Message.find({ productId: String(productId) }).select('senderId receiverId').lean();
    for (const message of messages) {
      const senderId = String(message.senderId);
      const receiverId = String(message.receiverId);
      if (senderId !== String(sellerId)) recipients.add(senderId);
      if (receiverId !== String(sellerId)) recipients.add(receiverId);
    }
  } catch (error) {
    console.error('Unable to load listing chat participants for sale notice:', error.message);
  }
  for (const recipientId of recipients) {
    if (!recipientId || recipientId === String(sellerId)) continue;
    reportNotification({
      recipientId,
      senderId: String(sellerId),
      senderName: sellerName,
      type: 'product',
      message: 'A listing you discussed has been marked sold.',
      productId: String(productId),
      eventKey: `sold:${productId}:${eventTime}:${recipientId}`,
    }, io);
  }
};

export const validateProductFields = (values, { partial = false } = {}) => {
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(values, key);
  if (!partial || has('name')) {
    if (typeof values.name !== 'string' || values.name.trim().length < 2 || values.name.trim().length > 100) errors.push('Name must be 2-100 characters.');
  }
  if (!partial || has('category')) {
    if (typeof values.category !== 'string' || !PRODUCT_CATEGORIES.includes(values.category.toLowerCase())) errors.push('Choose a valid category.');
  }
  if (!partial || has('new_price')) {
    const price = typeof values.new_price === 'number' ? values.new_price :
      typeof values.new_price === 'string' && values.new_price.trim() ? Number(values.new_price) : NaN;
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) errors.push('Selling price must be a finite amount between 0 and 100000000.');
  }
  if (has('old_price') && values.old_price !== '' && values.old_price !== null) {
    const price = typeof values.old_price === 'number' ? values.old_price :
      typeof values.old_price === 'string' && values.old_price.trim() ? Number(values.old_price) : NaN;
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) errors.push('Original price must be a finite amount between 0 and 100000000.');
  }
  if (has('description') && (typeof values.description !== 'string' || values.description.trim().length > 3000 || (partial && !values.description.trim()))) errors.push('Description must be non-empty and at most 3000 characters.');
  if (has('hall') && (typeof values.hall !== 'string' || values.hall.trim().length > 60)) errors.push('Hall must be at most 60 characters.');
  if (has('condition') && !['Brand New', 'Barely Used', 'Heavily Used'].includes(values.condition)) errors.push('Choose a valid condition.');
  if (has('image') && values.image && !validImage(values.image)) errors.push('Image must be an HTTPS URL or a supported image data URL.');
  if (has('images') && (!Array.isArray(values.images) || values.images.length > MAX_PRODUCT_IMAGES || values.images.some((image) => !validImage(image)))) errors.push(`Provide at most ${MAX_PRODUCT_IMAGES} valid images.`);
  if (has('defects') && !Array.isArray(values.defects) && (typeof values.defects !== 'string' || values.defects.length > 1500)) errors.push('Defects must be text of at most 1500 characters or a list.');
  if (Array.isArray(values.defects) && (values.defects.length > 15 || values.defects.some((item) => typeof item !== 'string' || item.trim().length > 100))) errors.push('Provide at most 15 defect labels of 100 characters each.');
  return errors;
};

export const getProducts = async (req, res) => {
  const { category, hall, search, condition, status } = req.query;
  const page = parsePage(req.query.page, 1);
  const limit = parsePage(req.query.limit, 20);
  if (!page || !limit || limit > MAX_PAGE_SIZE || (search && (typeof search !== 'string' || search.trim().length > 100))) {
    return res.status(400).json({ message: 'Invalid product query or pagination.' });
  }
  if (hall && (typeof hall !== 'string' || hall.trim().length > 60)) return res.status(400).json({ message: 'Invalid hall filter.' });
  if (condition && condition !== 'all' && !['Brand New', 'Barely Used', 'Heavily Used'].includes(condition)) {
    return res.status(400).json({ message: 'Invalid condition filter.' });
  }
  const sort = req.query.sort || 'newest';
  if (!['newest', 'price-low', 'price-high'].includes(sort)) return res.status(400).json({ message: 'Invalid product sort.' });
  if (category && category !== 'all' && !PRODUCT_CATEGORIES.includes(String(category).toLowerCase())) {
    return res.status(400).json({ message: 'Invalid category filter.' });
  }
  if (status && !PRODUCT_STATUSES.includes(String(status))) return res.status(400).json({ message: 'Invalid status filter.' });

  try {
    if (status === 'sold') return res.json({ products: [], total: 0, page, limit });

    const clauses = [{ archivedAt: null }];
    if (category && category !== 'all') clauses.push({ category: category.toLowerCase() });
    if (hall && hall !== 'all') clauses.push({ hall });
    if (condition && condition !== 'all') clauses.push({ condition });
    if (status === 'available') {
      clauses.push({ status: 'available' });
    } else {
      clauses.push({ status: { $ne: 'sold' } });
    }
    if (search) {
      const escapedSearch = escapeRegExp(search.trim());
      clauses.push({ $or: [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } },
        { hall: { $regex: escapedSearch, $options: 'i' } },
        { category: { $regex: escapedSearch, $options: 'i' } },
      ] });
    }
    const filter = { $and: clauses };

    const sortOrder = sort === 'price-low' ? { new_price: 1, createdAt: -1 } :
      sort === 'price-high' ? { new_price: -1, createdAt: -1 } : { createdAt: -1 };
    const [rawList, total] = await Promise.all([
      Product.find(filter).sort(sortOrder).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    const list = rawList.map(toPublicProduct);
    return res.json({ products: list, total, page, limit });
  } catch (error) {
    console.error('Product list failed:', error);
    return res.status(500).json({ message: 'Unable to load products right now.' });
  }
};

export const getProductById = async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' });
    const item = await Product.findById(id);
    if (!item || item.status === 'sold' || item.archivedAt) return res.status(404).json({ message: 'Product not found' });
    return res.json(toPublicProduct(item));
  } catch (error) {
    console.error('Product lookup failed:', error);
    return res.status(500).json({ message: 'Unable to load this product right now.' });
  }
};

export const createProduct = async (req, res) => {
  const body = req.body || {};
  const { name, category, new_price, old_price, description, hall, condition, defects, image } = body;
  const submittedImages = parseImageList(body.images);
  if (submittedImages === null) return res.status(400).json({ message: 'Images must be a list of valid image URLs.' });
  const baseImages = [...new Set(submittedImages ?? (image ? [image] : []))];
  const files = req.files || [];
  if (baseImages.length + files.length > MAX_PRODUCT_IMAGES || !validateImageList(baseImages)) {
    return res.status(400).json({ message: 'Provide up to 4 valid images.' });
  }
  const errors = validateProductFields({ name, category, new_price, old_price, description: description ?? '', hall: hall ?? '', condition: condition ?? 'Barely Used', defects: defects ?? [], image: baseImages[0] || image || FALLBACK_IMAGE, images: baseImages.length ? baseImages : [FALLBACK_IMAGE] });
  if (errors.length) return res.status(400).json({ message: errors[0] });
  if (!await validateInlineImages(baseImages)) return res.status(400).json({ message: 'One or more product images are malformed or exceed safe dimensions.' });
  const clientRequestId = req.get?.('Idempotency-Key') || body.clientRequestId;
  if (clientRequestId !== undefined && (typeof clientRequestId !== 'string' || !/^[\w-]{8,100}$/.test(clientRequestId))) {
    return res.status(400).json({ message: 'Invalid idempotency key.' });
  }

  const defaultImg = baseImages[0] || image || FALLBACK_IMAGE;
  const payload = {
    name,
    category: category.toLowerCase(),
    new_price: Number(new_price),
    old_price: old_price ? Number(old_price) : Number(new_price) * 1.3,
    description: cleanString(description) || 'No detailed description provided.',
    image: baseImages[0] || (files.length ? '' : defaultImg),
    images: baseImages.length ? baseImages : (files.length ? [] : [defaultImg]),
    hall: hall || req.user.hall || 'Hall 1',
    condition: condition || 'Barely Used',
    defects: Array.isArray(defects) ? defects : defects ? defects.split(',').map((d) => d.trim()) : [],
    status: 'available',
    sellerId: req.user.id,
    sellerName: req.user.name,
    ...(clientRequestId ? { clientRequestId } : {}),
  };
  const fileDigests = files.map((file) => createHash('sha256').update(file.buffer).digest('hex'));
  const payloadHash = hashListingPayload(payload, fileDigests);
  let uploadedPublicIds = [];

  try {
    if (clientRequestId) {
      const existing = await Product.findOne({ sellerId: String(req.user.id), clientRequestId }).lean();
      if (existing) {
        if ((existing.clientRequestHash || hashListingPayload(existing)) !== payloadHash) {
          return res.status(409).json({ message: 'This idempotency key was already used for a different listing.' });
        }
        return res.status(200).json(existing);
      }
      payload.clientRequestHash = payloadHash;
    }
    const uploaded = await uploadProductImages(files);
    uploadedPublicIds = uploaded.publicIds;
    payload.images = [...new Set([...baseImages, ...uploaded.images])];
    if (!payload.images.length) payload.images = [defaultImg];
    if (!validateImageList(payload.images)) {
      await deleteUploadedImages(uploadedPublicIds);
      return res.status(400).json({ message: 'Images exceed the listing count or local storage size limit.' });
    }
    payload.image = payload.images[0];
    const newProduct = await Product.create(payload);
    return res.status(201).json(newProduct);
  } catch (error) {
    await deleteUploadedImages(uploadedPublicIds);
    if (error.code === 11000 && clientRequestId) {
      try {
        const existing = await Product.findOne({ sellerId: String(req.user.id), clientRequestId }).lean();
        if (existing && (existing.clientRequestHash || hashListingPayload(existing)) === payloadHash) return res.status(200).json(existing);
        if (existing) return res.status(409).json({ message: 'This idempotency key was already used for a different listing.' });
      } catch (lookupError) {
        console.error('Idempotency lookup failed:', lookupError);
      }
    }
    if (!error.status) console.error('Product creation failed:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to create listing right now.' });
  }
};

export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const fields = ['name', 'category', 'new_price', 'old_price', 'description', 'hall', 'condition', 'defects', 'image', 'images'];
  const updates = Object.fromEntries(fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));
  const files = req.files || [];
  if (!Object.keys(updates).length && !files.length) return res.status(400).json({ message: 'No listing fields provided.' });
  if (Object.hasOwn(updates, 'images')) {
    updates.images = parseImageList(updates.images);
    if (updates.images === null) return res.status(400).json({ message: 'Images must be a list of valid image URLs.' });
  }
  if (updates.images === undefined && updates.image !== undefined) updates.images = [updates.image];
  const errors = validateProductFields(updates, { partial: true });
  if (errors.length) return res.status(400).json({ message: errors[0] });
  if (updates.images && (!validateImageList(updates.images) || !await validateInlineImages(updates.images))) {
    return res.status(400).json({ message: 'One or more product images are invalid or exceed safe limits.' });
  }
  if (updates.name) updates.name = updates.name.trim();
  if (updates.category) updates.category = updates.category.toLowerCase();
  if (updates.description !== undefined) updates.description = updates.description.trim();
  if (updates.hall !== undefined) updates.hall = updates.hall.trim();
  if (updates.defects && typeof updates.defects === 'string') updates.defects = updates.defects.split(',').map((value) => value.trim()).filter(Boolean);

  let uploadedPublicIds = [];
  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found.' });
    const existingProduct = await Product.findOne({ _id: id, sellerId: String(req.user.id), status: 'available', archivedAt: null }).lean();
    if (!existingProduct) {
      const existing = await Product.findById(id).select('sellerId status').lean();
      if (!existing) return res.status(404).json({ message: 'Product not found.' });
      if (String(existing.sellerId) !== String(req.user.id)) return res.status(403).json({ message: 'You cannot edit another seller listing.' });
      return res.status(409).json({ message: 'Only available listings can be edited.' });
    }
    const originalImages = existingProduct.images?.length ? existingProduct.images : [existingProduct.image];
    const selectedImages = updates.images ?? originalImages;
    if (selectedImages.length + files.length > MAX_PRODUCT_IMAGES) {
      return res.status(400).json({ message: 'A listing can contain at most 4 images.' });
    }
    const uploaded = await uploadProductImages(files);
    uploadedPublicIds = uploaded.publicIds;
    const nextImages = [...new Set([...selectedImages, ...uploaded.images])];
    if (!validateImageList(nextImages)) {
      await deleteUploadedImages(uploadedPublicIds);
      return res.status(400).json({ message: 'Images exceed the listing count or local storage size limit.' });
    }
    updates.images = nextImages.length ? nextImages : [FALLBACK_IMAGE];
    updates.image = updates.images[0];
    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: String(req.user.id), status: 'available', archivedAt: null },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (product) return res.json(product);
    await deleteUploadedImages(uploadedPublicIds);
    return res.status(409).json({ message: 'This listing is no longer available to edit.' });
  } catch (error) {
    await deleteUploadedImages(uploadedPublicIds);
    if (!error.status) console.error('Product update failed:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to update listing right now.' });
  }
};

export const updateProductStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!PRODUCT_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' });
    if (status !== 'sold') return res.status(400).json({ message: 'Listings can only be marked sold.' });
    const update = {
      status,
      soldAt: new Date(),
    };
    const before = await Product.findOneAndUpdate(
      { _id: id, sellerId: String(req.user.id), status: 'available', archivedAt: null },
      { $set: update },
      { new: false, runValidators: true }
    ).lean();
    if (!before) {
      const existing = await Product.findById(id).select('sellerId status').lean();
      if (!existing) return res.status(404).json({ message: 'Product not found' });
      if (String(existing.sellerId) !== String(req.user.id)) return res.status(403).json({ message: 'You cannot change another seller listing.' });
      return res.status(409).json({ message: `Cannot change a ${existing.status} listing to ${status}.` });
    }
    const product = { ...before, ...update, updatedAt: new Date() };
    await notifyInterestedBuyersOfSale({
      productId: id,
      sellerId: product.sellerId,
      sellerName: req.user.name,
      eventTime: product.updatedAt.getTime(),
      io: req.io,
    });
    return res.json(product);
  } catch (error) {
    console.error('Product status update failed:', error);
    return res.status(500).json({ message: 'Unable to update listing status right now.' });
  }
};

export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' });
    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: String(req.user.id), archivedAt: null },
      { $set: { archivedAt: new Date() } },
      { new: true }
    ).lean();
    if (!product) {
      const existing = await Product.findById(id).select('sellerId status archivedAt').lean();
      if (!existing) return res.status(404).json({ message: 'Product not found' });
      if (String(existing.sellerId) !== String(req.user.id)) return res.status(403).json({ message: 'You cannot delete another seller listing.' });
      if (existing.archivedAt) return res.status(409).json({ message: 'This listing is already archived.' });
      return res.status(409).json({ message: 'This listing could not be archived.' });
    }
    return res.json({ message: 'Product archived', product });
  } catch (error) {
    console.error('Product deletion failed:', error);
    return res.status(500).json({ message: 'Unable to delete listing right now.' });
  }
};

export const getSellerProducts = async (req, res) => {
  const sellerId = req.user.id;

  try {
    const products = await Product.find({ sellerId: String(sellerId) }).sort({ createdAt: -1 }).lean();
    return res.json(products.map(toPublicProduct));
  } catch (error) {
    console.error('Seller listings failed:', error);
    return res.status(500).json({ message: 'Unable to load your listings right now.' });
  }
};
