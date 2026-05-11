// src/app/users/page.jsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    collection, getDocs, doc, updateDoc, addDoc,
    serverTimestamp, query, orderBy, where
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
    Users, Shield, ShieldOff, Search, ChevronDown, ChevronUp,
    Clock, Mail, Calendar, Hash, AlertTriangle, CheckCircle2,
    Plus, X, Loader2, RefreshCw, UserCheck, UserX,
    ClipboardList, Inbox, Phone, Building2, Settings2, Save, Tag,
    FileCheck2, Gauge, Sparkles, LayoutGrid, Warehouse
} from 'lucide-react';

// ─── Data section definitions ─────────────────────────────────────────────────
// These keys MUST match the gating checks in InductionForm.js
export const DATA_SECTIONS = [
    {
        key: 'certificate',
        label: 'Certificate',
        description: 'Fitness cert validity dates',
        icon: FileCheck2,
        color: 'emerald',
        colorClasses: 'bg-emerald-500/10 text-emerald-400 border-emerald-400/30',
        activeClasses: 'border-emerald-400/50 bg-emerald-500/10',
    },
    {
        key: 'branding',
        label: 'Branding',
        description: 'Campaign & exposure data',
        icon: Tag,
        color: 'violet',
        colorClasses: 'bg-violet-500/10 text-violet-400 border-violet-400/30',
        activeClasses: 'border-violet-400/50 bg-violet-500/10',
    },
    {
        key: 'mileage',
        label: 'Mileage',
        description: 'Current km odometer reading',
        icon: Gauge,
        color: 'amber',
        colorClasses: 'bg-amber-500/10 text-amber-400 border-amber-400/30',
        activeClasses: 'border-amber-400/50 bg-amber-500/10',
    },
    {
        key: 'cleaning',
        label: 'Cleaning',
        description: 'Slot times & team assignment',
        icon: Sparkles,
        color: 'orange',
        colorClasses: 'bg-orange-500/10 text-orange-400 border-orange-400/30',
        activeClasses: 'border-orange-400/50 bg-orange-500/10',
    },
    {
        key: 'stabling',
        label: 'Stabling',
        description: 'Track, berth & geometry',
        icon: Warehouse,
        color: 'sky',
        colorClasses: 'bg-sky-500/10 text-sky-400 border-sky-400/30',
        activeClasses: 'border-sky-400/50 bg-sky-500/10',
    },
    {
        key: 'jobCard',
        label: 'Job card',
        description: 'Work orders & task status',
        icon: LayoutGrid,
        color: 'blue',
        colorClasses: 'bg-blue-500/10 text-blue-400 border-blue-400/30',
        activeClasses: 'border-blue-400/50 bg-blue-500/10',
    },
];

// Default: all sections off — admin must explicitly grant
export const DEFAULT_SECTIONS = Object.fromEntries(
    DATA_SECTIONS.map(s => [s.key, false])
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTime = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

const PRIORITY_META = {
    low: { label: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/30' },
    medium: { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
    high: { label: 'High', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30' },
};

const STATUS_META = {
    pending: { label: 'Pending', color: 'text-gray-500', bg: 'bg-gray-100 border-gray-300' },
    in_progress: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30' },
    completed: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/30' },
};

// ─── Small reusable components ────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, accent }) {
    return (
        <div className={`rounded-xl border p-5 flex items-center gap-4 ${accent}`}>
            <div className="p-2 rounded-lg bg-gray-100">
                <Icon className="h-5 w-5 opacity-80" />
            </div>
            <div>
                <p className="text-2xl font-bold tracking-tight">{value}</p>
                <p className="text-xs opacity-60 mt-0.5">{label}</p>
            </div>
        </div>
    );
}

function Badge({ meta }) {
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}>
            {meta.label}
        </span>
    );
}

// ─── Data Permissions Panel ───────────────────────────────────────────────────
function DataPermissionsPanel({ user, onSaved }) {
    const allowedSections = user.allowedSections || DEFAULT_SECTIONS;
    const [perms, setPerms] = useState({ ...DEFAULT_SECTIONS, ...allowedSections });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [err, setErr] = useState('');

    const toggle = (key) => {
        setPerms(p => ({ ...p, [key]: !p[key] }));
        setSaved(false);
    };

    const grantAll = () => {
        setPerms(Object.fromEntries(DATA_SECTIONS.map(s => [s.key, true])));
        setSaved(false);
    };

    const revokeAll = () => {
        setPerms(Object.fromEntries(DATA_SECTIONS.map(s => [s.key, false])));
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setErr('');
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                allowedSections: perms,
                sectionsUpdatedAt: serverTimestamp(),
            });
            setSaved(true);
            onSaved(user.uid, perms);
        } catch (e) {
            console.error('Save permissions error:', e);
            setErr('Failed to save. Try again.');
        } finally {
            setSaving(false);
        }
    };

    const activeCount = Object.values(perms).filter(Boolean).length;

    return (
        <div className="border-t border-gray-200 px-4 py-4 space-y-4">

            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Data access · {activeCount} of {DATA_SECTIONS.length} sections enabled
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={grantAll}
                        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
                    >
                        Grant all
                    </button>
                    <button
                        onClick={revokeAll}
                        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
                    >
                        Revoke all
                    </button>
                </div>
            </div>

            {/* Section toggles */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {DATA_SECTIONS.map(section => {
                    const Icon = section.icon;
                    const isOn = perms[section.key];
                    return (
                        <button
                            key={section.key}
                            onClick={() => toggle(section.key)}
                            className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${isOn
                                ? section.activeClasses
                                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                                }`}
                        >
                            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${isOn ? section.colorClasses.split(' ')[1] : 'text-gray-400'}`} />
                            <div className="min-w-0">
                                <p className={`text-xs font-semibold truncate ${isOn ? 'text-gray-900' : 'text-gray-500'}`}>
                                    {section.label}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                                    {section.description}
                                </p>
                            </div>
                            {/* Toggle indicator */}
                            <div className={`ml-auto shrink-0 w-7 h-4 rounded-full relative transition-colors ${isOn ? 'bg-blue-500' : 'bg-gray-200'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isOn ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* What the user will see preview */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Visible in mobile app
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {DATA_SECTIONS.filter(s => perms[s.key]).length === 0 ? (
                        <span className="text-xs text-gray-400 italic">No sections — user will see only Train ID &amp; Date</span>
                    ) : (
                        DATA_SECTIONS.filter(s => perms[s.key]).map(s => (
                            <span key={s.key} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${s.colorClasses}`}>
                                {s.label}
                            </span>
                        ))
                    )}
                </div>
            </div>

            {/* Error */}
            {err && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-2.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {err}
                </div>
            )}

            {/* Save */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${saved
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-400/30'
                        : 'bg-blue-600 hover:bg-blue-500 text-white border border-transparent'
                        }`}
                >
                    {saving
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : saved
                            ? <CheckCircle2 className="h-4 w-4" />
                            : <Save className="h-4 w-4" />
                    }
                    {saving ? 'Saving…' : saved ? 'Saved' : 'Save permissions'}
                </button>
            </div>
        </div>
    );
}

// ─── Assign Task Modal ────────────────────────────────────────────────────────
function AssignTaskModal({ user, onClose, onAssigned, currentUser }) {
    const [form, setForm] = useState({
        title: '', description: '', priority: 'medium', dueDate: ''
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const handleSubmit = async () => {
        if (!form.title.trim()) { setErr('Task title is required'); return; }
        setSaving(true);
        setErr('');
        try {
            await addDoc(collection(db, 'tasks'), {
                title: form.title.trim(),
                description: form.description.trim(),
                priority: form.priority,
                dueDate: form.dueDate || null,
                assignedTo: user.uid,
                assignedToEmail: user.email,
                assignedToName: user.displayName || user.email,
                status: 'pending',
                createdBy: currentUser.uid,
                createdAt: serverTimestamp(),
            });
            onAssigned();
            onClose();
        } catch (e) {
            console.error('Assign task error:', e);
            setErr('Failed to assign task. Try again.');
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white border border-gray-300 rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h3 className="font-semibold text-gray-900 text-lg">Assign Task</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            To: {user.displayName || user.email}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {err && (
                        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {err}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Task Title *</label>
                        <input
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Inspect KMRL-12 brakes"
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Optional details..."
                            rows={3}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Priority</label>
                            <select
                                value={form.priority}
                                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 transition-colors"
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Due Date</label>
                            <input
                                type="date"
                                value={form.dueDate}
                                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 p-6 pt-0">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {saving ? 'Assigning…' : 'Assign Task'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── User Tasks Panel ─────────────────────────────────────────────────────────
function UserTasksPanel({ user, onClose }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const q = query(collection(db, 'tasks'), where('assignedTo', '==', user.uid));
                const snap = await getDocs(q);
                const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                tasks.sort((a, b) => {
                    const aTime = a.createdAt?.toDate?.() || new Date(0);
                    const bTime = b.createdAt?.toDate?.() || new Date(0);
                    return bTime - aTime;
                });
                setTasks(tasks);
            } catch (e) {
                console.error('Load tasks error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user.uid]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h3 className="font-semibold text-gray-900 text-lg">Task History</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{user.displayName || user.email}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No tasks assigned yet</p>
                        </div>
                    ) : (
                        tasks.map(t => (
                            <div key={t.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <p className="text-sm font-medium text-gray-900 leading-tight">{t.title}</p>
                                    <div className="flex gap-1.5 shrink-0">
                                        <Badge meta={PRIORITY_META[t.priority] || PRIORITY_META.medium} />
                                        <Badge meta={STATUS_META[t.status] || STATUS_META.pending} />
                                    </div>
                                </div>
                                {t.description && <p className="text-xs text-gray-500 mb-2">{t.description}</p>}
                                <div className="flex items-center gap-3 text-xs text-gray-400">
                                    <span>Created: {fmtTime(t.createdAt)}</span>
                                    {t.dueDate && <span>Due: {t.dueDate}</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({ user, onBlock, onAssign, onViewTasks, taskCounts, onPermsSaved }) {
    const [expanded, setExpanded] = useState(false);
    const [showPerms, setShowPerms] = useState(false);
    const [toggling, setToggling] = useState(false);

    const handleBlock = async () => {
        setToggling(true);
        await onBlock(user);
        setToggling(false);
    };

    const isBlocked = user.isBlocked;
    const taskCount = taskCounts[user.uid] || 0;
    const allowedSections = { ...DEFAULT_SECTIONS, ...(user.allowedSections || {}) };
    const activePerms = DATA_SECTIONS.filter(s => allowedSections[s.key]);

    return (
        <div className={`border rounded-xl transition-all duration-200 ${isBlocked ? 'border-red-500/30 bg-red-500/5' : 'border-gray-200 bg-white'}`}>

            {/* Main row */}
            <div className="flex items-center gap-4 p-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isBlocked ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {(user.displayName || user.email || '?')[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900 truncate">
                            {user.displayName || <span className="text-gray-500 italic">No name</span>}
                        </p>
                        {isBlocked && (
                            <span className="text-xs font-medium text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">Blocked</span>
                        )}
                        {user.appType && (
                            <span className="text-xs font-medium text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">{user.appType}</span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{user.email}</p>

                    {/* Active permissions preview */}
                    {activePerms.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {activePerms.map(s => (
                                <span key={s.key} className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.colorClasses}`}>
                                    {s.label}
                                </span>
                            ))}
                        </div>
                    )}
                    {activePerms.length === 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 mt-1.5">
                            No data access
                        </span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-400 hidden sm:block">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>

                    {/* Permissions button */}
                    <button
                        onClick={() => { setShowPerms(p => !p); setExpanded(false); }}
                        className={`p-2 rounded-lg transition-colors ${showPerms ? 'bg-blue-500/10 text-blue-400' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
                        title="Manage data permissions"
                    >
                        <Settings2 className="h-4 w-4" />
                    </button>

                    <button
                        onClick={() => onViewTasks(user)}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                        title="View tasks"
                    >
                        <ClipboardList className="h-4 w-4" />
                    </button>

                    <button
                        onClick={() => onAssign(user)}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                        title="Assign task"
                    >
                        <Plus className="h-4 w-4" />
                    </button>

                    <button
                        onClick={handleBlock}
                        disabled={toggling}
                        className={`p-2 rounded-lg transition-colors ${isBlocked ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400' : 'bg-red-500/10 hover:bg-red-500/20 text-red-400'}`}
                        title={isBlocked ? 'Unblock user' : 'Block user'}
                    >
                        {toggling
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : isBlocked ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />
                        }
                    </button>

                    <button
                        onClick={() => { setExpanded(e => !e); setShowPerms(false); }}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                    >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Data Permissions Panel */}
            {showPerms && (
                <DataPermissionsPanel
                    user={user}
                    onSaved={(uid, perms) => onPermsSaved(uid, perms)}
                />
            )}

            {/* Expanded details */}
            {expanded && (
                <div className="border-t border-gray-200 px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    {[
                        { label: 'UID', value: user.uid, icon: Hash },
                        { label: 'Email', value: user.email, icon: Mail },
                        { label: 'Joined', value: fmt(user.createdAt), icon: Calendar },
                        { label: 'Last Login', value: fmtTime(user.lastLoginAt), icon: Clock },
                        { label: 'Email Verified', value: user.emailVerified ? 'Yes' : 'No', icon: CheckCircle2 },
                        { label: 'Role', value: user.role || 'user', icon: UserCheck },
                        { label: 'App Type', value: user.appType || 'unknown', icon: UserCheck },
                        { label: 'Status', value: isBlocked ? 'Blocked' : 'Active', icon: isBlocked ? UserX : UserCheck },
                        { label: 'Tasks Assigned', value: String(taskCount), icon: ClipboardList },
                        { label: 'Phone', value: user.phone || '—', icon: Phone },
                        { label: 'Department', value: user.department || '—', icon: Building2 },
                    ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="space-y-1">
                            <p className="text-gray-400 uppercase tracking-wider font-medium flex items-center gap-1">
                                <Icon className="h-3 w-3" />{label}
                            </p>
                            <p className={`font-mono text-gray-600 truncate ${label === 'UID' ? 'text-[10px]' : ''}`}>
                                {value}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
    const { user: currentUser, loading: authLoading } = useAuth();
    const router = useRouter();

    const [users, setUsers] = useState([]);
    const [taskCounts, setTaskCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [assignTarget, setAssignTarget] = useState(null);
    const [tasksTarget, setTasksTarget] = useState(null);
    const [toast, setToast] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const loadUsers = useCallback(async () => {
        setLoadError('');
        try {
            const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const mobileUsers = all.filter(u => u.appType !== 'web');
            setUsers(mobileUsers);

            const counts = {};
            await Promise.all(
                mobileUsers.map(async (u) => {
                    try {
                        const tSnap = await getDocs(query(collection(db, 'tasks'), where('assignedTo', '==', u.uid)));
                        counts[u.uid] = tSnap.size;
                    } catch {
                        counts[u.uid] = 0;
                    }
                })
            );
            setTaskCounts(counts);
        } catch (e) {
            console.error('Failed to load users:', e);
            setLoadError(`Failed to load users: ${e.message}`);
        }
    }, []);

    useEffect(() => {
        if (!authLoading) {
            if (!currentUser) { router.push('/login'); return; }
            loadUsers().finally(() => setLoading(false));
        }
    }, [authLoading, currentUser, loadUsers, router]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadUsers();
        setRefreshing(false);
    };

    const handleBlock = async (targetUser) => {
        const newVal = !targetUser.isBlocked;
        try {
            await updateDoc(doc(db, 'users', targetUser.uid), { isBlocked: newVal });
            setUsers(us => us.map(u => u.uid === targetUser.uid ? { ...u, isBlocked: newVal } : u));
            showToast(`${targetUser.email} ${newVal ? 'blocked' : 'unblocked'} successfully`);
        } catch (e) {
            console.error('Block error:', e);
            showToast('Failed to update user status', 'error');
        }
    };

    const handleTaskAssigned = () => {
        showToast('Task assigned successfully');
        if (assignTarget) {
            setTaskCounts(tc => ({ ...tc, [assignTarget.uid]: (tc[assignTarget.uid] || 0) + 1 }));
        }
    };

    // Update user's allowedSections in local state after save (no refetch needed)
    const handlePermsSaved = (uid, perms) => {
        setUsers(us => us.map(u => u.uid === uid ? { ...u, allowedSections: perms } : u));
        showToast('Data permissions updated successfully');
    };

    const filtered = users.filter(u => {
        const q = search.toLowerCase();
        const matchSearch =
            u.email?.toLowerCase().includes(q) ||
            u.displayName?.toLowerCase().includes(q) ||
            u.uid?.toLowerCase().includes(q);
        const matchFilter =
            filter === 'all' ? true :
                filter === 'active' ? !u.isBlocked :
                    filter === 'blocked' ? u.isBlocked : true;
        return matchSearch && matchFilter;
    });

    const stats = {
        total: users.length,
        active: users.filter(u => !u.isBlocked).length,
        blocked: users.filter(u => u.isBlocked).length,
        totalTasks: Object.values(taskCounts).reduce((a, b) => a + b, 0),
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-gray-500">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                    <p className="text-sm">Loading user data…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'}`}>
                    {toast.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {toast.msg}
                </div>
            )}

            {/* Modals */}
            {assignTarget && (
                <AssignTaskModal user={assignTarget} currentUser={currentUser} onClose={() => setAssignTarget(null)} onAssigned={handleTaskAssigned} />
            )}
            {tasksTarget && (
                <UserTasksPanel user={tasksTarget} onClose={() => setTasksTarget(null)} />
            )}

            <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                            <Users className="h-7 w-7 text-blue-400" />
                            User Management
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Mobile app ground staff · KMRL</p>
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-sm text-gray-600 hover:text-gray-900 hover:border-gray-400 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Error banner */}
                {loadError && (
                    <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold mb-1">Failed to load users</p>
                            <p className="text-xs opacity-80">{loadError}</p>
                        </div>
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard icon={Users} label="Total Users" value={stats.total} accent="border-gray-200 text-gray-900" />
                    <StatCard icon={UserCheck} label="Active" value={stats.active} accent="border-emerald-500/30 text-emerald-700" />
                    <StatCard icon={UserX} label="Blocked" value={stats.blocked} accent="border-red-500/30 text-red-700" />
                    <StatCard icon={ClipboardList} label="Tasks Assigned" value={stats.totalTasks} accent="border-blue-500/30 text-blue-700" />
                </div>

                {/* Search + filter */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name, email or UID…"
                            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                    <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white text-sm">
                        {['all', 'active', 'blocked'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2.5 capitalize transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* User list */}
                {filtered.length === 0 && !loadError ? (
                    <div className="text-center py-16 text-gray-400">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p className="text-sm">{search ? `No users found for "${search}"` : 'No users found'}</p>
                        {!search && <p className="text-xs mt-2 opacity-60">Mobile app users will appear here once they sign up.</p>}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                            {filtered.length} {filtered.length === 1 ? 'user' : 'users'} shown
                        </p>
                        {filtered.map(u => (
                            <UserRow
                                key={u.uid}
                                user={u}
                                taskCounts={taskCounts}
                                onBlock={handleBlock}
                                onAssign={setAssignTarget}
                                onViewTasks={setTasksTarget}
                                onPermsSaved={handlePermsSaved}
                            />
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}