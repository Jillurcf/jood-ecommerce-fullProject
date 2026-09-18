'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { createAdminParentCategory, updateAdminParentCategory, createAdminCategory, updateAdminCategory, getAdminCategory, getAdminParentCategory, getAdminParentCategories } from '@/lib/api';
import { ApiError } from '@/lib/api';

export default function CategoryForm({ id: _id }: { id?: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const id = _id ?? (params.id ? Number(params.id) : undefined);
  const kind = (searchParams.get('kind') as 'parent' | 'child') || 'child';
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<{ id: number; name: string }[]>([]);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminParentCategories().then((r) => {
      setParents(Array.isArray(r) ? r.map((p) => ({ id: p.id, name: p.name })) : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit && id) {
      if (kind === 'parent') {
        getAdminParentCategory(id).then((p) => {
          setName(p.name ?? '');
          setSlug(p.slug ?? '');
          setStatus(!!p.status);
          setDisplayOrder(String(p.display_order ?? 0));
          setMetaTitle(p.meta_title || '');
          setMetaDescription(p.meta_description || '');
          setLoading(false);
        }).catch((err) => { setError(err instanceof ApiError ? err.message : 'Load failed.'); setLoading(false); });
      } else {
        getAdminCategory(id).then((c) => {
          setName(c.name ?? '');
          setSlug(c.slug ?? '');
          setStatus(!!c.status);
          setDescription(c.description || '');
          setParentId(c.parent_id ? String(c.parent_id) : '');
          setLoading(false);
        }).catch((err) => { setError(err instanceof ApiError ? err.message : 'Load failed.'); setLoading(false); });
      }
    }
  }, [id, kind, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (kind === 'parent') {
        const payload = {
          name: name.trim(),
          slug: slug.trim() || undefined,
          display_order: parseInt(displayOrder || '0', 10),
          status,
          meta_title: metaTitle || undefined,
          meta_description: metaDescription || undefined,
        };
        if (isEdit && id) await updateAdminParentCategory(id, payload);
        else await createAdminParentCategory(payload);
      } else {
        const payload = {
          name: name.trim(),
          slug: slug.trim() || undefined,
          status,
          description: description || undefined,
          parent_id: parentId ? Number(parentId) : undefined,
        };
        if (isEdit && id) await updateAdminCategory(id, payload);
        else await createAdminCategory(payload);
      }
      router.push('/admin/categories');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="empty-state">Loading…</p>;

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <h1 className="admin-page-title">
        {isEdit ? 'Edit' : 'Add'} {kind === 'parent' ? 'Parent Category' : 'Category'}
      </h1>
      {error && <div className="auth-error">{error}</div>}

      <div className="admin-form__grid">
        <div className="form-field">
          <span>Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-field">
          <span>Slug</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto-generated" />
        </div>

        {kind === 'parent' ? (
          <div className="form-field">
            <span>Display Order</span>
            <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} />
          </div>
        ) : (
          <div className="form-field">
            <span>Parent Category</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— None —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-field">
          <span>Status</span>
          <select value={status ? 'true' : 'false'} onChange={(e) => setStatus(e.target.value === 'true')}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {kind === 'parent' ? (
        <>
          <div className="form-field">
            <span>Meta Title</span>
            <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
          </div>
          <div className="form-field">
            <span>Meta Description</span>
            <textarea rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="form-field">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => router.push('/admin/categories')}>Cancel</button>
      </div>
    </form>
  );
}
