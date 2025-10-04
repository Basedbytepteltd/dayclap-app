import React, { useEffect, useState, useCallback } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';

const boxStyle = {
  border: '1px solid var(--border-color)',
  background: 'var(--secondary-bg)',
  borderRadius: '0.5rem',
  padding: '0.75rem 1rem',
  margin: '0 0 1rem 0',
};

const rowStyle = { display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' };
const pill = (ok) => ({
  display: 'inline-block',
  padding: '.125rem .5rem',
  borderRadius: '.375rem',
  fontSize: '.75rem',
  fontWeight: 600,
  background: ok ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
  color: ok ? '#059669' : '#dc2626',
  border: `1px solid ${ok ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)'}`,
});

export default function DiagnosticsBanner({ user, backendUrl }) {
  const [loading, setLoading] = useState(true);
  const [statusCode, setStatusCode] = useState(null);
  const [data, setData] = useState(null);
  const [errText, setErrText] = useState('');

  const fetchDiag = useCallback(async () => {
    if (!backendUrl || !user?.email) return;
    setLoading(true);
    setErrText('');
    setStatusCode(null);
    setData(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'X-User-Email': user.email,
        'Content-Type': 'application/json'
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`${backendUrl}/api/admin/diagnostics`, { headers });
      setStatusCode(res.status);
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        setErrText(t || res.statusText);
        return;
      }
      const j = await res.json();
      setData(j);
    } catch (e) {
      setErrText(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, user?.email]);

  useEffect(() => {
    fetchDiag();
  }, [fetchDiag]);

  // Only show the banner if loading, error, or potential misconfig is detected.
  const forbidden = statusCode === 403;
  const show = loading || forbidden || errText || (data && !data?.origin_allowed);

  if (!show) return null;

  return (
    <div style={boxStyle}>
      <div style={rowStyle}>
        <Info size={16} />
        <strong>Admin Diagnostics</strong>
        <button
          onClick={fetchDiag}
          className="btn btn-outline btn-small"
          style={{ marginLeft: 'auto' }}
          title="Retry diagnostics"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>

      {loading && <p style={{ margin: '.5rem 0' }}>Checking admin access...</p>}

      {!loading && forbidden && (
        <div style={{ marginTop: '.5rem' }}>
          <p style={{ margin: 0 }}>
            Access denied. Your email <strong>{user?.email}</strong> is not recognized as an admin by the backend.
          </p>
          <p style={{ margin: '.25rem 0 0 0', fontSize: '.9rem', color: 'var(--secondary-text)' }}>
            Fix: Add your email to backend ADMIN_EMAILS and redeploy. Also ensure frontend VITE_ADMIN_EMAILS includes it.
          </p>
        </div>
      )}

      {!loading && !!errText && !forbidden && (
        <p style={{ marginTop: '.5rem', color: '#dc2626' }}>{errText}</p>
      )}

      {!loading && data && (
        <div style={{ marginTop: '.5rem' }}>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <span style={pill(!!data?.origin_allowed)}>
              Origin {data?.origin_allowed ? 'Allowed' : 'Blocked'}
            </span>
            <span style={pill(!!data?.scheduler?.running)}>
              Scheduler {data?.scheduler?.running ? 'Running' : 'Stopped'}
            </span>
            <span style={pill((data?.admin_emails_count ?? 0) > 0)}>
              Admins: {data?.admin_emails_count ?? 0}
            </span>
          </div>
          {!!data?.scheduler?.job_scheduled && data?.scheduler?.next_run_time && (
            <p style={{ margin: '.5rem 0 0 0', fontSize: '.9rem' }}>
              Next reminder run: {new Date(data.scheduler.next_run_time).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
