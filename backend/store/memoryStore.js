import { seedProducts } from '../data/seedProducts.js';

let memoryMode = false;

export const setMemoryMode = (mode) => {
  memoryMode = mode;
};

export const isMemoryMode = () => memoryMode;

const buildSeedProductList = () =>
  seedProducts.map((product, index) => ({
    ...product,
    image: product.image || product.images?.[0] || '',
    images: Array.isArray(product.images) && product.images.length ? product.images : product.image ? [product.image] : [],
    createdAt: product.createdAt || new Date(Date.now() - (seedProducts.length - index) * 60 * 60 * 1000).toISOString(),
    updatedAt: product.updatedAt || new Date(Date.now() - (seedProducts.length - index) * 60 * 60 * 1000).toISOString(),
  }));

export const reloadSeedProducts = () => {
  const hydrated = buildSeedProductList();
  memoryStore.products = hydrated;
  memoryStore.save();
  return hydrated;
};

export const memoryStore = {
  users: [],
  products: buildSeedProductList(),
  messages: [],
  otps: new Map(),

  // Deliberately ephemeral: serverless filesystems cannot persist application state.
  save() {},
};

reloadSeedProducts();
