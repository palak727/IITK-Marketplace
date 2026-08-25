import Product from '../models/Product.js';
import { isMemoryMode, memoryStore, reloadSeedProducts } from '../store/memoryStore.js';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import { seedProducts } from '../data/seedProducts.js';

const getPID = (p) => (p._id ? p._id.toString() : p.id ? p.id.toString() : String(p));

const rankProducts = (list, q) => {
  if (!q) return list;

  const keyword = q.toLowerCase();
  return [...list]
    .map((product) => {
      const haystack = `${product.name || ''} ${product.description || ''} ${product.hall || ''} ${product.category || ''}`.toLowerCase();
      let score = 0;

      if (product.name?.toLowerCase().includes(keyword)) score += 40;
      if (product.category?.toLowerCase().includes(keyword)) score += 20;
      if (product.hall?.toLowerCase().includes(keyword)) score += 15;
      if (product.description?.toLowerCase().includes(keyword)) score += 10;
      if (haystack === keyword) score += 5;

      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.product.createdAt || 0) - new Date(a.product.createdAt || 0))
    .map(({ product }) => product);
};

export const getProducts = async (req, res) => {
  const { category, hall, search, condition, status } = req.query;

  if (isMemoryMode()) {
    let list = [...memoryStore.products];
    if (list.length === 0) {
      const refreshed = reloadSeedProducts();
      list = [...refreshed];
    }

    list = list.filter((p) => p.status !== 'sold');

    if (category && category !== 'all') {
      list = list.filter((p) => p.category?.toLowerCase() === category.toLowerCase());
    }
    if (hall && hall !== 'all') {
      list = list.filter((p) => p.hall?.toLowerCase() === hall.toLowerCase());
    }
    if (condition && condition !== 'all') {
      list = list.filter((p) => p.condition?.toLowerCase() === condition.toLowerCase());
    }
    if (status) {
      list = list.filter((p) => p.status?.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      list = rankProducts(list, search);
    }

    return res.json({ products: list, total: list.length });
  }

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
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { hall: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const list = await Product.find(filter).sort({ createdAt: -1 });
    return res.json({ products: list, total: list.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getProductById = async (req, res) => {
  const { id } = req.params;

  if (isMemoryMode()) {
    const item = memoryStore.products.find((p) => getPID(p) === id);
    if (!item) return res.status(404).json({ message: 'Product not found' });
    return res.json(item);
  }

  try {
    const item = await Product.findById(id);
    if (!item) return res.status(404).json({ message: 'Product not found' });
    return res.json(item);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const createProduct = async (req, res) => {
  const { name, category, new_price, old_price, description, hall, condition, defects, image, images } = req.body;

  if (!name || !category || !new_price) {
    return res.status(400).json({ message: 'Name, category, and selling price are required.' });
  }

  const defaultImg =
    image ||
    `https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80`;

  const payload = {
    name,
    category: category.toLowerCase(),
    new_price: Number(new_price),
    old_price: old_price ? Number(old_price) : Number(new_price) * 1.3,
    description: description || 'No detailed description provided.',
    image: defaultImg,
    images: images && images.length ? images : [defaultImg],
    hall: hall || req.user.hall || 'Hall 1',
    condition: condition || 'Barely Used',
    defects: Array.isArray(defects) ? defects : defects ? defects.split(',').map((d) => d.trim()) : [],
    status: 'available',
    sellerId: req.user.id,
    sellerName: req.user.name,
    createdAt: new Date(),
  };

  if (isMemoryMode()) {
    const newProduct = {
      _id: `prod-${Date.now()}`,
      id: `prod-${Date.now()}`,
      ...payload,
    };
    memoryStore.products.unshift(newProduct);
    return res.status(201).json(newProduct);
  }

  try {
    const newProduct = await Product.create(payload);
    return res.status(201).json(newProduct);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const reserveProduct = async (req, res) => {
  const { id } = req.params;
  const reservedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (isMemoryMode()) {
    const product = memoryStore.products.find((p) => getPID(p) === id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.status === 'sold') {
      return res.status(409).json({ message: 'This product already sold.' });
    }
    if (product.status === 'reserved' && String(product.reservedBy) !== String(req.user.id)) {
      return res.status(409).json({ message: 'This item is already reserved by another user.' });
    }
    product.status = 'reserved';
    product.reservedUntil = reservedUntil;
    product.reservedBy = req.user.id;
    return res.json(product);
  }

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.status === 'sold') {
      return res.status(409).json({ message: 'This product already sold.' });
    }
    if (product.status === 'reserved' && String(product.reservedBy) !== String(req.user.id)) {
      return res.status(409).json({ message: 'This item is already reserved by another user.' });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { status: 'reserved', reservedUntil, reservedBy: req.user.id },
      { new: true }
    );
    return res.json(updatedProduct);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateProductStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['available', 'reserved', 'sold'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  if (isMemoryMode()) {
    const product = memoryStore.products.find((p) => getPID(p) === id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    product.status = status;
    return res.json(product);
  }

  try {
    const product = await Product.findByIdAndUpdate(id, { status }, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json(product);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  if (isMemoryMode()) {
    const index = memoryStore.products.findIndex((p) => getPID(p) === id);
    if (index === -1) return res.status(404).json({ message: 'Product not found' });
    const [removed] = memoryStore.products.splice(index, 1);
    memoryStore.save();
    return res.json({ message: 'Product deleted', product: removed });
  }

  try {
    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ message: 'Product deleted', product });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getSellerProducts = async (req, res) => {
  const sellerId = req.user.id;

  if (isMemoryMode()) {
    const list = memoryStore.products.filter((p) => String(p.sellerId) === String(sellerId));
    return res.json(list);
  }

  try {
    // Fallback support: if seeded products in MongoDB lack a sellerId or have a placeholder,
    // match them or query standard matching items.
    let list = await Product.find({ sellerId }).sort({ createdAt: -1 });
    
    if (list.length === 0) {
      // Optional fallback: if no products match the exact sellerId (e.g. from static seeding), 
      // you can grab unassigned products or assign them to the current user dynamically for testing.
      list = await Product.find({ $or: [{ sellerId }, { sellerId: { $exists: false } }, { sellerId: null }] }).sort({ createdAt: -1 });
    }

    return res.json(list);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const uploadImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file uploaded.' });
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
      console.warn('Cloudinary upload failed:', error.message);
    }
  }

  const b64 = Buffer.from(req.file.buffer).toString('base64');
  const dataURI = `data:${req.file.mimetype};base64,${b64}`;
  return res.json({ url: dataURI });
};
