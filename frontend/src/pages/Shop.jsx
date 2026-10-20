import Hero from '../components/Hero/Hero';
import Item from '../components/Item/Item';
import { useShop } from '../context/ShopContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Shop = () => {
  const { all_product, searchQuery, loading, productError, productPage, productLimit, productTotal, setProductPage, fetchProducts } = useShop();
  const pageCount = Math.max(1, Math.ceil(productTotal / productLimit));
  const products = all_product;

  return (
    <div>
      {!searchQuery && <Hero />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-bold text-royal uppercase tracking-wider">Hall Pickups</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-navy mt-1">
              {searchQuery ? `Search Results for "${searchQuery}"` : 'Available Campus Essentials'}
            </h2>
          </div>
        </div>

        {productError ? (
          <div role="alert" className="text-center py-16 glass-card">
            <p className="text-rose-700">{productError}</p>
            <button onClick={() => fetchProducts({ search: searchQuery.trim() || undefined })} className="btn-secondary mt-4">Retry</button>
          </div>
        ) : loading ? (
          <div className="text-center py-16 text-slate-500" role="status">Loading listings...</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 glass-card">
            <p className="text-slate-500">
              {searchQuery
                ? 'No campus items match your search. Try searching for "cooler", "cycle", or "Hall 12".'
                : 'No campus items are available right now.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((item) => (
              <Item key={item._id || item.id} product={item} />
            ))}
          </div>
        )}
        {!productError && productTotal > productLimit && (
          <nav aria-label="Product pages" className="mt-8 flex items-center justify-center gap-4">
            <button
              type="button"
              disabled={productPage <= 1 || loading}
              onClick={() => setProductPage((page) => Math.max(1, page - 1))}
              className="btn-secondary inline-flex items-center gap-1 disabled:opacity-40"
            ><ChevronLeft size={16} /> Previous</button>
            <span className="text-sm text-slate-600">Page {productPage} of {pageCount}</span>
            <button
              type="button"
              disabled={productPage >= pageCount || loading}
              onClick={() => setProductPage((page) => Math.min(pageCount, page + 1))}
              className="btn-secondary inline-flex items-center gap-1 disabled:opacity-40"
            >Next <ChevronRight size={16} /></button>
          </nav>
        )}
      </div>
    </div>
  );
};

export default Shop;
