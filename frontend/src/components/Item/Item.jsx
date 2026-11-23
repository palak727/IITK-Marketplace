import { Link } from 'react-router-dom';
import { MapPin, Tag } from 'lucide-react';
import LazyImage from '../LazyImage/LazyImage';
import { formatPrice, getProductId } from '../../utils/api';

const Item = ({ product = {} }) => {
  const productId = getProductId(product);
  const displayImage = product.images?.[0] || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';

  return (
    <Link to={`/product/${productId}`} className="listing-tile group">
      <div className="listing-photo">
        <LazyImage src={displayImage} alt={product.name || 'Campus item'} className="listing-image-wrapper w-full h-full" />
        {product.sellerId?.hall && <span className="listing-hall"><MapPin size={11} />{product.sellerId.hall}</span>}
      </div>
      <div className="listing-info">
        <div className="listing-meta">
          <span className="category">{product.category || 'General'}</span>
          {product.condition && <span className="inline-flex items-center gap-1"><Tag size={11} />{product.condition}</span>}
        </div>
        <h3 className="listing-title">{product.name || 'Unnamed Product'}</h3>
        <div className="listing-price">
          <strong>{formatPrice(product.new_price || 0)}</strong>
          {product.old_price > product.new_price && <del>{formatPrice(product.old_price)}</del>}
        </div>
      </div>
    </Link>
  );
};

export default Item;
