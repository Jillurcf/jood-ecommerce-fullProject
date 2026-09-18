'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getAdminParentCategories, getAdminCategories, deleteAdminParentCategory, deleteAdminCategory } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { AdminParentCategory, AdminCategory } from '@/lib/types';

const IMG = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:4001';

function CategoryRow({ c, onDelete }: { c: AdminCategory; onDelete: (id: number) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {c.image ? (
            <Image src={`${IMG}/uploads${c.image}`} alt="" width={36} height={36} style={{ objectFit: 'cover', borderRadius: 6 }} />
          ) : (
            <div style={{ width: 36, height: 36, background: 'var(--bg)', borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>🏷</div>
          )}
          <span style={{ fontWeight: 600 }}>{c.name}</span>
        </div>
      </td>
      <td>{c.parent_id ?? '—'}</td>
      <td>
        <span className={`admin-tag ${c.status ? 'admin-tag-green' : 'admin-tag-gray'}`}>
          {c.status ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <Link href={`/admin/categories/${c.id}`} className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}>Edit</Link>
          {confirming ? (
            <>
              <button className="btn btn-danger" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={async () => { onDelete(c.id); setConfirming(false); }}>Confirm</button>
              <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={() => setConfirming(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem', color: 'var(--danger)' }} onClick={() => setConfirming(true)}>Delete</button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ParentRow({ pc, childCount, onDelete }: { pc: AdminParentCategory; childCount: number; onDelete: (id: number) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {pc.image ? (
            <Image src={`${IMG}/uploads${pc.image}`} alt="" width={36} height={36} style={{ objectFit: 'cover', borderRadius: 6 }} />
          ) : (
            <div style={{ width: 36, height: 36, background: 'var(--bg)', borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>🗂</div>
          )}
          <span style={{ fontWeight: 600 }}>{pc.name}</span>
        </div>
      </td>
      <td style={{ color: 'var(--muted)' }}>{pc.slug}</td>
      <td>{pc.display_order}</td>
      <td>{childCount}</td>
      <td>
        <span className={`admin-tag ${pc.status ? 'admin-tag-green' : 'admin-tag-gray'}`}>
          {pc.status ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <Link href={`/admin/categories/${pc.id}?kind=parent`} className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}>Edit</Link>
          {confirming ? (
            <>
              <button className="btn btn-danger" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={async () => { onDelete(pc.id); setConfirming(false); }}>Confirm</button>
              <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={() => setConfirming(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem', color: 'var(--danger)' }} onClick={() => setConfirming(true)}>Delete</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminCategoriesPage() {
  const [parents, setParents] = useState<AdminParentCategory[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [selectedParent, setSelectedParent] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        getAdminParentCategories().then((r) => (Array.isArray(r) ? r : [])),
        getAdminCategories().then((r) => (r.categories ?? [])),
      ]);
      setParents(p);
      setCategories(c);
      if (!selectedParent && p.length) setSelectedParent(String(p[0].id));
    } catch {
      setError('Failed to load categories.');
    }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const visibleCategories = selectedParent
    ? categories.filter((c) => String(c.parent_id) === selectedParent)
    : categories;

  const handleDeleteParent = async (id: number) => {
    try { await deleteAdminParentCategory(id); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Delete failed.'); }
  };

  const handleDeleteCategory = async (id: number) => {
    try { await deleteAdminCategory(id); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Delete failed.'); }
  };

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Categories</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/admin/categories/new?kind=child" className="btn btn-outline">+ Category</Link>
          <Link href="/admin/categories/new?kind=parent" className="btn btn-primary">+ Parent Category</Link>
        </div>
      </div>
      {error && <div className="auth-error">{error}</div>}

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Parent Categories</h2>
        {parents.length === 0 ? (
          <p className="empty-state">No parent categories.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Parent</th>
                  <th>Slug</th>
                  <th>Order</th>
                  <th>Categories</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {parents.map((pc) => (
                  <ParentRow
                    key={pc.id}
                    pc={pc}
                    childCount={categories.filter((c) => String(c.parent_id) === String(pc.id)).length}
                    onDelete={handleDeleteParent}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.1rem' }}>Categories</h2>
          <select
            style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.4rem 0.7rem' }}
            value={selectedParent}
            onChange={(e) => setSelectedParent(e.target.value)}
          >
            <option value="">All parents</option>
            {parents.map((pc) => (
              <option key={pc.id} value={pc.id}>{pc.name}</option>
            ))}
          </select>
        </div>
        {visibleCategories.length === 0 ? (
          <p className="empty-state">No categories found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Parent ID</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCategories.map((c) => (
                  <CategoryRow key={c.id} c={c} onDelete={handleDeleteCategory} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
