"use client";
import React, { useState, useEffect } from 'react';
import {
    Brush, AlertTriangle, CheckCircle, Clock, Users,
    X, Loader2, UserCheck, CalendarDays, Layers,
    CircleDot, CircleCheck, Circle, RefreshCw, Train,
    Send, Phone
} from 'lucide-react';
import {
    collection, query, orderBy, onSnapshot,
    getDocs, addDoc, serverTimestamp, where, getDoc, doc as firestoreDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_WHATSAPP_API || 'http://localhost:5000';

// ─── Task Status Badge (unchanged) ─────────────────────────────────────────────
function TaskStatusBadge({ taskInfo }) {
    if (!taskInfo) {
        return (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 border border-gray-200 px-2 py-1 rounded-full">
                <Circle className="h-3 w-3" />
                Not assigned
            </span>
        );
    }
    if (taskInfo.status === 'completed') {
        return (
            <div className="space-y-0.5">
                <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-full font-medium">
                    <CircleCheck className="h-3 w-3" />
                    Done
                </span>
                <p className="text-xs text-gray-400 pl-1">{taskInfo.assignedToName}</p>
            </div>
        );
    }
    if (taskInfo.status === 'in_progress') {
        return (
            <div className="space-y-0.5">
                <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-100 border border-blue-200 px-2 py-1 rounded-full font-medium">
                    <CircleDot className="h-3 w-3" />
                    In progress
                </span>
                <p className="text-xs text-gray-400 pl-1">{taskInfo.assignedToName}</p>
            </div>
        );
    }
    return (
        <div className="space-y-0.5">
            <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-100 border border-orange-200 px-2 py-1 rounded-full font-medium">
                <Clock className="h-3 w-3" />
                Pending
            </span>
            <p className="text-xs text-gray-400 pl-1">{taskInfo.assignedToName}</p>
        </div>
    );
}

// ─── Helper: Send WhatsApp to all team members ────────────────────────────────
async function sendWhatsAppToTeam(record, teamData, currentUser) {
    const recipients = [];
    // Leader
    if (teamData.leaderPhone) {
        recipients.push({
            name: teamData.leaderName || teamData.leaderEmail,
            phone: teamData.leaderPhone,
            role: 'leader'
        });
    }
    // Members
    (teamData.members || []).forEach(m => {
        if (m.phone) recipients.push({ name: m.name, phone: m.phone, role: 'member' });
    });

    if (recipients.length === 0) return { success: false, error: 'No phone numbers found in team' };

    const trainId = record.train_id || record.sourceTrainId || 'Unknown Train';
    const cleaningType = record.cleaning_type || record.cleaningType || 'Cleaning';
    const slotStart = record.slot_start || '';
    const slotEnd = record.slot_end || '';
    const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const message = `🧹 *Cleaning Task Assigned*\n\nTrain: ${trainId}\nType: ${cleaningType}\nDate: ${date}\n${slotStart ? `Slot: ${slotStart.replace('T', ' ')} – ${slotEnd.replace('T', ' ')}` : ''}\n\nPlease check the KMRL app for details and update status.\n\n— KMRL Operations`;

    const results = [];
    for (const r of recipients) {
        try {
            const res = await fetch(`${API_URL}/api/whatsapp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.uid,
                    phone: r.phone.replace(/\D/g, ''),
                    message
                }),
            });
            const data = await res.json();
            results.push({ ...r, ok: data.success, error: data.error });
        } catch (err) {
            results.push({ ...r, ok: false, error: err.message });
        }
    }
    return { success: results.some(r => r.ok), results };
}

// ─── Assign Modal (auto‑assigns to team leader) ───────────────────────────────
function AssignCleaningModal({ record, onClose, currentUser }) {
    const [teamData, setTeamData] = useState(null);
    const [loadingTeam, setLoadingTeam] = useState(true);
    const [note, setNote] = useState('');
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    // Fetch the cleaning team (by team_name or team_id)
    useEffect(() => {
        const loadTeam = async () => {
            try {
                let teamQuery;
                if (record.team_id) {
                    const teamDoc = await getDoc(firestoreDoc(db, 'cleaningTeams', record.team_id));
                    if (teamDoc.exists()) {
                        setTeamData({ id: teamDoc.id, ...teamDoc.data() });
                        setLoadingTeam(false);
                        return;
                    }
                }
                // Fallback: search by team_name
                const q = query(collection(db, 'cleaningTeams'), where('name', '==', record.team_name));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const doc = snap.docs[0];
                    setTeamData({ id: doc.id, ...doc.data() });
                } else {
                    setError(`No cleaning team found for "${record.team_name || 'Unknown'}"`);
                }
            } catch (err) {
                console.error('Failed to load team:', err);
                setError('Could not load team details.');
            } finally {
                setLoadingTeam(false);
            }
        };
        loadTeam();
    }, [record.team_id, record.team_name]);

    const trainId = record.train_id || record.sourceTrainId || 'Unknown Train';
    const teamName = record.team_name || record.cleaningTeam || 'Unknown Team';
    const cleaningType = record.cleaning_type || record.cleaningType || 'Cleaning';
    const slotStart = record.slot_start || '';
    const slotEnd = record.slot_end || '';
    const remarks = record.remarks || '';

    const taskTitle = `[Cleaning] ${cleaningType} — ${trainId}`;
    const taskDesc = [
        `Train: ${trainId}`,
        `Type: ${cleaningType}`,
        slotStart ? `Slot: ${slotStart.replace('T', ' ')} – ${slotEnd.replace('T', ' ')}` : '',
        teamName ? `Team: ${teamName}` : '',
        note ? `Note: ${note}` : '',
    ].filter(Boolean).join('\n');

    const handleAssign = async () => {
        if (!teamData || !teamData.leaderId) {
            setError('No team leader found for this cleaning team.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await addDoc(collection(db, 'tasks'), {
                title: taskTitle,
                description: taskDesc,
                priority,
                dueDate: dueDate || null,
                assignedTo: teamData.leaderId,
                assignedToEmail: teamData.leaderEmail,
                assignedToName: teamData.leaderName || teamData.leaderEmail,
                status: 'pending',
                createdBy: currentUser.uid,
                createdAt: serverTimestamp(),
                sourceCleaningId: record.id,
                sourceTrainId: trainId,
                cleaningTeam: teamName,
                cleaningType,
                isCleaningTask: true,
                isJobCard: false,
                notifiedApp: true,
                notifiedWhatsApp: false,
            });
            setSaved(true);
            setTimeout(() => onClose(), 1500);
        } catch (e) {
            console.error('Assign cleaning error:', e);
            setError('Failed to assign task. Try again.');
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                            <Brush className="h-5 w-5 text-teal-500" />
                            Assign Cleaning Task
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">{cleaningType} · {trainId}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {saved ? (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                        <p className="font-semibold text-gray-900">Cleaning Task Assigned!</p>
                        <p className="text-sm text-gray-500 mt-1">The team leader will see it on their app.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-6 space-y-4">
                            {/* Context card */}
                            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm">
                                <p className="font-semibold text-gray-900 mb-1">{taskTitle}</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {slotStart && (
                                        <span className="text-xs bg-teal-100 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">
                                            {slotStart.replace('T', ' ')} – {slotEnd.replace('T', ' ')}
                                        </span>
                                    )}
                                    {teamName && (
                                        <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">
                                            Team: {teamName}
                                        </span>
                                    )}
                                    {remarks && (
                                        <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">
                                            {remarks}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Team leader info (auto‑assigned) */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                    Assign to (Team Leader)
                                </label>
                                {loadingTeam ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
                                    </div>
                                ) : teamData ? (
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                            <UserCheck className="h-4 w-4 text-gray-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{teamData.leaderName || teamData.leaderEmail}</p>
                                            {teamData.leaderPhone && (
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Phone className="h-3 w-3" /> {teamData.leaderPhone}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-red-500">Team leader not found</p>
                                )}
                            </div>

                            {/* Priority + Due Date */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Priority</label>
                                    <select
                                        value={priority}
                                        onChange={e => setPriority(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
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
                                        value={dueDate}
                                        onChange={e => setDueDate(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                                    />
                                </div>
                            </div>

                            {/* Note */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Additional Note</label>
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Any extra instructions for the staff member…"
                                    rows={2}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                                />
                            </div>
                        </div>

                        {/* Footer buttons */}
                        <div className="flex gap-3 p-6 pt-0">
                            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleAssign}
                                disabled={saving || loadingTeam || !teamData}
                                className="flex-1 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
                            >
                                {saving
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning…</>
                                    : <><UserCheck className="h-4 w-4" /> Assign to Leader</>
                                }
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────
const CleaningTasksPage = () => {
    const { user: currentUser } = useAuth();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [assignTarget, setAssignTarget] = useState(null);
    const [cleaningTaskMap, setCleaningTaskMap] = useState({});
    const [stats, setStats] = useState({
        total: 0, assigned: 0, pending: 0, completed: 0, inProgress: 0,
    });
    const [notifyingId, setNotifyingId] = useState(null);
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Real‑time cleaning records
    useEffect(() => {
        const q = query(collection(db, 'cleaningTasks'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setRecords(data);
            calculateStats(data);
            setLoading(false);
        }, (err) => {
            console.error('Error fetching cleaning records:', err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Real‑time task statuses
    useEffect(() => {
        const q = query(collection(db, 'tasks'), where('sourceCleaningId', '!=', null));
        const unsubscribe = onSnapshot(q, (snap) => {
            const map = {};
            const rank = { completed: 3, in_progress: 2, pending: 1 };
            snap.forEach(doc => {
                const t = doc.data();
                if (!t.sourceCleaningId) return;
                const existing = map[t.sourceCleaningId];
                if (!existing || (rank[t.status] || 0) > (rank[existing.status] || 0)) {
                    map[t.sourceCleaningId] = {
                        status: t.status,
                        assignedToName: t.assignedToName || t.assignedToEmail || 'Unknown',
                    };
                }
            });
            setCleaningTaskMap(map);
        }, (err) => {
            console.warn('Cleaning task status listener:', err.message);
        });
        return () => unsubscribe();
    }, []);

    const calculateStats = (data) => {
        setStats({
            total: data.length,
            assigned: data.filter(r => r.status === 'Assigned').length,
            pending: data.filter(r => r.status === 'Scheduled' || !r.status).length,
            inProgress: data.filter(r => r.status === 'In Progress').length,
            completed: data.filter(r => r.status === 'Completed').length,
        });
    };

    const getTypeBadge = (type) => {
        switch (type?.toLowerCase()) {
            case 'deep clean': return 'bg-blue-100 text-blue-800 border border-blue-200';
            case 'emergency clean': return 'bg-red-100 text-red-800 border border-red-200';
            case 'detailing': return 'bg-purple-100 text-purple-800 border border-purple-200';
            case 'weekly maintenance': return 'bg-orange-100 text-orange-800 border border-orange-200';
            default: return 'bg-teal-100 text-teal-800 border border-teal-200';
        }
    };

    const getStatusBadge = (status) => {
        switch (status?.toLowerCase()) {
            case 'completed': return 'bg-green-100 text-green-800 border border-green-200';
            case 'in progress': return 'bg-blue-100 text-blue-800 border border-blue-200';
            case 'assigned': return 'bg-orange-100 text-orange-800 border border-orange-200';
            default: return 'bg-gray-100 text-gray-800 border border-gray-200';
        }
    };

    const formatTimestamp = (ts) => {
        if (!ts) return 'N/A';
        try {
            const d = ts.toDate ? ts.toDate() : new Date(ts);
            return new Intl.DateTimeFormat('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }).format(d);
        } catch { return 'N/A'; }
    };

    const formatSlot = (slot) => {
        if (!slot) return '—';
        return slot.replace('T', ' ').slice(0, 16);
    };

    // WhatsApp notification handler
    const handleNotifyTeam = async (record) => {
        setNotifyingId(record.id);
        try {
            // Fetch team data (same as in modal)
            let teamData = null;
            if (record.team_id) {
                const teamDoc = await getDoc(firestoreDoc(db, 'cleaningTeams', record.team_id));
                if (teamDoc.exists()) teamData = { id: teamDoc.id, ...teamDoc.data() };
            }
            if (!teamData && record.team_name) {
                const q = query(collection(db, 'cleaningTeams'), where('name', '==', record.team_name));
                const snap = await getDocs(q);
                if (!snap.empty) teamData = { id: snap.docs[0].id, ...snap.docs[0].data() };
            }
            if (!teamData) {
                showToast(`Team "${record.team_name}" not found`, 'error');
                return;
            }
            const result = await sendWhatsAppToTeam(record, teamData, currentUser);
            if (result.success) {
                const sentCount = result.results.filter(r => r.ok).length;
                showToast(`WhatsApp sent to ${sentCount} / ${result.results.length} contacts`);
            } else {
                showToast(`Failed: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('WhatsApp sending failed', 'error');
        } finally {
            setNotifyingId(null);
        }
    };

    const recentRecords = records.slice(0, 5);
    const urgentRecords = records.filter(r =>
        (r.status === 'Assigned' || r.status === 'Scheduled') &&
        (r.cleaning_type === 'Emergency Clean' || r.cleaning_type === 'Deep Clean')
    ).slice(0, 5);

    const AssignBtn = ({ record }) => (
        <button
            onClick={() => setAssignTarget(record)}
            className="inline-flex items-center gap-1.5 font-medium rounded-lg transition-colors bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 px-2.5 py-1 text-xs whitespace-nowrap"
        >
            <UserCheck className="h-3.5 w-3.5" />
            Assign
        </button>
    );

    const NotifyBtn = ({ record }) => (
        <button
            onClick={() => handleNotifyTeam(record)}
            disabled={notifyingId === record.id}
            className="inline-flex items-center gap-1.5 font-medium rounded-lg transition-colors bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 text-xs whitespace-nowrap disabled:opacity-50"
        >
            {notifyingId === record.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <Send className="h-3.5 w-3.5" />
            )}
            Notify Team
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white max-w-sm ${toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
                    {toast.type === 'error' ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle className="h-4 w-4 shrink-0" />}
                    {toast.msg}
                </div>
            )}

            {/* Assign Modal */}
            {assignTarget && currentUser && (
                <AssignCleaningModal
                    record={assignTarget}
                    currentUser={currentUser}
                    onClose={() => setAssignTarget(null)}
                />
            )}

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Page Header */}
                <div className="mb-6">
                    <div className="flex items-center mb-2">
                        <Brush className="h-8 w-8 mr-3 text-gray-900" />
                        <h2 className="text-3xl font-bold text-gray-900">Cleaning Tasks</h2>
                    </div>
                    <p className="text-sm text-gray-600 max-w-4xl">
                        Live view of all cleaning assignments across the fleet. Assign tasks directly to team leaders and notify the whole team via WhatsApp.
                    </p>
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                    {[
                        { label: 'Total Records', value: stats.total, sub: 'All time', icon: <Layers className="h-5 w-5 text-gray-400" />, cls: 'text-gray-900' },
                        { label: 'Scheduled', value: stats.pending, sub: 'Awaiting start', icon: <Clock className="h-5 w-5 text-orange-400" />, cls: 'text-orange-600', subcls: 'text-orange-600' },
                        { label: 'Assigned', value: stats.assigned, sub: 'Task created', icon: <UserCheck className="h-5 w-5 text-blue-400" />, cls: 'text-blue-600', subcls: 'text-blue-600' },
                        { label: 'In Progress', value: stats.inProgress, sub: 'Being cleaned', icon: <RefreshCw className="h-5 w-5 text-purple-400" />, cls: 'text-purple-600', subcls: 'text-purple-600' },
                        { label: 'Completed', value: stats.completed, sub: 'Done today', icon: <CheckCircle className="h-5 w-5 text-green-400" />, cls: 'text-green-600', subcls: 'text-green-600' },
                    ].map(({ label, value, sub, icon, cls, subcls }) => (
                        <div key={label} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">{label}</span>
                                {icon}
                            </div>
                            <div className={`text-3xl font-bold ${cls}`}>{value}</div>
                            <div className={`text-xs mt-1 ${subcls || 'text-gray-600'}`}>{sub}</div>
                        </div>
                    ))}
                </div>

                {/* Recent + Urgent */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {/* Recent Cleaning Records */}
                    <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center">
                                <Clock className="h-5 w-5 mr-2" />
                                <h3 className="text-lg font-semibold text-gray-900">Recent Cleaning Records</h3>
                            </div>
                            <span className="text-sm text-gray-500">{records.length} total</span>
                        </div>

                        {loading ? (
                            <div className="text-center py-8 text-gray-500">Loading records...</div>
                        ) : records.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <Brush className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                                <p>No cleaning records yet</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-200">
                                            <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Train</th>
                                            <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Type</th>
                                            <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Team</th>
                                            <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Slot</th>
                                            <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Status</th>
                                            <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Task</th>
                                            <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentRecords.map((rec) => (
                                            <tr key={rec.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="py-4 px-4 text-sm font-medium text-gray-900">{rec.train_id || '—'}</td>
                                                <td className="py-4 px-4">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(rec.cleaning_type)}`}>
                                                        {rec.cleaning_type || 'Daily Clean'}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-sm text-gray-700">{rec.team_name || '—'}</td>
                                                <td className="py-4 px-4 text-xs text-gray-500">{formatSlot(rec.slot_start)}</td>
                                                <td className="py-4 px-4">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(rec.status)}`}>
                                                        {rec.status || 'Scheduled'}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4">
                                                    <TaskStatusBadge taskInfo={cleaningTaskMap[rec.id]} />
                                                </td>
                                                <td className="py-4 px-4">
                                                    <div className="flex gap-2">
                                                        <AssignBtn record={rec} />
                                                        <NotifyBtn record={rec} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Urgent Records */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center mb-4">
                            <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
                            <h3 className="text-lg font-semibold text-gray-900">Urgent / Deep Cleans</h3>
                        </div>
                        <div className="text-xs text-gray-500 mb-4">Emergency and deep cleans requiring immediate assignment</div>

                        {urgentRecords.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-300" />
                                <p className="text-sm">No urgent cleans pending</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {urgentRecords.map((rec) => (
                                    <div key={rec.id} className="border border-orange-200 bg-orange-50 rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                                                <Train className="h-3.5 w-3.5 text-gray-500" />
                                                {rec.train_id || '—'}
                                            </span>
                                            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getTypeBadge(rec.cleaning_type)}`}>
                                                {rec.cleaning_type}
                                            </span>
                                        </div>
                                        <div className="text-sm font-medium text-gray-900 mb-1">{rec.team_name || 'No team assigned'}</div>
                                        <div className="text-xs text-gray-600 mb-2">{formatSlot(rec.slot_start)}</div>
                                        {rec.remarks && (
                                            <div className="text-xs text-gray-500 italic mb-2 line-clamp-2">{rec.remarks}</div>
                                        )}
                                        <div className="mb-3">
                                            <TaskStatusBadge taskInfo={cleaningTaskMap[rec.id]} />
                                        </div>
                                        <div className="pt-2 border-t border-orange-200 flex gap-2">
                                            <AssignBtn record={rec} />
                                            <NotifyBtn record={rec} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* All Cleaning Records Table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center">
                            <Users className="h-5 w-5 mr-2" />
                            <h3 className="text-lg font-semibold text-gray-900">All Cleaning Records</h3>
                        </div>
                        <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
                            Export Report
                        </button>
                    </div>

                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : records.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <Brush className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg font-medium mb-2">No cleaning records yet</p>
                            <p className="text-sm">Submit cleaning data via the Induction Form on the mobile app</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Train</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Cleaning Type</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Team</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Slot Start</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Slot End</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Record Status</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Assigned By</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Created</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Task Status</th>
                                        <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map((rec) => (
                                        <tr key={rec.id} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="py-4 px-4 text-sm font-medium text-gray-900">{rec.train_id || '—'}</td>
                                            <td className="py-4 px-4">
                                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(rec.cleaning_type)}`}>
                                                    {rec.cleaning_type || 'Daily Clean'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-sm text-gray-700">{rec.team_name || '—'}</td>
                                            <td className="py-4 px-4 text-sm text-gray-500">{formatSlot(rec.slot_start)}</td>
                                            <td className="py-4 px-4 text-sm text-gray-500">{formatSlot(rec.slot_end)}</td>
                                            <td className="py-4 px-4">
                                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(rec.status)}`}>
                                                    {rec.status || 'Scheduled'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-sm text-gray-700">
                                                <div className="max-w-xs truncate" title={rec.assignedByName}>
                                                    {rec.assignedByName || '—'}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 text-sm text-gray-500">{formatTimestamp(rec.createdAt)}</td>
                                            <td className="py-4 px-4">
                                                <TaskStatusBadge taskInfo={cleaningTaskMap[rec.id]} />
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex gap-2">
                                                    <AssignBtn record={rec} />
                                                    <NotifyBtn record={rec} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default CleaningTasksPage;