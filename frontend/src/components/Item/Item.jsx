import { Link } from 'react-router-dom';
import { MapPin, Tag } from 'lucide-react';
import LazyImage from '../LazyImage/LazyImage';
import { formatPrice, getProductId, getStatusBadge } from '../../utils/api';

const Item = ({ product = {} }) => {
  const productId = getProductId(product);
  const badge = getStatusBadge(product.status);

  const displayImage = 
    product.image || 
    (Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null) || 
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';

  return (
    <Link 
      to={`/product/${productId}`} 
      className="group glass-card rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col bg-white"
    >
      <div className="relative aspect-square bg-slate-100 overflow-hidden flex items-center justify-center p-4">
        <LazyImage 
          src={displayImage} 
          alt={product.name || 'Campus Item'} 
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" 
        />
        <div className="absolute top-3 left-3 flex flex-col gap-1 items-start">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        {product.hall && (
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 shadow-sm">
            <MapPin size={12} className="text-amber" />
            {product.hall}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-grow justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-royal bg-blue-50 px-2 py-0.5 rounded-md">
              {product.category || 'General'}
            </span>
            {product.condition && (
              <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                <Tag size={12} /> {product.condition}
              </span>
            )}
          </div>
          <h3 className="font-bold text-navy text-base line-clamp-1 group-hover:text-royal transition-colors">
            {product.name || 'Unnamed Product'}
          </h3>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold text-royal">
              {formatPrice(product.new_price || 0)}
            </span>
            {product.old_price > product.new_price && (
              <span className="text-xs text-slate-400 line-through">
                {formatPrice(product.old_price)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default Item;