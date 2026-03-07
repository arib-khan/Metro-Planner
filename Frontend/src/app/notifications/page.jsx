// src/app/notifications/page.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, waitForAuthReady } from '../firebase/config';
import {
    checkCertAlerts, checkBrandingAlerts,
} from '../utils/trainDataService';
import {
    Bell, AlertTriangle, ShieldAlert, Clock, Train,
    CheckCircle2, X, RefreshCw, ChevronRight, Filter,
    ShieldCheck, Zap, Wrench
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0];

const timeAgo = (dateStr) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date() - new Date(dateStr + 'T00:00:00')) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return '1 day ago';
    if (diff > 0) return `${diff} days ago`;
    return null;
};

const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000);
};

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORIES = {
    cert_expired: { label: 'Certificate Expired', color: 'red', icon: ShieldAlert },
    cert_warning: { label: 'Certificate Expiring', color: 'amber', icon: ShieldCheck },
    branding_expired: { label: 'Branding Expired', color: 'red', icon: Zap },
    branding_warning: { label: 'Branding Expiring', color: 'amber', icon: Zap },
};

const COLOR = {
    red: { bg: 'bg-red-50', border: 'border-red-200', icon: 'bg-red-100 text-red-600', badge: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', text: 'text-red-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'bg-amber-100 text-amber-600', badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', text: 'text-amber-700' },
};

// ── Build notification objects from raw alerts ────────────────────────────────
const buildNotifications = (masterData) => {
    const today = todayStr();
    const items = [];

    Object.entries(masterData).forEach(([trainId, master]) => {
        if (!master) return;

        // Certificate alerts
        if (master.fitness_certificates) {
            checkCertAlerts(master.fitness_certificates, today, trainId).forEach(a => {
                const expired = a.type === 'expired';
                items.push({
                    id: `cert-${trainId}-${a.field}`,
                    trainId,
                    category: expired ? 'cert_expired' : 'cert_warning',
                    title: `${trainId} — ${a.field} certificate`,
                    detail: expired
                        ? `EXPIRED on ${a.expiryDate} (${timeAgo(a.expiryDate)})`
                        : `Expires on ${a.expiryDate} (in ${daysUntil(a.expiryDate)} day${daysUntil(a.expiryDate) !== 1 ? 's' : ''})`,
                    expiryDate: a.expiryDate,
                    daysLeft: daysUntil(a.expiryDate),
                    type: expired ? 'expired' : 'warning',
                    field: a.field,
                });
            });
        }

        // Branding alerts
        if (master.branding_priorities?.length) {
            checkBrandingAlerts(master.branding_priorities, today, trainId).forEach(a => {
                const expired = a.type === 'expired';
                items.push({
                    id: `branding-${trainId}-${a.field}`,
                    trainId,
                    category: expired ? 'branding_expired' : 'branding_warning',
                    title: `${trainId} — ${a.field}`,
                    detail: expired
                        ? `EXPIRED on ${a.expiryDate}`
                        : `Expires in ${daysUntil(a.expiryDate)} day${daysUntil(a.expiryDate) !== 1 ? 's' : ''}`,
                    expiryDate: a.expiryDate,
                    daysLeft: daysUntil(a.expiryDate),
                    type: expired ? 'expired' : 'warning',
                    field: a.field,
                });
            });
        }
    });

    // Sort: expired first, then by days remaining ascending
    return items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'expired' ? -1 : 1;
        return (a.daysLeft ?? 0) - (b.daysLeft ?? 0);
    });
};

// ── Notification row ──────────────────────────────────────────────────────────
const NotifRow = ({ notif, dismissed, onDismiss }) => {
    const cat = CATEGORIES[notif.category];
    const col = COLOR[cat.color];
    const Icon = cat.icon;

    if (dismissed) return null;

    return (
        <div className={`flex items-start gap-4 px-5 py-4 border-b border-gray-50 hover:bg-gray-50/60 transition group`}>
            {/* Icon */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${col.icon}`}>
                <Icon className="w-4 h-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-snug">{notif.title}</p>
                        <p className={`text-xs mt-0.5 font-medium ${col.text}`}>{notif.detail}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${col.badge}`}>
                            {notif.type === 'expired' ? 'Expired' : `${notif.daysLeft}d left`}
                        </span>
                        <button onClick={() => onDismiss(notif.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 transition p-0.5 rounded">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                        <Train className="w-3 h-3" /> {notif.trainId}
                    </span>
                    <span className="w-1 h-1 bg-gray-300 rounded-full" />
                    <span className="text-[11px] text-gray-400">{cat.label}</span>
                </div>
            </div>
        </div>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
    const [authReady, setAuthReady] = useState(false);
    const [masterData, setMasterData] = useState({});
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState(new Set());
    const [filterType, setFilterType] = useState('all'); // 'all' | 'expired' | 'warning'
    const [filterCategory, setFilterCategory] = useState('all'); // 'all' | 'cert' | 'branding'
    const [search, setSearch] = useState('');

    // Auth gate
    useEffect(() => {
        waitForAuthReady().then(() => setAuthReady(true));
    }, []);

    // Subscribe to master data
    useEffect(() => {
        if (!authReady || !db) return;
        const unsub = onSnapshot(
            collection(db, 'trainMasterData'),
            snap => {
                const map = {};
                snap.forEach(d => { map[d.id] = d.data(); });
                setMasterData(map);
                setLoading(false);
            },
            err => { console.error(err); setLoading(false); }
        );
        return () => unsub();
    }, [authReady]);

    const notifications = useMemo(() => buildNotifications(masterData), [masterData]);

    const filtered = useMemo(() => notifications.filter(n => {
        if (dismissed.has(n.id)) return false;
        if (filterType !== 'all' && n.type !== filterType) return false;
        if (filterCategory === 'cert' && !n.category.startsWith('cert')) return false;
        if (filterCategory === 'branding' && !n.category.startsWith('branding')) return false;
        if (search && !n.trainId.toLowerCase().includes(search.toLowerCase()) &&
            !n.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    }), [notifications, dismissed, filterType, filterCategory, search]);

    const expiredCount = filtered.filter(n => n.type === 'expired').length;
    const warningCount = filtered.filter(n => n.type === 'warning').length;
    const certCount = filtered.filter(n => n.category.startsWith('cert')).length;
    const brandingCount = filtered.filter(n => n.category.startsWith('branding')).length;

    const dismissAll = () => setDismissed(new Set(notifications.map(n => n.id)));
    const dismiss = (id) => setDismissed(prev => new Set([...prev, id]));
    const clearDismissed = () => setDismissed(new Set());

    if (!authReady || loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-slate-800 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400">Loading notifications…</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">

            {/* ── Header ── */}
            <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="w-10 h-10 bg-gray-900 rounded-2xl flex items-center justify-center">
                                    <Bell className="w-5 h-5 text-white" />
                                </div>
                                {filtered.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                                        {filtered.length > 9 ? '9+' : filtered.length}
                                    </span>
                                )}
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900 leading-tight">Notifications</h1>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {filtered.length === 0
                                        ? 'All clear — no active alerts'
                                        : `${filtered.length} active alert${filtered.length > 1 ? 's' : ''} · Fleet-wide`
                                    }
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {dismissed.size > 0 && (
                                <button onClick={clearDismissed}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-2 rounded-xl hover:bg-blue-50 transition">
                                    <RefreshCw className="w-3.5 h-3.5" /> Restore {dismissed.size}
                                </button>
                            )}
                            {filtered.length > 0 && (
                                <button onClick={dismissAll}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-xl transition">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Dismiss All
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

                {/* ── Summary cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: 'Expired', value: expiredCount, icon: AlertTriangle, bg: 'bg-red-600', active: filterType === 'expired', onClick: () => setFilterType(f => f === 'expired' ? 'all' : 'expired') },
                        { label: 'Expiring Soon', value: warningCount, icon: Clock, bg: 'bg-amber-500', active: filterType === 'warning', onClick: () => setFilterType(f => f === 'warning' ? 'all' : 'warning') },
                        { label: 'Certificates', value: certCount, icon: ShieldAlert, bg: 'bg-slate-700', active: filterCategory === 'cert', onClick: () => setFilterCategory(f => f === 'cert' ? 'all' : 'cert') },
                        { label: 'Branding', value: brandingCount, icon: Zap, bg: 'bg-violet-600', active: filterCategory === 'branding', onClick: () => setFilterCategory(f => f === 'branding' ? 'all' : 'branding') },
                    ].map(({ label, value, icon: Icon, bg, active, onClick }) => (
                        <button key={label} onClick={onClick}
                            className={`rounded-2xl p-4 text-left transition-all border-2 ${active ? 'border-gray-900 shadow-md' : 'border-transparent'}
                ${value > 0 ? bg : 'bg-gray-100'} ${value > 0 ? 'text-white' : 'text-gray-400'}`}>
                            <div className="flex items-start justify-between mb-2">
                                <Icon className="w-4 h-4 opacity-80" />
                                {active && <span className="text-[10px] font-bold opacity-70 uppercase tracking-wide">Active</span>}
                            </div>
                            <p className="text-2xl font-black leading-none">{value}</p>
                            <p className="text-xs font-semibold opacity-80 mt-1">{label}</p>
                        </button>
                    ))}
                </div>

                {/* ── Search + filter ── */}
                <div className="flex gap-2">
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by train ID or type…"
                        className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white" />
                    {(filterType !== 'all' || filterCategory !== 'all' || search) && (
                        <button onClick={() => { setFilterType('all'); setFilterCategory('all'); setSearch(''); }}
                            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:text-gray-900 hover:border-gray-300 transition bg-white">
                            <X className="w-3.5 h-3.5" /> Clear
                        </button>
                    )}
                </div>

                {/* ── Notification list ── */}
                {filtered.length === 0 ? (
                    <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center shadow-sm">
                        {notifications.length === 0 ? (
                            <>
                                <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
                                <p className="text-lg font-black text-gray-900">All clear!</p>
                                <p className="text-sm text-gray-400 mt-1">No certificate or branding alerts for the fleet.</p>
                            </>
                        ) : (
                            <>
                                <Filter className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                                <p className="text-base font-bold text-gray-400">No notifications match your filters.</p>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Expired group */}
                        {filtered.some(n => n.type === 'expired') && (
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                <div className="flex items-center gap-3 px-5 py-3.5 bg-red-50 border-b border-red-100">
                                    <div className="w-2 h-2 rounded-full bg-red-500" />
                                    <p className="text-sm font-black text-red-800">
                                        🚨 {filtered.filter(n => n.type === 'expired').length} Expired
                                    </p>
                                </div>
                                {filtered.filter(n => n.type === 'expired').map(n => (
                                    <NotifRow key={n.id} notif={n} dismissed={false} onDismiss={dismiss} />
                                ))}
                            </div>
                        )}

                        {/* Warning group */}
                        {filtered.some(n => n.type === 'warning') && (
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-50 border-b border-amber-100">
                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                    <p className="text-sm font-black text-amber-800">
                                        ⚠️ {filtered.filter(n => n.type === 'warning').length} Expiring Soon (within 7 days)
                                    </p>
                                </div>
                                {filtered.filter(n => n.type === 'warning').map(n => (
                                    <NotifRow key={n.id} notif={n} dismissed={false} onDismiss={dismiss} />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Dismissed count note */}
                {dismissed.size > 0 && (
                    <p className="text-center text-xs text-gray-400">
                        {dismissed.size} notification{dismissed.size > 1 ? 's' : ''} dismissed ·{' '}
                        <button onClick={clearDismissed} className="underline hover:text-gray-700 transition">Restore all</button>
                    </p>
                )}
            </div>
        </div>
    );
}