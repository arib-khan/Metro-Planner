"use client";
/**
 * AssignCleaningTaskModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in modal for the Cleaning page.
 * Mirrors exactly how AssignFixModal works in PhotoInspections, but adapted
 * for cleaning slots:
 *
 *  - Team is ALREADY known from the induction form's cleaning_slot
 *  - All task data (cleaning_type, slot_start, slot_end, train_id) is
 *    pre-populated from the slot — no need for the admin to re-enter it
 *  - Task is written to the `tasks` collection (same schema as photo tasks)
 *    with sourceCleaningSlotId so the cleaning page can show status badges
 *  - WhatsApp notification is sent to the team leader's phone number via
 *    the wa.me deep-link (works on both mobile and desktop — opens WhatsApp
 *    with a pre-filled message). For server-side delivery (Cloud Functions /
 *    WhatsApp Business API), swap sendWhatsApp() with your own integration.
 *
 * Props:
 *   slot        — one cleaning_slot object (from trainDailyData.cleaning_slots)
 *                 { cleaning_type, assigned_team, slot_start, slot_end, status }
 *   trainId     — string e.g. "KMRL-1"
 *   date        — 'YYYY-MM-DD'
 *   onClose     — () => void
 *   currentUser — firebase auth user object (from useAuth())
 *
 * Usage in the Cleaning page:
 *   {assignTarget && (
 *     <AssignCleaningTaskModal
 *       slot={assignTarget.slot}
 *       trainId={assignTarget.trainId}
 *       date={assignTarget.date}
 *       currentUser={currentUser}
 *       onClose={() => setAssignTarget(null)}
 *     />
 *   )}
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
    X, CheckCircle, Loader2, UserCheck,
    MessageCircle, ClipboardList, Train, Clock,
    CalendarDays, Sparkles
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useCleaningTeams } from '../utils/useCleaningTeams';
// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(datetimeStr) {
    if (!datetimeStr) return '—';
    try {
        return new Intl.DateTimeFormat('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true,
        }).format(new Date(datetimeStr));
    } catch { return datetimeStr; }
}

/**
 * Opens WhatsApp with a pre-filled message to the leader's phone.
 * phone should be in international format WITHOUT '+' or spaces, e.g. "919876543210"
 * For server-side sending, replace this with your Cloud Function call.
 */
function sendWhatsApp(phone, message) {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
}

function buildWhatsAppMessage({ teamName, leaderName, trainId, cleaningType, slotStart, slotEnd, date, note }) {
    return [
        `🚇 *KMRL Cleaning Task Assigned*`,
        ``,
        `Hello ${leaderName || teamName},`,
        `You have been assigned a cleaning task:`,
        ``,
        `• *Train:* ${trainId}`,
        `• *Type:* ${cleaningType}`,
        `• *Date:* ${date}`,
        `• *Start:* ${fmt(slotStart)}`,
        `• *End:* ${fmt(slotEnd)}`,
        note ? `• *Note:* ${note}` : null,
        ``,
        `Please acknowledge and proceed on time. Open the KMRL app to update status.`,
        ``,
        `— KMRL Operations`,
    ].filter(v => v !== null).join('\n');
}

// ── Status pill (same style as PhotoInspections TaskStatusBadge) ──────────────
function SlotStatusPill({ status }) {
    const map = {
        Scheduled: 'bg-orange-100 text-orange-700 border-orange-200',
        'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
        Completed: 'bg-green-100 text-green-700 border-green-200',
        Pending: 'bg-gray-100 text-gray-600 border-gray-200',
    };
    const cls = map[status] || 'bg-gray-100 text-gray-600 border-gray-200';
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
            {status || 'Unknown'}
        </span>
    );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function AssignCleaningTaskModal({ slot, trainId, date, onClose, currentUser }) {
    const { getTeamByName, loading: teamsLoading } = useCleaningTeams();

    const [note, setNote] = useState('');
    const [priority, setPriority] = useState('high');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [notified, setNotified] = useState(false);
    const [error, setError] = useState('');

    const team = getTeamByName(slot?.assigned_team);
    const leaderPhone = team?.leaderPhone || '';
    const leaderName = team?.leaderName || '';
    const teamName = slot?.assigned_team || 'Unassigned';
    const cleaningType = slot?.cleaning_type || 'Cleaning';

    const taskTitle = `${cleaningType} — ${trainId} (${date})`;

    // ── Write task to Firestore (same `tasks` collection as PhotoInspections) ──
    const handleAssign = async () => {
        if (!slot) { setError('No slot data provided.'); return; }
        setSaving(true);
        setError('');
        try {
            const taskDoc = {
                // Core task fields (shared schema with photo fix tasks)
                title: taskTitle,
                description: [
                    `Cleaning Type: ${cleaningType}`,
                    `Train: ${trainId}`,
                    `Date: ${date}`,
                    `Slot: ${fmt(slot.slot_start)} – ${fmt(slot.slot_end)}`,
                    note ? `Note: ${note}` : '',
                ].filter(Boolean).join('\n'),
                priority,
                dueDate: date,
                status: 'pending',

                // Assigned to team leader
                assignedTo: team?.leaderId || null,
                assignedToName: leaderName || teamName,
                assignedToPhone: leaderPhone || null,

                // Who created it
                createdBy: currentUser?.uid || null,
                createdByName: currentUser?.displayName || currentUser?.email || null,
                createdAt: serverTimestamp(),

                // Cleaning-specific linkage
                taskType: 'cleaning',
                sourceTrainId: trainId,
                sourceDate: date,
                sourceCleaningType: cleaningType,
                sourceTeamName: teamName,
                sourceSlotStart: slot.slot_start || null,
                sourceSlotEnd: slot.slot_end || null,
            };

            await addDoc(collection(db, 'tasks'), taskDoc);
            setSaved(true);
        } catch (e) {
            console.error('AssignCleaningTask error:', e);
            setError('Failed to assign task. Please try again.');
            setSaving(false);
        }
    };

    // ── WhatsApp notification ─────────────────────────────────────────────────
    const handleNotify = () => {
        const msg = buildWhatsAppMessage({
            teamName,
            leaderName,
            trainId,
            cleaningType,
            slotStart: slot?.slot_start,
            slotEnd: slot?.slot_end,
            date,
            note,
        });
        sendWhatsApp(leaderPhone, msg);
        setNotified(true);
    };

    // ── Loading state ─────────────────────────────────────────────────────────
    if (teamsLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-10 flex items-center gap-3 shadow-2xl">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-500">Loading team data…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 overflow-hidden">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-blue-500" />
                            Assign Cleaning Task
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">{cleaningType} · {trainId} · {date}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* ── Success state ── */}
                {saved ? (
                    <div className="p-10 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                        <p className="font-semibold text-gray-900 text-base">Task Assigned!</p>
                        <p className="text-sm text-gray-500 mt-1 mb-6">
                            {leaderName || teamName} will see it in their app.
                        </p>

                        {/* WhatsApp notify button — shown after task is saved */}
                        {leaderPhone ? (
                            <button
                                onClick={handleNotify}
                                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all
                  ${notified
                                        ? 'bg-green-100 text-green-700 border border-green-200 cursor-default'
                                        : 'bg-[#25D366] hover:bg-[#1ebe5d] text-white shadow-md hover:shadow-lg'
                                    }`}
                                disabled={notified}
                            >
                                <MessageCircle className="h-4 w-4" />
                                {notified ? 'WhatsApp Opened ✓' : `Notify on WhatsApp`}
                            </button>
                        ) : (
                            <p className="text-xs text-gray-400">
                                No phone number on record for this team leader — WhatsApp notification unavailable.
                            </p>
                        )}

                        <button
                            onClick={onClose}
                            className="block mx-auto mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
                        >
                            Close
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="px-6 py-5 space-y-4">

                            {/* ── Slot summary card (pre-filled from induction form) ── */}
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2.5">
                                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                                    From Induction Form
                                </p>

                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <Train className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                                        <span className="font-medium">{trainId}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <Sparkles className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                                        <span>{cleaningType}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <CalendarDays className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                                        <span>{date}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <Clock className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                                        <span>{fmt(slot?.slot_start)} – {fmt(slot?.slot_end)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-blue-200 mt-1">
                                    <SlotStatusPill status={slot?.status} />
                                </div>
                            </div>

                            {/* ── Assigned team (already known — read-only) ── */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                    Assigned Team
                                </label>
                                <div className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50">
                                    {team?.color && (
                                        <span
                                            className="h-3 w-3 rounded-full flex-shrink-0 border border-white shadow"
                                            style={{ background: team.color }}
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{teamName}</p>
                                        {leaderName && (
                                            <p className="text-xs text-gray-500 truncate">
                                                Leader: {leaderName}
                                                {leaderPhone && ` · ${leaderPhone}`}
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                        Task will go to leader
                                    </span>
                                </div>
                                {!team && (
                                    <p className="text-xs text-orange-600 mt-1">
                                        ⚠ Team "{teamName}" not found in Firestore — task will still be created.
                                    </p>
                                )}
                            </div>

                            {/* ── Priority ── */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                    Priority
                                </label>
                                <select
                                    value={priority}
                                    onChange={e => setPriority(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>

                            {/* ── Additional note ── */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                    Additional Note <span className="font-normal text-gray-400">(optional)</span>
                                </label>
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Special instructions for the team leader…"
                                    rows={2}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>

                            {/* ── Error ── */}
                            {error && (
                                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                                    <span className="flex-shrink-0 mt-0.5">⚠</span>
                                    {error}
                                </div>
                            )}
                        </div>

                        {/* ── Footer buttons ── */}
                        <div className="flex gap-3 px-6 pb-6">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAssign}
                                disabled={saving}
                                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
                            >
                                {saving
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning…</>
                                    : <><UserCheck className="h-4 w-4" /> Assign Task</>
                                }
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}