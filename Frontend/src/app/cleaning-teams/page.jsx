// src/app/cleaning-teams/page.jsx
'use client';

/**
 * Cleaning Teams — Web Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore: cleaningTeams/{teamId}
 * {
 *   name:        string,           // "TEAM-A"
 *   color:       string,
 *   leaderId:    string,           // uid of the app user (department=Cleaning)
 *   leaderName:  string,
 *   leaderEmail: string,
 *   leaderPhone: string,
 *   members: [                     // plain contacts — NO app account needed
 *     { id: string, name: string, phone: string }
 *   ],
 *   createdAt, updatedAt, createdBy, updatedBy,
 *   lastBroadcastAt, lastBroadcastSent
 * }
 *
 * cleaningTasks/{taskId}  — written by mobile app on submit
 * {
 *   train_id, date, team_id, team_name, cleaning_type,
 *   slot_start, slot_end, remarks, status,
 *   assignedBy, assignedByName, createdAt,
 *   whatsappResults, whatsappSentAt, whatsappSentCount
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import {
    collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, where, limit
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
    Users, Plus, X, MessageSquare, Loader2, CheckCircle2,
    AlertTriangle, Phone, Pencil, Trash2, Send,
    RefreshCw, Search, ChevronDown, ChevronUp,
    Sparkles, Crown, UserPlus, Shield, ClipboardList,
    Calendar, CheckSquare, Clock
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_WHATSAPP_API || 'http://localhost:5000';

// ── Colour palette ────────────────────────────────────────────────────────────
const COLORS = [
    { id: 'blue', dot: 'bg-blue-500', ring: 'ring-blue-400', badge: 'bg-blue-100 text-blue-800 border-blue-200', bar: 'bg-blue-500', cardBg: 'bg-blue-50', text: 'text-blue-700' },
    { id: 'green', dot: 'bg-emerald-500', ring: 'ring-emerald-400', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500', cardBg: 'bg-emerald-50', text: 'text-emerald-700' },
    { id: 'amber', dot: 'bg-amber-500', ring: 'ring-amber-400', badge: 'bg-amber-100 text-amber-800 border-amber-200', bar: 'bg-amber-500', cardBg: 'bg-amber-50', text: 'text-amber-700' },
    { id: 'purple', dot: 'bg-violet-500', ring: 'ring-violet-400', badge: 'bg-violet-100 text-violet-800 border-violet-200', bar: 'bg-violet-500', cardBg: 'bg-violet-50', text: 'text-violet-700' },
    { id: 'rose', dot: 'bg-rose-500', ring: 'ring-rose-400', badge: 'bg-rose-100 text-rose-800 border-rose-200', bar: 'bg-rose-500', cardBg: 'bg-rose-50', text: 'text-rose-700' },
    { id: 'cyan', dot: 'bg-cyan-500', ring: 'ring-cyan-400', badge: 'bg-cyan-100 text-cyan-800 border-cyan-200', bar: 'bg-cyan-500', cardBg: 'bg-cyan-50', text: 'text-cyan-700' },
];
const gc = (id) => COLORS.find(c => c.id === id) || COLORS[0];

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid4 = () => Math.random().toString(36).slice(2, 10);
const ini = (s = '') => (s.trim().slice(0, 2) || '??').toUpperCase();
const fmtTs = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── Plain member row ──────────────────────────────────────────────────────────
function MemberRow({ member, onChange, onRemove }) {
    return (
        <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                {ini(member.name)}
            </div>
            <input
                value={member.name}
                onChange={e => onChange(member.id, 'name', e.target.value)}
                placeholder="Member name *"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900 min-w-0"
            />
            <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                <input
                    value={member.phone}
                    onChange={e => onChange(member.id, 'phone', e.target.value)}
                    placeholder="WhatsApp number"
                    className="w-40 pl-7 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900"
                />
            </div>
            <button onClick={() => onRemove(member.id)} className="p-1 text-gray-300 hover:text-red-500 shrink-0 transition-colors">
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

// ── Create / Edit Team Modal ──────────────────────────────────────────────────
function TeamModal({ appLeaders, existing, onClose, onSaved, currentUser }) {
    const isEdit = !!existing;

    const [teamName, setTeamName] = useState(existing?.name || '');
    const [color, setColor] = useState(existing?.color || 'blue');
    const [leaderId, setLeaderId] = useState(existing?.leaderId || '');
    const [members, setMembers] = useState(existing?.members || []);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [leaderSearch, setLeaderSearch] = useState('');

    const selectedLeader = appLeaders.find(u => u.uid === leaderId);
    const filteredLeaders = appLeaders.filter(u =>
        (u.displayName || u.email || '').toLowerCase().includes(leaderSearch.toLowerCase()) ||
        (u.phone || '').includes(leaderSearch)
    );

    const addMember = () => setMembers(m => [...m, { id: uid4(), name: '', phone: '' }]);
    const changeMember = (id, field, val) => setMembers(m => m.map(x => x.id === id ? { ...x, [field]: val } : x));
    const removeMember = (id) => setMembers(m => m.filter(x => x.id !== id));

    const handleSave = async () => {
        if (!teamName.trim()) { setErr('Team name is required'); return; }
        if (!leaderId) { setErr('Select a team leader'); return; }
        if (members.some(m => !m.name.trim())) { setErr('All members need a name'); return; }

        setSaving(true); setErr('');
        try {
            const leader = appLeaders.find(u => u.uid === leaderId);
            const payload = {
                name: teamName.trim(),
                color,
                leaderId,
                leaderName: leader?.displayName || leader?.email || '',
                leaderEmail: leader?.email || '',
                leaderPhone: leader?.phone || '',
                members: members.filter(m => m.name.trim()),
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.uid,
            };
            if (isEdit) {
                await updateDoc(doc(db, 'cleaningTeams', existing.id), payload);
            } else {
                await addDoc(collection(db, 'cleaningTeams'), { ...payload, createdAt: serverTimestamp(), createdBy: currentUser.uid });
            }
            onSaved();
        } catch (e) {
            console.error(e);
            if (e.code === 'permission-denied') {
                setErr('Permission denied — add the cleaningTeams rule to firestore.rules (see firestore.rules file).');
            } else {
                setErr('Failed to save: ' + e.message);
            }
            setSaving(false);
        }
    };

    const c = gc(color);
    const totalRecipients = (selectedLeader?.phone ? 1 : 0) + members.filter(m => m.phone).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh]">

                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900 text-lg">{isEdit ? `Edit ${existing.name}` : 'Create Cleaning Team'}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">1 app leader · unlimited WhatsApp-only members</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
                </div>

                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                    {err && (
                        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{err}</span>
                        </div>
                    )}

                    {/* Name + colour */}
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Team Name *</label>
                            <input value={teamName} onChange={e => setTeamName(e.target.value)}
                                placeholder="e.g. TEAM-A, Night Shift, Muttom Crew"
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-900" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Colour</label>
                            <div className="flex gap-1.5 pb-0.5">
                                {COLORS.map(tc => (
                                    <button key={tc.id} onClick={() => setColor(tc.id)}
                                        className={`w-6 h-6 rounded-full ${tc.dot} ring-2 ring-offset-1 transition-all ${color === tc.id ? tc.ring : 'ring-transparent'}`} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Leader picker */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                            <span className="inline-flex items-center gap-1"><Crown className="h-3 w-3 text-amber-500" /> Team Leader (App User) *</span>
                        </label>
                        <p className="text-[11px] text-gray-400 mb-2">Must be a mobile app user with department = Cleaning.</p>

                        {selectedLeader ? (
                            <div className={`flex items-center gap-3 p-3 rounded-xl border ${c.cardBg}`}>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${c.dot}`}>
                                    {ini(selectedLeader.displayName || selectedLeader.email)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold truncate ${c.text}`}>{selectedLeader.displayName || selectedLeader.email}</p>
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        <Phone className="h-2.5 w-2.5" />
                                        {selectedLeader.phone || <span className="text-amber-500">No phone on record</span>}
                                    </p>
                                </div>
                                <button onClick={() => setLeaderId('')} className="text-gray-300 hover:text-red-500"><X className="h-4 w-4" /></button>
                            </div>
                        ) : (
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <div className="relative border-b border-gray-100">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                    <input value={leaderSearch} onChange={e => setLeaderSearch(e.target.value)}
                                        placeholder="Search by name or email…"
                                        className="w-full pl-8 pr-4 py-2 text-xs focus:outline-none" />
                                </div>
                                <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                                    {filteredLeaders.length === 0
                                        ? <p className="text-center text-xs text-gray-400 py-5">No cleaning staff found. Users need department = Cleaning.</p>
                                        : filteredLeaders.map(u => (
                                            <button key={u.uid} onClick={() => setLeaderId(u.uid)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors">
                                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                                                    {ini(u.displayName || u.email)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{u.displayName || u.email}</p>
                                                    <p className="text-xs text-gray-400 flex items-center gap-1">
                                                        <Phone className="h-2.5 w-2.5" />{u.phone || 'No phone'}
                                                    </p>
                                                </div>
                                            </button>
                                        ))
                                    }
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Plain members */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                <Users className="h-3 w-3" /> Members (WhatsApp only)
                            </label>
                            <button onClick={addMember}
                                className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2 py-1 rounded-lg transition-colors">
                                <UserPlus className="h-3.5 w-3.5" /> Add member
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-3">No app account needed — they only receive WhatsApp notifications.</p>

                        {members.length === 0 ? (
                            <button onClick={addMember}
                                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-2">
                                <UserPlus className="h-4 w-4" /> Click to add members
                            </button>
                        ) : (
                            <div className="space-y-2">
                                {members.map(m => (
                                    <MemberRow key={m.id} member={m} onChange={changeMember} onRemove={removeMember} />
                                ))}
                                <button onClick={addMember}
                                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mt-1 pl-1 transition-colors">
                                    <Plus className="h-3.5 w-3.5" /> Add another
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Summary */}
                    {leaderId && (
                        <div className={`rounded-xl p-3 border text-xs ${c.cardBg}`}>
                            <p className={`font-semibold mb-1.5 flex items-center gap-1 ${c.text}`}>
                                <MessageSquare className="h-3 w-3" />
                                WhatsApp will go to {totalRecipients} contact{totalRecipients !== 1 ? 's' : ''} per task
                            </p>
                            <div className="space-y-1 text-gray-600">
                                <div className="flex items-center gap-1.5">
                                    <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                                    <span className="font-medium">{selectedLeader?.displayName || selectedLeader?.email}</span>
                                    <span className="text-gray-400">(leader · app)</span>
                                    {!selectedLeader?.phone && <span className="text-amber-500 ml-1">⚠ no phone</span>}
                                </div>
                                {members.filter(m => m.name.trim()).map(m => (
                                    <div key={m.id} className="flex items-center gap-1.5 pl-4">
                                        <span>• {m.name}</span>
                                        {m.phone
                                            ? <span className="text-gray-400">{m.phone}</span>
                                            : <span className="text-amber-500">⚠ no phone</span>
                                        }
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 p-6 border-t border-gray-100">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-sm font-semibold text-white flex items-center justify-center gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create team'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── WhatsApp Broadcast Modal ──────────────────────────────────────────────────
function BroadcastModal({ team, onClose, onDone, currentUser }) {
    const c = gc(team.color);
    const allRecipients = [
        { id: team.leaderId, name: team.leaderName || team.leaderEmail, phone: team.leaderPhone, role: 'leader' },
        ...(team.members || []).map(m => ({ ...m, role: 'member' })),
    ];
    const withPhone = allRecipients.filter(r => r.phone?.trim());
    const noPhone = allRecipients.filter(r => !r.phone?.trim());

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const [message, setMessage] = useState(
        `🧹 *Cleaning Duty Notice*\n\nTeam: *${team.name}*\nDate: ${today}\n\nPlease report to your assigned depot on time.\nUpdate your status on the KMRL app after completion.\n\n— KMRL Operations`
    );
    const [sending, setSending] = useState(false);
    const [results, setResults] = useState(null);
    const [err, setErr] = useState('');

    const handleSend = async () => {
        if (!message.trim()) { setErr('Message cannot be empty'); return; }
        setSending(true); setErr('');
        const waResults = [];

        for (const r of withPhone) {
            try {
                const res = await fetch(`${API_URL}/api/whatsapp/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.uid, phone: r.phone.replace(/\D/g, ''), message }),
                });
                const data = await res.json();
                waResults.push({ ...r, ok: data.success, errMsg: data.error });
            } catch (e) {
                waResults.push({ ...r, ok: false, errMsg: e.message });
            }
        }

        try {
            await updateDoc(doc(db, 'cleaningTeams', team.id), {
                lastBroadcastAt: serverTimestamp(),
                lastBroadcastBy: currentUser.uid,
                lastBroadcastSent: waResults.filter(r => r.ok).length,
            });
        } catch (_) { /* non-critical */ }

        setResults(waResults);
        setSending(false);
        onDone();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className={`flex items-center justify-between p-5 rounded-t-2xl border-b border-gray-100 ${c.cardBg}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.dot}`}>
                            <MessageSquare className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h3 className={`font-bold text-base ${c.text}`}>Broadcast · {team.name}</h3>
                            <p className="text-xs text-gray-500">{withPhone.length} will receive · {noPhone.length} skipped</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400"><X className="h-5 w-5" /></button>
                </div>

                {results ? (
                    <div className="p-6 space-y-4">
                        <div className="text-center py-2">
                            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-2" />
                            <p className="font-bold text-gray-900 text-xl">{results.filter(r => r.ok).length} / {withPhone.length} Sent</p>
                            <p className="text-sm text-gray-500 mt-0.5">WhatsApp notifications dispatched</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-52 overflow-y-auto space-y-1.5">
                            {results.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                    <span>{r.ok ? '✅' : '❌'}</span>
                                    {r.role === 'leader' && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                                    <span className="font-medium text-gray-700 truncate">{r.name}</span>
                                    <span className="text-gray-400">{r.phone}</span>
                                    {!r.ok && r.errMsg && <span className="text-red-500 truncate">· {r.errMsg}</span>}
                                </div>
                            ))}
                            {noPhone.map((r, i) => (
                                <div key={'np' + i} className="flex items-center gap-2 text-xs text-gray-400">
                                    <span>⚠️</span>
                                    {r.role === 'leader' && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                                    <span className="truncate">{r.name} — no phone, skipped</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 text-sm">Done</button>
                    </div>
                ) : (
                    <>
                        <div className="overflow-y-auto flex-1 p-6 space-y-4">
                            {err && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</div>}
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recipients ({allRecipients.length})</p>
                                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
                                    {allRecipients.map((r, i) => (
                                        <div key={i} className="flex items-center gap-3 px-3 py-2">
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${r.role === 'leader' ? c.dot : 'bg-gray-400'}`}>
                                                {ini(r.name)}
                                            </div>
                                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                                {r.role === 'leader' && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                                                <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                                            </div>
                                            {r.phone
                                                ? <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0"><Phone className="h-3 w-3" />{r.phone}</span>
                                                : <span className="text-xs text-amber-500 shrink-0">No phone</span>
                                            }
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Message</label>
                                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={7}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-gray-900 resize-none" />
                                <p className="text-xs text-gray-400 mt-1">{message.length} chars · *bold* _italic_ supported</p>
                            </div>
                            {noPhone.length > 0 && (
                                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>No phone: {noPhone.map(r => r.name).join(', ')} — will be skipped</span>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 p-6 border-t border-gray-100">
                            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button onClick={handleSend} disabled={sending || withPhone.length === 0}
                                className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-sm font-semibold text-white flex items-center justify-center gap-2">
                                {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />Send to {withPhone.length}</>}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Recent tasks panel ────────────────────────────────────────────────────────
function RecentTasks({ teamId, teamName }) {
    const [tasks, setTasks] = useState([]);
    const [allTasks, setAllTasks] = useState([]);  // unfiltered — for mismatch debug
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    useEffect(() => {
        // Fetch ALL cleaningTasks (no filter) so we can diagnose team_id mismatches
        getDocs(query(collection(db, 'cleaningTasks'), limit(50)))
            .then(snap => {
                const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

                // Filter client-side by both team_id AND team_name as fallback
                const matched = all.filter(t =>
                    t.team_id === teamId ||
                    t.team_name === teamName
                );

                matched.sort((a, b) => {
                    const aT = a.createdAt?.toDate?.() ?? new Date(a.createdAt ?? 0);
                    const bT = b.createdAt?.toDate?.() ?? new Date(b.createdAt ?? 0);
                    return bT - aT;
                });

                setTasks(matched.slice(0, 5));
                setAllTasks(all);

                // Debug log — helps identify team_id mismatches
                if (all.length > 0 && matched.length === 0) {
                    console.warn(
                        `[RecentTasks] ${all.length} tasks in Firestore but none match.`,
                        `
Expecting team_id="${teamId}" or team_name="${teamName}"`,
                        `
Actual values in Firestore:`,
                        all.map(t => ({ id: t.id, team_id: t.team_id, team_name: t.team_name }))
                    );
                }
            })
            .catch(e => {
                console.error('RecentTasks error:', e);
                setErr(e.message);
            })
            .finally(() => setLoading(false));
    }, [teamId, teamName]);

    if (loading) return <div className="py-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-gray-300" /></div>;
    if (err) return <p className="text-xs text-red-400 py-2 px-1">Error: {err}</p>;

    if (!tasks.length) {
        // Show mismatch warning if there ARE tasks in Firestore but none matched
        const hasMismatch = allTasks.length > 0;
        return (
            <div className="py-2">
                <p className="text-xs text-gray-400 text-center">No tasks assigned yet</p>
                {hasMismatch && (
                    <details className="mt-2 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <summary className="cursor-pointer font-semibold">
                            ⚠ {allTasks.length} task(s) in Firestore but team_id doesn&apos;t match — click to inspect
                        </summary>
                        <div className="mt-2 space-y-1 font-mono break-all">
                            <p className="text-gray-500">This card expects:</p>
                            <p>team_id = &quot;{teamId}&quot;</p>
                            <p>team_name = &quot;{teamName}&quot;</p>
                            <p className="text-gray-500 mt-1">Tasks found:</p>
                            {allTasks.slice(0, 5).map(t => (
                                <p key={t.id}>
                                    team_id=&quot;{t.team_id ?? '—'}&quot; team_name=&quot;{t.team_name ?? '—'}&quot;
                                </p>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        );
    }

    const STATUS_COLOR = {
        Assigned: 'bg-blue-100 text-blue-700',
        'In Progress': 'bg-amber-100 text-amber-700',
        Completed: 'bg-emerald-100 text-emerald-700',
    };

    return (
        <div className="space-y-1.5 mt-3">
            {tasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 text-xs bg-white border border-gray-100 rounded-lg px-3 py-2">
                    <span className="text-gray-400 shrink-0">{t.date || '—'}</span>
                    <span className="font-medium text-gray-700 truncate flex-1">{t.train_id} · {t.cleaning_type}</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-medium text-[10px] shrink-0 ${STATUS_COLOR[t.status] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                    {t.whatsappSentCount != null && (
                        <span className="text-[10px] text-green-600 flex items-center gap-0.5 shrink-0">
                            <MessageSquare className="h-2.5 w-2.5" />{t.whatsappSentCount}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Team Card ─────────────────────────────────────────────────────────────────
function TeamCard({ team, onEdit, onDelete, onBroadcast, deleting }) {
    const [expanded, setExpanded] = useState(false);
    const [showTasks, setShowTasks] = useState(false);
    const c = gc(team.color);

    const allRecipients = [
        { name: team.leaderName || team.leaderEmail, phone: team.leaderPhone, role: 'leader' },
        ...(team.members || []),
    ];
    const withPhone = allRecipients.filter(r => r.phone?.trim());
    const memberCount = (team.members || []).length;

    return (
        <div className={`border rounded-2xl overflow-hidden ${c.cardBg} border-opacity-60`}>
            <div className={`h-1 w-full ${c.bar}`} />

            <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${c.dot}`}>
                            {(team.name || 'T').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-base leading-tight">{team.name}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                1 leader · {memberCount} member{memberCount !== 1 ? 's' : ''} ·{' '}
                                <span className={withPhone.length < allRecipients.length ? 'text-amber-600' : 'text-emerald-600'}>
                                    {withPhone.length}/{allRecipients.length} with phone
                                </span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => onBroadcast(team)} disabled={withPhone.length === 0}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-semibold transition-colors">
                            <MessageSquare className="h-3.5 w-3.5" /><span className="hidden sm:inline">WhatsApp</span>
                        </button>
                        <button onClick={() => onEdit(team)} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-gray-900 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => onDelete(team)} disabled={deleting === team.id}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-gray-300 hover:text-red-600 disabled:opacity-50 transition-colors">
                            {deleting === team.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 transition-colors">
                            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                </div>

                {/* Leader row */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-2 ${c.badge}`}>
                    <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{team.leaderName || team.leaderEmail || '—'}</p>
                        <p className="text-[10px] text-gray-400">Leader · mobile app</p>
                    </div>
                    {team.leaderPhone
                        ? <span className="text-[10px] text-gray-500 flex items-center gap-0.5 shrink-0"><Phone className="h-2.5 w-2.5" />{team.leaderPhone}</span>
                        : <span className="text-[10px] text-amber-500 shrink-0">No phone</span>
                    }
                </div>

                {/* Collapsed member chips */}
                {!expanded && memberCount > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {(team.members || []).slice(0, 4).map(m => (
                            <span key={m.id} className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${c.badge}`}>{m.name}</span>
                        ))}
                        {memberCount > 4 && (
                            <button onClick={() => setExpanded(true)} className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${c.badge}`}>
                                +{memberCount - 4} more
                            </button>
                        )}
                    </div>
                )}

                {/* Expanded member list */}
                {expanded && memberCount > 0 && (
                    <div className="mt-2 border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white overflow-hidden">
                        {(team.members || []).map(m => (
                            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">{ini(m.name)}</div>
                                <p className="flex-1 text-sm font-medium text-gray-900 truncate">{m.name}</p>
                                {m.phone
                                    ? <a href={`tel:${m.phone}`} className="text-xs text-green-700 flex items-center gap-1 hover:underline shrink-0"><Phone className="h-3 w-3" />{m.phone}</a>
                                    : <span className="text-xs text-amber-500 shrink-0">No phone</span>
                                }
                            </div>
                        ))}
                    </div>
                )}

                {/* Recent tasks toggle */}
                <button onClick={() => setShowTasks(t => !t)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
                    <ClipboardList className="h-3 w-3" />
                    {showTasks ? 'Hide' : 'Show'} recent tasks
                </button>
                {showTasks && <RecentTasks teamId={team.id} teamName={team.name} />}

                {/* Last broadcast */}
                {team.lastBroadcastAt && (
                    <p className="text-[10px] text-gray-400 mt-3 flex items-center gap-1">
                        <MessageSquare className="h-2.5 w-2.5" />
                        Last broadcast: {fmtTs(team.lastBroadcastAt)}
                        {team.lastBroadcastSent != null && ` · ${team.lastBroadcastSent} sent`}
                    </p>
                )}
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CleaningTeamsPage() {
    const { user: currentUser, loading: authLoading } = useAuth();

    const [teams, setTeams] = useState([]);
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [deleting, setDeleting] = useState(null);

    const [showCreate, setShowCreate] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [broadcastTarget, setBroadcastTarget] = useState(null);

    const [toast, setToast] = useState(null);
    const [search, setSearch] = useState('');

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const load = useCallback(async () => {
        try {
            const [lSnap, tSnap] = await Promise.all([
                getDocs(query(collection(db, 'users'), where('department', '==', 'Cleaning'))),
                getDocs(query(collection(db, 'cleaningTeams'), orderBy('createdAt', 'desc'))),
            ]);
            setLeaders(lSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
            setTeams(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error(e);
            if (e.code === 'permission-denied') {
                showToast('Permission denied — update firestore.rules (see firestore.rules file)', 'error');
            } else {
                showToast('Failed to load: ' + e.message, 'error');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSaved = () => {
        setShowCreate(false); setEditTarget(null);
        showToast(editTarget ? 'Team updated' : 'Team created');
        load();
    };

    const handleDelete = async (team) => {
        if (!window.confirm(`Delete "${team.name}"? This cannot be undone.`)) return;
        setDeleting(team.id);
        try {
            await deleteDoc(doc(db, 'cleaningTeams', team.id));
            setTeams(t => t.filter(x => x.id !== team.id));
            showToast(`"${team.name}" deleted`);
        } catch (e) {
            showToast('Delete failed: ' + e.message, 'error');
        } finally {
            setDeleting(null);
        }
    };

    const filteredTeams = teams.filter(t => !search || t.name?.toLowerCase().includes(search.toLowerCase()));
    const totalMembers = teams.reduce((n, t) => n + (t.members?.length || 0), 0);
    const totalContacts = teams.reduce((n, t) => {
        const l = t.leaderPhone ? 1 : 0;
        const m = (t.members || []).filter(m => m.phone).length;
        return n + l + m;
    }, 0);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm">Loading cleaning teams…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white max-w-sm ${toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
                    {toast.type === 'error' ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    {toast.msg}
                </div>
            )}

            {(showCreate || editTarget) && (
                <TeamModal appLeaders={leaders} existing={editTarget} currentUser={currentUser}
                    onClose={() => { setShowCreate(false); setEditTarget(null); }} onSaved={handleSaved} />
            )}
            {broadcastTarget && (
                <BroadcastModal team={broadcastTarget} currentUser={currentUser}
                    onClose={() => setBroadcastTarget(null)}
                    onDone={() => { showToast('WhatsApp messages sent!'); load(); }} />
            )}

            <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <Sparkles className="h-7 w-7 text-emerald-500" /> Cleaning Teams
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">1 app leader per team · unlimited WhatsApp-only members</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { setRefreshing(true); load(); }} disabled={refreshing}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <button onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold">
                            <Plus className="h-4 w-4" /> New Team
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { icon: Shield, label: 'Teams', value: teams.length, cls: 'border-blue-200 text-blue-700' },
                        { icon: Crown, label: 'App Leaders', value: leaders.length, cls: 'border-amber-200 text-amber-700' },
                        { icon: Users, label: 'WA Members', value: totalMembers, cls: 'border-emerald-200 text-emerald-700' },
                        { icon: MessageSquare, label: 'Total WA Contacts', value: totalContacts, cls: 'border-gray-200 text-gray-700' },
                    ].map(s => (
                        <div key={s.label} className={`bg-white rounded-xl border p-5 ${s.cls}`}>
                            <div className="flex items-center gap-2 mb-1 opacity-70"><s.icon className="h-4 w-4" /><p className="text-xs font-medium">{s.label}</p></div>
                            <p className="text-3xl font-bold">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Search */}
                {teams.length > 2 && (
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams…"
                            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-gray-900" />
                    </div>
                )}

                {/* Teams grid */}
                {filteredTeams.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                        <Sparkles className="h-14 w-14 mx-auto mb-4 opacity-20" />
                        <p className="text-lg font-semibold text-gray-500">{search ? `No teams match "${search}"` : 'No cleaning teams yet'}</p>
                        {!search && (
                            <button onClick={() => setShowCreate(true)}
                                className="mt-6 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800">
                                Create First Team
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                        {filteredTeams.map(team => (
                            <TeamCard key={team.id} team={team} deleting={deleting}
                                onEdit={setEditTarget} onDelete={handleDelete} onBroadcast={setBroadcastTarget} />
                        ))}
                    </div>
                )}

            </main>
        </div>
    );
}