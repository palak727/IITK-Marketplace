import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Package, Upload, Tag, AlertCircle, ImageOff, Pencil, Check, X } from 'lucide-react';
import LazyImage from '../components/LazyImage/LazyImage';
import { useShop } from '../context/ShopContext';
import { api, CONDITIONS, CATEGORIES, formatPrice, getProductId, getStatusBadge } from '../utils/api';
import { MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES, MAX_TOTAL_UPLOAD_BYTES, PRODUCT_IMAGE_TYPES } from '../utils/productImageConfig';
import { validateProductForm } from '../utils/productValidation';

const INITIAL_FORM_STATE = {
  name: '',
  description: '',
  category: 'coolers',
  new_price: '',
  old_price: '',
  condition: 'Barely Used',
  defects: '',
  images: [],
};

const newRequestId = () => globalThis.crypto?.randomUUID?.() || `listing-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const Dashboard = () => {
  const { auth, token, createProduct, updateProduct, updateProductStatus, deleteProduct } = useShop();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listingError, setListingError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [form, setForm] = useState({ ...INITIAL_FORM_STATE });
  const [touchedFields, setTouchedFields] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [createRequestId, setCreateRequestId] = useState(newRequestId);
  useEffect(() => {
    const previews = selectedFiles.map((file) => URL.createObjectURL(file));
    setFilePreviews(previews);
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview));
  }, [selectedFiles]);

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
    setFormError('');
    if (!editingProduct) setCreateRequestId(newRequestId());
  };
  const fieldErrors = validateProductForm(form);
  const visibleFieldError = (field) =>
    touchedFields[field] || submitAttempted ? fieldErrors[field] : '';

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (files.some((file) => !PRODUCT_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES)) {
      toast.error('Choose JPEG, PNG, or WebP images up to 5 MB each.');
      return;
    }
    if (form.images.length + selectedFiles.length + files.length > MAX_PRODUCT_IMAGES) {
      toast.error(`A listing can have at most ${MAX_PRODUCT_IMAGES} images.`);
      return;
    }
    const totalUploadSize = [...selectedFiles, ...files].reduce((total, file) => total + file.size, 0);
    if (totalUploadSize > MAX_TOTAL_UPLOAD_BYTES) {
      toast.error('New images must total no more than 12 MB.');
      return;
    }
    setSelectedFiles((current) => [...current, ...files]);
    if (!editingProduct) setCreateRequestId(newRequestId());
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (saving) return;
    if (Object.keys(validateProductForm(form)).length) return;
    if (form.images.length + selectedFiles.length === 0) {
      setFormError('Please upload at least one product image.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        new_price: Number(form.new_price),
        old_price: form.old_price !== '' && form.old_price !== null ? Number(form.old_price) : '',
        defects: form.defects.trim(),
        images: form.images,
        ...(editingProduct ? {} : { clientRequestId: createRequestId }),
      };

      const saved = editingProduct
        ? await updateProduct(getProductId(editingProduct), payload, selectedFiles)
        : await createProduct(payload, selectedFiles);
      setProducts((prev) => editingProduct
        ? prev.map((product) => String(getProductId(product)) === String(getProductId(saved)) ? saved : product)
        : [saved, ...prev]);
      setShowForm(false);
      setEditingProduct(null);
      setSelectedFiles([]);
      setTouchedFields({});
      setSubmitAttempted(false);
      setFormError('');
      setCreateRequestId(newRequestId());
      setForm({ ...INITIAL_FORM_STATE });
      toast.success(editingProduct ? 'Listing updated successfully!' : 'Listing published successfully!');
    } catch (err) {
      setFormError(err.message || 'Failed to save listing.');
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
    setSelectedFiles([]);
    setTouchedFields({});
    setSubmitAttempted(false);
    setFormError('');
    setForm({
      ...INITIAL_FORM_STATE,
      ...product,
      images: Array.isArray(product.images) ? product.images : [],
      defects: product.defects || '',
    });
    setShowForm(true);
  };

  const handleDeleteProduct = async (product) => {
    const productId = getProductId(product);
    if (!window.confirm(`Permanently delete "${product.name}" from the marketplace?`)) return;

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
            Manage your campus items, {auth?.user?.name || 'Seller'} ({auth?.user?.hall || 'Hall 12'})
          </p>
        </div>
        <button 
          onClick={() => {
            if (showForm) {
              setEditingProduct(null);
              setSelectedFiles([]);
              setTouchedFields({});
              setSubmitAttempted(false);
              setFormError('');
              setCreateRequestId(newRequestId());
              setForm({ ...INITIAL_FORM_STATE });
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
          noValidate
          className="glass-card p-6 md:p-8 mb-8 space-y-4 border border-slate-200"
        >
          <h2 className="font-bold text-xl text-navy pb-2 border-b border-slate-100 flex items-center gap-2">
            <Package size={20} className="text-royal" /> {editingProduct ? 'Edit Listing' : 'List a Campus Essential'}
          </h2>

          {formError && <p role="alert" className="text-sm text-rose-700">{formError}</p>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Item Title *</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                onBlur={() => setTouchedFields((prev) => ({ ...prev, name: true }))}
                placeholder="e.g. Symphony 70L Cooler or Hero Cycle"
                required
                minLength={2}
                maxLength={100}
                aria-invalid={Boolean(visibleFieldError('name'))}
                className="input-field"
              />
              {visibleFieldError('name') && <p className="mt-1 text-xs text-rose-700">{visibleFieldError('name')}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Category *</label>
              <select name="category" value={form.category} onChange={handleChange} onBlur={() => setTouchedFields((prev) => ({ ...prev, category: true }))} required aria-invalid={Boolean(visibleFieldError('category'))} className="input-field">
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
              {visibleFieldError('category') && <p className="mt-1 text-xs text-rose-700">{visibleFieldError('category')}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Selling Price (₹) *</label>
              <input
                name="new_price"
                type="number"
                min="0"
                max="1000000"
                step="any"
                value={form.new_price}
                onChange={handleChange}
                onBlur={() => setTouchedFields((prev) => ({ ...prev, new_price: true }))}
                placeholder="Selling price"
                required
                aria-invalid={Boolean(visibleFieldError('new_price'))}
                className="input-field"
              />
              {visibleFieldError('new_price') && <p className="mt-1 text-xs text-rose-700">{visibleFieldError('new_price')}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Original Price (₹)</label>
              <input
                name="old_price"
                type="number"
                min="0"
                max="1000000"
                step="any"
                value={form.old_price}
                onChange={handleChange}
                onBlur={() => setTouchedFields((prev) => ({ ...prev, old_price: true }))}
                placeholder="Original purchase price"
                aria-invalid={Boolean(visibleFieldError('old_price'))}
                className="input-field"
              />
              {visibleFieldError('old_price') && <p className="mt-1 text-xs text-rose-700">{visibleFieldError('old_price')}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Tag size={12} className="text-royal" /> Condition Grade *
              </label>
              <select name="condition" value={form.condition} onChange={handleChange} onBlur={() => setTouchedFields((prev) => ({ ...prev, condition: true }))} required aria-invalid={Boolean(visibleFieldError('condition'))} className="input-field">
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {visibleFieldError('condition') && <p className="mt-1 text-xs text-rose-700">{visibleFieldError('condition')}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Upload size={12} className="text-royal" /> Listing Images (up to 4, 5 MB each, 12 MB total)
            </label>
            <label className="btn-secondary text-xs px-4 py-2.5 cursor-pointer inline-flex items-center gap-1">
              <Upload size={14} /> Choose Images
              <input type="file" accept={PRODUCT_IMAGE_TYPES.join(',')} multiple onChange={handleFileUpload} className="hidden" />
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              {form.images.map((src, index) => (
                <div key={`saved-${src}-${index}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                  <LazyImage src={src} alt={`Listing image ${index + 1}`} className="w-full h-full object-cover" />
                  <button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => setForm((current) => {
                    const images = current.images.filter((_, imageIndex) => imageIndex !== index);
                    return { ...current, images };
                  })} className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-rose-700"><X size={13} /></button>
                </div>
              ))}
              {filePreviews.map((src, index) => (
                <div key={`new-${src}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                  <LazyImage src={src} alt={`New listing image ${index + 1}`} className="w-full h-full object-cover" />
                  <button type="button" aria-label={`Remove new image ${index + 1}`} onClick={() => {
                    setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
                    if (!editingProduct) setCreateRequestId(newRequestId());
                  }} className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-rose-700"><X size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <AlertCircle size={12} className="text-amber" />               Known Defects (up to 100 characters)
            </label>
            <input
              name="defects"
              value={form.defects}
              maxLength={100}
              onChange={handleChange}
              onBlur={() => setTouchedFields((prev) => ({ ...prev, defects: true }))}
              aria-invalid={Boolean(visibleFieldError('defects'))}
              placeholder="Describe any known defects"
              className="input-field"
            />
            {visibleFieldError('defects') && <p className="mt-1 text-xs text-rose-700">{visibleFieldError('defects')}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Item Description *</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              onBlur={() => setTouchedFields((prev) => ({ ...prev, description: true }))}
              placeholder="Provide details about condition, usage time, and pickup availability..."
              rows={3}
              required
              maxLength={3000}
              aria-invalid={Boolean(visibleFieldError('description'))}
              className="input-field resize-none"
            />
            {visibleFieldError('description') && <p className="mt-1 text-xs text-rose-700">{visibleFieldError('description')}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Publish Item Listing'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingProduct(null);
                setSelectedFiles([]);
                setTouchedFields({});
                setSubmitAttempted(false);
                setFormError('');
                setCreateRequestId(newRequestId());
                setForm({ ...INITIAL_FORM_STATE });
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
            <h2 className="text-lg font-bold text-navy mb-2">Your Listings ({products.length})</h2>
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
                    {product.images?.[0] ? (
                      <LazyImage src={product.images[0]} alt={product.name} className="w-full h-full object-contain" />
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
                      <span className="text-xs text-slate-500 font-semibold">{product.sellerId?.hall}</span>
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
                  <button
                    onClick={() => handleDeleteProduct(product)}
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
