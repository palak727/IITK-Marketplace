import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Filter, Tag } from 'lucide-react';
import Item from '../Item/Item';
import { HALLS, CONDITIONS } from '../../utils/api';
import { useShop } from '../../context/ShopContext';

const ShopCategoryComponent = ({
  categoryName = 'all',
  products = [], // Default empty array prevents .filter() crash when loading
  categoryTitle = 'Campus Listings',
  bannerDesc = 'Explore items available across IIT Kanpur campus',
  loading = false,
  error = '',
  page = 1,
  limit = 20,
  total = 0,
  onPageChange,
  onRetry,
}) => {
  const { setProductFilters } = useShop();
  const [selectedHall, setSelectedHall] = useState('all');
  const [selectedCondition, setSelectedCondition] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // Ensure products is always an array before filtering
  const safeProducts = Array.isArray(products) ? products : [];

  useEffect(() => {
    setProductFilters({
      category: categoryName && categoryName !== 'all' ? categoryName : undefined,
      hall: selectedHall === 'all' ? undefined : selectedHall,
      condition: selectedCondition === 'all' ? undefined : selectedCondition,
      sort: sortBy,
    });
  }, [categoryName, selectedHall, selectedCondition, sortBy, setProductFilters]);

  useEffect(() => {
    return () => setProductFilters({});
  }, [setProductFilters]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Category Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 md:p-8 mb-8 bg-gradient-to-r from-navy via-slate-800 to-royal text-white rounded-3xl shadow-xl"
      >
        <h1 className="text-3xl md:text-4xl font-extrabold mb-2 capitalize">{categoryTitle}</h1>
        <p className="text-slate-300 text-sm md:text-base max-w-2xl">{bannerDesc}</p>
      </motion.div>

      {/* Filter Bar */}
      <div className="glass-card p-4 mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <span className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-1">
            <Filter size={14} className="text-royal" /> Filters:
          </span>

          {/* Hall Filter */}
          <div className="relative">
            <select
              value={selectedHall}
              onChange={(e) => { setSelectedHall(e.target.value); onPageChange(1); }}
              className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-navy focus:outline-none focus:ring-2 focus:ring-royal/30"
            >
              <option value="all">All Halls of Residence</option>
              {HALLS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* Condition Filter */}
          <div className="relative">
            <select
              value={selectedCondition}
              onChange={(e) => { setSelectedCondition(e.target.value); onPageChange(1); }}
              className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-navy focus:outline-none focus:ring-2 focus:ring-royal/30"
            >
              <option value="all">All Condition Grades</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sorting Dropdown */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <span className="text-xs font-semibold text-slate-500">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); onPageChange(1); }}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-navy focus:outline-none focus:ring-2 focus:ring-royal/30"
          >
            <option value="newest">Recently Listed</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* Products Grid */}
      {error ? (
        <div role="alert" className="text-center py-16 glass-card">
          <p className="text-rose-700">{error}</p>
          <button
            onClick={() => onRetry({
              category: categoryName,
              hall: selectedHall === 'all' ? undefined : selectedHall,
              condition: selectedCondition === 'all' ? undefined : selectedCondition,
              sort: sortBy,
              page,
              limit,
            })}
            className="btn-secondary mt-4"
          >Retry</button>
        </div>
      ) : loading ? (
        <div role="status" className="text-center py-16 text-slate-500">Loading listings...</div>
      ) : safeProducts.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-2xl">
          <Tag size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="font-bold text-navy text-lg mb-1">No items found</p>
          <p className="text-slate-500 text-sm">Try adjusting your Hall or Condition filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {safeProducts.map((item) => (
            <Item key={item._id || item.id} product={item} />
          ))}
        </div>
      )}
      {!error && total > limit && (
        <nav aria-label="Product pages" className="mt-8 flex items-center justify-center gap-4">
          <button type="button" disabled={page <= 1 || loading} onClick={() => onPageChange((value) => Math.max(1, value - 1))} className="btn-secondary inline-flex items-center gap-1 disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-sm text-slate-600">Page {page} of {pageCount}</span>
          <button type="button" disabled={page >= pageCount || loading} onClick={() => onPageChange((value) => Math.min(pageCount, value + 1))} className="btn-secondary inline-flex items-center gap-1 disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </nav>
      )}
    </div>
  );
};

export default ShopCategoryComponent;