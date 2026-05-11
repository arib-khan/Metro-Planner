// src/app/job-cards/page.jsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    collection, addDoc, getDocs, query, orderBy,
    serverTimestamp, doc, updateDoc, where
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
    Upload, AlertTriangle, CheckCircle2, Loader2,
    X, ChevronDown, ChevronUp,
    MessageSquare, Bell, Search, FileText,
    Zap, ShieldAlert, CircleDot, Circle, CircleCheck,
    TriangleAlert, RefreshCw
} from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_WHATSAPP_API || 'http://localhost:5000';

const PRIORITY_MAP = { high: 'High', medium: 'Medium', low: 'Low' };

const PRIORITY_STYLES = {
    High: { badge: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500', icon: ShieldAlert },
    Medium: { badge: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500', icon: Zap },
    Low: { badge: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500', icon: Circle },
};

// Tasks use lowercase status; job cards use title case
const STATUS_DISPLAY = {
    pending: { label: 'Pending', badge: 'bg-slate-100 text-slate-700 border-slate-200', icon: Circle },
    in_progress: { label: 'In Progress', badge: 'bg-blue-100 text-blue-700 border-blue-200', icon: CircleDot },
    completed: { label: 'Completed', badge: 'bg-green-100 text-green-700 border-green-200', icon: CircleCheck },
};

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = values[i] || ''; });
        return obj;
    });
}

// Map CSV status strings → task status keys
function mapStatus(csvStatus) {
    const s = csvStatus?.toLowerCase().trim();
    if (s === 'completed') return 'completed';
    if (s === 'in progress') return 'in_progress';
    return 'pending';
}

// Map CSV priority → lowercase task priority
function mapPriority(csvPriority) {
    const p = csvPriority?.toLowerCase().trim();
    if (p === 'high') return 'high';
    if (p === 'low') return 'low';
    return 'medium';
}

// ─── Critical Alert Banner ────────────────────────────────────────────────────
function CriticalAlertBanner({ tasks }) {
    const blocked = tasks.filter(t =>
        t.priority === 'high' && (t.status === 'pending' || t.status === 'in_progress')
    );
    if (!blocked.length) return null;
    return (
        <div className="bg-red-600 text-white rounded-xl p-4 flex items-start gap-3 shadow-lg">
            <TriangleAlert className="h-6 w-6 flex-shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1">
                <p className="font-bold text-base mb-1">
                    🚨 {blocked.length} Train{blocked.length > 1 ? 's' : ''} Cannot Operate
                </p>
                <p className="text-red-100 text-sm mb-2">
                    High priority jobs are pending — these trains must not run until resolved.
                </p>
                <div className="flex flex-wrap gap-2">
                    {blocked.map(t => (
                        <span key={t.id} className="bg-red-700 text-white text-xs font-bold px-3 py-1 rounded-full border border-red-400">
                            {t.sourceTrainId} · {t.sourceJobCardId}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Job Card Row ─────────────────────────────────────────────────────────────
function JobCardRow({ task, onStatusChange, updating }) {
    const [expanded, setExpanded] = useState(false);
    const [localStatus, setLocalStatus] = useState(task.status);

    useEffect(() => { setLocalStatus(task.status); }, [task.status]);

    const priorityKey = PRIORITY_MAP[task.priority] || 'Medium';
    const p = PRIORITY_STYLES[priorityKey];
    const s = STATUS_DISPLAY[localStatus] || STATUS_DISPLAY.pending;
    const PIcon = p.icon;
    const isBlocked = task.priority === 'high' && (localStatus === 'pending' || localStatus === 'in_progress');

    const handleChange = (e) => {
        const newStatus = e.target.value;
        setLocalStatus(newStatus);
        onStatusChange(task.id, newStatus);
    };

    return (
        <div className={`border rounded-xl overflow-hidden transition-all ${isBlocked ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.dot}`} />

                <div className="w-28 flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{task.sourceTrainId || '—'}</p>
                    <p className="text-xs text-gray-400">{task.sourceJobCardId || '—'}</p>
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">{task.jobType || task.description?.split('\n')[0] || ''}{task.department ? ` · ${task.department}` : ''}</p>
                        {task.isJobCard
                            ? <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full">Job Card</span>
                            : <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">Manual</span>
                        }
                    </div>
                </div>

                <div className="hidden md:block w-44 flex-shrink-0">
                    <p className="text-xs text-gray-500 truncate">{task.assignedToEmail}</p>
                    <p className="text-xs text-gray-400">{task.phone || '—'}</p>
                </div>

                <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border flex-shrink-0 ${p.badge}`}>
                    <PIcon className="h-3 w-3" />{priorityKey}
                </span>

                {/* Status dropdown */}
                <div className="flex-shrink-0">
                    <select
                        value={localStatus}
                        onChange={handleChange}
                        disabled={updating === task.id}
                        className={`text-xs font-medium px-2 py-1.5 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-900 ${s.badge}`}
                    >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                    </select>
                </div>

                <div className="flex gap-1.5 flex-shrink-0">
                    <span title="App notified" className={`inline-flex items-center justify-center h-6 w-6 rounded-full ${task.notifiedApp ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                        <Bell className="h-3 w-3" />
                    </span>
                    <span title="WhatsApp notified" className={`inline-flex items-center justify-center h-6 w-6 rounded-full ${task.notifiedWhatsApp ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                        <MessageSquare className="h-3 w-3" />
                    </span>
                </div>

                <button onClick={() => setExpanded(e => !e)} className="p-1 text-gray-400 hover:text-gray-600">
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
            </div>

            {isBlocked && (
                <div className="px-4 py-2 bg-red-100 border-t border-red-200 flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
                    <p className="text-xs text-red-700 font-semibold">
                        ⛔ {task.sourceTrainId} is blocked until this High priority job is resolved.
                    </p>
                </div>
            )}

            {expanded && (
                <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 text-xs">
                    {[
                        { label: 'Work Order', value: task.sourceWorkOrder || '—' },
                        { label: 'Department', value: task.department || '—' },
                        { label: 'Reported', value: task.reportedDatetime || '—' },
                        { label: 'Due', value: task.dueDate || '—' },
                        { label: 'Completed', value: task.completedDatetime || '—' },
                        { label: 'Assigned To', value: task.assignedToName || task.assignedToEmail || '—' },
                        { label: 'Phone', value: task.phone || '—' },
                        { label: 'Batch', value: task.csvFileName || '—' },
                    ].map(({ label, value }) => (
                        <div key={label}>
                            <p className="text-gray-400 uppercase tracking-wider font-medium mb-0.5">{label}</p>
                            <p className="text-gray-700 font-medium">{value}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── WhatsApp Modal ───────────────────────────────────────────────────────────
function WhatsAppModal({ tasks, csvFileName, onClose, onDone, currentUser }) {
    const [sending, setSending] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState('');

    const handleSend = async () => {
        setSending(true);
        setError('');
        const waResults = [];
        try {
            for (const task of tasks) {
                if (!task.phone) {
                    waResults.push({ id: task.id, ok: false, msg: 'No phone number' });
                    continue;
                }
                const message =
                    `🔧 *Job Card Assigned*\n\n` +
                    `*Job Card:* ${task.sourceJobCardId}\n` +
                    `*Train:* ${task.sourceTrainId}\n` +
                    `*Work Order:* ${task.sourceWorkOrder}\n` +
                    `*Type:* ${task.jobType}\n` +
                    `*Description:* ${task.title}\n` +
                    `*Priority:* ${task.priority}\n` +
                    `*Department:* ${task.department}\n` +
                    `*Due:* ${task.dueDate}\n\n` +
                    `Please update status on the KMRL app.`;
                try {
                    const res = await fetch(`${API_URL}/api/whatsapp/send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: currentUser.uid,
                            phone: task.phone.replace(/\D/g, ''),
                            message,
                        }),
                    });
                    const data = await res.json();
                    waResults.push({ id: task.id, ok: data.success, msg: data.error });
                } catch (e) {
                    waResults.push({ id: task.id, ok: false, msg: e.message });
                }
            }

            // Mark notifiedWhatsApp on each task in Firestore
            await Promise.all(
                waResults
                    .filter(r => r.ok)
                    .map(r => updateDoc(doc(db, 'tasks', r.id), { notifiedWhatsApp: true }))
            );

            setResults(waResults);
            onDone();
        } catch (e) {
            setError('Something went wrong: ' + e.message);
        } finally {
            setSending(false);
        }
    };

    const ok = results?.filter(r => r.ok).length ?? 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-green-600" /> Send WhatsApp Notifications
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">{tasks.length} job cards · {csvFileName}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {results ? (
                    <div className="p-6 space-y-4">
                        <div className="text-center">
                            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                            <p className="font-bold text-gray-900 text-lg">{ok}/{tasks.length} Messages Sent</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-48 overflow-y-auto space-y-1">
                            {results.map(r => (
                                <p key={r.id} className={`text-xs ${r.ok ? 'text-green-700' : 'text-red-600'}`}>
                                    {r.ok ? '✅' : '❌'} {r.id}{r.msg ? `: ${r.msg}` : ''}
                                </p>
                            ))}
                        </div>
                        <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800">
                            Done
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="p-6">
                            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
                            <p className="text-sm text-gray-600 mb-4">
                                Sends a WhatsApp message to all <strong>{tasks.length} staff members</strong> in this batch.
                                Requires WhatsApp to be connected.
                            </p>
                            <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 font-mono whitespace-pre-line">
                                {`🔧 Job Card Assigned\nJob Card: JC-XXXX\nTrain: KMRL-X\nPriority: High\n...`}
                            </div>
                        </div>
                        <div className="flex gap-3 p-6 pt-0">
                            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                                Cancel
                            </button>
                            <button onClick={handleSend} disabled={sending}
                                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2">
                                {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><MessageSquare className="h-4 w-4" />Send WhatsApp</>}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function JobCardsPage() {
    const { user: currentUser, loading: authLoading } = useAuth();

    const [tasks, setTasks] = useState([]);       // all job-card tasks from Firestore
    const [csvFiles, setCsvFiles] = useState([]);       // distinct csvFileName values
    const [activeCsv, setActiveCsv] = useState(null);     // selected batch name
    const [loadingTasks, setLoadingTasks] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [updatingTask, setUpdatingTask] = useState(null);
    const [showWhatsApp, setShowWhatsApp] = useState(false);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterPriority, setFilterPriority] = useState('All');
    const [toast, setToast] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    // ── Load all job-card tasks from Firestore ──────────────────────────────
    const loadTasks = useCallback(async (selectCsv) => {
        try {
            const snap = await getDocs(
                query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
            );
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setTasks(list);

            // Build distinct csv batch names
            const names = [...new Set(list.map(t => t.csvFileName).filter(Boolean))];
            setCsvFiles(names);

            if (selectCsv) {
                setActiveCsv(selectCsv);
            } else {
                setActiveCsv(prev => prev ?? '__all__');
            }
        } catch (e) {
            console.error('Load tasks error:', e);
        } finally {
            setLoadingTasks(false);
        }
    }, []);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    // ── Tasks for the active CSV batch ─────────────────────────────────────
    const batchTasks = activeCsv === '__all__' ? tasks : tasks.filter(t => t.csvFileName === activeCsv);

    // ── Upload CSV — creates tasks, skips duplicates ────────────────────────
    const processFile = useCallback(async (file) => {
        if (!file?.name.endsWith('.csv')) {
            showToast('Please upload a CSV file', 'error');
            return;
        }
        setUploading(true);
        try {
            const text = await file.text();
            const rows = parseCSV(text);
            if (!rows.length) { showToast('CSV has no data rows', 'error'); setUploading(false); return; }

            // Fetch all users (email → uid map)
            const usersSnap = await getDocs(query(collection(db, 'users')));
            const userMap = {};
            usersSnap.forEach(d => {
                const u = d.data();
                if (u.email) userMap[u.email.toLowerCase()] = u;
            });

            // Check ALL tasks in DB for existing job_card_ids — blocks duplicates across any CSV
            const existingSnap = await getDocs(
                query(collection(db, 'tasks'), where('isJobCard', '==', true))
            );
            const existingIds = new Set(existingSnap.docs.map(d => d.data().sourceJobCardId).filter(Boolean));

            // Pre-check: find which rows are duplicates before doing anything
            const duplicateIds = rows.filter(r => existingIds.has(r.job_card_id)).map(r => r.job_card_id);

            if (duplicateIds.length > 0 && duplicateIds.length === rows.length) {
                showToast(`⚠️ All ${rows.length} job cards already exist in the database. Nothing added.`, 'error');
                setUploading(false);
                return;
            }

            let created = 0, skipped = 0, failed = 0;

            for (const row of rows) {
                if (existingIds.has(row.job_card_id)) { skipped++; continue; }

                const email = row.user_id?.toLowerCase();
                const targetUser = userMap[email];

                try {
                    await addDoc(collection(db, 'tasks'), {
                        // Core task fields (same schema as user management tasks)
                        title: `[${row.job_card_id}] ${row.description}`,
                        description: `Train: ${row.train_id}\nWork Order: ${row.work_order_no}\nType: ${row.job_type}\nDepartment: ${row.assigned_department}\nDue: ${row.due_datetime}`,
                        priority: mapPriority(row.priority),
                        dueDate: row.due_datetime?.split(' ')[0] || null,
                        status: mapStatus(row.status),
                        assignedTo: targetUser?.uid || null,
                        assignedToEmail: targetUser?.email || row.user_id,
                        assignedToName: targetUser?.displayName || targetUser?.email || row.user_id,
                        createdBy: currentUser.uid,
                        createdAt: serverTimestamp(),

                        // Job-card specific fields
                        isJobCard: true,
                        csvFileName: file.name,
                        sourceJobCardId: row.job_card_id,
                        sourceTrainId: row.train_id,
                        sourceWorkOrder: row.work_order_no,
                        jobType: row.job_type,
                        department: row.assigned_department,
                        phone: row.phone_number || null,
                        reportedDatetime: row.reported_datetime || null,
                        completedDatetime: row.completed_datetime || null,
                        notifiedApp: !!targetUser,   // true if user found = task visible on app
                        notifiedWhatsApp: false,
                    });
                    created++;
                } catch (e) {
                    console.error('Task create error:', e);
                    failed++;
                }
            }

            await loadTasks(file.name);
            showToast(
                skipped > 0
                    ? `✅ ${created} tasks created · ${skipped} already existed · ${failed} failed`
                    : `✅ ${created}/${rows.length} tasks created & sent to app`
            );
        } catch (e) {
            console.error('Upload error:', e);
            showToast('Upload failed: ' + e.message, 'error');
        } finally {
            setUploading(false);
        }
    }, [currentUser, loadTasks]);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    };

    // ── Status change — update single task doc directly ─────────────────────
    const handleStatusChange = async (taskId, newStatus) => {
        setUpdatingTask(taskId);
        try {
            const extra = newStatus === 'completed'
                ? { completedDatetime: new Date().toISOString().slice(0, 16).replace('T', ' ') }
                : {};
            await updateDoc(doc(db, 'tasks', taskId), { status: newStatus, ...extra });
            // Update local state directly — no reload needed
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: newStatus, ...extra } : t
            ));
        } catch (e) {
            console.error('Status update error:', e);
            showToast('Failed to update status', 'error');
        } finally {
            setUpdatingTask(null);
        }
    };

    // ── Filters ──────────────────────────────────────────────────────────────
    const displayTasks = batchTasks.filter(t => {
        const q = search.toLowerCase();
        const matchSearch = !q ||
            t.sourceJobCardId?.toLowerCase().includes(q) ||
            t.sourceTrainId?.toLowerCase().includes(q) ||
            t.title?.toLowerCase().includes(q) ||
            t.assignedToEmail?.toLowerCase().includes(q) ||
            t.department?.toLowerCase().includes(q);

        const statusLabel = STATUS_DISPLAY[t.status]?.label || '';
        const matchStatus = filterStatus === 'All' || statusLabel === filterStatus;
        const priorityLabel = PRIORITY_MAP[t.priority] || 'Medium';
        const matchPriority = filterPriority === 'All' || priorityLabel === filterPriority;

        return matchSearch && matchStatus && matchPriority;
    });

    const stats = batchTasks.length ? {
        total: batchTasks.length,
        pending: batchTasks.filter(t => t.status === 'pending').length,
        inProgress: batchTasks.filter(t => t.status === 'in_progress').length,
        completed: batchTasks.filter(t => t.status === 'completed').length,
        highPending: batchTasks.filter(t => t.priority === 'high' && t.status !== 'completed').length,
    } : null;

    if (authLoading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2
          ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'}`}>
                    {toast.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {toast.msg}
                </div>
            )}

            {/* WhatsApp modal */}
            {showWhatsApp && activeCsv && (
                <WhatsAppModal
                    tasks={batchTasks}
                    csvFileName={activeCsv}
                    currentUser={currentUser}
                    onClose={() => setShowWhatsApp(false)}
                    onDone={() => { setShowWhatsApp(false); loadTasks(activeCsv); }}
                />
            )}

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <FileText className="h-8 w-8" /> Job Cards
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Upload CSV → tasks created automatically · WhatsApp on demand
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/cleaning-teams">
                            <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl font-medium hover:bg-gray-50 text-sm">
                                cleaning team
                            </button>
                        </Link>
                        <button onClick={() => loadTasks(activeCsv)}
                            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl font-medium hover:bg-gray-50 text-sm">
                            <RefreshCw className="h-4 w-4" /> Refresh
                        </button>
                        {batchTasks.length > 0 && activeCsv !== '__all__' && (
                            <button onClick={() => setShowWhatsApp(true)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 text-sm">
                                <MessageSquare className="h-4 w-4" /> Send WhatsApp
                            </button>
                        )}

                    </div>
                </div>

                {/* Critical alert */}
                {batchTasks.length > 0 && <CriticalAlertBanner tasks={batchTasks} />}

                {/* Upload zone */}
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
            ${dragOver ? 'border-gray-900 bg-gray-100' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
                >
                    <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                        onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
                    {uploading ? (
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                            <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
                            <p className="font-medium">Creating tasks & notifying staff on app…</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                            <Upload className="h-10 w-10 text-gray-400" />
                            <p className="font-semibold text-gray-700">Drop CSV here or click to browse</p>
                            <p className="text-xs text-gray-400">
                                Tasks created instantly in the app · Duplicate job cards are skipped · WhatsApp sent separately
                            </p>
                        </div>
                    )}
                </div>

                {/* Batch tabs */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-gray-700 flex-shrink-0">View:</p>
                    <button onClick={() => setActiveCsv('__all__')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeCsv === '__all__' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>
                        All Tasks · {tasks.length}
                    </button>
                    {csvFiles.map(name => (
                        <button key={name} onClick={() => setActiveCsv(name)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeCsv === name ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}>
                            {name} · {tasks.filter(t => t.csvFileName === name).length}
                        </button>
                    ))}
                </div>

                {/* Stats */}
                {
                    stats && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {[
                                { label: 'Total', value: stats.total, color: 'border-gray-200 text-gray-900' },
                                { label: 'Pending', value: stats.pending, color: 'border-slate-200 text-slate-700' },
                                { label: 'In Progress', value: stats.inProgress, color: 'border-blue-200 text-blue-700' },
                                { label: 'Completed', value: stats.completed, color: 'border-green-200 text-green-700' },
                                {
                                    label: 'High Pending', value: stats.highPending, sub: 'Train blocked',
                                    color: stats.highPending > 0 ? 'border-red-300 text-red-700 bg-red-50' : 'border-gray-200 text-gray-900'
                                },
                            ].map(s => (
                                <div key={s.label} className={`bg-white rounded-xl border p-5 ${s.color}`}>
                                    <p className="text-3xl font-bold">{s.value}</p>
                                    <p className="text-sm font-medium mt-1">{s.label}</p>
                                    {s.sub && <p className="text-xs mt-0.5 opacity-70">{s.sub}</p>}
                                </div>
                            ))}
                        </div>
                    )
                }

                {/* Task list */}
                {
                    activeCsv && (
                        <div className="bg-white rounded-xl border border-gray-200">
                            <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-100">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input value={search} onChange={e => setSearch(e.target.value)}
                                        placeholder="Search job ID, train, description, user…"
                                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                                </div>
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                                    <option value="All">All Status</option>
                                    <option value="Pending">Pending</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Completed">Completed</option>
                                </select>
                                <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                                    <option value="All">All Priority</option>
                                    <option value="High">High</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Low">Low</option>
                                </select>
                                <p className="text-xs text-gray-400 self-center whitespace-nowrap">
                                    {displayTasks.length} of {batchTasks.length}
                                </p>
                            </div>

                            <div className="p-4 space-y-2">
                                {loadingTasks ? (
                                    <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-300" /></div>
                                ) : displayTasks.length === 0 ? (
                                    <div className="text-center py-12 text-gray-400">
                                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">No tasks match your filters</p>
                                    </div>
                                ) : (
                                    displayTasks.map(task => (
                                        <JobCardRow
                                            key={task.id}
                                            task={task}
                                            onStatusChange={handleStatusChange}
                                            updating={updatingTask}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    )
                }

                {
                    !loadingTasks && !tasks.length && (
                        <div className="text-center py-16 text-gray-400">
                            <FileText className="h-16 w-16 mx-auto mb-4 opacity-20" />
                            <p className="text-lg font-medium text-gray-500">No job cards yet</p>
                            <p className="text-sm mt-1">Drop a CSV file above to get started</p>
                        </div>
                    )
                }

            </main >
        </div >
    );
}