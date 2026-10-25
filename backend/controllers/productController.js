import mongoose from 'mongoose';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import Product from '../models/Product.js';
import User from '../models/User.js';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_PRODUCT_IMAGES,
  MAX_TOTAL_UPLOAD_BYTES,
  PRODUCT_IMAGE_TYPE_SET,
  SHARP_IMAGE_TYPES,
} from '../utils/productImageConfig.js';

const MAX_PAGE_SIZE = 50;
const PRODUCT_CATEGORIES = ['coolers', 'mattresses', 'cycles', 'academics', 'appliances', 'others'];
const PRODUCT_STATUSES = ['available', 'sold'];
const availableProductFilter = (filter = {}) => ({
  ...filter,
  status: 'available',
});
const validImage = (value) => typeof value === 'string' && (
  /^https:\/\//i.test(value) || /^\/images\/[\w./-]+$/.test(value)
);

export const validateImageBuffer = async (buffer, declaredMime) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return false;
  try {
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !PRODUCT_IMAGE_TYPE_SET.has(detected.mime) || detected.mime !== declaredMime) return false;
    const { width, height, format } = await sharp(buffer, {limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning'}).metadata();
    if (SHARP_IMAGE_TYPES[format] !== detected.mime) return false;
    return ( Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 &&
    width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION && width * height <= MAX_IMAGE_PIXELS);
  } catch {
    return false;
  }
};
const parseImageList = (value) => {
  if (value === undefined) return value;
  const images = Array.isArray(value) ? value : typeof value === 'string' ? (value ? [value] : []) : null;
  return images === null ? null : [...new Set(images.map((image) => typeof image === 'string' ? image.trim() : image))];
};
const uploadProductImages = async (files = []) => {
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_UPLOAD_BYTES) {
    const error = new Error('Select up to 4 images with a combined size under 12 MB.');
    error.status = 400;
    throw error;
  }
  if (files.length === 0) return { images: [], publicIds: [] };
  for (const file of files) {
    if (!await validateImageBuffer(file.buffer, file.mimetype)) {
      const error = new Error('One or more images are unsupported, invalid, or exceed safe dimensions.');
      error.status = 400;
      throw error;
    }
  }
  if (!isCloudinaryConfigured()) {
    const error = new Error('Image uploads are unavailable. Configure Cloudinary to upload listing images.');
    error.status = 503;
    throw error;
  }

  const images = [];
  const publicIds = [];
  try {
    for (const file of files) {
      const uploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'iitk_marketplace' }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        stream.end(file.buffer);
      });
      publicIds.push(uploaded.public_id);
      if (!uploaded.secure_url || !uploaded.secure_url.startsWith('https://')) {
        throw new Error('Cloudinary did not return an HTTPS image URL.');
      }
      images.push(uploaded.secure_url);
    }
    return { images, publicIds };
  } catch (error) {
    await deleteUploadedImages(publicIds);
    throw error;
  }
};
const deleteUploadedImages = async (publicIds) => {
  if (!publicIds.length || !isCloudinaryConfigured()) return;
  const results = await Promise.allSettled(publicIds.map((publicId) => cloudinary.uploader.destroy(publicId)));
  results.filter((result) => result.status === 'rejected').forEach((result) => {
    console.error('Cloudinary image cleanup failed:', result.reason);
  });
};
const getCloudinaryPublicId = (imageUrl) => {
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== 'res.cloudinary.com') return null;
    const match = url.pathname.match(/^\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return null;
    const publicId = decodeURIComponent(match[1]).replace(/\.[^/.]+$/, '');
    return publicId.startsWith('iitk_marketplace/') ? publicId : null;
  } catch {
    return null;
  }
};
const deleteProductImages = async (images) => {
  const cloudinaryImages = [...new Set(images.filter((image) => getCloudinaryPublicId(image)))];
  if (!cloudinaryImages.length) return;
  let listings;
  try {
    listings = await Product.find({ images: { $in: cloudinaryImages } }).select('images').lean();
  } catch (error) {
    console.error('Cloudinary image reference check failed:', error);
    return;
  }
  const referencedImages = new Set(listings.flatMap((listing) => listing.images || []));
  const publicIds = cloudinaryImages
    .filter((image) => !referencedImages.has(image))
    .map(getCloudinaryPublicId);
  await deleteUploadedImages(publicIds);
};

const getProductErrorResponse = (error, fallbackMessage) => {
  const validationError = error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError;
  const status = error.status || (validationError ? 400 : 500);
  return {
    status,
    message: error.message || fallbackMessage,
  };
};
const toPublicProduct = (product) => {
  const publicProduct = product?.toObject?.() ?? { ...product };
  delete publicProduct.clientRequestId;
  return publicProduct;
};

export const validateProductFields = (values) => {
  if (Object.prototype.hasOwnProperty.call(values, 'images') && (!Array.isArray(values.images) || values.images.some((image) => !validImage(image)))) {
    return ['Provide valid image URLs.'];
  }
  return [];
};

export const getProducts = async (req, res) => {
  const { category, hall, search, condition, status } = req.query;
  const pageValue = Number(req.query.page);
  const limitValue = Number(req.query.limit);
  const page = Number.isInteger(pageValue) && pageValue >= 1 ? pageValue : 1;
  const limit = Number.isInteger(limitValue) && limitValue >= 1 ? limitValue : 20;
  if (limit > MAX_PAGE_SIZE || (search && (typeof search !== 'string' || search.trim().length > 100))) {
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

    const clauses = [availableProductFilter()];
    if (hall && hall !== 'all') {
      const matchingSellers = await User.find({ hall }).select('_id').lean();
      if (!matchingSellers.length) return res.json({ products: [], total: 0, page, limit });
      clauses.push({ sellerId: { $in: matchingSellers.map((seller) => seller._id) } });
    }
    if (category && category !== 'all') clauses.push({ category: category.toLowerCase() });
    if (condition && condition !== 'all') clauses.push({ condition });
    if (search) {
      const search = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchMatches = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
      const matchingSellers = await User.find({ $or: [
        { name: { $regex: search, $options: 'i' } },
        { hall: { $regex: search, $options: 'i' } },
        { year: { $regex: search, $options: 'i' } },
      ] }).select('_id').lean();
      if (matchingSellers.length) {
        searchMatches.push({ sellerId: { $in: matchingSellers.map((seller) => seller._id) } });
      }
      clauses.push({ $or: searchMatches });
    }
    const filter = { $and: clauses };

    const sortOrder = sort === 'price-low' ? { new_price: 1, createdAt: -1 } :
      sort === 'price-high' ? { new_price: -1, createdAt: -1 } : { createdAt: -1 };
    const [rawList, total] = await Promise.all([
      Product.find(filter).populate('sellerId', 'name hall year').sort(sortOrder).skip((page - 1) * limit).limit(limit).lean(),
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
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' });
    const item = await Product.findById(id).populate('sellerId', 'name hall year');
    if (!item || item.status !== 'available') 
      return res.status(404).json({ message: 'Product not found' });
    return res.json(toPublicProduct(item));
  } catch (error) {
    console.error('Product lookup failed:', error);
    return res.status(500).json({ message: 'Unable to load this product right now.' });
  }
};

export const createProduct = async (req, res) => {
  const body = req.body || {};
  const submittedImages = parseImageList(body.images);
  if (submittedImages === null) return res.status(400).json({ message: 'Atleast one valid image is required.' });
  const files = req.files || [];
  const payload = {
    name: body.name,
    category: body.category,
    new_price: body.new_price,
    old_price: body.old_price,
    description: body.description,
    condition: body.condition ?? 'Barely Used',
    defects: body.defects,
    images: submittedImages ?? [],
  };
  if (files.length && payload.images.length + files.length > MAX_PRODUCT_IMAGES) {
    return res.status(400).json({ message: 'Max 4 valid images are allowed.' });
  }
  const errors = validateProductFields(payload);
  if (errors.length) return res.status(400).json({ message: errors[0] });
  const clientRequestId = req.get?.('Idempotency-Key') || body.clientRequestId;
  if (clientRequestId !== undefined && (typeof clientRequestId !== 'string' || !/^[\w-]{8,100}$/.test(clientRequestId))) {
    return res.status(400).json({ message: 'Invalid idempotency key.' });
  }
  if (payload.old_price === '') payload.old_price = undefined;
  payload.status = 'available';
  payload.sellerId = req.user.id;
  if (clientRequestId) payload.clientRequestId = clientRequestId;
  let uploadedPublicIds = [];

  try {
    if (clientRequestId) {
      const existing = await Product.findOne({ sellerId: req.user.id, clientRequestId }).populate('sellerId', 'name hall year').lean();
      if (existing) {
        return res.status(200).json(toPublicProduct(existing));
      }
    }
    const uploaded = await uploadProductImages(files);
    uploadedPublicIds = uploaded.publicIds;
    payload.images = [...new Set([...payload.images, ...uploaded.images])];
    if (payload.images.length === 0) {
      await deleteUploadedImages(uploadedPublicIds);
      uploadedPublicIds = [];
      return res.status(400).json({ message: 'Please upload at least one product image.' });
    }
    const newProduct = await Product.create(payload);
    await newProduct.populate('sellerId', 'name hall year');
    return res.status(201).json(toPublicProduct(newProduct));
  } catch (error) {
    await deleteUploadedImages(uploadedPublicIds);
    if (error.code === 11000 && clientRequestId) {
      try {
        const existing = await Product.findOne({sellerId: req.user.id,clientRequestId}).populate('sellerId', 'name hall year').lean();
        if (existing)  
          return res.status(200).json(toPublicProduct(existing));
      } catch (lookupError) {
        console.error('Idempotency lookup failed:', lookupError);
      }
    }
    const result = getProductErrorResponse(error, 'Unable to create listing right now.');
    if (result.status === 500) console.error('Product creation failed:', error);
    return res.status(result.status).json({ message: result.message });
  }
};

export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const fields = ['name', 'category', 'new_price', 'old_price', 'description', 'condition', 'defects', 'images'];
  const updates = Object.fromEntries(
    fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]])
  );
  const files = req.files || [];
  let uploadedPublicIds = [];
  if (!Object.keys(updates).length && !files.length)  return res.status(400).json({ message: 'No listing fields provided.' });

  if (Object.hasOwn(updates, 'images')) {
    updates.images = parseImageList(updates.images);
    if (updates.images === null) return res.status(400).json({ message: 'Images must be a list of valid image URLs.' });
  }
  if (updates.old_price === '' || updates.old_price === null) {
    delete updates.old_price;
  }
  const errors = validateProductFields(updates);
  if (errors.length) return res.status(400).json({ message: errors[0] });

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    const existing = await Product.findById(id).lean();

    if (!existing) return res.status(404).json({ message: 'Product not found.' });
    if (String(existing.sellerId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You cannot edit another seller listing.' });
    }
    if (existing.status !== 'available') {
      return res.status(409).json({ message: 'Only available listings can be edited.' });
    }
    const originalImages = existing.images || [];
    const selectedImages = updates.images ?? originalImages;
    if (selectedImages.length + files.length > MAX_PRODUCT_IMAGES) {
      return res.status(400).json({ message: 'A listing can contain at most 4 images.' });
    }
    const uploaded = await uploadProductImages(files);
    uploadedPublicIds = uploaded.publicIds;
    if (Object.hasOwn(updates, 'images') || files.length) {
      updates.images = [...new Set([...selectedImages, ...uploaded.images])];
    }

    if (!updates.images && originalImages.length === 0) return res.status(400).json({ message: 'Please upload at least one product image.' });
    if (updates.images?.length === 0) return res.status(400).json({ message: 'Please upload at least one product image.' });
    
    const update = {
      ...(Object.keys(updates).length ? { $set: updates } : {}),
      ...(updates.old_price === undefined && (body.old_price === '' || body.old_price === null)
        ? { $unset: { old_price: '' } }
        : {}),
    };
    const product = await Product.findOneAndUpdate(
      availableProductFilter({ _id: id, sellerId: req.user.id }),
      update,
      { new: true, runValidators: true }
    ).populate('sellerId', 'name hall year');

    if (!product) {
      await deleteUploadedImages(uploadedPublicIds);
      uploadedPublicIds = [];
      return res.status(409).json({ message: 'This listing is no longer available to edit.' });
    }

    await deleteProductImages(originalImages.filter((image) => !(product.images || []).includes(image)));
    return res.json(toPublicProduct(product));
  } catch (error) {
    await deleteUploadedImages(uploadedPublicIds);
    const result = getProductErrorResponse(error, 'Unable to update listing right now.');
    if (result.status === 500) console.error('Product update failed:', error);
    return res.status(result.status).json({ message: result.message });
  }
};

export const updateProductStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!PRODUCT_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' });
    if (status !== 'sold') return res.status(400).json({ message: 'Listings can only be marked sold.' });
    const update = { status, soldAt: new Date() };
    const before = await Product.findOneAndUpdate(
      availableProductFilter({ _id: id, sellerId: req.user.id }),
      { $set: update },
      { new: false, runValidators: true }
    ).populate('sellerId', 'name hall year').lean();
    if (!before) {
      const existing = await Product.findById(id).select('sellerId status').lean();
      if (!existing) return res.status(404).json({ message: 'Product not found' });
      if (String(existing.sellerId) !== String(req.user.id)) return res.status(403).json({ message: 'You cannot change another seller listing.' });
      return res.status(409).json({ message: `Cannot change a ${existing.status} listing to ${status}.` });
    }
    const product = { ...before, ...update, updatedAt: new Date() };
    return res.json(toPublicProduct(product));
  } catch (error) {
    console.error('Product status update failed:', error);
    return res.status(500).json({ message: 'Unable to update listing status right now.' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Product not found' });
    const existing = await Product.findById(id).lean();
    if (!existing) return res.status(404).json({ message: 'Product not found' });
    if (String(existing.sellerId) !== String(req.user.id)) return res.status(403).json({ message: 'You cannot delete another seller listing.' });

    const result = await Product.deleteOne({ _id: id, sellerId: String(req.user.id) });
    if (result.deletedCount) {
      await deleteProductImages(existing.images || []);
      return res.json({ message: 'Product deleted' });
    }
    return res.status(409).json({ message: 'This listing could not be deleted.' });
  } catch (error) {
    console.error('Product deletion failed:', error);
    return res.status(500).json({ message: 'Unable to delete listing right now.' });
  }
};

export const getSellerProducts = async (req, res) => {
  const sellerId = req.user.id;

  try {
    const products = await Product.find({ sellerId }).populate('sellerId', 'name hall year').sort({ createdAt: -1 }).lean();
    return res.json(products.map(toPublicProduct));
  } catch (error) {
    console.error('Seller listings failed:', error);
    return res.status(500).json({ message: 'Unable to load your listings right now.' });
  }
};
