// app/admin/ads/page.tsx
'use client';

/**
 * Admin Ad Management Panel
 *
 * Features:
 *  ① Station Pricing — set per-day price per station (saved to config/stationPricing)
 *  ② Booking Queue   — pending marketplace bookings (approve / reject + auto-refund)
 *  ③ All Active Ads  — running ads across all stations (marketplace + admin-added)
 *  ④ Add Ad Manually — legacy admin flow (no payment, direct to stationAds collection)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, getDoc, setDoc, getDocs, onSnapshot,
  updateDoc, addDoc, serverTimestamp, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { STATIONS, nameToSlug } from '../lib/scheduleEngine';

// ─── helpers ──────────────────────────────────────────────────────────────────

const extractYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([^?&#]+)/,
    /youtube\.com\/watch\?v=([^&#]+)/,
    /youtube\.com\/embed\/([^?&#]+)/,
    /youtube\.com\/shorts\/([^?&#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
};

const formatINR = (amount: number | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount ?? 0);

type BookingStatus = 'pending' | 'approved' | 'rejected' | 'refunded';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200 ring-1 ring-red-200',
  refunded: 'bg-gray-100 text-gray-500 border-gray-200 ring-1 ring-gray-200',
};

const TAB_LABELS = ['Pricing', 'Pending Approvals', 'All Bookings', 'Add Ad'];

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <div className={`w-4 h-4 border-2 rounded-full animate-spin inline-block ${light ? 'border-white border-t-transparent' : 'border-blue-600 border-t-transparent'
      }`} />
  );
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status}
    </span>
  );
}

// ── Tab 1: Station Pricing ────────────────────────────────────────────────────

function PricingTab() {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    getDoc(doc(db, 'config', 'stationPricing'))
      .then(snap => {
        const p = snap.exists() ? (snap.data().prices ?? {}) : {};
        setPrices(p);
        setDraft(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, 'config', 'stationPricing'), { prices: draft, updatedAt: serverTimestamp() });
      setPrices({ ...draft });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const setPrice = (slug: string, val: string) => {
    const n = parseInt(val, 10);
    setDraft(prev => ({ ...prev, [slug]: isNaN(n) || n < 0 ? 0 : n }));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
      <Spinner />
      <span className="text-sm">Loading pricing…</span>
    </div>
  );

  const isDirty = JSON.stringify(draft) !== JSON.stringify(prices);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-500 max-w-lg">
          Set the daily advertising rate (₹/day) for each station. This price is shown to advertisers on the booking page.
        </p>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2 rounded-lg transition-colors shadow-sm shrink-0"
        >
          {saving ? <Spinner light /> : null}
          {saved ? '✓ Saved' : 'Save Pricing'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {STATIONS.map((s: any, i: number) => {
          const slug = nameToSlug(s.name);
          const isTerminus = i === 0 || i === 23;
          return (
            <div key={slug}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isTerminus
                  ? 'border-blue-200 bg-blue-50/60'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-tight truncate ${isTerminus ? 'text-blue-700' : 'text-gray-800'}`}>
                  {s.name}
                </p>
                <p className="text-[10px] font-mono text-gray-400 mt-0.5">{String(i + 1).padStart(2, '0')}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-gray-400 text-sm font-medium">₹</span>
                <input
                  type="number"
                  min="0"
                  value={draft[slug] ?? ''}
                  onChange={e => setPrice(slug, e.target.value)}
                  placeholder="0"
                  className="w-24 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <span className="text-gray-400 text-xs">/day</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab 2: Pending Approvals ──────────────────────────────────────────────────

function PendingTab() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Record<string, string>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(
      collection(db, 'adBookings'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const approve = async (booking: any) => {
    setProcessing(p => ({ ...p, [booking.id]: 'approving' }));
    try {
      await updateDoc(doc(db, 'adBookings', booking.id), {
        status: 'approved',
        adminNote: adminNotes[booking.id] ?? '',
        approvedAt: serverTimestamp(),
      });

      const stationRef = doc(db, 'stationAds', booking.stationSlug);
      const snap = await getDoc(stationRef);
      const existing = snap.exists() ? (snap.data().videos ?? []) : [];
      const newVideo = {
        id: booking.videoId,
        url: booking.youtubeUrl,
        label: booking.label ?? booking.stationName,
        bookingId: booking.id,
        source: 'marketplace',
        startDate: booking.startDate,
        endDate: booking.endDate,
      };
      await setDoc(stationRef, { videos: [...existing, newVideo] }, { merge: true });
    } catch (e: any) {
      alert('Approve failed: ' + e.message);
    } finally {
      setProcessing(p => { const n = { ...p }; delete n[booking.id]; return n; });
    }
  };

  const reject = async (booking: any) => {
    if (!confirm(`Reject this booking and trigger a refund of ${formatINR(booking.totalAmount)}?`)) return;
    setProcessing(p => ({ ...p, [booking.id]: 'rejecting' }));
    try {
      const refundRes = await fetch('/api/razorpay/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: booking.razorpayPaymentId,
          amount: booking.totalAmount * 100,
        }),
      });

      let refundId: string | null = null;
      if (refundRes.ok) {
        const data = await refundRes.json();
        refundId = data.refundId;
      }

      await updateDoc(doc(db, 'adBookings', booking.id), {
        status: 'rejected',
        adminNote: adminNotes[booking.id] ?? '',
        rejectedAt: serverTimestamp(),
        refundId: refundId ?? null,
        refundedAt: refundId ? serverTimestamp() : null,
      });
    } catch (e: any) {
      alert('Reject failed: ' + e.message);
    } finally {
      setProcessing(p => { const n = { ...p }; delete n[booking.id]; return n; });
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
      <Spinner />
      <span className="text-sm">Loading pending bookings…</span>
    </div>
  );

  if (bookings.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-5xl mb-4">✅</div>
        <p className="text-sm font-medium text-gray-600">All caught up!</p>
        <p className="text-xs text-gray-400 mt-1">No pending bookings to review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        <span className="font-semibold text-gray-700">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</span> awaiting review.
        Approving adds the video immediately; rejecting triggers an automatic Razorpay refund.
      </p>
      {bookings.map(b => (
        <div key={b.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3 shadow-sm">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">{b.stationName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{b.advertiserName} · {b.advertiserEmail}</p>
              <p className="text-[10px] font-mono text-gray-400 mt-0.5">{b.id}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-emerald-600 font-bold text-base">{formatINR(b.totalAmount)}</p>
              <p className="text-xs text-gray-500">{b.days} day{b.days !== 1 ? 's' : ''}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{b.startDate} → {b.endDate}</p>
            </div>
          </div>

          {/* Video preview */}
          <a href={`https://youtube.com/watch?v=${b.videoId}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2.5 hover:bg-gray-50 hover:border-gray-300 transition group shadow-sm">
            <img
              src={`https://img.youtube.com/vi/${b.videoId}/mqdefault.jpg`}
              alt="thumbnail"
              className="w-20 h-12 object-cover rounded-lg shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-800 truncate">{b.label ?? 'Ad Video'}</p>
              <p className="text-[10px] text-blue-500 group-hover:text-blue-600 truncate mt-0.5">youtu.be/{b.videoId}</p>
            </div>
            <span className="ml-auto text-gray-300 group-hover:text-gray-500 text-lg transition">▶</span>
          </a>

          {/* Admin note */}
          <textarea
            value={adminNotes[b.id] ?? ''}
            onChange={e => setAdminNotes(prev => ({ ...prev, [b.id]: e.target.value }))}
            placeholder="Admin note (optional, sent to advertiser)…"
            rows={2}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => approve(b)}
              disabled={!!processing[b.id]}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-lg transition-colors shadow-sm"
            >
              {processing[b.id] === 'approving' ? <Spinner light /> : <span>✓</span>}
              Approve
            </button>
            <button
              onClick={() => reject(b)}
              disabled={!!processing[b.id]}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-lg transition-colors shadow-sm"
            >
              {processing[b.id] === 'rejecting' ? <Spinner light /> : <span>✕</span>}
              Reject & Refund
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab 3: All Bookings ───────────────────────────────────────────────────────

function AllBookingsTab() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'adBookings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  const stats = {
    total: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    approved: bookings.filter(b => b.status === 'approved').length,
    rejected: bookings.filter(b => b.status === 'rejected').length,
    revenue: bookings.filter(b => b.status === 'approved').reduce((s, b) => s + (b.totalAmount ?? 0), 0),
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
      <Spinner />
      <span className="text-sm">Loading bookings…</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-800', bg: 'bg-white' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Approved', value: stats.approved, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Revenue', value: formatINR(stats.revenue), color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-gray-200 rounded-xl p-3.5 text-center shadow-sm`}>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {['all', 'pending', 'approved', 'rejected', 'refunded'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${filter === f
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
              }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Bookings list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-10">No bookings for this filter.</p>
        )}
        {filtered.map(b => (
          <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
            <img
              src={`https://img.youtube.com/vi/${b.videoId}/mqdefault.jpg`}
              alt=""
              className="w-16 h-10 object-cover rounded-lg shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900">{b.stationName}</p>
                <Badge status={b.status} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{b.advertiserName} · {b.advertiserEmail}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{b.startDate} → {b.endDate} · {b.days}d</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-emerald-600">{formatINR(b.totalAmount)}</p>
              {b.razorpayPaymentId && (
                <p className="text-[10px] font-mono text-gray-400 mt-0.5 max-w-[100px] truncate">{b.razorpayPaymentId}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab 4: Add Ad Manually (legacy admin flow) ────────────────────────────────

function AddAdTab() {
  const [selectedSlug, setSelectedSlug] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [stationVideos, setStationVideos] = useState<any[]>([]);

  useEffect(() => {
    if (!db || !selectedSlug) { setStationVideos([]); return; }
    const unsub = onSnapshot(doc(db, 'stationAds', selectedSlug), snap => {
      setStationVideos(snap.exists() ? (snap.data().videos ?? []) : []);
    });
    return () => unsub();
  }, [selectedSlug]);

  const videoId = extractYouTubeId(ytUrl);

  const handleAdd = async () => {
    if (!selectedSlug) return setError('Select a station.');
    if (!videoId) return setError('Invalid YouTube URL.');
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const stationRef = doc(db, 'stationAds', selectedSlug);
      const snap = await getDoc(stationRef);
      const existing = snap.exists() ? (snap.data().videos ?? []) : [];
      const newVideo = {
        id: videoId,
        url: ytUrl,
        label: label.trim() || selectedSlug,
        source: 'admin',
        addedAt: new Date().toISOString(),
      };
      await setDoc(stationRef, { videos: [...existing, newVideo] }, { merge: true });
      setYtUrl('');
      setLabel('');
      setSuccess('Ad added successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError('Failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (videoIdx: number) => {
    if (!confirm('Remove this ad?')) return;
    try {
      const stationRef = doc(db, 'stationAds', selectedSlug);
      const snap = await getDoc(stationRef);
      const videos = snap.exists() ? [...(snap.data().videos ?? [])] : [];
      videos.splice(videoIdx, 1);
      await setDoc(stationRef, { videos }, { merge: true });
    } catch (e: any) {
      alert('Remove failed: ' + e.message);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Add ads directly to a station without payment — for internal or promotional use.
        These bypass the approval flow and go live immediately.
      </p>

      {/* Station picker */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Station</label>
        <select
          value={selectedSlug}
          onChange={e => setSelectedSlug(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
        >
          <option value="">— choose a station —</option>
          {STATIONS.map((s: any, i: number) => (
            <option key={i} value={nameToSlug(s.name)}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Current videos */}
      {selectedSlug && stationVideos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Current Ads — {STATIONS.find((s: any) => nameToSlug(s.name) === selectedSlug)?.name}
          </p>
          {stationVideos.map((v: any, i: number) => (
            <div key={i} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2.5 shadow-sm">
              <img src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`} alt="" className="w-14 h-9 object-cover rounded-lg shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{v.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v.source === 'admin'
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-blue-50 text-blue-600'
                    }`}>
                    {v.source === 'admin' ? 'Admin' : 'Marketplace'}
                  </span>
                  {v.endDate && <span className="text-[10px] text-gray-400">until {v.endDate}</span>}
                </div>
              </div>
              <button
                onClick={() => handleRemove(i)}
                className="shrink-0 text-red-500 hover:text-red-600 text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-red-50 transition"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new video */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Add New Video</p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">YouTube URL</label>
          <input
            type="url" value={ytUrl} onChange={e => setYtUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
          {ytUrl && !videoId && <p className="text-xs text-red-500 mt-1">⚠ Invalid YouTube URL</p>}
          {videoId && <p className="text-xs text-emerald-600 mt-1">✓ Video ID: {videoId}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Label</label>
          <input
            type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Kochi Tourism Promo"
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        {error && <p className="text-xs text-red-500">⚠ {error}</p>}
        {success && <p className="text-xs text-emerald-600">✓ {success}</p>}

        <button
          onClick={handleAdd}
          disabled={saving || !videoId || !selectedSlug}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-colors shadow-sm"
        >
          {saving ? <Spinner light /> : null}
          {saving ? 'Adding…' : '+ Add Ad Now'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Admin Ads Page ──────────────────────────────────────────────────────

export default function AdminAdsPage() {
  const [tab, setTab] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'adBookings'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, snap => setPendingCount(snap.size));
    return () => unsub();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span>📢</span> Ad Management
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Station advertising — pricing, approvals, and content</p>
          </div>
          <a
            href="/scheduling"
            className="text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Scheduling
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto shadow-sm">
          {TAB_LABELS.map((tabLabel, i) => (
            <button
              key={i}
              onClick={() => setTab(i)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === i
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
            >
              {tabLabel}
              {i === 1 && pendingCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          {tab === 0 && <PricingTab />}
          {tab === 1 && <PendingTab />}
          {tab === 2 && <AllBookingsTab />}
          {tab === 3 && <AddAdTab />}
        </div>

      </main>
    </div>
  );
}