// src/app/dashboard/page.jsx
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  collection, doc, onSnapshot, query, where, getDocs, getDoc
} from 'firebase/firestore';
import { db, waitForAuthReady } from '../firebase/config';
import {
  Train, Calendar, ChevronRight, ChevronLeft, Shield, AlertTriangle,
  CheckCircle, X, TrendingUp, Zap, Droplets, MapPin, Wrench,
  Bell, BarChart2, Eye, Filter, ShieldAlert
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  checkCertAlerts, checkBrandingAlerts, isBrandingActiveOn, isFitnessValidOn
} from '../utils/trainDataService';
import {
  buildAllTrips, computeRemainingExposure, nowMin,
} from '../lib/scheduleEngine';

// ── Fleet ─────────────────────────────────────────────────────────────────────
const TRAIN_IDS = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);
const todayStr = () => new Date().toISOString().split('T')[0];

const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
};



// ── Badge component ───────────────────────────────────────────────────────────
const Badge = ({ label, color = 'gray' }) => {
  const cls = {
    green: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    red: 'bg-red-100 text-red-800 border border-red-200',
    orange: 'bg-amber-100 text-amber-800 border border-amber-200',
    blue: 'bg-blue-100 text-blue-800 border border-blue-200',
    purple: 'bg-violet-100 text-violet-800 border border-violet-200',
    gray: 'bg-gray-100 text-gray-600 border border-gray-200',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${cls[color]}`}>{label}</span>;
};

// ── Alert banner component ────────────────────────────────────────────────────
const AlertBanner = ({ alerts, onDismiss }) => {
  if (!alerts.length) return null;
  const expired = alerts.filter(a => a.type === 'expired');
  const warnings = alerts.filter(a => a.type === 'warning');

  return (
    <div className="mb-4 space-y-2">
      {expired.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-red-800 text-sm mb-1">🚨 {expired.length} Expired Certificate{expired.length > 1 ? 's' : ''}</p>
            <ul className="text-xs text-red-700 space-y-0.5">
              {expired.slice(0, 5).map((a, i) => <li key={i}>• {a.message}</li>)}
              {expired.length > 5 && <li className="font-semibold">• ...and {expired.length - 5} more</li>}
            </ul>
          </div>
          <button onClick={() => onDismiss('expired')} className="text-red-400 hover:text-red-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Bell className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-amber-800 text-sm mb-1">⚠️ {warnings.length} Expiring Soon (within 7 days)</p>
            <ul className="text-xs text-amber-700 space-y-0.5">
              {warnings.slice(0, 5).map((a, i) => <li key={i}>• {a.message}</li>)}
              {warnings.length > 5 && <li className="font-semibold">• ...and {warnings.length - 5} more</li>}
            </ul>
          </div>
          <button onClick={() => onDismiss('warning')} className="text-amber-400 hover:text-amber-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

// ── Calendar date picker ──────────────────────────────────────────────────────
const DatePicker = ({ selectedDates, onToggle, onClear }) => {
  const [cal, setCal] = useState(() => {
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() };
  });
  const daysInMonth = new Date(cal.y, cal.m + 1, 0).getDate();
  const firstDay = new Date(cal.y, cal.m, 1).getDay();
  const label = new Date(cal.y, cal.m, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const prev = () => setCal(c => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const next = () => setCal(c => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
        <span className="font-semibold text-sm">{label}</span>
        <button onClick={next} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const ds = `${cal.y}-${String(cal.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const sel = selectedDates.includes(ds);
          const isToday = ds === todayStr();
          return (
            <button key={day} onClick={() => onToggle(ds)}
              className={`text-center text-xs py-1.5 rounded-lg font-medium transition
                ${sel ? 'bg-slate-800 text-white' : isToday ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300' : 'hover:bg-gray-100 text-gray-700'}`}>
              {day}
            </button>
          );
        })}
      </div>
      {selectedDates.length > 0 && (
        <button onClick={onClear} className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 underline transition">
          Clear {selectedDates.length} selected
        </button>
      )}
    </div>
  );
};

// ── Train Detail Panel ────────────────────────────────────────────────────────
const TrainDetail = ({ trainId, masterData, dailyData, selectedDates, allTrips = [], nowTime, onClose, taskJobs = [] }) => {
  const [tab, setTab] = useState('overview');
  const [allTrainTasks, setAllTrainTasks] = useState(taskJobs); // starts with passed-in blocked jobs, then loads all

  // Fetch ALL tasks for this train when panel opens (not just high-priority blocked ones)
  useEffect(() => {
    if (!trainId || !db) return;
    let cancelled = false;
    getDocs(query(collection(db, 'tasks'), where('sourceTrainId', '==', trainId)))
      .then(snap => {
        if (cancelled) return;
        const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        tasks.sort((a, b) => {
          const pri = { high: 0, medium: 1, low: 2 };
          return (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1);
        });
        setAllTrainTasks(tasks);
      })
      .catch(err => console.error('[train-tasks]', err));
    return () => { cancelled = true; };
  }, [trainId]);

  const fitness = masterData?.fitness_certificates;
  const branding = masterData?.branding_priorities || [];
  const today = todayStr();

  // Aggregate daily data across selected dates
  const allMileage = dailyData
    .filter(d => d.mileage)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ date: d.date.slice(5), km: d.mileage.current_mileage_km }));

  const latestDaily = [...dailyData].sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestMileage = latestDaily?.mileage?.current_mileage_km;
  // Jobs from tasks collection — all priorities for this train
  const allJobs = allTrainTasks;
  const allCleaning = dailyData.flatMap(d => (d.cleaning_slots || []).map(c => ({ ...c, date: d.date })));
  const stabling = latestDaily?.stabling_geometry;

  // Cert expiry alerts for this train (vs today)
  const certAlerts = fitness ? checkCertAlerts(fitness, today, trainId) : [];
  const brandingAlerts = checkBrandingAlerts(branding, today, trainId);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'mileage', label: 'Mileage', icon: TrendingUp },
    { id: 'branding', label: 'Branding', icon: Zap },
    { id: 'fitness', label: 'Fitness', icon: Shield },
    { id: 'jobs', label: 'Jobs', icon: Wrench },
  ];

  const activeBranding = branding.filter(b =>
    selectedDates.some(d => isBrandingActiveOn(b, d))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Train className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-none">{trainId}</h2>
              <p className="text-slate-300 text-xs mt-0.5">
                {stabling?.yard || '—'} • Track {stabling?.track_no || '—'} • Berth {stabling?.berth || '—'}
              </p>
            </div>
          </div>
          {(certAlerts.length > 0 || brandingAlerts.length > 0) && (
            <div className="mr-3 flex items-center gap-1 bg-red-500/20 border border-red-400/30 px-2.5 py-1 rounded-full">
              <AlertTriangle className="w-3.5 h-3.5 text-red-300" />
              <span className="text-red-200 text-xs font-bold">
                {certAlerts.length + brandingAlerts.length} Alert{certAlerts.length + brandingAlerts.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b bg-gray-50 px-2">
          {tabs.map(t => {
            const Icon = t.icon;
            const hasAlert = (t.id === 'fitness' && certAlerts.length > 0) ||
              (t.id === 'branding' && brandingAlerts.length > 0);
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition
                  ${tab === t.id ? 'border-slate-800 text-slate-800' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {hasAlert && (
                  <span className="absolute top-1.5 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Expiry alerts inside panel */}
              {(certAlerts.length > 0 || brandingAlerts.length > 0) && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="font-bold text-red-800 text-sm mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Alerts for {trainId}
                  </p>
                  {[...certAlerts, ...brandingAlerts].map((a, i) => (
                    <p key={i} className={`text-xs mb-0.5 ${a.type === 'expired' ? 'text-red-700 font-semibold' : 'text-amber-700'}`}>
                      {a.type === 'expired' ? '🚨' : '⚠️'} {a.field}: {a.type === 'expired' ? `Expired ${a.expiryDate}` : `Expires ${a.expiryDate} (${a.daysLeft}d)`}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Current Mileage</p>
                  {latestMileage != null
                    ? <><p className="text-xl font-bold">{latestMileage.toLocaleString()}</p><p className="text-xs text-gray-400">km</p></>
                    : <p className="text-sm text-gray-300 italic mt-1">Not uploaded</p>
                  }
                </div>
                <div className={`border rounded-xl p-4 ${!fitness ? 'bg-gray-50' : fitness.status === 'Fit for Service' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className="text-xs text-gray-400 mb-1">Fitness</p>
                  {fitness
                    ? <p className={`text-sm font-bold ${fitness.status === 'Fit for Service' ? 'text-emerald-700' : 'text-red-600'}`}>{fitness.status}</p>
                    : <p className="text-sm text-gray-300 italic mt-1">Not uploaded</p>
                  }
                </div>
                <div className="bg-slate-50 border rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Open Jobs</p>
                  <p className="text-xl font-bold text-amber-600">
                    {allJobs.filter(j => j.status === 'pending' || j.status === 'in_progress').length}
                  </p>
                </div>
                <div className={`border rounded-xl p-4 ${activeBranding.length > 0 ? 'bg-violet-50' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-400 mb-1">Branding</p>
                  <p className={`text-sm font-bold ${activeBranding.length > 0 ? 'text-violet-700' : 'text-gray-400'}`}>
                    {activeBranding.length > 0 ? activeBranding[0].branding_type : '—'}
                  </p>
                </div>
              </div>

              {stabling ? (
                <div className="border rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" /> Latest Stabling
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {[
                      ['Yard', stabling.yard], ['Track', stabling.track_no], ['Berth', stabling.berth],
                      ['Orientation', stabling.orientation], ['Buffer', `${stabling.distance_from_buffer_m}m`],
                    ].map(([k, v]) => (
                      <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-medium">{v}</p></div>
                    ))}
                  </div>
                  {stabling.remarks && <p className="text-xs text-gray-400 mt-2 italic">"{stabling.remarks}"</p>}
                </div>
              ) : (
                <div className="border border-dashed rounded-xl p-4 text-center text-gray-300 text-sm">
                  <MapPin className="w-5 h-5 mx-auto mb-1 opacity-40" />
                  No stabling data uploaded for selected date{selectedDates.length > 1 ? 's' : ''}
                </div>
              )}

              {allCleaning.length > 0 ? (
                <div className="border rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Droplets className="w-4 h-4" /> Cleaning ({allCleaning.length})
                  </h4>
                  {allCleaning.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                      <span>{c.cleaning_type} <span className="text-xs text-gray-400">— {c.assigned_team}</span></span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{c.date}</span>
                        <Badge label={c.status} color={c.status === 'Completed' ? 'green' : c.status === 'In Progress' ? 'orange' : 'blue'} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed rounded-xl p-4 text-center text-gray-300 text-sm">
                  <Droplets className="w-5 h-5 mx-auto mb-1 opacity-40" />
                  No cleaning data uploaded for selected date{selectedDates.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}

          {/* MILEAGE */}
          {tab === 'mileage' && (
            <div className="space-y-4">
              {allMileage.length === 0 ? (
                <div className="border border-dashed rounded-xl p-12 text-center text-gray-300">
                  <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No mileage data uploaded for selected date{selectedDates.length > 1 ? 's' : ''}.</p>
                  <p className="text-xs mt-1">Submit an induction form with a mileage reading to see data here.</p>
                </div>
              ) : (
                <>
                  {allMileage.length > 1 ? (
                    <div className="border rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-4">Mileage Progression</h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={allMileage}>
                          <defs>
                            <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#334155" stopOpacity={0.12} />
                              <stop offset="95%" stopColor="#334155" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                          <Tooltip formatter={v => [`${v.toLocaleString()} km`]} />
                          <Area type="monotone" dataKey="km" stroke="#334155" strokeWidth={2} fill="url(#mg)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="border rounded-xl p-4 text-center text-gray-400 text-sm">
                      Select multiple dates to see mileage trend chart.
                    </div>
                  )}
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Date</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Mileage (km)</th>
                      </tr></thead>
                      <tbody>
                        {[...dailyData].sort((a, b) => b.date.localeCompare(a.date)).map((d, i) => d.mileage && (
                          <tr key={i} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-600">{d.date}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-medium">{d.mileage.current_mileage_km.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* BRANDING */}
          {tab === 'branding' && (
            <div className="space-y-4">
              {brandingAlerts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  {brandingAlerts.map((a, i) => (
                    <p key={i} className="text-xs text-amber-800">
                      {a.type === 'expired' ? '🚨' : '⚠️'} {a.message}
                    </p>
                  ))}
                </div>
              )}
              {branding.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No branding campaigns.</div>
              ) : branding.map((b, i) => {
                const exp = computeRemainingExposure(trainId, b, allTrips, nowTime);
                const remaining = exp?.remaining ?? b.exposure_minutes ?? 0;
                const total = exp?.total ?? b.exposure_minutes ?? 0;
                const pct = exp?.pct ?? 100;
                const completedTrips = exp?.completedTrips ?? 0;
                const used = exp?.used ?? 0;
                const barColor = pct === 0 ? 'bg-red-500'
                  : pct <= 20 ? 'bg-amber-400'
                    : pct <= 50 ? 'bg-yellow-400'
                      : 'bg-violet-500';
                const textColor = pct === 0 ? 'text-red-600'
                  : pct <= 20 ? 'text-amber-600'
                    : pct <= 50 ? 'text-yellow-600'
                      : 'text-violet-700';
                const activeOnDates = selectedDates.filter(d => isBrandingActiveOn(b, d));
                return (
                  <div key={i} className="border rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold">{b.branding_type}</p>
                        <p className="text-xs text-gray-400 mt-0.5">By {b.approved_by}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge label={`Priority ${b.priority_level}`} color="purple" />
                        {activeOnDates.length > 0
                          ? <Badge label={`Active ${activeOnDates.length}d`} color="green" />
                          : <Badge label="Inactive on selected dates" color="gray" />
                        }
                        {exp?.status === 'exhausted' && <Badge label="Exposure Exhausted" color="red" />}
                        {exp?.status === 'low' && <Badge label="Low Exposure" color="orange" />}
                      </div>
                    </div>

                    {/* Live exposure countdown bar */}
                    <div className="mb-3 bg-gray-50 rounded-xl p-3 border">
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-xs text-gray-500 font-medium">Remaining Exposure</span>
                        <span className={`text-sm font-bold ${textColor}`}>
                          {remaining.toLocaleString()} min
                        </span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-2.5 mb-1.5">
                        <div
                          className={`${barColor} h-2.5 rounded-full transition-all duration-1000`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-400">
                        <span>{used.toLocaleString()} min used · {completedTrips} trip{completedTrips !== 1 ? 's' : ''} completed</span>
                        <span>{pct}% of {total.toLocaleString()} min</span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-400 mt-2">
                      Valid: {fmtDate(b.valid_from)} → {fmtDate(b.valid_to)}
                      {daysUntil(b.valid_to) !== null && (
                        <span className={`ml-2 font-semibold ${daysUntil(b.valid_to) < 0 ? 'text-red-500' : daysUntil(b.valid_to) <= 3 ? 'text-amber-600' : 'text-gray-400'}`}>
                          ({daysUntil(b.valid_to) < 0 ? `Expired ${Math.abs(daysUntil(b.valid_to))}d ago` : `${daysUntil(b.valid_to)}d left`})
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
              <p className="text-xs text-center text-gray-400 italic">
                ℹ️ Branding is shown for all selected dates within its valid_from → valid_to window.
                New submissions override this record.
              </p>
            </div>
          )}

          {/* FITNESS */}
          {tab === 'fitness' && (
            <div className="space-y-4">
              {certAlerts.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  {certAlerts.map((a, i) => (
                    <p key={i} className={`text-xs ${a.type === 'expired' ? 'text-red-700 font-bold' : 'text-amber-700'}`}>
                      {a.type === 'expired' ? '🚨' : '⚠️'} {a.message}
                    </p>
                  ))}
                </div>
              )}
              {!fitness ? (
                <div className="text-center py-10 text-gray-400 text-sm">No fitness data.</div>
              ) : (
                <>
                  <div className={`rounded-xl p-5 border flex items-center gap-4 ${fitness.status === 'Fit for Service' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    {fitness.status === 'Fit for Service'
                      ? <CheckCircle className="w-8 h-8 text-emerald-600" />
                      : <AlertTriangle className="w-8 h-8 text-red-500" />
                    }
                    <div>
                      <p className="font-bold text-lg">{fitness.status}</p>
                      <p className="text-xs text-gray-500">Master record — overrideable via new submission</p>
                    </div>
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Certificate</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Valid Until</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                      </tr></thead>
                      <tbody>
                        {[
                          ['Rolling Stock', 'rolling_stock_validity'],
                          ['Signalling', 'signalling_validity'],
                          ['Telecom', 'telecom_validity'],
                        ].map(([label, key]) => {
                          const exp = fitness[key];
                          const d = daysUntil(exp);
                          const color = !exp ? 'gray' : d < 0 ? 'red' : d <= 7 ? 'orange' : 'green';
                          const statusLabel = !exp ? 'No Data' : d < 0 ? `Expired ${Math.abs(d)}d ago` : d <= 7 ? `${d}d left` : 'Valid';
                          return (
                            <tr key={key} className="border-t">
                              <td className="px-4 py-3">{label}</td>
                              <td className="px-4 py-3 text-right font-mono text-sm">{fmtDate(exp)}</td>
                              <td className="px-4 py-3 text-right"><Badge label={statusLabel} color={color} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-center text-gray-400 italic">
                    ℹ️ This is a master record. Submit a new induction with &quot;Update fitness&quot; toggled to override.
                    Validity is shown across all dates within the certificate window.
                  </p>
                </>
              )}
            </div>
          )}

          {/* JOBS */}
          {tab === 'jobs' && (
            <div className="space-y-3">
              {allJobs.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No job cards found for {trainId}.
                </div>
              ) : allJobs.map((j, i) => {
                const priorityColor = j.priority === 'high' ? 'red' : j.priority === 'medium' ? 'orange' : 'gray';
                const statusColor = j.status === 'completed' ? 'green' : j.status === 'in_progress' ? 'orange' : 'red';
                const statusLabel = j.status === 'in_progress' ? 'In Progress' : j.status === 'completed' ? 'Completed' : 'Pending';
                const priorityLabel = j.priority ? j.priority.charAt(0).toUpperCase() + j.priority.slice(1) : '—';
                return (
                  <div key={j.id || i} className={`border rounded-xl p-4 ${j.priority === 'high' && j.status !== 'completed' ? 'border-red-200 bg-red-50/40' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-semibold text-sm truncate">{j.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {j.sourceJobCardId && <span>{j.sourceJobCardId} · </span>}
                          {j.department || j.assignedToName || '—'}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-wrap justify-end flex-shrink-0">
                        <Badge label={priorityLabel} color={priorityColor} />
                        <Badge label={statusLabel} color={statusColor} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      {j.sourceWorkOrder && <span>WO: {j.sourceWorkOrder} · </span>}
                      {j.dueDate && <span>Due: {fmtDate(j.dueDate)}</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [authReady, setAuthReady] = useState(false);   // true once Firebase Auth session is restored
  const [currentUser, setCurrentUser] = useState(null);
  const [masterData, setMasterData] = useState({});
  const [dailyDocs, setDailyDocs] = useState([]);
  const [selectedDates, setSelectedDates] = useState([todayStr()]);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [search, setSearch] = useState('');
  const [filterDepot, setFilterDepot] = useState('All');
  const [filterFitness, setFilterFitness] = useState('All');
  const [dismissedAlertTypes, setDismissedAlertTypes] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [nowTime, setNowTime] = useState(() => nowMin());
  const [blockedJobs, setBlockedJobs] = useState([]);          // high-priority unresolved job card tasks
  const [blockedTrainIds, setBlockedTrainIds] = useState(new Set()); // Set<trainId>
  const [allOpenTasksCount, setAllOpenTasksCount] = useState(0); // all open/in-progress job card tasks

  const masterUnsubRef = useRef(null);

  // ── Step 1: wait for auth session to restore ────────────────────────────────
  // This MUST run before any Firestore query. Firebase Auth restores the
  // persisted session asynchronously — firing onSnapshot before this completes
  // means request.auth is null on the server → "Missing or insufficient permissions".
  useEffect(() => {
    waitForAuthReady().then((user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
  }, []);

  // ── Live clock — refreshes every 60 s so exposure countdown ticks down ───────
  useEffect(() => {
    const id = setInterval(() => setNowTime(nowMin()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Live listener: high-priority unresolved job cards → blocks trains ─────────
  // Any task with isJobCard=true, priority=high, status!=completed, and a
  // sourceTrainId will ground that train — shown as blocked on cards & banner.
  // Clears automatically when a job is marked complete in the Job Cards page.
  useEffect(() => {
    if (!authReady || !currentUser || !db) return;
    const q = query(
      collection(db, 'tasks'),
      where('isJobCard', '==', true),
      where('priority', '==', 'high')
    );
    const unsub = onSnapshot(q, snap => {
      const jobs = [];
      snap.forEach(d => {
        const t = { id: d.id, ...d.data() };
        if (t.status !== 'completed' && t.sourceTrainId) jobs.push(t);
      });
      setBlockedJobs(jobs);
      setBlockedTrainIds(new Set(jobs.map(j => j.sourceTrainId)));
    }, err => console.error('[job-block]', err));

    // Separate snapshot for ALL job card tasks to count open ones (any priority)
    const unsubAll = onSnapshot(
      collection(db, 'tasks'),
      snap => {
        let count = 0;
        snap.forEach(d => {
          const t = d.data();
          if (t.isJobCard && (t.status === 'pending' || t.status === 'in_progress')) count++;
        });
        setAllOpenTasksCount(count);
      },
      err => console.error('[all-tasks]', err)
    );

    return () => { unsub(); unsubAll(); };
  }, [authReady, currentUser]);

  // ── Step 2: subscribe to master data — only after auth is confirmed ─────────
  useEffect(() => {
    if (!authReady || !currentUser || !db) {
      setLoadingMaster(false);
      return;
    }

    if (masterUnsubRef.current) {
      masterUnsubRef.current();
      masterUnsubRef.current = null;
    }

    let active = true;

    const unsub = onSnapshot(
      collection(db, 'trainMasterData'),
      { includeMetadataChanges: false },
      (snap) => {
        if (!active) return;
        const map = {};
        snap.forEach(d => { map[d.id] = d.data(); });
        setMasterData(map);
        setLoadingMaster(false);
      },
      (err) => {
        if (!active) return;
        console.error('[masterData] onSnapshot error:', err);
        setLoadingMaster(false);
      }
    );

    masterUnsubRef.current = unsub;

    return () => {
      active = false;
      if (masterUnsubRef.current) {
        masterUnsubRef.current();
        masterUnsubRef.current = null;
      }
    };
  }, [authReady, currentUser]);

  // ── Step 3: fetch daily data — only after auth is confirmed ─────────────────
  useEffect(() => {
    if (!authReady || !currentUser || !db || !selectedDates.length) {
      setDailyDocs([]);
      return;
    }

    setLoadingDaily(true);
    let cancelled = false;

    const chunks = [];
    for (let i = 0; i < selectedDates.length; i += 10) {
      chunks.push(selectedDates.slice(i, i + 10));
    }

    Promise.all(
      chunks.map(chunk =>
        getDocs(query(collection(db, 'trainDailyData'), where('date', 'in', chunk)))
          .then(snap => {
            const docs = [];
            snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
            return docs;
          })
          .catch((err) => {
            console.error('[dailyData] getDocs error:', err);
            return [];
          })
      )
    ).then(results => {
      if (!cancelled) {
        setDailyDocs(results.flat());
        setLoadingDaily(false);
      }
    });

    return () => { cancelled = true; };
  }, [authReady, currentUser, selectedDates]);

  const toggleDate = (d) =>
    setSelectedDates(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  // ── Build per-train data view — REAL DATA ONLY, no seed/fake fallbacks ────────
  const trainView = useMemo(() => {
    const latestDate = selectedDates[selectedDates.length - 1] || todayStr();

    return TRAIN_IDS.map(tid => {
      // Master data: real Firestore record only, or null if not yet submitted
      const master = masterData[tid] || null;

      // Daily data: only real Firestore records for this train across selected dates
      const allDaily = dailyDocs
        .filter(d => d.train_id === tid)
        .sort((a, b) => a.date.localeCompare(b.date));

      const latestDaily = allDaily[allDaily.length - 1] || null;

      const fitness = master?.fitness_certificates || null;
      const isFit = fitness ? isFitnessValidOn(fitness, latestDate) : false;

      const activeBranding = (master?.branding_priorities || []).filter(b =>
        selectedDates.some(d => isBrandingActiveOn(b, d))
      );

      return {
        trainId: tid,
        master,
        allDaily,
        latestDaily,
        fitness,
        isFit,
        activeBranding,
        hasData: allDaily.length > 0,          // false means no daily data uploaded yet
        hasMaster: master !== null,             // false means no fitness/branding submitted yet
        latestMileage: latestDaily?.mileage?.current_mileage_km ?? null,
        depot: latestDaily?.stabling_geometry?.yard ?? null,
        openJobs: allDaily.flatMap(d => d.job_card_status || []).filter(j => j.status === 'Open').length,
      };
    });
  }, [masterData, dailyDocs, selectedDates]);

  // ── Build all trips for live exposure countdown ───────────────────────────
  const allTrips = useMemo(() => {
    const latestDate = selectedDates[selectedDates.length - 1] || todayStr();
    const fleet = TRAIN_IDS.map(tid => ({
      train_id: tid,
      isFit: isFitnessValidOn(masterData[tid]?.fitness_certificates || null, latestDate),
    }));
    return buildAllTrips(fleet);
  }, [masterData, selectedDates]);

  // ── Fleet-wide expiry alerts (shown at top of dashboard) ─────────────────────
  const fleetAlerts = useMemo(() => {
    if (dismissedAlertTypes.includes('all')) return [];
    const today = todayStr();
    const alerts = [];
    trainView.forEach(({ trainId, master }) => {
      if (!master) return; // no data uploaded for this train yet — skip
      if (master.fitness_certificates) {
        alerts.push(...checkCertAlerts(master.fitness_certificates, today, trainId));
      }
      if (master.branding_priorities?.length) {
        alerts.push(...checkBrandingAlerts(master.branding_priorities, today, trainId));
      }
    });
    return alerts.filter(a => !dismissedAlertTypes.includes(a.type));
  }, [trainView, dismissedAlertTypes]);

  // ── Filtered train list ───────────────────────────────────────────────────────
  const filtered = useMemo(() => trainView.filter(t => {
    if (search && !t.trainId.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterDepot !== 'All' && t.depot !== filterDepot) return false;
    if (filterFitness === 'Fit' && !t.isFit) return false;
    if (filterFitness === 'Check' && t.isFit) return false;
    return true;
  }), [trainView, search, filterDepot, filterFitness]);

  // ── Fleet mileage chart — only trains that have real data ────────────────────
  const fleetChart = useMemo(() => selectedDates.map(d => {
    const trainsWithData = trainView.filter(t => {
      const dd = t.allDaily.find(x => x.date === d);
      return dd?.mileage?.current_mileage_km != null;
    });
    const avg = trainsWithData.length > 0
      ? Math.round(trainsWithData.reduce((acc, t) => {
        const dd = t.allDaily.find(x => x.date === d);
        return acc + dd.mileage.current_mileage_km;
      }, 0) / trainsWithData.length)
      : null;
    return { date: d.slice(5), avg, count: trainsWithData.length };
  }), [trainView, selectedDates]);

  const fitCount = trainView.filter(t => t.isFit && !blockedTrainIds.has(t.trainId)).length;
  const jobBlockedCount = blockedTrainIds.size;
  const totalOpenJobs = allOpenTasksCount;
  const activeBrandingCount = trainView.filter(t => t.activeBranding.length > 0).length;

  const selectedTrainData = selectedTrain ? trainView.find(t => t.trainId === selectedTrain) : null;

  // Block render until Firebase Auth session is restored.
  // Without this gate: fleetAlerts runs while masterData is still {},
  // trainView entries have master=null → "Cannot read properties of null".
  // Firestore queries also fire before auth token is attached → permissions error.
  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Connecting...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Please sign in to view the dashboard.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between shadow-lg sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Train className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">KMRL Fleet Dashboard</h1>
            <p className="text-slate-400 text-xs">KMRL-1 to KMRL-30 • {selectedDates.length > 0 ? selectedDates.join(', ') : 'No date selected'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fleetAlerts.length > 0 && (
            <div className="flex items-center gap-1 bg-red-500/20 border border-red-400/40 px-3 py-1.5 rounded-full">
              <Bell className="w-3.5 h-3.5 text-red-300" />
              <span className="text-red-200 text-xs font-bold">{fleetAlerts.length} Alert{fleetAlerts.length > 1 ? 's' : ''}</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(o => !o)}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs flex items-center gap-1.5 transition">
            <Calendar className="w-3.5 h-3.5" />
            {sidebarOpen ? 'Hide' : 'Calendar'}
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-64 flex-shrink-0 border-r bg-white overflow-y-auto p-4 space-y-4">
            <DatePicker selectedDates={selectedDates} onToggle={toggleDate} onClear={() => setSelectedDates([])} />

            <div className="bg-white border rounded-2xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Filters
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Search</label>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="KMRL-..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Depot</label>
                  <select value={filterDepot} onChange={e => setFilterDepot(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option>All</option>
                    <option value="Muttom Depot">Muttom</option>
                    <option value="Kalamassery Depot">Kalamassery</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Fitness</label>
                  <select value={filterFitness} onChange={e => setFilterFitness(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="All">All</option>
                    <option value="Fit">Fit for Service</option>
                    <option value="Check">Requires Check</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-800 space-y-1.5">
              <p className="font-bold mb-2">ℹ️ Data Architecture</p>
              <p><strong>Master</strong> (fitness, branding): overrideable — new submission replaces previous</p>
              <p><strong>Daily</strong> (stabling, mileage, cleaning, jobs): per-date — each date stored independently</p>
            </div>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Alerts */}
          {/* <AlertBanner
            alerts={fleetAlerts}
            onDismiss={(type) => setDismissedAlertTypes(prev => [...prev, type])}
          /> */}

          {/* Job Block Banner — only when trains are grounded */}
          {blockedJobs.length > 0 && (
            <div className="bg-red-600 text-white rounded-2xl shadow-lg overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <ShieldAlert className="h-6 w-6 flex-shrink-0 mt-0.5 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">
                    🚨 {blockedTrainIds.size} Train{blockedTrainIds.size > 1 ? 's' : ''} Grounded — High Priority Job{blockedJobs.length > 1 ? 's' : ''} Unresolved
                  </p>
                  <p className="text-red-100 text-sm mt-0.5 mb-3">
                    These trains cannot operate until all High priority job cards are marked complete.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {blockedJobs.map(j => (
                      <div key={j.id} className="bg-red-700/60 border border-red-500 rounded-xl px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-white">{j.sourceTrainId}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${j.status === 'in_progress' ? 'bg-amber-400 text-amber-900' : 'bg-red-400 text-white'}`}>
                            {j.status === 'in_progress' ? 'In Progress' : 'Pending'}
                          </span>
                        </div>
                        <p className="text-red-100 truncate">{j.title}</p>
                        {j.sourceJobCardId && (
                          <p className="text-red-300 mt-0.5">{j.sourceJobCardId}{j.dueDate ? ` · Due ${j.dueDate}` : ''}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Fleet', value: 30, sub: 'KMRL-1 to KMRL-30', bg: 'bg-slate-800', icon: Train },
              { label: 'Fit for Service', value: fitCount, sub: `${30 - fitCount - jobBlockedCount} cert check needed`, bg: 'bg-emerald-600', icon: CheckCircle },
              { label: 'Job Blocked', value: jobBlockedCount, sub: jobBlockedCount > 0 ? 'High priority jobs open' : 'All clear', bg: jobBlockedCount > 0 ? 'bg-red-600' : 'bg-slate-600', icon: ShieldAlert },
              { label: 'Open Job Cards', value: totalOpenJobs, sub: 'Pending + in progress, all priority', bg: 'bg-amber-500', icon: AlertTriangle },
              { label: 'Active Branding', value: activeBrandingCount, sub: 'Trains with campaigns', bg: 'bg-violet-600', icon: Zap },
            ].map(({ label, value, sub, bg, icon: Icon }) => (
              <div key={label} className={`${bg} text-white rounded-2xl p-5`}>
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-medium opacity-80">{label}</p>
                  <Icon className="w-4 h-4 opacity-70" />
                </div>
                <p className="text-3xl font-bold leading-none">{value}</p>
                <p className="text-xs opacity-70 mt-1.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Fleet trend */}
          {selectedDates.length > 1 && (
            <div className="bg-white border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4" /> Fleet Average Mileage
              </h3>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={fleetChart}>
                  <defs>
                    <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1e293b" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#1e293b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={v => [`${v.toLocaleString()} km`, 'Avg']} />
                  <Area type="monotone" dataKey="avg" stroke="#1e293b" strokeWidth={2} fill="url(#fg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Train grid */}
          <div>
            <h2 className="font-semibold text-gray-800 mb-3">
              Train Fleet <span className="text-gray-400 font-normal text-sm">({filtered.length})</span>
              {loadingDaily && <span className="ml-2 text-xs text-blue-500">Loading...</span>}
            </h2>

            {selectedDates.length === 0 ? (
              <div className="bg-white border rounded-2xl p-12 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Select one or more dates</p>
                <p className="text-gray-400 text-sm mt-1">to view daily operations data</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(({ trainId, fitness, isFit, activeBranding, latestMileage, depot, openJobs, master, allDaily, hasData, hasMaster }) => {
                  const certA = fitness ? checkCertAlerts(fitness, todayStr(), trainId) : [];
                  const hasAlert = certA.length > 0 || checkBrandingAlerts(master?.branding_priorities || [], todayStr(), trainId).length > 0;
                  const isJobBlocked = blockedTrainIds.has(trainId);
                  const blockedJob = blockedJobs.find(j => j.sourceTrainId === trainId);

                  return (
                    <button key={trainId} onClick={() => setSelectedTrain(trainId)}
                      className={`bg-white border rounded-2xl p-4 text-left hover:shadow-md transition-all group relative
                        ${isJobBlocked ? 'border-red-400 ring-2 ring-red-200 bg-red-50/40' : hasAlert ? 'border-red-200 ring-1 ring-red-100' : 'hover:border-slate-300'}
                        ${!hasData && !hasMaster ? 'opacity-60' : ''}`}>

                      {/* Pulsing dot: red for job-blocked, orange for cert alert */}
                      {(isJobBlocked || hasAlert) && (
                        <span className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full animate-pulse ${isJobBlocked ? 'bg-red-600' : 'bg-red-500'}`} />
                      )}

                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center
                          ${isJobBlocked ? 'bg-red-100' : !hasMaster ? 'bg-gray-100' : isFit ? 'bg-emerald-100' : 'bg-red-100'}`}>
                          {isJobBlocked
                            ? <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                            : <Train className={`w-3.5 h-3.5 ${!hasMaster ? 'text-gray-400' : isFit ? 'text-emerald-600' : 'text-red-500'}`} />
                          }
                        </div>
                        <span className="font-bold text-sm text-slate-800">{trainId}</span>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition ml-auto" />
                      </div>

                      {/* Grounded warning strip */}
                      {isJobBlocked && (
                        <div className="mb-2 bg-red-100 border border-red-200 rounded-lg px-2.5 py-1.5 text-xs">
                          <p className="font-bold text-red-700 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" /> GROUNDED
                          </p>
                          {blockedJob && <p className="text-red-500 truncate mt-0.5">{blockedJob.sourceJobCardId || blockedJob.title}</p>}
                        </div>
                      )}

                      {!hasData && !hasMaster ? (
                        <p className="text-xs text-gray-400 italic py-1">No data uploaded yet</p>
                      ) : (
                        <div className="space-y-1.5 text-xs text-gray-500">
                          <div className="flex justify-between">
                            <span>Mileage</span>
                            <span className={`font-medium ${latestMileage != null ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                              {latestMileage != null ? `${latestMileage.toLocaleString()} km` : 'Not uploaded'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Depot</span>
                            <span className={`font-medium truncate max-w-[110px] ${depot ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                              {depot ? depot.replace(' Depot', '') : 'Not uploaded'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Fitness</span>
                            {hasMaster
                              ? <Badge label={isFit ? 'Fit' : 'Check'} color={isFit ? 'green' : 'red'} />
                              : <span className="text-gray-300 italic text-xs">Not uploaded</span>
                            }
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 mt-3 pt-2.5 border-t">
                        {isJobBlocked && <Badge label="Grounded" color="red" />}
                        {activeBranding.length > 0 && <Badge label="Branding" color="purple" />}
                        {openJobs > 0 && <Badge label={`${openJobs} Job${openJobs > 1 ? 's' : ''}`} color="orange" />}
                        {!hasData && hasMaster && <Badge label="Master only" color="blue" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Train detail */}
      {selectedTrain && selectedTrainData && (
        <TrainDetail
          trainId={selectedTrain}
          masterData={selectedTrainData.master}
          dailyData={selectedTrainData.allDaily}
          selectedDates={selectedDates}
          allTrips={allTrips}
          nowTime={nowTime}
          onClose={() => setSelectedTrain(null)}
          taskJobs={blockedJobs.filter(j => j.sourceTrainId === selectedTrain)}
        />
      )}
    </div>
  );
}