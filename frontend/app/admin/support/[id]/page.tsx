'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getAdminSupportDetail, updateAdminSupportStatus } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { AdminSupportDetail } from '@/lib/types';

export default function AdminSupportDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [item, setItem] = useState<AdminSupportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminSupportDetail(id);
      setItem(res);
      setError('');
    } catch {
      setError('Failed to load request.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status: string) => {
    if (!item) return;
    setSaving(true);
    try {
      await updateAdminSupportStatus(item.id, status);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error) return <p className="empty-state">{error}</p>;
  if (!item) return null;

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">{item.subject || 'No subject'}</h1>
        <Link href="/admin/support" className="btn btn-outline">← Back to Inbox</Link>
      </div>

      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="admin-tag">{item.type}</span>
          <span className="admin-tag admin-tag-amber">{item.status || '—'}</span>
          {item.priority && <span className="admin-tag admin-tag-red">{item.priority}</span>}
        </div>

        <div className="detail-row"><span>From</span><strong>{item.name}</strong></div>
        <div className="detail-row"><span>Email</span><strong>{item.email}</strong></div>
        {item.phone && <div className="detail-row"><span>Phone</span><strong>{item.phone}</strong></div>}
        {item.order_number && <div className="detail-row"><span>Order</span><strong>{item.order_number}</strong></div>}
        {item.category && <div className="detail-row"><span>Category</span><strong>{item.category}</strong></div>}
        <div className="detail-row"><span>Date</span><strong>{new Date(item.created_at).toLocaleString()}</strong></div>

        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Message</h3>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '1rem', whiteSpace: 'pre-wrap', fontSize: '0.92rem' }}>
            {item.message}
          </div>
        </div>

        {item.type === 'support' && (
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Set status:</span>
            <button className="btn btn-outline" disabled={saving || item.status === 'open'} onClick={() => updateStatus('open')}>Open</button>
            <button className="btn btn-outline" disabled={saving || item.status === 'in_progress'} onClick={() => updateStatus('in_progress')}>In Progress</button>
            <button className="btn btn-outline" disabled={saving || item.status === 'closed'} onClick={() => updateStatus('closed')}>Closed</button>
          </div>
        )}
      </div>
    </div>
  );
}
