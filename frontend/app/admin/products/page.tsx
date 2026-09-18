'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { getAdminProducts, deleteAdminProduct } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { AdminProduct, AdminProductListResponse } from '@/lib/types';
import SuspenseBoundary from '@/components/SuspenseBoundary';

const IMG = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:4001';

function ProductRow({ p, onDelete }: { p: AdminProduct; onDelete: (id: number) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {p.main_image ? (
            <Image
              src={`${IMG}/uploads${p.main_image}`}
              alt=""
              width={40}
              height={40}
              style={{ objectFit: 'cover', borderRadius: 6 }}
            />
          ) : (
            <div style={{ width: 40, height: 40, background: 'var(--bg)', borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>📦</div>
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{p.product_id}</div>
          </div>
        </div>
      </td>
      <td>{p.brand || '—'}</td>
      <td>{p._count?.variants ?? 0}</td>
      <td>
        <span className={`admin-tag ${p.status === 'published' ? 'admin-tag-green' : p.status === 'draft' ? 'admin-tag-gray' : 'admin-tag-red'}`}>
          {p.status}
        </span>
      </td>
      <td>{new Date(p.updated_at).toLocaleDateString()}</td>
      <td>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <Link href={`/admin/products/${p.id}`} className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}>
            Edit
          </Link>
          {confirming ? (
            <>
              <button
                className="btn btn-danger"
                style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}
                onClick={async () => { onDelete(p.id); setConfirming(false); }}
              >
                Confirm
              </button>
              <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem', color: 'var(--danger)' }} onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function AdminProductsInner() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AdminProductListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (q) params.q = q;
    if (status) params.status = status;
    try {
      const res = await getAdminProducts(params);
      setData(res);
      setError('');
    } catch {
      setError('Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, [page, q, status, limit]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    try {
      await deleteAdminProduct(id);
      load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Delete failed.');
    }
  };

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Products</h1>
        <Link href="/admin/products/new" className="btn btn-primary">+ Add Product</Link>
      </div>

      <form className="card" style={{ display: 'flex', gap: '0.75rem', padding: '0.9rem 1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }} onSubmit={applySearch}>
        <input
          style={{ flex: 1, minWidth: 180, border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          placeholder="Search by name, ID, SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="deleted">Deleted</option>
        </select>
        <button className="btn btn-primary">Search</button>
      </form>

      {error && <div className="auth-error">{error}</div>}

      {loading ? (
        <p className="empty-state">Loading products…</p>
      ) : !data || data.products.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No products found.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>Variants</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <ProductRow key={p.id} p={p} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pagination.total_pages > 1 && (
        <div className="pagination">
          <button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span>Page {data.pagination.page} of {data.pagination.total_pages}</span>
          <button className="btn btn-outline" disabled={page >= data.pagination.total_pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

export default function AdminProductsPage() {
  return (
    <SuspenseBoundary>
      <AdminProductsInner />
    </SuspenseBoundary>
  );
}
