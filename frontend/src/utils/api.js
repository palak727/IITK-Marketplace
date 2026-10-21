import axios from 'axios';

const AUTH_STORAGE_KEY = 'iitk_auth';

const getBaseUrl = () => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  if (import.meta.env.PROD) {
    throw new Error('VITE_API_BASE_URL must be set for production builds.');
  }
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    return '/api';
  }
  return 'http://localhost:5000/api';
};

const API_BASE = getBaseUrl();

// Seed assets are served by the Express backend, not by the separately deployed Vite app.
export const getImageUrl = (src) => {
  if (!src || !src.startsWith('/images/')) return src;

  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000';
  const apiOrigin = new URL(API_BASE, siteOrigin).origin;
  return `${apiOrigin}${src}`;
};

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = new Error(error.response?.data?.message || error.message || 'Request failed');
    apiError.status = error.response?.status;
    apiError.code = error.code;
    if (apiError.status === 401 && typeof window !== 'undefined') {
      try {
        if (localStorage.getItem(AUTH_STORAGE_KEY)) {
          window.dispatchEvent(new Event('auth:expired'));
        }
      } catch {
        // ignore storage access errors
      }
    }
    return Promise.reject(apiError);
  }
);

export const CATEGORIES = [
  { slug: 'coolers', label: 'Coolers', icon: 'Wind', path: '/category/coolers' },
  { slug: 'mattresses', label: 'Mattresses', icon: 'Bed', path: '/category/mattresses' },
  { slug: 'cycles', label: 'Cycles', icon: 'Bike', path: '/category/cycles' },
  { slug: 'academics', label: 'Academics & Books', icon: 'BookOpen', path: '/category/academics' },
  { slug: 'appliances', label: 'Appliances', icon: 'Tv', path: '/category/appliances' },
  { slug: 'others', label: 'Others', icon: 'Tag', path: '/category/others' },
];

export const HALLS = [
  'Hall 1', 'Hall 2', 'Hall 3', 'Hall 4', 'Hall 5',
  'Hall 7', 'Hall 8', 'Hall 9', 'Hall 10', 'Hall 11',
  'Hall 12', 'Hall 13', 'Hall 14', 'GH1', 'GH2',
  'CWS', 'RA Tower', 'SBRA',
];

export const CONDITIONS = ['Brand New', 'Barely Used', 'Heavily Used'];

export const api = {
  get: async (endpoint, token) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await apiClient.get(endpoint, { headers });
    return res.data;
  },

  post: async (endpoint, body, token) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await apiClient.post(endpoint, body, { headers });
    return res.data;
  },

  postMultipart: async (endpoint, body, token) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await apiClient.post(endpoint, body, { headers });
    return res.data;
  },

  patch: async (endpoint, body, token) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await apiClient.patch(endpoint, body, { headers });
    return res.data;
  },

  patchMultipart: async (endpoint, body, token) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await apiClient.patch(endpoint, body, { headers });
    return res.data;
  },

  delete: async (endpoint, token) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await apiClient.delete(endpoint, { headers });
    return res.data;
  },

};

export const formatPrice = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

export const getProductId = (product) => {
  if (!product) return '';
  return product._id || product.id || '';
};

export const getStatusBadge = (status) => {
  switch (status) {
    case 'available':
      return { label: 'Available', className: 'bg-emerald-100 text-emerald-800 border border-emerald-300' };
    case 'sold':
      return { label: 'Sold Out', className: 'bg-rose-100 text-rose-800 border border-rose-300' };
    default:
      return { label: status, className: 'bg-slate-100 text-slate-800' };
  }
};

export const resolveSocketUrl = () => {
  const configured = import.meta.env.VITE_SOCKET_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.PROD) {
    throw new Error('VITE_SOCKET_URL must be set for production builds.');
  }
  return 'http://localhost:5000';
};
