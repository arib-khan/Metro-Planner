// src/app/user/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    doc, getDoc, updateDoc, serverTimestamp,
    collection, getDocs, query, where
} from 'firebase/firestore';
import {
    updateProfile, updatePassword,
    EmailAuthProvider, reauthenticateWithCredential
} from 'firebase/auth';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
    User, Mail, Clock, Shield, ShieldCheck, ShieldAlert,
    Pencil, Check, X, Loader2, Key, Eye, EyeOff,
    Activity, Hash, Calendar, AlertTriangle,
    CheckCircle2, Wrench, AlertCircle, LogOut
} from 'lucide-react';
import WhatsAppIntegration from '../components/WhatsAppIntegration';

// ── Helpers ───────────────────────────────────────────────────────────────────
const getInitials = (name, email) => {
    if (name) {
        const parts = name.trim().split(' ').filter(Boolean);
        return parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : parts[0].slice(0, 2).toUpperCase();
    }
    return email?.[0]?.toUpperCase() || '?';
};

const getAvatarGradient = (str = '') => {
    const g = [
        'from-slate-700 to-slate-900',
        'from-blue-700 to-indigo-900',
        'from-emerald-700 to-teal-900',
        'from-violet-700 to-purple-900',
        'from-rose-700 to-red-900',
    ];
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return g[Math.abs(h) % g.length];
};

const fmtDate = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ── Toast ─────────────────────────────────────────────────────────────────────
const Toast = ({ msg, type }) => (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-semibold
    ${type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'}`}>
        {type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        {msg}
    </div>
);

// ── Avatar ────────────────────────────────────────────────────────────────────
const Avatar = ({ name, email, size = 88 }) => (
    <div
        className={`bg-gradient-to-br ${getAvatarGradient(name || email)} rounded-2xl flex items-center justify-center text-white font-black select-none shadow-lg flex-shrink-0`}
        style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
        {getInitials(name, email)}
    </div>
);

// ── Card primitives ───────────────────────────────────────────────────────────
const Card = ({ children, className = '' }) => (
    <div className={`bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden ${className}`}>
        {children}
    </div>
);

const CardHeader = ({ icon: Icon, title, action }) => (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center">
                <Icon className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
        </div>
        {action}
    </div>
);

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, iconBg }) => (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${iconBg}`}>
            <Icon className="w-4 h-4 text-white" />
        </div>
        <p className="text-2xl font-black text-gray-900">{value}</p>
        <p className="text-xs font-semibold text-gray-600 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
);

// ── Password field ────────────────────────────────────────────────────────────
const PwField = ({ label, value, onChange, show, onToggle, placeholder }) => (
    <div>
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">{label}</label>
        <div className="relative">
            <input type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            <button type="button" onClick={onToggle}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
        </div>
    </div>
);

// ── Info row ──────────────────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, children }) => (
    <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
            {children}
        </div>
    </div>
);

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UserProfilePage() {
    const { user, logout } = useAuth();
    const router = useRouter();

    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ mobileUsers: 0, blockedUsers: 0, jobCards: 0, openJobCards: 0 });
    const [loadingStats, setLoadingStats] = useState(true);

    // Edit name
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [savingName, setSavingName] = useState(false);

    // Change password
    const [editingPw, setEditingPw] = useState(false);
    const [pwDraft, setPwDraft] = useState({ current: '', next: '', confirm: '' });
    const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
    const [savingPw, setSavingPw] = useState(false);

    const [toast, setToast] = useState(null);
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Load profile
    useEffect(() => {
        if (!user?.uid) return;
        getDoc(doc(db, 'users', user.uid)).then(snap => {
            if (snap.exists()) {
                const d = snap.data();
                setProfile({ ...d, emailVerified: user.emailVerified });
                setNameDraft(d.displayName || user.displayName || '');
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [user]);

    // Load system stats
    useEffect(() => {
        if (!user?.uid) return;
        Promise.all([
            getDocs(query(collection(db, 'users'), where('appType', '==', 'mobile'))),
            getDocs(query(collection(db, 'users'), where('isBlocked', '==', true))),
            getDocs(query(collection(db, 'tasks'), where('isJobCard', '==', true))),
        ]).then(([mobileSnap, blockedSnap, jobsSnap]) => {
            const openJobs = jobsSnap.docs.filter(d => ['pending', 'in_progress'].includes(d.data().status)).length;
            setStats({ mobileUsers: mobileSnap.size, blockedUsers: blockedSnap.size, jobCards: jobsSnap.size, openJobCards: openJobs });
            setLoadingStats(false);
        }).catch(() => setLoadingStats(false));
    }, [user]);

    // Save name
    const handleSaveName = async () => {
        if (!nameDraft.trim()) { showToast('Name cannot be empty', 'error'); return; }
        setSavingName(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), { displayName: nameDraft.trim(), updatedAt: serverTimestamp() });
            await updateProfile(user, { displayName: nameDraft.trim() });
            setProfile(p => ({ ...p, displayName: nameDraft.trim() }));
            setEditingName(false);
            showToast('Name updated');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setSavingName(false); }
    };

    // Change password
    const handleChangePassword = async () => {
        if (!pwDraft.current) { showToast('Enter your current password', 'error'); return; }
        if (pwDraft.next.length < 6) { showToast('New password must be at least 6 characters', 'error'); return; }
        if (pwDraft.next !== pwDraft.confirm) { showToast('Passwords do not match', 'error'); return; }
        setSavingPw(true);
        try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pwDraft.current));
            await updatePassword(user, pwDraft.next);
            setPwDraft({ current: '', next: '', confirm: '' });
            setEditingPw(false);
            showToast('Password changed successfully');
        } catch (e) {
            showToast(e.code === 'auth/wrong-password' ? 'Current password is incorrect' : e.message, 'error');
        } finally { setSavingPw(false); }
    };

    if (!user) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500 text-sm">Please sign in.</p>
        </div>
    );

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        </div>
    );

    const name = profile?.displayName || user?.displayName || '';
    const email = profile?.email || user?.email || '';

    return (
        <div className="min-h-screen bg-gray-50">
            {toast && <Toast {...toast} />}

            {/* ── Hero ─────────────────────────────────────────────────────────────── */}
            <div className="relative bg-gray-900 overflow-hidden">
                <div className="absolute inset-0 opacity-[0.06]"
                    style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
                <div className={`absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br ${getAvatarGradient(name || email)} rounded-full opacity-20 blur-3xl pointer-events-none`} />

                <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6">
                        <div className="relative">
                            <Avatar name={name} email={email} size={88} />
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-400 border-2 border-gray-900 rounded-full" />
                        </div>
                        <div className="flex-1 pb-1">
                            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2 flex-wrap">
                                {name || 'No name set'}
                                {profile?.emailVerified
                                    ? <ShieldCheck className="w-5 h-5 text-emerald-400" />
                                    : <ShieldAlert className="w-5 h-5 text-amber-400" />}
                            </h1>
                            <p className="text-gray-400 text-sm mt-0.5">{email}</p>
                            <div className="flex flex-wrap gap-2 mt-3">
                                <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">
                                    <Shield className="w-3 h-3" /> Supervisor · Web Dashboard
                                </span>
                                <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-full">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Online
                                </span>
                            </div>
                        </div>
                        <button onClick={() => { logout(); router.push('/'); }}
                            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold rounded-xl transition">
                            <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────────────────── */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* System stats */}
                <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">System Overview</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard icon={User} label="Mobile Users" sub="Active ground staff" value={loadingStats ? '—' : stats.mobileUsers} iconBg="bg-slate-800" />
                        <StatCard icon={ShieldAlert} label="Blocked Users" sub="Access restricted" value={loadingStats ? '—' : stats.blockedUsers} iconBg={stats.blockedUsers > 0 ? 'bg-red-600' : 'bg-slate-400'} />
                        <StatCard icon={Wrench} label="Total Job Cards" sub="All time" value={loadingStats ? '—' : stats.jobCards} iconBg="bg-blue-700" />
                        <StatCard icon={AlertTriangle} label="Open Job Cards" sub="Pending or in progress" value={loadingStats ? '—' : stats.openJobCards} iconBg={stats.openJobCards > 0 ? 'bg-amber-500' : 'bg-slate-400'} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* ── Account Details ── */}
                    <Card>
                        <CardHeader icon={User} title="Account Details"
                            action={
                                !editingName
                                    ? <button onClick={() => setEditingName(true)}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition">
                                        <Pencil className="w-3 h-3" /> Edit Name
                                    </button>
                                    : <button onClick={() => { setEditingName(false); setNameDraft(profile?.displayName || ''); }}
                                        className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
                                        <X className="w-4 h-4" />
                                    </button>
                            }
                        />
                        <div className="p-6 space-y-5">

                            {/* Name */}
                            <InfoRow icon={User} label="Display Name">
                                {editingName ? (
                                    <div className="flex items-center gap-2 mt-1">
                                        <input value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                                            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                                            autoFocus />
                                        <button onClick={handleSaveName} disabled={savingName}
                                            className="w-9 h-9 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center flex-shrink-0 transition">
                                            {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm font-semibold text-gray-900">{name || <span className="italic text-gray-400">Not set</span>}</p>
                                )}
                            </InfoRow>

                            {/* Email */}
                            <InfoRow icon={Mail} label="Email Address">
                                <p className="text-sm font-semibold text-gray-900 truncate">{email}</p>
                                <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full
                  ${profile?.emailVerified ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {profile?.emailVerified ? <><ShieldCheck className="w-3 h-3" />Verified</> : <><ShieldAlert className="w-3 h-3" />Not Verified</>}
                                </span>
                            </InfoRow>

                            {/* Member since */}
                            <InfoRow icon={Calendar} label="Member Since">
                                <p className="text-sm font-semibold text-gray-900">{fmtDate(profile?.createdAt)}</p>
                            </InfoRow>

                            {/* Last login */}
                            <InfoRow icon={Activity} label="Last Login">
                                <p className="text-sm font-semibold text-gray-900">{fmtDateTime(profile?.lastLoginAt)}</p>
                            </InfoRow>

                            {/* UID */}
                            <InfoRow icon={Hash} label="User ID">
                                <p className="text-[11px] font-mono text-gray-400 break-all leading-relaxed">{user.uid}</p>
                            </InfoRow>
                        </div>
                    </Card>

                    {/* ── Security ── */}
                    <Card>
                        <CardHeader icon={Key} title="Security"
                            action={
                                !editingPw
                                    ? <button onClick={() => setEditingPw(true)}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition">
                                        <Pencil className="w-3 h-3" /> Change Password
                                    </button>
                                    : <button onClick={() => { setEditingPw(false); setPwDraft({ current: '', next: '', confirm: '' }); }}
                                        className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
                                        <X className="w-4 h-4" />
                                    </button>
                            }
                        />
                        <div className="p-6">
                            {editingPw ? (
                                <div className="space-y-4">
                                    {[
                                        { k: 'current', label: 'Current Password', ph: 'Your current password' },
                                        { k: 'next', label: 'New Password', ph: 'At least 6 characters' },
                                        { k: 'confirm', label: 'Confirm Password', ph: 'Repeat new password' },
                                    ].map(({ k, label, ph }) => (
                                        <PwField key={k} label={label} placeholder={ph}
                                            value={pwDraft[k]} onChange={e => setPwDraft(d => ({ ...d, [k]: e.target.value }))}
                                            show={showPw[k]} onToggle={() => setShowPw(s => ({ ...s, [k]: !s[k] }))}
                                        />
                                    ))}
                                    <button onClick={handleChangePassword} disabled={savingPw}
                                        className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
                                        {savingPw ? <><Loader2 className="w-4 h-4 animate-spin" />Updating…</> : <><Key className="w-4 h-4" />Update Password</>}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                                        {[
                                            ['Password', '••••••••'],
                                            ['Auth Provider', 'Email / Password'],
                                            ['Account Status', profile?.isBlocked ? 'Blocked' : 'Active'],
                                        ].map(([label, val]) => (
                                            <div key={label} className="flex items-center justify-between text-sm">
                                                <span className="text-gray-500">{label}</span>
                                                <span className={`font-bold ${label === 'Account Status' && !profile?.isBlocked ? 'text-emerald-600' : label === 'Account Status' ? 'text-red-600' : 'text-gray-800'}`}>
                                                    {val}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-400 text-center pt-1">
                                        Click <strong className="text-gray-600">Change Password</strong> to update your credentials.
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
                <WhatsAppIntegration />
            </div>
        </div>
    );
}