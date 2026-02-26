// src/app/dashboard/page.jsx
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, onSnapshot, orderBy, getDocs
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Train, Calendar, ChevronRight, ChevronLeft, TrendingUp, Activity,
  Shield, Wrench, Droplets, MapPin, AlertTriangle, CheckCircle,
  Clock, BarChart2, X, ArrowLeft, Eye, Zap
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, AreaChart, Area
} from 'recharts';

// ─── Hardcoded train fleet KMRL-1 to KMRL-30 ────────────────────────────────
const TRAIN_IDS = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);

// ─── Utility helpers ──────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];

const dateRange = (start, end) => {
  const dates = [];
  let cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Is a date-ranged item active on a given date? ───────────────────────────
// For fitness certificates: valid if viewDate is between valid_from and validity dates
// For branding: valid if viewDate is between valid_from and valid_to
const isActiveOn = (item, viewDate, startField, endField) => {
  if (!item[startField] || !item[endField]) return false;
  return viewDate >= item[startField] && viewDate <= item[endField];
};

// ─── Mock / seed data generator (used when no Firestore data) ────────────────
const generateSeedData = (dateStr) => {
  // This generates deterministic mock data for a given date so the dashboard
  // always has something to display even without real Firestore records.
  const seed = dateStr.replace(/-/g, '');
  const rng = (mod, offset = 0) => ((parseInt(seed) + offset) % mod);

  const docs = [];
  const chunkSize = 5; // 5 trains per doc upload

  for (let chunk = 0; chunk < 6; chunk++) {
    const branding_priorities = [];
    const cleaning_slots = [];
    const stabling_geometry = [];
    const fitness_certificates = [];
    const job_card_status = [];
    const mileage = [];

    for (let t = 0; t < chunkSize; t++) {
      const idx = chunk * chunkSize + t;
      if (idx >= 30) break;
      const trainId = TRAIN_IDS[idx];
      const baseMileage = 250000 + idx * 8000 + rng(1000, idx * 7);
      const dayNum = parseInt(dateStr.split('-')[2]);

      const brandingTypes = ['None', 'Election Awareness', 'Tourism', 'Government Campaign', 'Commercial', 'None'];
      const brandingType = brandingTypes[rng(brandingTypes.length, idx)];

      if (brandingType !== 'None') {
        branding_priorities.push({
          train_id: trainId,
          exposure_minutes: 3600 + rng(1800, idx),
          priority_level: rng(3, idx) + 1,
          branding_type: brandingType,
          valid_from: `${dateStr.slice(0, 8)}01`,
          valid_to: `${dateStr.slice(0, 8)}${String(28 + rng(3, idx)).padStart(2, '0')}`,
          approved_by: ['Marketing Dept', 'Operations', 'GM Office'][rng(3, idx)],
        });
      }

      const cleanTypes = ['Daily Clean', 'Detailing', 'Weekly Maintenance', 'Daily Clean'];
      cleaning_slots.push({
        train_id: trainId,
        cleaning_type: cleanTypes[rng(cleanTypes.length, idx + 1)],
        slot_start: `${dateStr}T${String(22 + rng(2, idx)).padStart(2, '0')}:00`,
        slot_end: `${dateStr}T${String(23 + rng(2, idx)).padStart(2, '0')}:${rng(2, idx) === 0 ? '45' : '30'}`,
        assigned_team: ['Team A', 'Team B', 'Detail Squad', 'Night Crew'][rng(4, idx)],
        status: ['Scheduled', 'In Progress', 'Completed'][rng(3, idx + dayNum)],
      });

      const depots = ['Muttom Depot', 'Kalamassery Depot'];
      stabling_geometry.push({
        train_id: trainId,
        yard: depots[rng(2, idx)],
        track_no: rng(8, idx) + 1,
        berth: `${['A', 'B', 'C'][rng(3, idx)]}${rng(4, idx) + 1}`,
        orientation: rng(2, idx) === 0 ? 'UP' : 'DN',
        distance_from_buffer_m: 3.0 + (rng(30, idx) / 10),
        remarks: rng(5, idx) > 3 ? 'Restricted movement on left side' : 'Safe clearance maintained',
      });

      const validityBase = new Date(dateStr);
      validityBase.setDate(validityBase.getDate() + 10 + rng(60, idx));
      const validityStr = validityBase.toISOString().split('T')[0];
      const isFit = rng(5, idx) > 0;

      fitness_certificates.push({
        train_id: trainId,
        rolling_stock_validity: validityStr,
        signalling_validity: new Date(new Date(validityStr).setDate(new Date(validityStr).getDate() - rng(5, idx))).toISOString().split('T')[0],
        telecom_validity: new Date(new Date(validityStr).setDate(new Date(validityStr).getDate() + rng(7, idx))).toISOString().split('T')[0],
        status: isFit ? 'Fit for Service' : 'Requires Check',
      });

      if (rng(3, idx + dayNum) === 0) {
        job_card_status.push({
          train_id: trainId,
          job_id: `JC-${4000 + idx * 10 + rng(9, idx)}`,
          task: ['Brake Inspection', 'Pantograph Check', 'HVAC Service', 'Door Mechanism Check', 'Wheel Profile Measurement'][rng(5, idx)],
          status: ['Open', 'Pending', 'Completed'][rng(3, idx + dayNum)],
          assigned_team: 'Maintenance Team',
          due_date: dateStr,
          priority: ['Low', 'Medium', 'High'][rng(3, idx)],
        });
      }

      mileage.push({
        train_id: trainId,
        current_mileage_km: baseMileage + dayNum * 150 + rng(50, idx),
      });
    }

    docs.push({
      id: `seed-${dateStr}-${chunk}`,
      date: dateStr,
      branding_priorities,
      cleaning_slots,
      stabling_geometry,
      fitness_certificates,
      job_card_status,
      mileage,
      status: 'approved',
      source: 'seed',
    });
  }
  return docs;
};

// ─── Merge multiple day documents into a unified per-train view ───────────────
// Respects date-range data (fitness_certificates stay valid across their range)
const buildTrainMap = (docs, viewDates) => {
  // trainMap: { trainId -> { mileage: [], branding: [], cleaning: [], stabling: [], fitness: [], jobs: [] } }
  const trainMap = {};

  TRAIN_IDS.forEach(tid => {
    trainMap[tid] = {
      mileage: [],
      branding: [],
      cleaning: [],
      stabling: null,
      fitness: null,
      jobs: [],
    };
  });

  // Sort docs by date
  const sortedDocs = [...docs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  sortedDocs.forEach(doc => {
    const docDate = doc.date;

    // Mileage — per-day snapshot
    (doc.mileage || []).forEach(m => {
      if (trainMap[m.train_id]) {
        trainMap[m.train_id].mileage.push({ date: docDate, ...m });
      }
    });

    // Stabling — keep latest
    (doc.stabling_geometry || []).forEach(s => {
      if (trainMap[s.train_id]) {
        trainMap[s.train_id].stabling = s;
      }
    });

    // Branding — date-ranged, keep active entries
    (doc.branding_priorities || []).forEach(b => {
      if (trainMap[b.train_id]) {
        // Avoid duplicates
        const alreadyHas = trainMap[b.train_id].branding.some(
          existing => existing.branding_type === b.branding_type && existing.valid_from === b.valid_from
        );
        if (!alreadyHas) {
          trainMap[b.train_id].branding.push(b);
        }
      }
    });

    // Cleaning — per-day
    (doc.cleaning_slots || []).forEach(c => {
      if (trainMap[c.train_id]) {
        trainMap[c.train_id].cleaning.push({ date: docDate, ...c });
      }
    });

    // Fitness — date-ranged (keep latest that's valid)
    (doc.fitness_certificates || []).forEach(f => {
      if (trainMap[f.train_id]) {
        trainMap[f.train_id].fitness = f; // always overwrite with latest
      }
    });

    // Jobs
    (doc.job_card_status || []).forEach(j => {
      if (trainMap[j.train_id]) {
        const alreadyHas = trainMap[j.train_id].jobs.some(ex => ex.job_id === j.job_id);
        if (!alreadyHas) {
          trainMap[j.train_id].jobs.push({ date: docDate, ...j });
        }
      }
    });
  });

  // Filter branding to active on any selected date
  TRAIN_IDS.forEach(tid => {
    trainMap[tid].branding = trainMap[tid].branding.filter(b =>
      viewDates.some(d => d >= (b.valid_from || '') && d <= (b.valid_to || d))
    );
  });

  return trainMap;
};

// ─── Status badge component ───────────────────────────────────────────────────
const Badge = ({ label, color }) => {
  const colors = {
    green: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    red: 'bg-red-100 text-red-800 border border-red-200',
    orange: 'bg-amber-100 text-amber-800 border border-amber-200',
    blue: 'bg-blue-100 text-blue-800 border border-blue-200',
    gray: 'bg-gray-100 text-gray-600 border border-gray-200',
    purple: 'bg-violet-100 text-violet-800 border border-violet-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color] || colors.gray}`}>
      {label}
    </span>
  );
};

// ─── Train Detail / Drill-down panel ─────────────────────────────────────────
const TrainDetailPanel = ({ trainId, trainData, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'mileage', label: 'Mileage', icon: TrendingUp },
    { id: 'branding', label: 'Branding', icon: Zap },
    { id: 'fitness', label: 'Fitness', icon: Shield },
    { id: 'jobs', label: 'Jobs', icon: Wrench },
  ];

  const mileageChartData = trainData.mileage
    .slice(-14)
    .map(m => ({ date: m.date, km: m.current_mileage_km }));

  const latestMileage = trainData.mileage[trainData.mileage.length - 1];
  const firstMileage = trainData.mileage[0];
  const totalGain = latestMileage && firstMileage
    ? latestMileage.current_mileage_km - firstMileage.current_mileage_km
    : 0;

  const activeBranding = trainData.branding[0];
  const brandingExposurePercent = activeBranding
    ? Math.min(100, Math.round((activeBranding.exposure_minutes / 7200) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-800 to-slate-700 sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Train className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-none">{trainId}</h2>
              <p className="text-slate-300 text-xs mt-0.5">
                {trainData.stabling?.yard || 'No depot data'} • Track {trainData.stabling?.track_no || '—'} • Berth {trainData.stabling?.berth || '—'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b bg-gray-50 px-4">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${activeTab === tab.id
                  ? 'border-slate-800 text-slate-800'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-gray-500 mb-1">Current Mileage</p>
                  <p className="text-xl font-bold text-slate-800">
                    {latestMileage ? latestMileage.current_mileage_km.toLocaleString() : '—'}
                  </p>
                  <p className="text-xs text-gray-400">km</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-gray-500 mb-1">Period Gain</p>
                  <p className="text-xl font-bold text-emerald-600">+{totalGain.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">km selected period</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-gray-500 mb-1">Fitness</p>
                  <p className={`text-sm font-bold mt-1 ${trainData.fitness?.status === 'Fit for Service' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {trainData.fitness?.status || 'Unknown'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-gray-500 mb-1">Open Jobs</p>
                  <p className="text-xl font-bold text-amber-600">
                    {trainData.jobs.filter(j => j.status === 'Open' || j.status === 'Pending').length}
                  </p>
                  <p className="text-xs text-gray-400">pending tasks</p>
                </div>
              </div>

              {/* Branding exposure bar */}
              {activeBranding && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-violet-900">{activeBranding.branding_type} Campaign</p>
                    <Badge label={`Priority ${activeBranding.priority_level}`} color="purple" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-violet-200 rounded-full h-2.5">
                      <div
                        className="bg-violet-600 h-2.5 rounded-full transition-all"
                        style={{ width: `${brandingExposurePercent}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-violet-700">{brandingExposurePercent}%</span>
                  </div>
                  <p className="text-xs text-violet-500 mt-1.5">
                    {activeBranding.exposure_minutes?.toLocaleString()} min • Valid {fmtDate(activeBranding.valid_from)} → {fmtDate(activeBranding.valid_to)}
                  </p>
                </div>
              )}

              {/* Stabling info */}
              {trainData.stabling && (
                <div className="border rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" /> Stabling Position
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs">Yard</p>
                      <p className="font-medium">{trainData.stabling.yard}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Track</p>
                      <p className="font-medium">{trainData.stabling.track_no}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Berth</p>
                      <p className="font-medium">{trainData.stabling.berth}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Orientation</p>
                      <p className="font-medium">{trainData.stabling.orientation}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Buffer Dist.</p>
                      <p className="font-medium">{trainData.stabling.distance_from_buffer_m}m</p>
                    </div>
                  </div>
                  {trainData.stabling.remarks && (
                    <p className="text-xs text-gray-500 mt-2 italic">"{trainData.stabling.remarks}"</p>
                  )}
                </div>
              )}

              {/* Latest cleaning */}
              {trainData.cleaning.length > 0 && (
                <div className="border rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Droplets className="w-4 h-4" /> Cleaning History ({trainData.cleaning.length} records)
                  </h4>
                  <div className="space-y-2">
                    {trainData.cleaning.slice(-3).reverse().map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                        <div>
                          <span className="font-medium">{c.cleaning_type}</span>
                          <span className="text-gray-400 ml-2 text-xs">{c.assigned_team}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{c.date}</span>
                          <Badge
                            label={c.status}
                            color={c.status === 'Completed' ? 'green' : c.status === 'In Progress' ? 'orange' : 'blue'}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MILEAGE TAB */}
          {activeTab === 'mileage' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-gray-400">Latest</p>
                  <p className="text-lg font-bold">{latestMileage?.current_mileage_km?.toLocaleString() || '—'} km</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <p className="text-xs text-gray-400">Period Gain</p>
                  <p className="text-lg font-bold text-emerald-600">+{totalGain.toLocaleString()} km</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs text-gray-400">Days Tracked</p>
                  <p className="text-lg font-bold text-blue-600">{trainData.mileage.length}</p>
                </div>
              </div>
              {mileageChartData.length > 1 ? (
                <div className="border rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-4">Mileage Progression</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={mileageChartData}>
                      <defs>
                        <linearGradient id="mileageGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#334155" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#334155" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={v => [`${v.toLocaleString()} km`, 'Mileage']} labelFormatter={d => `Date: ${d}`} />
                      <Area type="monotone" dataKey="km" stroke="#334155" strokeWidth={2} fill="url(#mileageGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="border rounded-xl p-8 text-center text-gray-400 text-sm">
                  Select multiple dates to see mileage trend chart.
                </div>
              )}
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Date</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Mileage (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...trainData.mileage].reverse().slice(0, 10).map((m, i) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-600">{m.date}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium">{m.current_mileage_km.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BRANDING TAB */}
          {activeTab === 'branding' && (
            <div className="space-y-4">
              {trainData.branding.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Zap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No active branding campaigns for selected dates.</p>
                </div>
              ) : (
                trainData.branding.map((b, i) => {
                  const pct = Math.min(100, Math.round((b.exposure_minutes / 7200) * 100));
                  return (
                    <div key={i} className="border rounded-xl p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="font-bold text-slate-800">{b.branding_type}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Approved by {b.approved_by}</p>
                        </div>
                        <Badge label={`Priority ${b.priority_level}`} color="purple" />
                      </div>
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Exposure Completion</span>
                          <span className="font-bold">{pct}%</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-3">
                          <div className="bg-violet-500 h-3 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 mt-3">
                        <div><span className="text-gray-400">Exposure Minutes</span><br />{b.exposure_minutes?.toLocaleString()} min</div>
                        <div><span className="text-gray-400">Valid Period</span><br />{fmtDate(b.valid_from)} → {fmtDate(b.valid_to)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* FITNESS TAB */}
          {activeTab === 'fitness' && (
            <div className="space-y-4">
              {!trainData.fitness ? (
                <div className="text-center py-10 text-gray-400 text-sm">No fitness certificate data available.</div>
              ) : (
                <>
                  <div className={`rounded-xl p-5 border ${trainData.fitness.status === 'Fit for Service' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3">
                      {trainData.fitness.status === 'Fit for Service'
                        ? <CheckCircle className="w-8 h-8 text-emerald-600" />
                        : <AlertTriangle className="w-8 h-8 text-red-500" />
                      }
                      <div>
                        <p className="font-bold text-lg">{trainData.fitness.status}</p>
                        <p className="text-xs text-gray-500">Certificate validity status</p>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Certificate Type</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Valid Until</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Rolling Stock', key: 'rolling_stock_validity' },
                          { label: 'Signalling', key: 'signalling_validity' },
                          { label: 'Telecom', key: 'telecom_validity' },
                        ].map(cert => {
                          const expiry = trainData.fitness[cert.key];
                          const isExpired = expiry && expiry < today();
                          return (
                            <tr key={cert.key} className="border-t">
                              <td className="px-4 py-3">{cert.label}</td>
                              <td className="px-4 py-3 text-right font-mono text-sm">{fmtDate(expiry)}</td>
                              <td className="px-4 py-3 text-right">
                                <Badge label={isExpired ? 'Expired' : 'Valid'} color={isExpired ? 'red' : 'green'} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400 italic text-center">
                    ℹ️ Fitness certificates are shown for all dates within their validity period.
                  </p>
                </>
              )}
            </div>
          )}

          {/* JOBS TAB */}
          {activeTab === 'jobs' && (
            <div className="space-y-3">
              {trainData.jobs.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Wrench className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No job cards for selected dates.</p>
                </div>
              ) : (
                trainData.jobs.map((j, i) => (
                  <div key={i} className="border rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{j.task}</p>
                        <p className="text-xs text-gray-400">{j.job_id} • {j.assigned_team}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Badge
                          label={j.priority}
                          color={j.priority === 'High' ? 'red' : j.priority === 'Medium' ? 'orange' : 'gray'}
                        />
                        <Badge
                          label={j.status}
                          color={j.status === 'Completed' ? 'green' : j.status === 'Open' ? 'red' : 'orange'}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      Date: {j.date} • Due: {fmtDate(j.due_date)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Date selector component ──────────────────────────────────────────────────
const DateSelector = ({ selectedDates, onToggle, onClear }) => {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(month.year, month.month, 1).getDay();
  const monthName = new Date(month.year, month.month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => setMonth(m => {
    const d = new Date(m.year, m.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setMonth(m => {
    const d = new Date(m.year, m.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold text-sm text-gray-700">{monthName}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = selectedDates.includes(dateStr);
          const isToday = dateStr === today();
          return (
            <button
              key={day}
              onClick={() => onToggle(dateStr)}
              className={`
                text-center text-xs py-1.5 rounded-lg font-medium transition
                ${isSelected ? 'bg-slate-800 text-white' : isToday ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-100 text-gray-700'}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>

      {selectedDates.length > 0 && (
        <button
          onClick={onClear}
          className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 transition underline"
        >
          Clear all ({selectedDates.length} selected)
        </button>
      )}
    </div>
  );
};

// ─── Fleet overview stat card ─────────────────────────────────────────────────
const StatCard = ({ label, value, sub, icon: Icon, color }) => {
  const colors = {
    slate: 'bg-slate-800 text-white',
    green: 'bg-emerald-500 text-white',
    orange: 'bg-amber-500 text-white',
    red: 'bg-red-500 text-white',
    blue: 'bg-blue-500 text-white',
    purple: 'bg-violet-500 text-white',
  };
  return (
    <div className={`${colors[color]} rounded-2xl p-5`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium opacity-80">{label}</p>
        <Icon className="w-4 h-4 opacity-70" />
      </div>
      <p className="text-3xl font-bold leading-none">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1.5">{sub}</p>}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function TrainDashboard() {
  const [firestoreDocs, setFirestoreDocs] = useState([]);
  const [loadingFirestore, setLoadingFirestore] = useState(true);
  const [selectedDates, setSelectedDates] = useState([today()]);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepot, setFilterDepot] = useState('All');
  const [filterFitness, setFilterFitness] = useState('All');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fetch approved docs from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'trainInduction'),
      where('status', '==', 'approved')
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = [];
      snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
      setFirestoreDocs(docs);
      setLoadingFirestore(false);
    }, () => setLoadingFirestore(false));

    return () => unsub();
  }, []);

  // Toggle a date in selected list
  const toggleDate = (dateStr) => {
    setSelectedDates(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr].sort()
    );
  };

  // Build unified docs: Firestore real data + seed data for selected dates with no Firestore data
  const allDocs = useMemo(() => {
    const firestoreDates = new Set(firestoreDocs.map(d => d.date));
    const seedDocs = [];
    selectedDates.forEach(d => {
      if (!firestoreDates.has(d)) {
        seedDocs.push(...generateSeedData(d));
      }
    });
    const relevant = firestoreDocs.filter(d => selectedDates.includes(d.date));
    return [...relevant, ...seedDocs];
  }, [firestoreDocs, selectedDates]);

  // Build per-train map
  const trainMap = useMemo(() => buildTrainMap(allDocs, selectedDates), [allDocs, selectedDates]);

  // Fleet stats
  const fleetStats = useMemo(() => {
    const fitCount = TRAIN_IDS.filter(id => trainMap[id]?.fitness?.status === 'Fit for Service').length;
    const openJobs = TRAIN_IDS.reduce((acc, id) => acc + trainMap[id]?.jobs.filter(j => j.status === 'Open').length, 0);
    const activeBranding = TRAIN_IDS.filter(id => trainMap[id]?.branding.length > 0).length;
    const avgMileage = TRAIN_IDS.reduce((acc, id) => {
      const m = trainMap[id]?.mileage;
      return acc + (m?.length > 0 ? m[m.length - 1].current_mileage_km : 0);
    }, 0) / 30;
    return { fitCount, openJobs, activeBranding, avgMileage: Math.round(avgMileage) };
  }, [trainMap]);

  // Filtered train list
  const filteredTrains = useMemo(() => {
    return TRAIN_IDS.filter(id => {
      if (searchQuery && !id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterDepot !== 'All' && trainMap[id]?.stabling?.yard !== filterDepot) return false;
      if (filterFitness === 'Fit' && trainMap[id]?.fitness?.status !== 'Fit for Service') return false;
      if (filterFitness === 'Check' && trainMap[id]?.fitness?.status !== 'Requires Check') return false;
      return true;
    });
  }, [searchQuery, filterDepot, filterFitness, trainMap]);

  // Fleet mileage chart data
  const fleetChartData = useMemo(() => {
    return selectedDates.map(d => ({
      date: d.slice(5),
      avgMileage: Math.round(
        TRAIN_IDS.reduce((acc, id) => {
          const m = trainMap[id]?.mileage.find(x => x.date === d);
          return acc + (m?.current_mileage_km || 0);
        }, 0) / 30
      ),
    }));
  }, [selectedDates, trainMap]);

  const selectedTrain_data = selectedTrain ? trainMap[selectedTrain] : null;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Top bar */}
      <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Train className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">KMRL Train Operations</h1>
            <p className="text-slate-300 text-xs">Fleet Management Dashboard — {TRAIN_IDS.length} trains</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {selectedDates.length === 0 ? 'No date selected' : selectedDates.length === 1 ? selectedDates[0] : `${selectedDates.length} dates selected`}
          </span>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="ml-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs transition flex items-center gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5" />
            {sidebarOpen ? 'Hide' : 'Show'} Calendar
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Sidebar: date selector + filters */}
        {sidebarOpen && (
          <div className="w-64 flex-shrink-0 overflow-y-auto border-r bg-white p-4 space-y-4">
            <DateSelector
              selectedDates={selectedDates}
              onToggle={toggleDate}
              onClear={() => setSelectedDates([])}
            />

            {/* Filters */}
            <div className="bg-white border rounded-2xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Filters</h3>

              <div className="mb-3">
                <label className="text-xs text-gray-400 mb-1 block">Search Train</label>
                <input
                  type="text"
                  placeholder="KMRL-..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>

              <div className="mb-3">
                <label className="text-xs text-gray-400 mb-1 block">Depot</label>
                <select
                  value={filterDepot}
                  onChange={e => setFilterDepot(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                >
                  <option value="All">All Depots</option>
                  <option value="Muttom Depot">Muttom Depot</option>
                  <option value="Kalamassery Depot">Kalamassery Depot</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Fitness Status</label>
                <select
                  value={filterFitness}
                  onChange={e => setFilterFitness(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                >
                  <option value="All">All</option>
                  <option value="Fit">Fit for Service</option>
                  <option value="Check">Requires Check</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Fleet KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Fleet" value={30} sub="KMRL-1 to KMRL-30" icon={Train} color="slate" />
            <StatCard label="Fit for Service" value={fleetStats.fitCount} sub={`${30 - fleetStats.fitCount} require check`} icon={CheckCircle} color="green" />
            <StatCard label="Open Job Cards" value={fleetStats.openJobs} sub="Across selected dates" icon={AlertTriangle} color="orange" />
            <StatCard label="Active Branding" value={fleetStats.activeBranding} sub="Trains with campaigns" icon={Zap} color="purple" />
          </div>

          {/* Fleet mileage chart */}
          {selectedDates.length > 1 && (
            <div className="bg-white border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4" /> Fleet Average Mileage Trend
              </h3>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={fleetChartData}>
                  <defs>
                    <linearGradient id="fleetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1e293b" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#1e293b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={v => [`${v.toLocaleString()} km`, 'Avg Mileage']} />
                  <Area type="monotone" dataKey="avgMileage" stroke="#1e293b" strokeWidth={2} fill="url(#fleetGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Train grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">
                Train Fleet <span className="text-gray-400 font-normal text-sm">({filteredTrains.length} shown)</span>
              </h2>
            </div>

            {selectedDates.length === 0 ? (
              <div className="bg-white border rounded-2xl p-12 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Select one or more dates from the calendar</p>
                <p className="text-gray-400 text-sm mt-1">to view train operations data</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredTrains.map(trainId => {
                  const data = trainMap[trainId];
                  const fitness = data.fitness;
                  const latestMileage = data.mileage[data.mileage.length - 1];
                  const openJobs = data.jobs.filter(j => j.status === 'Open').length;
                  const hasBranding = data.branding.length > 0;
                  const isFit = fitness?.status === 'Fit for Service';

                  return (
                    <button
                      key={trainId}
                      onClick={() => setSelectedTrain(trainId)}
                      className="bg-white border rounded-2xl p-4 text-left hover:shadow-md hover:border-slate-300 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isFit ? 'bg-emerald-100' : 'bg-red-100'}`}>
                            <Train className={`w-3.5 h-3.5 ${isFit ? 'text-emerald-600' : 'text-red-500'}`} />
                          </div>
                          <span className="font-bold text-sm text-slate-800">{trainId}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
                      </div>

                      <div className="space-y-1.5 text-xs text-gray-500">
                        <div className="flex justify-between">
                          <span>Mileage</span>
                          <span className="font-medium text-gray-700">
                            {latestMileage ? `${latestMileage.current_mileage_km.toLocaleString()} km` : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Depot</span>
                          <span className="font-medium text-gray-700 truncate max-w-[100px]">{data.stabling?.yard?.replace(' Depot', '') || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Fitness</span>
                          <Badge label={isFit ? 'Fit' : 'Check'} color={isFit ? 'green' : 'red'} />
                        </div>
                      </div>

                      {/* Indicators row */}
                      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t">
                        {hasBranding && <Badge label="Branding" color="purple" />}
                        {openJobs > 0 && <Badge label={`${openJobs} Job${openJobs > 1 ? 's' : ''}`} color="orange" />}
                        {data.cleaning.length > 0 && <Badge label="Clean" color="blue" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Train detail panel */}
      {selectedTrain && selectedTrain_data && (
        <TrainDetailPanel
          trainId={selectedTrain}
          trainData={selectedTrain_data}
          onClose={() => setSelectedTrain(null)}
        />
      )}
    </div>
  );
}