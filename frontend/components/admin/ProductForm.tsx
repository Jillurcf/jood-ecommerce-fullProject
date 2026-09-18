'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createAdminProduct, updateAdminProduct, getAdminParentCategories, getAdminCategories, getAdminProduct } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { AdminVariant, AdminParentCategory, AdminCategory } from '@/lib/types';

interface FormVariant {
  id?: number;
  name: string;
  display_name: string;
  sku: string;
  price: string;
  sale_price: string;
  cost_price: string;
  stock: string;
  low_stock_threshold: string;
  track_inventory: boolean;
  allow_backorders: boolean;
  discount_type: string;
  discount_value: string;
  vat_rate: string;
  vat_included: boolean;
  barcode: string;
  is_active: boolean;
  is_default: boolean;
}

const emptyVariant = (): FormVariant => ({
  name: '', display_name: '', sku: '', price: '', sale_price: '', cost_price: '',
  stock: '', low_stock_threshold: '5', track_inventory: true, allow_backorders: false,
  discount_type: '', discount_value: '', vat_rate: '5', vat_included: true,
  barcode: '', is_active: true, is_default: false,
});

export default function ProductForm({ productId: _productId }: { productId?: number }) {
  const router = useRouter();
  const params = useParams();
  const productId = _productId ?? (params.id ? Number(params.id) : undefined);
  const isEdit = !!productId;

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [mpn, setMpn] = useState('');
  const [productType, setProductType] = useState('simple');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('published');
  const [visibility, setVisibility] = useState(true);
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [bullets, setBullets] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');

  const [variants, setVariants] = useState<FormVariant[]>([emptyVariant()]);
  const [parentCategories, setParentCategories] = useState<AdminParentCategory[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminParentCategories().then((res) => {
      setParentCategories(Array.isArray(res) ? res : []);
      if (!isEdit && Array.isArray(res) && res.length && !parentCategoryId) {
        setParentCategoryId(String(res[0].id));
      }
    }).catch(() => {});
  }, [isEdit]); // eslint-disable-line

  useEffect(() => {
    if (parentCategoryId) {
      getAdminCategories({ parent_id: parentCategoryId }).then((res) => {
        setCategories(res.categories ?? []);
      }).catch(() => setCategories([]));
    } else {
      setCategories([]);
    }
  }, [parentCategoryId]);

  useEffect(() => {
    if (isEdit && productId) {
      getAdminProduct(productId).then((p) => {
        setName(p.name || '');
        setBrand(p.brand || '');
        setMpn(p.mpn || '');
        setProductType(p.product_type || 'simple');
        setParentCategoryId(p.parent_category_id ? String(p.parent_category_id) : '');
        setCategoryId(p.category_id ? String(p.category_id) : '');
        setStatus(p.status || 'published');
        setVisibility(p.visibility);
        setShortDescription(p.short_description || '');
        setDescription(p.description || '');
        setMetaTitle((p as unknown as Record<string, string>).meta_title || '');
        setMetaDescription((p as unknown as Record<string, string>).meta_description || '');
        setMetaKeywords((p as unknown as Record<string, string>).meta_keywords || '');

        if (Array.isArray(p.variants) && p.variants.length) {
          setVariants(p.variants.map((v: AdminVariant) => ({
            id: v.id,
            name: v.name || '',
            display_name: v.display_name || '',
            sku: v.sku || '',
            price: String(v.price ?? ''),
            sale_price: v.sale_price != null ? String(v.sale_price) : '',
            cost_price: v.cost_price != null ? String(v.cost_price) : '',
            stock: String(v.stock ?? ''),
            low_stock_threshold: String(v.low_stock_threshold ?? '5'),
            track_inventory: v.track_inventory,
            allow_backorders: v.allow_backorders,
            discount_type: v.discount_type || '',
            discount_value: v.discount_value != null ? String(v.discount_value) : '',
            vat_rate: String(v.vat_rate ?? '5'),
            vat_included: v.vat_included,
            barcode: (v as unknown as Record<string, string>).barcode || '',
            is_active: v.is_active,
            is_default: v.is_default,
          })));
        }
        setLoading(false);
      }).catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load product.');
        setLoading(false);
      });
    }
  }, [isEdit, productId]);

  const updateVariant = (i: number, patch: Partial<FormVariant>) => {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  };

  const addVariant = () => setVariants((prev) => [...prev, emptyVariant()]);
  const removeVariant = (i: number) => {
    if (variants.length === 1) return;
    setVariants((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      brand: brand.trim() || undefined,
      mpn: mpn.trim() || undefined,
      product_type: productType,
      parent_category_id: parentCategoryId ? Number(parentCategoryId) : null,
      category_id: categoryId ? Number(categoryId) : null,
      status,
      visibility,
      short_description: shortDescription || undefined,
      description: description || undefined,
      bullets: bullets ? bullets.split('\n').map((b) => b.trim()).filter(Boolean) : [],
      meta_title: metaTitle || undefined,
      meta_description: metaDescription || undefined,
      meta_keywords: metaKeywords || undefined,
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name.trim(),
        display_name: v.display_name.trim() || undefined,
        sku: v.sku.trim() || undefined,
        price: parseFloat(v.price),
        sale_price: v.sale_price ? parseFloat(v.sale_price) : null,
        cost_price: v.cost_price ? parseFloat(v.cost_price) : null,
        stock: parseInt(v.stock || '0', 10),
        low_stock_threshold: parseInt(v.low_stock_threshold || '5', 10),
        track_inventory: v.track_inventory,
        allow_backorders: v.allow_backorders,
        discount_type: v.discount_type || undefined,
        discount_value: v.discount_value ? parseFloat(v.discount_value) : null,
        vat_rate: parseFloat(v.vat_rate || '5'),
        vat_included: v.vat_included,
        barcode: v.barcode.trim() || undefined,
        is_active: v.is_active,
        is_default: v.is_default,
      })),
    };

    try {
      if (isEdit && productId) {
        await updateAdminProduct(productId, payload);
      } else {
        await createAdminProduct(payload);
      }
      router.push('/admin/products');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="empty-state">Loading product…</p>;

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <h1 className="admin-page-title">{isEdit ? 'Edit Product' : 'Add Product'}</h1>
      {error && <div className="auth-error">{error}</div>}

      <div className="admin-form__grid">
        <div className="form-field">
          <span>Product Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-field">
          <span>Brand</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="form-field">
          <span>MPN / Model</span>
          <input value={mpn} onChange={(e) => setMpn(e.target.value)} />
        </div>
        <div className="form-field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
        <div className="form-field">
          <span>Parent Category</span>
          <select value={parentCategoryId} onChange={(e) => { setParentCategoryId(e.target.value); setCategoryId(''); }}>
            <option value="">— None —</option>
            {parentCategories.map((pc) => (
              <option key={pc.id} value={pc.id}>{pc.name}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <span>Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!parentCategoryId}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label className="auth-check">
          <input type="checkbox" checked={visibility} onChange={(e) => setVisibility(e.target.checked)} />
          Visible on storefront
        </label>
      </div>

      <div className="form-field">
        <span>Short Description</span>
        <textarea rows={2} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
      </div>
      <div className="form-field">
        <span>Description</span>
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="form-field">
        <span>Bullets (one per line)</span>
        <textarea rows={3} value={bullets} onChange={(e) => setBullets(e.target.value)} />
      </div>

      <div className="admin-form__grid">
        <div className="form-field">
          <span>Meta Title</span>
          <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
        </div>
        <div className="form-field">
          <span>Meta Keywords</span>
          <input value={metaKeywords} onChange={(e) => setMetaKeywords(e.target.value)} />
        </div>
      </div>
      <div className="form-field">
        <span>Meta Description</span>
        <textarea rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.1rem' }}>Variants (SKUs)</h2>
          <button type="button" className="btn btn-outline" onClick={addVariant}>+ Add Variant</button>
        </div>

        {variants.map((v, i) => (
          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', background: '#fafbfc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <strong>Variant {i + 1}</strong>
              <button type="button" className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', color: 'var(--danger)' }} onClick={() => removeVariant(i)} disabled={variants.length === 1}>
                Remove
              </button>
            </div>
            <div className="admin-form__grid">
              <div className="form-field">
                <span>Name</span>
                <input value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} />
              </div>
              <div className="form-field">
                <span>Display Name</span>
                <input value={v.display_name} onChange={(e) => updateVariant(i, { display_name: e.target.value })} />
              </div>
              <div className="form-field">
                <span>SKU</span>
                <input value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
              </div>
              <div className="form-field">
                <span>Barcode</span>
                <input value={v.barcode} onChange={(e) => updateVariant(i, { barcode: e.target.value })} />
              </div>
              <div className="form-field">
                <span>Price *</span>
                <input type="number" step="0.01" value={v.price} onChange={(e) => updateVariant(i, { price: e.target.value })} />
              </div>
              <div className="form-field">
                <span>Sale Price</span>
                <input type="number" step="0.01" value={v.sale_price} onChange={(e) => updateVariant(i, { sale_price: e.target.value })} />
              </div>
              <div className="form-field">
                <span>Cost Price</span>
                <input type="number" step="0.01" value={v.cost_price} onChange={(e) => updateVariant(i, { cost_price: e.target.value })} />
              </div>
              <div className="form-field">
                <span>Stock *</span>
                <input type="number" value={v.stock} onChange={(e) => updateVariant(i, { stock: e.target.value })} />
              </div>
              <div className="form-field">
                <span>Low Stock Threshold</span>
                <input type="number" value={v.low_stock_threshold} onChange={(e) => updateVariant(i, { low_stock_threshold: e.target.value })} />
              </div>
              <div className="form-field">
                <span>Discount Type</span>
                <select value={v.discount_type} onChange={(e) => updateVariant(i, { discount_type: e.target.value })}>
                  <option value="">None</option>
                  <option value="percent">Percent</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed</option>
                  <option value="amount">Amount</option>
                </select>
              </div>
              <div className="form-field">
                <span>Discount Value</span>
                <input type="number" step="0.01" value={v.discount_value} onChange={(e) => updateVariant(i, { discount_value: e.target.value })} />
              </div>
              <div className="form-field">
                <span>VAT Rate (%)</span>
                <input type="number" step="0.01" value={v.vat_rate} onChange={(e) => updateVariant(i, { vat_rate: e.target.value })} />
              </div>
            </div>
            <div className="auth-check" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem' }}>
              <label className="auth-check">
                <input type="checkbox" checked={v.track_inventory} onChange={(e) => updateVariant(i, { track_inventory: e.target.checked })} />
                Track inventory
              </label>
              <label className="auth-check">
                <input type="checkbox" checked={v.allow_backorders} onChange={(e) => updateVariant(i, { allow_backorders: e.target.checked })} />
                Allow backorders
              </label>
              <label className="auth-check">
                <input type="checkbox" checked={v.vat_included} onChange={(e) => updateVariant(i, { vat_included: e.target.checked })} />
                VAT included in price
              </label>
              <label className="auth-check">
                <input type="checkbox" checked={v.is_active} onChange={(e) => updateVariant(i, { is_active: e.target.checked })} />
                Active
              </label>
              <label className="auth-check">
                <input type="checkbox" checked={v.is_default} onChange={(e) => updateVariant(i, { is_default: e.target.checked })} />
                Default variant
              </label>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => router.push('/admin/products')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
