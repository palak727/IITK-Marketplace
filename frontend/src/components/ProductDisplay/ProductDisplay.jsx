import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, MessageCircle, MapPin, Tag, AlertCircle, ImageOff } from 'lucide-react';
import toast from 'react-hot-toast';
import LazyImage from '../LazyImage/LazyImage';
import { useShop } from '../../context/ShopContext';
import { formatPrice, getProductId, getStatusBadge } from '../../utils/api';

const ProductDisplay = ({ product }) => {
  const { auth, addToCart, openChat } = useShop();
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(0);
  const productId = getProductId(product);

  const images = useMemo(() => {
    const normalized = [];
    if (product.image) normalized.push(product.image);
    if (Array.isArray(product.images)) {
      product.images.forEach((img) => {
        if (img && !normalized.includes(img)) normalized.push(img);
      });
    }
    return normalized;
  }, [product.image, product.images]);

  useEffect(() => {
    if (images.length <= 1) return undefined;
    const interval = setInterval(() => {
      setSelectedImage((prev) => (prev + 1) % images.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [images]);

  const badge = getStatusBadge(product.status);
  const isAvailable = product.status === 'available';
  const currentUserId = String(auth?.user?.id || auth?.user?._id || '');
  const sellerId = String(product?.sellerId || '');
  const isOwner = currentUserId && sellerId && currentUserId === sellerId;

  const handleMessage = () => {
    if (!auth) {
      toast.error('Please sign in to message the seller.');
      navigate('/login', { state: { from: `/product/${productId}` } });
      return;
    }
    openChat(product, product.sellerId || 'senior-1');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid md:grid-cols-2 gap-8 lg:gap-12"
    >
      <div>
        <div className="aspect-square rounded-2xl overflow-hidden mb-4 glass-card border border-slate-200 shadow-lg bg-slate-100 flex items-center justify-center">
          {images.length > 0 && images[selectedImage] ? (
            <LazyImage src={images[selectedImage]} alt={product.name} className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
              <ImageOff size={40} />
              <span className="text-xs font-medium">No image available</span>
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setSelectedImage(i)}
                className={`w-20 h-20 rounded-xl overflow-hidden shrink-0 border-2 transition-colors bg-slate-100 ${
                  selectedImage === i ? 'border-royal shadow-md' : 'border-transparent'
                }`}
              >
                <LazyImage src={img} alt="" className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
          <span className="text-xs font-bold text-royal uppercase tracking-wider bg-blue-50 px-3 py-1 rounded-full">
            {product.category}
          </span>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-navy mb-3">{product.name}</h1>

        <div className="flex items-baseline gap-3 mb-6">
          <span className="text-3xl font-extrabold text-royal">{formatPrice(product.new_price)}</span>
          {product.old_price > product.new_price && (
            <span className="text-lg text-slate-400 line-through">{formatPrice(product.old_price)}</span>
          )}
        </div>

        <div className="space-y-3 mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          {product.hall && (
            <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
              <MapPin size={18} className="text-amber shrink-0" />
              Physical Pickup: <strong className="text-navy">{product.hall}</strong>
            </div>
          )}
          {product.condition && (
            <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
              <Tag size={18} className="text-royal shrink-0" />
              Condition Grade: <strong className="text-navy">{product.condition}</strong>
            </div>
          )}
          {product.sellerName && (
            <p className="text-sm text-slate-600">
              Listed by <strong className="text-navy">{product.sellerName}</strong>
            </p>
          )}
        </div>

        {product.defects?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-2">
              <AlertCircle size={18} className="text-amber-600" />
              Condition & Defect Callouts
            </div>
            <ul className="text-sm text-amber-800 space-y-1 pl-5 list-disc">
              {product.defects.map((defect, i) => (
                <li key={i}>{defect}</li>
              ))}
            </ul>
          </div>
        )}

        {product.description && (
          <div className="mb-8">
            <h4 className="text-sm font-bold text-navy mb-1 uppercase tracking-wider">Description</h4>
            <p className="text-slate-600 text-sm leading-relaxed">{product.description}</p>
          </div>
        )}

        {isOwner ? (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-royal font-semibold text-center">
            This is your active listing. Buyers can contact you through chat.
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => addToCart(productId, product)}
              disabled={!isAvailable}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingCart size={18} />
              Add to Cart
            </button>
            <button
              onClick={handleMessage}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border-2 border-navy text-navy font-semibold hover:bg-navy hover:text-white transition-colors"
            >
              <MessageCircle size={18} />
              Chat with Seller
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ProductDisplay;
