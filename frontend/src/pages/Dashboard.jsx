import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Package, Upload, MapPin, Tag, AlertCircle, ImageOff, Pencil, Check, RotateCcw } from 'lucide-react';
import LazyImage from '../components/LazyImage/LazyImage';
import { useShop } from '../context/ShopContext';
import { api, CONDITIONS, CATEGORIES, formatPrice, getProductId, getStatusBadge, HALLS } from '../utils/api';

const INITIAL_FORM_STATE = {
  name: '',
  description: '',
  category: 'coolers',
  new_price: '',
  old_price: '',
  hall: 'Hall 12',
  condition: 'Barely Used',
  defects: '',
  image: '',
};

const newRequestId = () => globalThis.crypto?.randomUUID?.() || `listing-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const Dashboard = () => {
  const { auth, token, createProduct, updateProduct, updateProductStatus, deleteProduct } = useShop();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listingError, setListingError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    ...INITIAL_FORM_STATE,
    hall: auth?.user?.hall || 'Hall 12',
  });
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [createRequestId, setCreateRequestId] = useState(newRequestId);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setListingError('');
    try {
      setProducts(await api.get('/products/seller/mine', token));
    } catch (error) {
      setListingError(error.message || 'Unable to load your listings.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (auth) loadListings();
  }, [auth, loadListings]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const url = await api.upload(file, token);
      setForm((prev) => ({ ...prev, image: url }));
      toast.success('Image uploaded successfully!');
    } catch (err) {
      toast.error(err.message || 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.new_price === '' || saving || uploading) {
      toast.error('Item name and selling price are required');
      return;
    }

    setSaving(true);
    try {
      const imgUrl = form.image || '';
      const payload = {
        ...form,
        new_price: Number(form.new_price),
        old_price: form.old_price ? Number(form.old_price) : Number(form.new_price) * 1.3,
        defects: form.defects ? form.defects.split(',').map((d) => d.trim()).filter(Boolean) : [],
        images: imgUrl ? [imgUrl] : [],
        image: imgUrl,
        ...(editingProduct ? {} : { clientRequestId: createRequestId }),
      };

      const saved = editingProduct
        ? await updateProduct(getProductId(editingProduct), payload)
        : await createProduct(payload);
      setProducts((prev) => editingProduct
        ? prev.map((product) => String(getProductId(product)) === String(getProductId(saved)) ? saved : product)
        : [saved, ...prev]);
      setShowForm(false);
      setEditingProduct(null);
      setCreateRequestId(newRequestId());
      setForm({
        ...INITIAL_FORM_STATE,
        hall: auth?.user?.hall || 'Hall 12',
      });
      toast.success(editingProduct ? 'Listing updated successfully!' : 'Listing published successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to create listing');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (product, status) => {
    const productId = getProductId(product);
    try {
      const updated = await updateProductStatus(productId, status);
      setProducts((prev) =>
        prev.map((p) => (String(getProductId(p)) === String(productId) ? updated : p))
      );
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const beginEdit = (product) => {
    setEditingProduct(product);
    setCreateRequestId('');
    setForm({
      ...INITIAL_FORM_STATE,
      ...product,
      defects: Array.isArray(product.defects) ? product.defects.join(', ') : '',
      hall: product.hall || auth?.user?.hall || 'Hall 12',
      image: product.image || '',
    });
    setShowForm(true);
  };

  const handleDeleteProduct = async (product) => {
    const productId = getProductId(product);
    if (!window.confirm(`Delete "${product.name}" from your listings?`)) return;

    try {
      await deleteProduct(productId);
      setProducts((prev) => prev.filter((p) => String(getProductId(p)) !== String(productId)));
      toast.success('Listing deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete listing');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-navy">Your listings</h1>
          <p className="text-slate-500 text-sm">
            Manage your campus items, {auth.user.name} ({auth.user.hall || 'Hall 12'})
          </p>
        </div>
        <button 
          onClick={() => {
            if (showForm) {
              setEditingProduct(null);
              setCreateRequestId(newRequestId());
              setForm({ ...INITIAL_FORM_STATE, hall: auth?.user?.hall || 'Hall 12' });
            }
            setShowForm(!showForm);
          }}
          className="btn-primary flex items-center gap-2 shadow-lg"
        >
          <Plus size={18} />
          {showForm ? 'Close Form' : 'Post New Item'}
        </button>
      </div>

      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreate}
          className="glass-card p-6 md:p-8 mb-8 space-y-4 border border-slate-200"
        >
          <h2 className="font-bold text-xl text-navy pb-2 border-b border-slate-100 flex items-center gap-2">
            <Package size={20} className="text-royal" /> {editingProduct ? 'Edit Listing' : 'List a Campus Essential'}
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Item Title *</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Symphony 70L Cooler or Hero Cycle"
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Category *</label>
              <select name="category" value={form.category} onChange={handleChange} className="input-field">
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Selling Price (₹) *</label>
              <input
                name="new_price"
                type="number"
                min="0"
                max="100000000"
                value={form.new_price}
                onChange={handleChange}
                placeholder="Selling price"
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Original Price (₹)</label>
              <input
                name="old_price"
                type="number"
                min="0"
                max="100000000"
                value={form.old_price}
                onChange={handleChange}
                placeholder="Original purchase price"
                className="input-field"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin size={12} className="text-amber" /> Hall of Residence Pickup *
              </label>
              <select name="hall" value={form.hall} onChange={handleChange} className="input-field">
                {HALLS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Tag size={12} className="text-royal" /> Condition Grade *
              </label>
              <select name="condition" value={form.condition} onChange={handleChange} className="input-field">
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Upload size={12} className="text-royal" /> Upload Image File or Enter URL
            </label>
            <div className="flex gap-2">
              <input
                name="image"
                value={form.image}
                onChange={handleChange}
                placeholder="https://... or choose file on right"
                className="input-field flex-1"
              />
              <label className="btn-secondary text-xs px-4 py-2.5 cursor-pointer flex items-center gap-1 shrink-0">
                <Upload size={14} /> {uploading ? 'Uploading...' : 'Browse Image'}
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <AlertCircle size={12} className="text-amber" /> Known Defects / Tags (comma separated)
            </label>
            <input
              name="defects"
              value={form.defects}
              onChange={handleChange}
              placeholder="e.g. Minor dust, Power cord included, Serviced last month"
              className="input-field"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Item Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Provide details about condition, usage time, and pickup availability..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving || uploading} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Publish Item Listing'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingProduct(null);
                setCreateRequestId(newRequestId());
                setForm({ ...INITIAL_FORM_STATE, hall: auth?.user?.hall || 'Hall 12' });
              }}
              className="px-6 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </motion.form>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading your listings...</div>
      ) : listingError ? (
        <div role="alert" className="text-center py-12 glass-card">
          <p className="text-rose-700">{listingError}</p>
          <button type="button" onClick={loadListings} className="btn-secondary mt-4">Retry</button>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 glass-card border border-slate-200">
          <Package size={56} className="mx-auto text-slate-300 mb-3" />
          <p className="text-navy font-bold text-lg mb-1">No items listed yet</p>
          <p className="text-slate-500 text-sm mb-6">Click &quot;Post New Item&quot; above to list your campus gear.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-navy mb-2">Your Active Listings ({products.length})</h2>
          {products.map((product) => {
            const badge = getStatusBadge(product.status);
            const productId = getProductId(product);

            return (
              <motion.div
                key={productId}
                layout
                className="glass-card p-4 flex flex-col sm:flex-row gap-4 items-center border border-slate-200 justify-between"
              >
                <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                  <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center bg-slate-50 text-slate-400">
                    {product.image ? (
                      <LazyImage src={product.image} alt={product.name} className="w-full h-full object-contain" />
                    ) : (
                      <ImageOff size={24} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-navy line-clamp-1">{product.name}</h3>
                    <p className="text-royal font-bold text-sm">{formatPrice(product.new_price)}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">{product.hall}</span>
                      <span className="text-xs text-slate-400">• {product.condition}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-3 sm:pt-0">
                  {product.status === 'available' && (
                    <>
                      <button onClick={() => beginEdit(product)} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-navy" title="Edit listing"><Pencil size={15} /> Edit</button>
                      <button onClick={() => handleStatus(product, 'sold')} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-800" title="Mark sold"><Check size={15} /> Mark sold</button>
                    </>
                  )}
                  {product.status === 'reserved' && (
                    <>
                      <button onClick={() => handleStatus(product, 'available')} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-bold text-amber-800" title="Cancel reservation"><RotateCcw size={15} /> Release</button>
                      <button onClick={() => handleStatus(product, 'sold')} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-800" title="Mark sold"><Check size={15} /> Mark sold</button>
                    </>
                  )}
                  <button
                    onClick={() => handleDeleteProduct(product)}
                    disabled={product.status === 'reserved'}
                    className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-700 hover:bg-rose-100 shrink-0 shadow-sm"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dashboard;