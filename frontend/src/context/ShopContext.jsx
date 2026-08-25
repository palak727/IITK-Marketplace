import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import { api, getProductId } from '../utils/api';

export const ShopContext = createContext(null);

const CART_KEY = 'iitk_cart';
const AUTH_KEY = 'iitk_auth';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const ShopContextProvider = ({ children }) => {
  const [all_product, setAllProduct] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState(() => loadJSON(CART_KEY, {}));
  const [auth, setAuth] = useState(() => loadJSON(AUTH_KEY, null));
  const [searchQuery, setSearchQuery] = useState('');
  const [hallFilter, setHallFilter] = useState('');
  const [socket, setSocket] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [activeChat, setActiveChat] = useState(null);

  const token = auth?.token;
  const user = auth?.user;

  const fetchProducts = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const query = new URLSearchParams(params).toString();
      const data = await api.get(`/products${query ? `?${query}` : ''}`);
      const productsList = Array.isArray(data) ? data : data?.products || data?.data || [];
      setAllProduct(productsList);
    } catch (err) {
      console.error('Error fetching products:', err);
      setAllProduct([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    if (auth) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  }, [auth]);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return undefined;
    }

    // Render hosts a persistent Socket.IO server for real-time chat.
    let s;
    try {
      s = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
      s.on('connect', () => {
        api.get('/chat/unread', token).then((r) => setUnreadCount(r.count)).catch(() => {});
      });

      s.on('chat:notification', () => {
        setUnreadCount((count) => count + 1);
        toast('New message received', { icon: '💬' });
      });

      s.on('user:online', ({ userId, online }) => {
        setOnlineUsers((prev) => ({ ...prev, [userId]: online }));
      });

      setSocket(s);
    } catch (err) {
      console.warn('Socket connection failed');
    }

    // Keep unread counts fresh if a socket reconnects after a network interruption.
    const pollInterval = setInterval(() => {
      api.get('/chat/unread', token).then((r) => setUnreadCount(r.count)).catch(() => {});
    }, 5000);

    return () => {
      if (s) s.disconnect();
      clearInterval(pollInterval);
    };
  }, [token]);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setAuth(data);
    toast.success(`Welcome back, ${data.user?.name || 'IITKian'}!`);
    return data;
  };

  const register = async (form) => {
    const data = await api.post('/auth/register', form);
    setAuth(data);
    toast.success('Account created successfully!');
    return data;
  };

  const logout = () => {
    setAuth(null);
    setActiveChat(null);
    setUnreadCount(0);
    localStorage.removeItem(AUTH_KEY);
    toast.success('Logged out');
  };

  const requestOTP = (email) => api.post('/auth/otp/request', { email });
  const verifyOTP = (email, otp) => api.post('/auth/otp/verify', { email, otp });
  const requestResetOTP = (email) => api.post('/auth/reset-otp/request', { email });
  const resetPassword = ({ email, otp, newPassword }) =>
    api.post('/auth/reset-password', { email, otp, newPassword });

  const addToCart = (itemId) => {
    const product = all_product.find((p) => String(getProductId(p)) === String(itemId));
    const currentUserId = String(auth?.user?.id || auth?.user?._id || '');
    const sellerId = String(product?.sellerId || '');

    if (currentUserId && sellerId && currentUserId === sellerId) {
      toast.error('You cannot add your own listed product to your cart.');
      return;
    }

    setCartItems((prev) => {
      const next = { ...prev, [itemId]: (prev[itemId] || 0) + 1 };
      toast.success('Added to cart');
      return next;
    });
  };

  const removeFromCart = (itemId) => {
    setCartItems((prev) => {
      const next = { ...prev };
      if (next[itemId] > 1) next[itemId] -= 1;
      else delete next[itemId];
      return next;
    });
  };

  const clearCart = () => setCartItems({});

  const getCartCount = () => Object.values(cartItems).reduce((sum, qty) => sum + qty, 0);

  const getCartTotal = () =>
    Object.entries(cartItems).reduce((total, [id, qty]) => {
      const product = all_product.find((p) => String(getProductId(p)) === String(id));
      return total + (product?.new_price || 0) * qty;
    }, 0);

  const reserveProduct = async (productId) => {
    const product = all_product.find((p) => String(getProductId(p)) === String(productId));
    const currentUserId = String(auth?.user?.id || auth?.user?._id || '');
    if (currentUserId && String(product?.sellerId) === currentUserId) {
      toast.error('You cannot reserve your own product.');
      return;
    }
    const updated = await api.post(`/products/${productId}/reserve`, {}, token);
    setAllProduct((prev) =>
      prev.map((p) => (String(getProductId(p)) === String(productId) ? updated : p))
    );
    toast.success('Item reserved for 24 hours!');
    return updated;
  };

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
    toast.success('Listing removed');
  };

  const createProduct = async (productData) => {
    const created = await api.post('/products', productData, token);
    setAllProduct((prev) => [created, ...prev]);
    toast.success('Listing created!');
    return created;
  };

  const openChat = (product, sellerId, sellerName = product?.sellerName || 'Seller', productId = product ? getProductId(product) : '') => {
    if (!auth) {
      toast.error('Please login to message seller');
      return;
    }

    const targetSellerId = String(sellerId || product?.sellerId || '');
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
        image: '',
        new_price: 0,
        status: 'available',
        sellerId: targetSellerId || 'seller-unknown',
      };

    setActiveChat({
      product: resolvedProduct,
      sellerId: targetSellerId || resolvedProduct?.sellerId || 'seller-unknown',
      sellerName,
      productId: productId || getProductId(resolvedProduct),
    });
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const closeChat = () => setActiveChat(null);

  const sendMessage = async (text) => {
    if (!activeChat || !auth || !auth.user) return;

    const productId = String(activeChat.productId || getProductId(activeChat.product));
    if (socket?.connected) {
      socket.emit('chat:send', {
        receiverId: activeChat.sellerId,
        productId,
        text,
        product: {
          id: productId,
          name: activeChat.product.name,
          new_price: activeChat.product.new_price,
          status: activeChat.product.status,
          image: activeChat.product.image,
        },
      });
      return;
    }

    // Temporary HTTP fallback while a socket reconnects.
    try {
      await api.post('/chat/send', {
        receiverId: activeChat.sellerId,
        productId,
        text,
        product: {
          id: productId,
          name: activeChat.product.name,
          new_price: activeChat.product.new_price,
          status: activeChat.product.status,
          image: activeChat.product.image,
        },
      }, token);
    } catch (err) {
      toast.error('Failed to send message');
      console.error(err);
    }
  };

  const value = useMemo(
    () => ({
      all_product,
      loading,
      cartItems,
      auth,
      user,
      searchQuery,
      setSearchQuery,
      hallFilter,
      setHallFilter,
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
      reserveProduct,
      updateProductStatus,
      deleteProduct,
      createProduct,
      socket,
      unreadCount,
      onlineUsers,
      activeChat,
      openChat,
      closeChat,
      sendMessage,
      token,
    }),
    [all_product, loading, cartItems, auth, user, searchQuery, hallFilter, fetchProducts, token, socket, unreadCount, onlineUsers, activeChat]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
};

export const useShop = () => {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within ShopContextProvider');
  return ctx;
};

export default ShopContextProvider;
