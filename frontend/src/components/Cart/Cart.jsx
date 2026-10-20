import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, ShoppingBag, MapPin, ArrowLeft, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import LazyImage from '../LazyImage/LazyImage';
import { useShop } from '../../context/ShopContext';
import { formatPrice, getProductId } from '../../utils/api';

const CartComponent = () => {
  const {
    cartItems,
    cartProducts,
    cartLoading,
    cartReady,
    all_product,
    auth,
    removeFromCart,
    clearCart,
    getCartTotal,
    reserveCartItems,
  } = useShop();
  const navigate = useNavigate();

  const cartList = Object.entries(cartItems)
    .map(([id, qty]) => {
      const product = cartProducts[id] !== undefined
        ? cartProducts[id]
        : all_product.find((p) => String(getProductId(p)) === String(id));
      return product ? { product, qty } : { id, qty, missing: true };
    })
    .filter((item) => item.qty > 0);

  const total = getCartTotal();

  const handleReserveSaved = async () => {
    if (!auth) {
      toast.error('Please sign in to reserve items from your cart.');
      navigate('/login', { state: { from: '/cart' } });
      return;
    }
    try {
      const { reserved, failed } = await reserveCartItems();
      if (reserved.length) {
        toast.success(`${reserved.length} item${reserved.length > 1 ? 's' : ''} reserved for 24 hours.`);
      }
      failed.forEach(({ message }) => toast.error(message));
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        toast.error('Please sign in to continue.');
        navigate('/login', { state: { from: '/cart' } });
        return;
      }
      toast.error(err.message || 'Unable to reserve items right now.');
    }
  };

  if (!cartReady || cartLoading) {
    return <div role="status" className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-500">Loading saved listings...</div>;
  }

  if (cartList.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-12">
          <ShoppingBag size={64} className="mx-auto text-slate-300 mb-4" />
          <h2 className="text-2xl font-bold text-navy mb-2">Your cart is empty</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
            Save listings while you browse. Adding to cart does not reserve an item — sign in when you are ready to reserve.
          </p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft size={16} /> Explore Campus Marketplace
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-navy">Your cart</h1>
          <p className="text-slate-500 text-sm">Saved listings for later — reserve when you are ready (availability is confirmed at reservation time)</p>
        </div>
        <button
          onClick={clearCart}
          className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover:underline"
        >
          <Trash2 size={14} /> Clear All
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {cartList.map(({ product, qty, id, missing }) => missing ? (
            <div key={id} className="glass-card p-4 flex items-center justify-between border border-slate-200">
              <p className="text-sm text-slate-600">This listing is unavailable or could not be loaded.</p>
              <button onClick={() => removeFromCart(id)} className="p-2 text-rose-600" title="Remove unavailable item"><Trash2 size={18} /></button>
            </div>
          ) : (
            <motion.div
              key={getProductId(product)}
              layout
              className="glass-card p-4 flex flex-col sm:flex-row items-center gap-4 border border-slate-200"
            >
              <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 border border-slate-100">
                <LazyImage src={product.image} alt={product.name} className="w-full h-full object-cover" />
              </div>

              <div className="flex-1 min-w-0 text-center sm:text-left">
                <Link to={`/product/${getProductId(product)}`}>
                  <h3 className="font-bold text-navy hover:text-royal transition-colors line-clamp-1">{product.name}</h3>
                </Link>
                <div className="flex items-center gap-2 mt-1 justify-center sm:justify-start">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin size={12} className="text-amber" /> Pickup: <strong>{product.hall}</strong>
                  </span>
                  <span className="text-xs text-slate-400">• Seller: {product.sellerName}</span>
                </div>
                <div className="mt-2 text-sm font-bold text-royal">
                  {formatPrice(product.new_price)}
                  {product.status !== 'available' && <span className="ml-2 text-rose-700">May no longer be available</span>}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => removeFromCart(getProductId(product))}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Remove item"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <div>
          <div className="glass-card p-6 border border-slate-200 sticky top-24">
            <h3 className="text-lg font-bold text-navy mb-4 pb-3 border-b border-slate-100">Cart summary</h3>

            <div className="space-y-3 text-sm mb-6">
              <div className="flex justify-between text-slate-600">
                <span>Saved items</span>
                <span className="font-semibold text-navy">{cartList.reduce((a, b) => a + b.qty, 0)}</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between text-base font-bold text-navy">
                <span>Estimated total</span>
                <span className="text-royal text-xl">{formatPrice(total)}</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                For reference only. Payment and pickup are arranged directly with the seller after you reserve.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-4 text-xs text-blue-800 space-y-1">
              <div className="font-bold flex items-center gap-1 text-royal">
                <Bookmark size={14} /> How reservation works
              </div>
              <p>
                Saving an item does not hold it. Sign in and reserve to hold a listing for 24 hours, then coordinate pickup via chat.
              </p>
            </div>

            <button
              type="button"
              onClick={handleReserveSaved}
              className="btn-primary w-full text-center block text-sm mb-3"
            >
              Reserve saved items
            </button>

            <Link to="/" className="btn-secondary w-full text-center block text-sm">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartComponent;
