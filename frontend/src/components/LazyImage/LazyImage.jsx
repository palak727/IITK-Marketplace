import { useState } from 'react';
import { getImageUrl } from '../../utils/api';

const LazyImage = ({ src, alt = '', className = '' }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className={`relative overflow-hidden bg-slate-100 flex items-center justify-center ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 animate-pulse" />
      )}
      {failed ? (
        <span className="text-xs text-slate-400">Image unavailable</span>
      ) : <img
        src={getImageUrl(src) || '/placeholder-image.svg'}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => { setFailed(true); setLoaded(true); }}
        className={`w-full h-full object-contain transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
      />}
    </div>
  );
};

export default LazyImage;
