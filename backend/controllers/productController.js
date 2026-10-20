import mongoose from 'mongoose';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import Product from '../models/Product.js';
import Message from '../models/Message.js';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import { createNotification } from './notificationController.js';

const MAX_PRICE = 100000000;
const MAX_PAGE_SIZE = 50;
const PRODUCT_CATEGORIES = ['coolers', 'mattresses', 'cycles', 'academics', 'appliances', 'others'];
const PRODUCT_STATUSES = ['available', 'reserved', 'sold'];
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8000;
const MAX_IMAGE_PIXELS = 40_000_000;

const getPID = (p) => (p._id ? p._id.toString() : p.id ? p.id.toString() : String(p));
const cleanString = (value) => typeof value === 'string' ? value.trim() : '';
const validImage = (value) => typeof value === 'string' && value.length <= 7 * 1024 * 1024 && (
  /^https:\/\//i.test(value) || /^\/images\/[\w./-]+$/.test(value) ||
  /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)
);
export const validateImageBuffer = async (buffer, declaredMime) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return false;
  try {
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(detected.mime) || detected.mime !== declaredMime) return false;
    const decoder = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' });
    const { width, height, format } = await decoder.metadata();
    const decodedMime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[format];
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
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(image);
    if (!match || !await validateImageBuffer(Buffer.from(match[2], 'base64'), match[1].toLowerCase())) return false;
  }
  return true;
};
const parsePage = (value, fallback) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
};
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const reportNotification = (data, io) => {
  createNotification(data).then((notification) => {
    if (io && data.type !== 'message') {
      io.to(`user:${String(data.recipientId)}`).emit('notification:new', { notificationId: String(notification._id || '') });
    }
  }).catch((error) => console.error('Business notification failed:', error.message));
};

const notifyInterestedBuyersOfSale = async ({ productId, sellerId, sellerName, reservedBy, eventTime, io }) => {
  const recipients = new Set(reservedBy ? [String(reservedBy)] : []);
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

const reconcileExpiredReservation = async (product, io) => {
  if (!product || product.status !== 'reserved' || (product.reservedUntil && new Date(product.reservedUntil) > new Date())) return product;
  const reservedBy = product.reservedBy ? String(product.reservedBy) : '';
  const expiryKey = product.reservedUntil ? new Date(product.reservedUntil).getTime() : 'missing';
  let released = true;
  const releasedProduct = await Product.findOneAndUpdate(
    {
      _id: product._id,
      status: 'reserved',
      $or: [{ reservedUntil: null }, { reservedUntil: { $lte: new Date() } }],
    },
    { $set: { status: 'available', reservedBy: null, reservedUntil: null } },
    { new: true, runValidators: true }
  ).lean();
  let updated = releasedProduct;
  if (!releasedProduct) {
    updated = await Product.findById(product._id).lean();
    released = false;
  }
  if (released && reservedBy) reportNotification({
    recipientId: reservedBy,
    type: 'product',
    message: 'Your reservation expired.',
    productId: getPID(product),
    eventKey: `reservation-expired:${getPID(product)}:${expiryKey}`,
  }, io);
  return updated;
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
  if (has('images') && (!Array.isArray(values.images) || values.images.length > 8 || values.images.some((image) => !validImage(image)))) errors.push('Provide at most 8 valid images.');
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
    const filter = {};
    if (category && category !== 'all') filter.category = category.toLowerCase();
    if (hall && hall !== 'all') filter.hall = hall;
    if (condition && condition !== 'all') filter.condition = condition;
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $ne: 'sold' };
    }
    if (search) {
      const escapedSearch = escapeRegExp(search.trim());
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } },
        { hall: { $regex: escapedSearch, $options: 'i' } },
        { category: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const sortOrder = sort === 'price-low' ? { new_price: 1, createdAt: -1 } :
      sort === 'price-high' ? { new_price: -1, createdAt: -1 } : { createdAt: -1 };
    const [rawList, total] = await Promise.all([
      Product.find(filter).sort(sortOrder).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    const list = await Promise.all(rawList.map((product) => reconcileExpiredReservation(product, req.io)));
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
    if (!item) return res.status(404).json({ message: 'Product not found' });
    return res.json(await reconcileExpiredReservation(item.toObject(), req.io));
  } catch (error) {
    console.error('Product lookup failed:', error);
    return res.status(500).json({ message: 'Unable to load this product right now.' });
  }
};

export const createProduct = async (req, res) => {
  const { name, category, new_price, old_price, description, hall, condition, defects, image, images } = req.body;
  const errors = validateProductFields({ name, category, new_price, old_price, description: description ?? '', hall: hall ?? '', condition: condition ?? 'Barely Used', defects: defects ?? [], image: image || FALLBACK_IMAGE, images: images ?? (image ? [image] : [FALLBACK_IMAGE]) });
  if (errors.length) return res.status(400).json({ message: errors[0] });
  if (!await validateInlineImages([image, images])) return res.status(400).json({ message: 'One or more product images are malformed or exceed safe dimensions.' });
  const clientRequestId = req.get?.('Idempotency-Key') || req.body.clientRequestId;
  if (clientRequestId !== undefined && (typeof clientRequestId !== 'string' || !/^[\w-]{8,100}$/.test(clientRequestId))) {
    return res.status(400).json({ message: 'Invalid idempotency key.' });
  }

  const defaultImg = image || FALLBACK_IMAGE;

  const payload = {
    name,
    category: category.toLowerCase(),
    new_price: Number(new_price),
    old_price: old_price ? Number(old_price) : Number(new_price) * 1.3,
    description: cleanString(description) || 'No detailed description provided.',
    image: defaultImg,
    images: images && images.length ? images : [defaultImg],
    hall: hall || req.user.hall || 'Hall 1',
    condition: condition || 'Barely Used',
    defects: Array.isArray(defects) ? defects : defects ? defects.split(',').map((d) => d.trim()) : [],
    status: 'available',
    sellerId: req.user.id,
    sellerName: req.user.name,
    ...(clientRequestId ? { clientRequestId } : {}),
  };

  try {
    const newProduct = await Product.create(payload);
    return res.status(201).json(newProduct);
  } catch (error) {
    if (error.code === 11000 && clientRequestId) {
      const existing = await Product.findOne({ sellerId: String(req.user.id), clientRequestId });
      if (existing) return res.status(200).json(existing);
    }
    console.error('Product creation failed:', error);
    return res.status(500).json({ message: 'Unable to create listing right now.' });
  }
};

export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const fields = ['name', 'category', 'new_price', 'old_price', 'description', 'hall', 'condition', 'defects', 'image', 'images'];
  const updates = Object.fromEntries(fields.filter((field) => Object.hasOwn(req.body, field)).map((field) => [field, req.body[field]]));
  if (!Object.keys(updates).length) return res.status(400).json({ message: 'No listing fields provided.' });
  const errors = validateProductFields(updates, { partial: true });
  if (errors.length) return res.status(400).json({ message: errors[0] });
  if (!await validateInlineImages([updates.image, updates.images])) return res.status(400).json({ message: 'One or more product images are malformed or exceed safe dimensions.' });
  if (updates.name) updates.name = updates.name.trim();
  if (updates.category) updates.category = updates.category.toLowerCase();
  if (updates.description !== undefined) updates.description = updates.description.trim();
  if (updates.hall !== undefined) updates.hall = updates.hall.trim();
  if (updates.defects && typeof updates.defects === 'string') updates.defects = updates.defects.split(',').map((value) => value.trim()).filter(Boolean);

  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found.' });
    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: String(req.user.id), status: 'available' },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (product) return res.json(product);
    const existing = await Product.findById(id).select('sellerId status').lean();
    if (!existing) return res.status(404).json({ message: 'Product not found.' });
    if (String(existing.sellerId) !== String(req.user.id)) return res.status(403).json({ message: 'You cannot edit another seller listing.' });
    return res.status(409).json({ message: 'Only available listings can be edited.' });
  } catch (error) {
    console.error('Product update failed:', error);
    return res.status(500).json({ message: 'Unable to update listing right now.' });
  }
};

export const reserveProduct = async (req, res) => {
  const { id } = req.params;
  const now = new Date();
  const reservedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' });
    const before = await Product.findById(id).select('status reservedBy reservedUntil seedKey').lean();
    if (before?.seedKey) {
      return res.status(409).json({ message: 'This sample listing is not linked to an active seller.' });
    }
    const updatedProduct = await Product.findOneAndUpdate(
      {
        _id: id,
        sellerId: { $ne: String(req.user.id) },
        $or: [
          { status: 'available' },
          { status: 'reserved', $or: [{ reservedUntil: null }, { reservedUntil: { $lte: now } }] },
        ],
      },
      { $set: { status: 'reserved', reservedUntil, reservedBy: String(req.user.id) } },
      { new: true, runValidators: true }
    );
    if (!updatedProduct) {
      const product = await Product.findById(id).select('sellerId status reservedUntil').lean();
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (String(product.sellerId) === String(req.user.id)) return res.status(403).json({ message: 'You cannot reserve your own listing.' });
      if (product.status === 'sold') return res.status(409).json({ message: 'This product already sold.' });
      return res.status(409).json({ message: 'This item is already reserved by another user.' });
    }
    if (before?.status === 'reserved' && (!before.reservedUntil || new Date(before.reservedUntil) <= now) && before.reservedBy) {
      reportNotification({
        recipientId: String(before.reservedBy), senderId: String(req.user.id), senderName: req.user.name,
        type: 'product', message: 'Your reservation expired.', productId: id,
        eventKey: `reservation-expired:${id}:${before.reservedUntil ? new Date(before.reservedUntil).getTime() : 'missing'}`,
      }, req.io);
    }
    reportNotification({
      recipientId: String(updatedProduct.sellerId), senderId: String(req.user.id), senderName: req.user.name,
      type: 'product', message: 'A buyer reserved your listing.', productId: id,
      eventKey: `reservation:${id}:${reservedUntil.getTime()}`,
    }, req.io);
    return res.json(updatedProduct);
  } catch (error) {
    console.error('Product reservation failed:', error);
    return res.status(500).json({ message: 'Unable to reserve this product right now.' });
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
    const allowedFrom = status === 'sold' ? ['available', 'reserved'] : status === 'available' ? ['reserved'] : [];
    if (!allowedFrom.length) return res.status(409).json({ message: `Cannot change a sold listing to ${status}.` });
    const update = { status, reservedBy: null, reservedUntil: null };
    const before = await Product.findOneAndUpdate(
      { _id: id, sellerId: String(req.user.id), status: { $in: allowedFrom } },
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
    const eventTime = before.reservedUntil ? new Date(before.reservedUntil).getTime() : product.updatedAt.getTime();
    if (status === 'sold') await notifyInterestedBuyersOfSale({
      productId: id,
      sellerId: product.sellerId,
      sellerName: req.user.name,
      reservedBy: before?.reservedBy,
      eventTime,
      io: req.io,
    });
    if (status === 'available' && before?.reservedBy) reportNotification({
      recipientId: String(before.reservedBy), senderId: String(req.user.id), senderName: req.user.name,
      type: 'product', message: 'The seller cancelled your reservation.', productId: id,
      eventKey: `cancelled:${id}:${eventTime}`,
    }, req.io);
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
    const product = await Product.findOneAndDelete({ _id: id, sellerId: String(req.user.id), status: { $ne: 'reserved' } });
    if (!product) {
      const existing = await Product.findById(id).select('sellerId status').lean();
      if (!existing) return res.status(404).json({ message: 'Product not found' });
      if (String(existing.sellerId) !== String(req.user.id)) return res.status(403).json({ message: 'You cannot delete another seller listing.' });
      return res.status(409).json({ message: 'Cancel the active reservation before deleting this listing.' });
    }
    return res.json({ message: 'Product deleted', product });
  } catch (error) {
    console.error('Product deletion failed:', error);
    return res.status(500).json({ message: 'Unable to delete listing right now.' });
  }
};

export const getSellerProducts = async (req, res) => {
  const sellerId = req.user.id;

  try {
    const products = await Product.find({ sellerId: String(sellerId) }).sort({ createdAt: -1 }).lean();
    const list = await Promise.all(products.map((product) => reconcileExpiredReservation(product, req.io)));
    return res.json(list);
  } catch (error) {
    console.error('Seller listings failed:', error);
    return res.status(500).json({ message: 'Unable to load your listings right now.' });
  }
};

export const uploadImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file uploaded.' });
  }

  if (!await validateImageBuffer(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({ message: 'Upload a valid JPEG, PNG, WebP, or GIF image up to 8000 by 8000 pixels.' });
  }

  if (isCloudinaryConfigured()) {
    try {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'iitk_marketplace',
      });
      return res.json({ url: result.secure_url });
    } catch (error) {
      console.error('Cloudinary upload failed:', error.message);
    }
  }

  const b64 = Buffer.from(req.file.buffer).toString('base64');
  const dataURI = `data:${req.file.mimetype};base64,${b64}`;
  return res.json({ url: dataURI });
};
