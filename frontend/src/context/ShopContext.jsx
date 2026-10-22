import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import { api, getProductId, resolveSocketUrl } from '../utils/api';
import { addItemToCart } from './cartState';

export const ShopContext = createContext(null);

const AUTH_KEY = 'iitk_auth';
const GUEST_CART_KEY = 'iitk_cart_guest';
const getUserId = (auth) => String(auth?.user?.id || auth?.user?._id || 'guest');
const cartKeyFor = (auth) => `iitk_cart_${getUserId(auth)}`;
const listingFormData = (listing, files) => {
  const formData = new FormData();
  Object.entries(listing).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      if (value.length) value.forEach((item) => formData.append(key, String(item)));
      else formData.append(key, '');
    } else formData.append(key, String(value));
  });
  files.forEach((file) => formData.append('files', file));
  return formData;
};

const discardGuestCartStorage = () => {
  try {
    localStorage.removeItem(GUEST_CART_KEY);
  } catch {
    // ignore
  }
};

const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const loadCart = (key) => {
  const stored = loadJSON(key, {});
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([, quantity]) => Number(quantity) > 0).map(([id]) => [id, 1]));
};

const ShopContextProvider = ({ children }) => {
  const [all_product, setAllProduct] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(() => loadJSON(AUTH_KEY, null));
  const [cartKey, setCartKey] = useState(() => cartKeyFor(loadJSON(AUTH_KEY, null)));
  const [cartItems, setCartItems] = useState(() => loadCart(cartKeyFor(loadJSON(AUTH_KEY, null))));
  const cartItemsRef = useRef(cartItems);
  const [cartProducts, setCartProducts] = useState({});
  const [cartLoading, setCartLoading] = useState(() => Object.keys(loadCart(cartKeyFor(loadJSON(AUTH_KEY, null)))).length > 0);
  const [productError, setProductError] = useState('');
  const productRequestId = useRef(0);
  const [productPage, setProductPage] = useState(1);
  const productLimit = 20;
  const [productTotal, setProductTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [productFilters, setProductFilters] = useState({});
  const [socket, setSocket] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [activeChat, setActiveChat] = useState(null);

  const token = auth?.token;
  const user = auth?.user;
  const userId = getUserId(auth);

  const fetchProducts = useCallback(async (params = {}) => {
    const requestId = ++productRequestId.current;
    setLoading(true);
    setProductError('');
    try {
      const queryParams = { page: productPage, limit: productLimit, ...params };
      Object.keys(queryParams).forEach((key) => queryParams[key] === undefined && delete queryParams[key]);
      const query = new URLSearchParams(queryParams).toString();
      const data = await api.get(`/products${query ? `?${query}` : ''}`);
      const productsList = Array.isArray(data) ? data : data?.products || [];
      if (requestId === productRequestId.current) {
        setAllProduct(productsList);
        setProductTotal(data?.total ?? productsList.length);
      }
    } catch (err) {
      if (requestId === productRequestId.current) {
        setProductError(err.message || 'Unable to load marketplace listings.');
      }
    } finally {
      if (requestId === productRequestId.current) setLoading(false);
    }
  }, [productPage, productLimit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setProductPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchProducts({ ...productFilters, search: debouncedSearch || undefined });
  }, [fetchProducts, debouncedSearch, productFilters]);

  useEffect(() => {
    const nextKey = cartKeyFor(auth);
    const nextCart = loadCart(nextKey);
    setCartKey(nextKey);
    setCartProducts({});
    setCartLoading(Object.keys(nextCart).length > 0);
    cartItemsRef.current = nextCart;
    setCartItems(nextCart);
  }, [userId]);

  useEffect(() => {
    if (cartKey === cartKeyFor(auth)) localStorage.setItem(cartKey, JSON.stringify(cartItems));
  }, [cartItems, cartKey, auth]);

  useEffect(() => {
    const ids = Object.keys(cartItems);
    if (!ids.length) {
      setCartProducts({});
      setCartLoading(false);
      return undefined;
    }
    let active = true;
    setCartLoading(true);
    Promise.all(ids.map(async (id) => {
      try {
        return [id, await api.get(`/products/${id}`)];
      } catch {
        return [id, null];
      }
    })).then((entries) => {
      if (active) setCartProducts(Object.fromEntries(entries));
    }).finally(() => {
      if (active) setCartLoading(false);
    });
    return () => { active = false; };
  }, [cartItems, userId]);

  useEffect(() => {
    if (auth) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  }, [auth]);

  useEffect(() => {
    const clearExpiredSession = () => {
      setAuth(null);
      setActiveChat(null);
      setUnreadCount(0);
      setNotificationUnreadCount(0);
      toast.error('Your session has expired. Please log in again.');
    };
    window.addEventListener('auth:expired', clearExpiredSession);
    return () => window.removeEventListener('auth:expired', clearExpiredSession);
  }, []);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return undefined;
    }

    // Render hosts a persistent Socket.IO server for real-time chat.
    let s;
    try {
      s = io(resolveSocketUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
      s.on('connect', () => {
        api.get('/chat/unread', token).then((r) => setUnreadCount(r.count)).catch(() => {});
      });

      s.on('chat:notification', () => {
        api.get('/chat/unread', token).then((r) => setUnreadCount(r.count)).catch(() => {});
        api.get('/notifications/unread-count', token).then((r) => setNotificationUnreadCount(r.count)).catch(() => {});
        toast('New message received', { icon: '💬' });
      });

      s.on('notification:new', () => {
        api.get('/notifications/unread-count', token).then((r) => setNotificationUnreadCount(r.count)).catch(() => {});
      });

      s.on('user:online', ({ userId, online }) => {
        setOnlineUsers((prev) => ({ ...prev, [userId]: online }));
      });

      setSocket(s);
    } catch (err) {
      console.warn('Socket connection failed');
    }

    return () => {
      if (s) s.disconnect();
    };
  }, [token]);

  const refreshNotificationCount = useCallback(async () => {
    if (!token) return setNotificationUnreadCount(0);
    try {
      const result = await api.get('/notifications/unread-count', token);
      setNotificationUnreadCount(result.count);
    } catch {
      setNotificationUnreadCount(0);
    }
  }, [token]);

  useEffect(() => {
    refreshNotificationCount();
  }, [token]);

  const login = async (email, password) => {
    discardGuestCartStorage();
    const data = await api.post('/auth/login', { email, password });
    setAuth(data);
    toast.success(`Welcome back, ${data.user?.name || 'IITKian'}!`);
    return data;
  };

  const register = async (form) => {
    discardGuestCartStorage();
    const data = await api.post('/auth/register', form);
    setAuth(data);
    toast.success('Account created successfully!');
    return data;
  };

  const logout = () => {
    setAuth(null);
    setActiveChat(null);
    setUnreadCount(0);
    toast.success('Logged out');
  };

  const requestOTP = (email) => api.post('/auth/otp/request', { email });
  const verifyOTP = (email, otp) => api.post('/auth/otp/verify', { email, otp });
  const requestResetOTP = (email) => api.post('/auth/reset-otp/request', { email });
  const resetPassword = ({ email, otp, newPassword }) =>
    api.post('/auth/reset-password', { email, otp, newPassword });

  const refreshUnreadCount = useCallback(async () => {
    if (!token) return setUnreadCount(0);
    try {
      const result = await api.get('/chat/unread', token);
      setUnreadCount(result.count);
    } catch {
      setUnreadCount(0);
    }
  }, [token]);

  const addToCart = async (itemId) => {
    try {
      const product = await api.get(`/products/${itemId}`);
      if (product.status !== 'available') {
        toast.error('This listing is no longer available.');
        return;
      }
      const currentUserId = String(auth?.user?.id || auth?.user?._id || '');
      if (currentUserId && String(product.sellerId?._id || product.sellerId) === currentUserId) {
        toast.error('You cannot add your own listed product to your cart.');
        return;
      }
      setCartProducts((previous) => ({ ...previous, [itemId]: product }));
      const result = addItemToCart(cartItemsRef.current, itemId);
      if (result.added) {
        cartItemsRef.current = result.cartItems;
        setCartItems(result.cartItems);
        toast.success('Added to cart');
      }
    } catch (error) {
      toast.error(error.message || 'Unable to confirm this listing.');
    }
  };

  const removeFromCart = (itemId) => {
    const next = { ...cartItemsRef.current };
    delete next[itemId];
    cartItemsRef.current = next;
    setCartItems(next);
  };

  const clearCart = () => {
    cartItemsRef.current = {};
    setCartItems({});
  };

  const cartReady = cartKey === cartKeyFor(auth);
  const getCartCount = () => cartReady ? Object.keys(cartItems).length : 0;

  const getCartTotal = () =>
    cartReady ? Object.keys(cartItems).reduce((total, id) => {
      const product = all_product.find((p) => String(getProductId(p)) === String(id));
      const currentProduct = Object.hasOwn(cartProducts, id) ? cartProducts[id] : product;
      return total + (currentProduct?.status === 'available' ? Number(currentProduct.new_price || 0) : 0);
    }, 0) : 0;

  const updateProductStatus = async (productId, status) => {
    const updated = await api.patch(`/products/${productId}/status`, { status }, token);
    setAllProduct((prev) =>
      prev.map((p) => (String(getProductId(p)) === String(productId) ? updated : p))
    );
    toast.success(`Status updated to ${status}`);
    return updated;
  };

  const deleteProduct = async (productId) => {
    await api.delete(`/products/${productId}`, token);
    setAllProduct((prev) => prev.filter((p) => String(getProductId(p)) !== String(productId)));
  };

  const createProduct = async (productData, files = []) => {
    const created = files.length
      ? await api.postMultipart('/products', listingFormData(productData, files), token)
      : await api.post('/products', productData, token);
    setAllProduct((prev) => [created, ...prev]);
    return created;
  };

  const updateProduct = async (productId, productData, files = []) => {
    const updated = files.length
      ? await api.patchMultipart(`/products/${productId}`, listingFormData(productData, files), token)
      : await api.patch(`/products/${productId}`, productData, token);
    setAllProduct((previous) => previous.map((product) =>
      String(getProductId(product)) === String(productId) ? updated : product
    ));
    return updated;
  };

  const openChat = (product, sellerId, sellerName = product?.sellerId?.name || 'Seller', productId = product ? getProductId(product) : '') => {
    if (!auth) {
      toast.error('Please sign in to message the seller.');
      return;
    }

    const targetSellerId = String(sellerId || product?.sellerId?._id || product?.sellerId || '');
    const currentUserId = String(auth?.user?.id || auth?.user?._id || '');

    if (currentUserId && targetSellerId && currentUserId === targetSellerId) {
      toast.error("You cannot chat with yourself on your own listing.");
      return;
    }

    const resolvedProduct =
      product ||
      all_product.find((item) => String(getProductId(item)) === String(productId)) ||
      {
        _id: productId,
        id: productId,
        name: 'Product Inquiry',
        images: [],
        new_price: 0,
        status: 'unknown',
        sellerId: targetSellerId || 'seller-unknown',
      };

    setActiveChat({
      product: resolvedProduct,
      sellerId: targetSellerId || resolvedProduct?.sellerId?._id || resolvedProduct?.sellerId || 'seller-unknown',
      sellerName,
      productId: productId || getProductId(resolvedProduct),
    });
  };

  const closeChat = () => setActiveChat(null);

  const sendMessage = async (text) => {
    if (!activeChat || !auth || !auth.user) return;

    const productId = String(activeChat.productId || getProductId(activeChat.product));
    if (socket?.connected) {
      return new Promise((resolve, reject) => {
        socket.timeout(10000).emit('chat:send', {
          receiverId: activeChat.sellerId,
          productId,
          text,
        }, (timeoutError, response) => {
          if (timeoutError) return reject(new Error('Message send timed out.'));
          if (!response?.success) return reject(new Error(response?.error || 'Failed to send message.'));
          return resolve(response.message);
        });
      });
    }

    // Temporary HTTP fallback while a socket reconnects.
    return api.post('/chat/send', {
      receiverId: activeChat.sellerId,
      productId,
      text,
    }, token);
  };

  const value = useMemo(
    () => ({
      all_product,
      loading,
      productError,
      productPage,
      productLimit,
      productTotal,
      setProductPage,
      cartItems,
      cartProducts,
      cartLoading,
      cartReady,
      auth,
      user,
      searchQuery,
      setSearchQuery,
      setProductFilters,
      productFilters,
      fetchProducts,
      login,
      register,
      logout,
      requestOTP,
      verifyOTP,
      requestResetOTP,
      resetPassword,
      addToCart,
      removeFromCart,
      clearCart,
      getCartCount,
      getCartTotal,
      updateProductStatus,
      deleteProduct,
      createProduct,
      updateProduct,
      socket,
      unreadCount,
      notificationUnreadCount,
      refreshNotificationCount,
      refreshUnreadCount,
      onlineUsers,
      activeChat,
      openChat,
      closeChat,
      sendMessage,
      token,
    }),
    [all_product, loading, productError, productPage, productLimit, productTotal, cartItems, cartProducts, cartLoading, cartReady, auth, user, searchQuery, productFilters, fetchProducts, token, socket, unreadCount, notificationUnreadCount, refreshNotificationCount, refreshUnreadCount, onlineUsers, activeChat]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
};

export const useShop = () => {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within ShopContextProvider');
  return ctx;
};

export default ShopContextProvider;
