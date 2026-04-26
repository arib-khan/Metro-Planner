// app/admin/ads/page.jsx
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
import { db } from '../../firebase/config';
import { STATIONS, nameToSlug } from '../../lib/scheduleEngine';

// ─── helpers ──────────────────────────────────────────────────────────────────

const extractYouTubeId = (url) => {
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

const formatINR = (amount) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount ?? 0);

const STATUS_STYLES = {
    pending: 'bg-amber-900/40 text-amber-300 border-amber-700',
    approved: 'bg-emerald-900/40 text-emerald-300 border-emerald-700',
    rejected: 'bg-red-900/40 text-red-300 border-red-700',
    refunded: 'bg-gray-800 text-gray-400 border-gray-700',
};

const TAB_LABELS = ['Pricing', 'Pending Approvals', 'All Bookings', 'Add Ad'];

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Spinner() {
    return <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />;
}

function Badge({ status }) {
    return (
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
            {status}
        </span>
    );
}

// ── Tab 1: Station Pricing ────────────────────────────────────────────────────

function PricingTab() {
    const [prices, setPrices] = useState({});
    const [draft, setDraft] = useState({});
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
        } catch (e) {
            alert('Save failed: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const setPrice = (slug, val) => {
        const n = parseInt(val, 10);
        setDraft(prev => ({ ...prev, [slug]: isNaN(n) || n < 0 ? 0 : n }));
    };

    if (loading) return <div className="text-center py-12 text-gray-500 text-sm">Loading pricing…</div>;

    const isDirty = JSON.stringify(draft) !== JSON.stringify(prices);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Set the daily advertising rate (₹/day) for each station. This price is shown to advertisers on the booking page.</p>
                <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2 rounded-lg transition"
                >
                    {saving ? <Spinner /> : null}
                    {saved ? '✓ Saved' : 'Save Pricing'}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STATIONS.map((s, i) => {
                    const slug = nameToSlug(s.name);
                    const isTerminus = i === 0 || i === 23;
                    return (
                        <div key={slug}
                            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isTerminus ? 'border-blue-800 bg-blue-950/20' : 'border-gray-800 bg-gray-900'}`}>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium leading-tight truncate ${isTerminus ? 'text-blue-300' : 'text-white'}`}>
                                    {s.name}
                                </p>
                                <p className="text-[10px] font-mono text-gray-600">{String(i + 1).padStart(2, '0')}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="text-gray-500 text-sm">₹</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={draft[slug] ?? ''}
                                    onChange={e => setPrice(slug, e.target.value)}
                                    placeholder="0"
                                    className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-right text-white focus:outline-none focus:border-blue-500"
                                />
                                <span className="text-gray-600 text-xs">/day</span>
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
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState({}); // bookingId → 'approving'|'rejecting'
    const [adminNotes, setAdminNotes] = useState({});  // bookingId → string

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

    const approve = async (booking) => {
        setProcessing(p => ({ ...p, [booking.id]: 'approving' }));
        try {
            // 1. Mark booking as approved
            await updateDoc(doc(db, 'adBookings', booking.id), {
                status: 'approved',
                adminNote: adminNotes[booking.id] ?? '',
                approvedAt: serverTimestamp(),
            });

            // 2. Add video to station's stationAds collection
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
        } catch (e) {
            alert('Approve failed: ' + e.message);
        } finally {
            setProcessing(p => { const n = { ...p }; delete n[booking.id]; return n; });
        }
    };

    const reject = async (booking) => {
        if (!confirm(`Reject this booking and trigger a refund of ${formatINR(booking.totalAmount)}?`)) return;
        setProcessing(p => ({ ...p, [booking.id]: 'rejecting' }));
        try {
            // 1. Trigger refund via your API route
            const refundRes = await fetch('/api/razorpay/refund', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentId: booking.razorpayPaymentId,
                    amount: booking.totalAmount * 100, // paise
                }),
            });

            let refundId = null;
            if (refundRes.ok) {
                const data = await refundRes.json();
                refundId = data.refundId;
            }
            // Note: even if refund API fails, mark as rejected — admin must manually refund

            await updateDoc(doc(db, 'adBookings', booking.id), {
                status: 'rejected',
                adminNote: adminNotes[booking.id] ?? '',
                rejectedAt: serverTimestamp(),
                refundId: refundId ?? null,
                refundedAt: refundId ? serverTimestamp() : null,
            });
        } catch (e) {
            alert('Reject failed: ' + e.message);
        } finally {
            setProcessing(p => { const n = { ...p }; delete n[booking.id]; return n; });
        }
    };

    if (loading) return <div className="text-center py-12 text-gray-500 text-sm">Loading pending bookings…</div>;
    if (bookings.length === 0) {
        return (
            <div className="text-center py-16 text-gray-600">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-sm">No pending bookings. All caught up!</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-xs text-gray-500">{bookings.length} booking{bookings.length !== 1 ? 's' : ''} awaiting review. Approving adds the video immediately; rejecting triggers an automatic Razorpay refund.</p>
            {bookings.map(b => (
                <div key={b.id} className="rounded-2xl border border-amber-800 bg-amber-950/20 p-4 space-y-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-bold">{b.stationName}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{b.advertiserName} · {b.advertiserEmail}</p>
                            <p className="text-[10px] font-mono text-gray-600 mt-0.5">{b.id}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-emerald-400 font-bold">{formatINR(b.totalAmount)}</p>
                            <p className="text-xs text-gray-500">{b.days} day{b.days !== 1 ? 's' : ''}</p>
                            <p className="text-[10px] text-gray-600">{b.startDate} → {b.endDate}</p>
                        </div>
                    </div>

                    {/* Video preview */}
                    <a href={`https://youtube.com/watch?v=${b.videoId}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-2.5 hover:bg-gray-800 transition group">
                        <img
                            src={`https://img.youtube.com/vi/${b.videoId}/mqdefault.jpg`}
                            alt="thumbnail"
                            className="w-20 h-12 object-cover rounded-lg shrink-0"
                        />
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate">{b.label ?? 'Ad Video'}</p>
                            <p className="text-[10px] text-blue-400 group-hover:text-blue-300 truncate">youtu.be/{b.videoId}</p>
                        </div>
                        <span className="ml-auto text-gray-600 group-hover:text-gray-400 text-lg">▶</span>
                    </a>

                    {/* Admin note */}
                    <textarea
                        value={adminNotes[b.id] ?? ''}
                        onChange={e => setAdminNotes(prev => ({ ...prev, [b.id]: e.target.value }))}
                        placeholder="Admin note (optional, sent to advertiser)…"
                        rows={2}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500"
                    />

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => approve(b)}
                            disabled={!!processing[b.id]}
                            className="flex-1 flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs py-2 rounded-lg transition"
                        >
                            {processing[b.id] === 'approving' ? <Spinner /> : '✓'} Approve
                        </button>
                        <button
                            onClick={() => reject(b)}
                            disabled={!!processing[b.id]}
                            className="flex-1 flex items-center justify-center gap-2 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs py-2 rounded-lg transition"
                        >
                            {processing[b.id] === 'rejecting' ? <Spinner /> : '✕'} Reject & Refund
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Tab 3: All Bookings ───────────────────────────────────────────────────────

function AllBookingsTab() {
    const [bookings, setBookings] = useState([]);
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

    if (loading) return <div className="text-center py-12 text-gray-500 text-sm">Loading bookings…</div>;

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                    { label: 'Total', value: stats.total, color: 'text-white' },
                    { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
                    { label: 'Approved', value: stats.approved, color: 'text-emerald-400' },
                    { label: 'Revenue', value: formatINR(stats.revenue), color: 'text-blue-400' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                        <p className={`text-lg font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className="flex gap-1.5 flex-wrap">
                {['all', 'pending', 'approved', 'rejected', 'refunded'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition
              ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-900 border border-gray-700 text-gray-400 hover:text-white'}`}>
                        {f}
                    </button>
                ))}
            </div>

            {/* Bookings list */}
            <div className="space-y-2">
                {filtered.length === 0 && (
                    <p className="text-center text-gray-600 text-sm py-8">No bookings for this filter.</p>
                )}
                {filtered.map(b => (
                    <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-start gap-3">
                        <img
                            src={`https://img.youtube.com/vi/${b.videoId}/mqdefault.jpg`}
                            alt=""
                            className="w-16 h-10 object-cover rounded-lg shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold">{b.stationName}</p>
                                <Badge status={b.status} />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{b.advertiserName} · {b.advertiserEmail}</p>
                            <p className="text-[10px] text-gray-600 mt-0.5">{b.startDate} → {b.endDate} · {b.days}d</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-emerald-400">{formatINR(b.totalAmount)}</p>
                            {b.razorpayPaymentId && (
                                <p className="text-[10px] font-mono text-gray-600 mt-0.5 max-w-[100px] truncate">{b.razorpayPaymentId}</p>
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

    // Current ads for selected station
    const [stationVideos, setStationVideos] = useState([]);

    useEffect(() => {
        if (!db || !selectedSlug) return;
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
        } catch (e) {
            setError('Failed: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (videoIdx) => {
        if (!confirm('Remove this ad?')) return;
        try {
            const stationRef = doc(db, 'stationAds', selectedSlug);
            const snap = await getDoc(stationRef);
            const videos = snap.exists() ? (snap.data().videos ?? []) : [];
            videos.splice(videoIdx, 1);
            await setDoc(stationRef, { videos }, { merge: true });
        } catch (e) {
            alert('Remove failed: ' + e.message);
        }
    };

    return (
        <div className="space-y-5">
            <p className="text-xs text-gray-500">Add ads directly to a station without payment — for internal/promotional use. These bypass the approval flow and go live immediately.</p>

            {/* Station picker */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Station</label>
                <select
                    value={selectedSlug}
                    onChange={e => setSelectedSlug(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                    <option value="">— choose a station —</option>
                    {STATIONS.map((s, i) => (
                        <option key={i} value={nameToSlug(s.name)}>{s.name}</option>
                    ))}
                </select>
            </div>

            {/* Current videos */}
            {selectedSlug && stationVideos.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-400">Current Ads on {STATIONS.find(s => nameToSlug(s.name) === selectedSlug)?.name}</p>
                    {stationVideos.map((v, i) => (
                        <div key={i} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-2.5">
                            <img src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`} alt="" className="w-14 h-9 object-cover rounded-lg shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white truncate">{v.label}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${v.source === 'admin' ? 'bg-gray-700 text-gray-400' : 'bg-blue-900/50 text-blue-400'}`}>
                                        {v.source === 'admin' ? 'Admin' : 'Marketplace'}
                                    </span>
                                    {v.endDate && <span className="text-[10px] text-gray-600">until {v.endDate}</span>}
                                </div>
                            </div>
                            <button onClick={() => handleRemove(i)}
                                className="shrink-0 text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1 rounded-lg hover:bg-red-950/40 transition">
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add new video */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Add New Video</p>
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">YouTube URL</label>
                    <input
                        type="url" value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                    {ytUrl && !videoId && <p className="text-xs text-red-400">⚠ Invalid URL</p>}
                    {videoId && <p className="text-xs text-emerald-400">✓ Video ID: {videoId}</p>}
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">Label</label>
                    <input
                        type="text" value={label} onChange={e => setLabel(e.target.value)}
                        placeholder="e.g. Kochi Tourism Promo"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                </div>

                {error && <p className="text-xs text-red-400">⚠ {error}</p>}
                {success && <p className="text-xs text-emerald-400">✓ {success}</p>}

                <button
                    onClick={handleAdd}
                    disabled={saving || !videoId || !selectedSlug}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm py-2 rounded-lg transition"
                >
                    {saving ? <Spinner /> : null}
                    {saving ? 'Adding…' : '+ Add Ad Now'}
                </button>
            </div>
        </div>
    );
}

// ─── Main Admin Ads Page ──────────────────────────────────────────────────────

export default function AdminAdsPage() {
    const [tab, setTab] = useState(0);

    // Live pending count for badge
    const [pendingCount, setPendingCount] = useState(0);
    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'adBookings'), where('status', '==', 'pending'));
        const unsub = onSnapshot(q, snap => setPendingCount(snap.size));
        return () => unsub();
    }, []);

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-bold">📢 Ad Management</h1>
                        <p className="text-xs text-gray-500 mt-0.5">Station advertising — pricing, approvals, and content</p>
                    </div>
                    <a href="/scheduling" className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg transition">
                        ← Scheduling
                    </a>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

                {/* Tabs */}
                <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 overflow-x-auto">
                    {TAB_LABELS.map((label, i) => (
                        <button
                            key={i}
                            onClick={() => setTab(i)}
                            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition
                ${tab === i ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            {label}
                            {i === 1 && pendingCount > 0 && (
                                <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {pendingCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                {tab === 0 && <PricingTab />}
                {tab === 1 && <PendingTab />}
                {tab === 2 && <AllBookingsTab />}
                {tab === 3 && <AddAdTab />}

            </main>
        </div>
    );
}