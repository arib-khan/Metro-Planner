"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db, waitForAuthReady } from '../firebase/config';
import { Calendar, Clock, Wrench, TrendingUp, MapPin, RefreshCw, Download, ChevronDown, ChevronUp, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Station data — 24 stations with realistic cumulative travel times from Aluva
// Each gap ≈ 2–2.5 min. Total run: ~55 min end-to-end.
// ─────────────────────────────────────────────────────────────────────────────
const STATIONS = [
  { name: 'Aluva', cumMin: 0 },
  { name: 'Pulinchodu', cumMin: 2.5 },
  { name: 'Companypady', cumMin: 5 },
  { name: 'Ambattukavu', cumMin: 7.5 },
  { name: 'Muttom', cumMin: 10 },
  { name: 'Kalamassery', cumMin: 13 },
  { name: 'CUSAT', cumMin: 16 },
  { name: 'Pathadipalam', cumMin: 18.5 },
  { name: 'Edappally', cumMin: 21 },
  { name: 'Changampuzha Park', cumMin: 23.5 },
  { name: 'Palarivattom', cumMin: 26 },
  { name: 'JLN Stadium', cumMin: 28.5 },
  { name: 'Kaloor Town Hall', cumMin: 31 },
  { name: 'MG Road', cumMin: 33.5 },
  { name: "Maharaja's College", cumMin: 36 },
  { name: 'Ernakulam South', cumMin: 38.5 },
  { name: 'Kadavanthra', cumMin: 41 },
  { name: 'Elamkulam', cumMin: 43.5 },
  { name: 'Vyttila', cumMin: 46 },
  { name: 'Thaikoodam', cumMin: 48 },
  { name: 'Petta', cumMin: 50 },
  { name: 'Vadakkekotta', cumMin: 51.5 },
  { name: 'SN Junction', cumMin: 53 },
  { name: 'Tripunithura Terminal', cumMin: 55 },
];

const N_STATIONS = STATIONS.length;  // 24
const DWELL_SEC = 30;               // 30s stop at intermediate stations
const TERMINAL_TURNAROUND = 5;        // 5 min turnaround at each terminus
const ONE_WAY_MIN = STATIONS[N_STATIONS - 1].cumMin;  // 55 min
const CYCLE_MIN = ONE_WAY_MIN + TERMINAL_TURNAROUND; // 60 min per one-way + turnaround

const OP_START_MIN = 6 * 60;  // 06:00
const OP_END_MIN = 23 * 60;  // 23:00

const TRAIN_IDS = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);
const todayStr = () => new Date().toISOString().split('T')[0];

const fmt = (totalMin) => {
  const m = Math.round(totalMin);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const fmtSec = (totalMin) => {
  const totalSeconds = Math.round(totalMin * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// computeStationTimetable
// Given a departure time (minutes from midnight) and direction,
// returns the full list of station stops with arrival, dwell, departure.
//
// NORTHBOUND: Aluva (index 0) → Tripunithura Terminal (index 23)
// SOUTHBOUND: Tripunithura Terminal (index 23) → Aluva (index 0)
//
// Inter-station travel: cumMin diff between consecutive stations.
// Dwell: 30 sec at intermediate stations, 5 min at terminus (turnaround).
// ─────────────────────────────────────────────────────────────────────────────
const computeStationTimetable = (departureMin, direction) => {
  const isNB = direction === 'Northbound';
  const ordered = isNB ? [...STATIONS] : [...STATIONS].reverse();
  const stops = [];

  // Origin station: departure = given time, no prior arrival
  stops.push({
    station: ordered[0].name,
    isTerminus: true,
    arrivalMin: null,
    dwellSec: TERMINAL_TURNAROUND * 60,
    departMin: departureMin,
  });

  let cursor = departureMin;

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const travelMin = Math.abs(curr.cumMin - prev.cumMin); // always positive
    const arrivalMin = cursor + travelMin;
    const isLast = i === ordered.length - 1;
    const dwellSec = isLast ? TERMINAL_TURNAROUND * 60 : DWELL_SEC;
    const departMin = arrivalMin + dwellSec / 60;

    stops.push({
      station: curr.name,
      isTerminus: isLast,
      arrivalMin,
      dwellSec,
      departMin: isLast ? null : departMin, // last stop: no departure on this trip
    });

    cursor = arrivalMin + (isLast ? 0 : dwellSec / 60);
  }

  return stops;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildSchedule — per-train rotation model
//
// PROBLEM WITH THE PREVIOUS CODE:
//   Trains were split into NB pool and SB pool by index parity, then round-robin
//   assigned to slots in their pool forever. This meant KMRL-2 could be assigned
//   Aluva→Tripunithura twice in a row because the pool just cycled regardless of
//   which direction the train physically was after its last trip.
//
// THE CORRECT MODEL:
//   Each train has its own personal schedule built independently.
//   Starting condition: the train starts at its stabling depot terminal.
//   Trains stabled at Muttom/Aluva side → first trip is Northbound (Aluva→Trip).
//   Trains stabled at Kalamassery/Tripunithura side → first trip is Southbound.
//   After completing a trip, the train is physically AT the far terminal.
//   It turnarounds (5 min) and then departs in the OPPOSITE direction.
//   This guarantees: NB → SB → NB → SB → ... strictly alternating per train.
//
// HEADWAY (service frequency):
//   With N fit trains, the headway from the passenger's perspective is:
//   headway = CYCLE_MIN / (N / 2) — since half the trains service each direction.
//   We stagger each train's first departure by (index * stagger) minutes so
//   departures spread evenly across the operating window at each terminal.
//
// RESULT: Each train appears in the schedule with strictly alternating NB/SB trips.
//   No train ever repeats the same direction without first completing the return.
// ─────────────────────────────────────────────────────────────────────────────
const buildSchedule = (fleet) => {
  const fit = fleet.filter(t => t.isFit);
  const unfit = fleet.filter(t => !t.isFit && t.hasMasterData);
  const noData = fleet.filter(t => !t.hasMasterData);

  // All trips across all trains — each trip is one one-way run
  const allTrips = [];
  const ganttMap = {};
  fit.forEach(t => { ganttMap[t.train_id] = { train: t, trips: [] }; });

  // Stagger: spread first departures evenly.
  // If we have N fit trains and a cycle of 60 min, stagger = 60/N min apart.
  // This gives roughly even headway from the passenger's perspective.
  const N = fit.length;

  // Split fleet exactly in half:
  //   First  half → Northbound  from Aluva                at 06:00
  //   Second half → Southbound  from Tripunithura Terminal at 06:00
  // Each group staggers within itself — both start simultaneously.
  const half = Math.floor(N / 2);
  const nbTrains = fit.slice(0, half);
  const sbTrains = fit.slice(half);
  const nbStagger = nbTrains.length > 0 ? CYCLE_MIN / nbTrains.length : 5;
  const sbStagger = sbTrains.length > 0 ? CYCLE_MIN / sbTrains.length : 5;

  const addTrips = (train, i, firstDep, firstDir) => {
    let cursor = firstDep;
    let direction = firstDir;
    while (cursor + ONE_WAY_MIN <= OP_END_MIN) {
      const isNB = direction === 'Northbound';
      const origin = isNB ? 'Aluva' : 'Tripunithura Terminal';
      const dest = isNB ? 'Tripunithura Terminal' : 'Aluva';
      const stops = computeStationTimetable(cursor, direction);
      allTrips.push({
        trainId: train.train_id,
        departure: fmt(cursor),
        arrival: fmt(cursor + ONE_WAY_MIN),
        route: `${origin} → ${dest}`,
        direction,
        status: 'On Time',
        bay: `Bay ${(i % 4) + 1}`,
        depot: train.depot,
        mileage: train.mileage,
        stops,
        depMin: cursor,
        arrMin: cursor + ONE_WAY_MIN,
      });
      ganttMap[train.train_id].trips.push({ startMin: cursor, endMin: cursor + ONE_WAY_MIN, direction });
      cursor += CYCLE_MIN;
      direction = direction === 'Northbound' ? 'Southbound' : 'Northbound';
    }
  };

  // First half — NB from Aluva, staggered within the group
  nbTrains.forEach((train, i) => addTrips(train, i, OP_START_MIN + i * nbStagger, 'Northbound'));
  // Second half — SB from Tripunithura Terminal, staggered within the group
  sbTrains.forEach((train, i) => addTrips(train, i, OP_START_MIN + i * sbStagger, 'Southbound'));

  // Sort all trips by departure time for the main schedule table
  allTrips.sort((a, b) => a.depMin - b.depMin);

  // Build gantt rows
  const ganttRows = Object.values(ganttMap)
    .filter(b => b.trips.length > 0)
    .sort((a, b) =>
      parseInt(a.train.train_id.replace('KMRL-', '')) -
      parseInt(b.train.train_id.replace('KMRL-', ''))
    );

  // Maintenance / no-data rows
  const staticRows = [];
  unfit.forEach(train => staticRows.push({
    trainId: train.train_id, departure: '—', arrival: '—',
    route: 'Under Maintenance', direction: '—', status: 'Maintenance',
    bay: 'Workshop', depot: train.depot, mileage: train.mileage, stops: [],
  }));
  noData.forEach(train => staticRows.push({
    trainId: train.train_id, departure: '—', arrival: '—',
    route: 'No data uploaded', direction: '—', status: 'No Data',
    bay: '—', depot: '—', mileage: null, stops: [],
  }));

  return { allTrips, staticRows, ganttRows };
};

// ─────────────────────────────────────────────────────────────────────────────
// Fitness check
// ─────────────────────────────────────────────────────────────────────────────
const isFitnessValid = (cert, date) => {
  if (!cert) return false;
  const { rolling_stock_validity: rs, signalling_validity: sig, telecom_validity: tel } = cert;
  return !!(rs >= date && sig >= date && tel >= date);
};

// ─────────────────────────────────────────────────────────────────────────────
// StationTimetableModal — shows full stop-by-stop timing for one trip
// ─────────────────────────────────────────────────────────────────────────────
const StationTimetableModal = ({ trip, onClose }) => {
  if (!trip) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-800">{trip.trainId}</span>
              {trip.direction === 'Northbound'
                ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">↑ Northbound</span>
                : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">↓ Southbound</span>
              }
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{trip.route} · {trip.departure} – {trip.arrival}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Station list */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[1.35rem] top-4 bottom-4 w-0.5 bg-gray-200" />

            {trip.stops.map((stop, i) => {
              const isFirst = i === 0;
              const isLast = i === trip.stops.length - 1;
              const dotColor = stop.isTerminus
                ? (trip.direction === 'Northbound' ? 'bg-blue-500' : 'bg-emerald-500')
                : 'bg-gray-300';
              return (
                <div key={i} className="flex gap-4 mb-0 relative">
                  {/* Dot */}
                  <div className="flex flex-col items-center z-10 flex-shrink-0 w-11">
                    <div className={`w-3 h-3 rounded-full border-2 border-white shadow ${dotColor} mt-3.5`} />
                    <span className="text-[10px] text-gray-400 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  </div>

                  {/* Content */}
                  <div className={`flex-1 pb-4 ${isLast ? '' : 'border-b border-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2 pt-2">
                      <span className={`text-sm font-semibold ${stop.isTerminus ? 'text-slate-800' : 'text-slate-700'}`}>
                        {stop.station}
                        {stop.isTerminus && (
                          <span className="ml-1.5 text-[10px] font-normal text-gray-400 uppercase tracking-wide">
                            {isFirst ? 'Origin' : 'Terminus'}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex gap-4 mt-1.5 text-xs">
                      {stop.arrivalMin !== null ? (
                        <div className="flex flex-col">
                          <span className="text-gray-400 uppercase tracking-wide text-[10px]">Arrives</span>
                          <span className="font-mono font-semibold text-gray-700">{fmtSec(stop.arrivalMin)}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-gray-400 uppercase tracking-wide text-[10px]">Origin</span>
                          <span className="font-mono font-semibold text-gray-700">{fmtSec(stop.departMin)}</span>
                        </div>
                      )}

                      <div className="flex flex-col">
                        <span className="text-gray-400 uppercase tracking-wide text-[10px]">Dwell</span>
                        <span className="font-mono text-gray-600">
                          {stop.dwellSec >= 60
                            ? `${stop.dwellSec / 60} min`
                            : `${stop.dwellSec}s`}
                        </span>
                      </div>

                      {stop.departMin !== null && !isFirst && (
                        <div className="flex flex-col">
                          <span className="text-gray-400 uppercase tracking-wide text-[10px]">Departs</span>
                          <span className="font-mono font-semibold text-slate-800">{fmtSec(stop.departMin)}</span>
                        </div>
                      )}

                      {isLast && (
                        <div className="flex flex-col">
                          <span className="text-gray-400 uppercase tracking-wide text-[10px]">End of Trip</span>
                          <span className="font-mono font-semibold text-slate-800">{fmtSec(stop.arrivalMin)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex-shrink-0 flex items-center justify-between text-xs text-gray-400">
          <span>{trip.stops.length} stations · {ONE_WAY_MIN} min total · 30s dwell at intermediate stops · 5 min at terminals</span>
          <button onClick={onClose} className="text-slate-600 font-medium hover:text-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function Scheduling() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [masterData, setMasterData] = useState({});
  const [dailyDocs, setDailyDocs] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [allTrips, setAllTrips] = useState([]);
  const [staticRows, setStaticRows] = useState([]);
  const [ganttRows, setGanttRows] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(todayStr());
  const [dirFilter, setDirFilter] = useState('All');
  const [trainFilter, setTrainFilter] = useState('');
  const [selectedTrip, setSelectedTrip] = useState(null); // for station modal

  const masterUnsubRef = useRef(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    waitForAuthReady().then(u => { setCurrentUser(u); setAuthReady(true); });
  }, []);

  // ── Live master data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!authReady || !currentUser || !db) { setLoadingData(false); return; }
    if (masterUnsubRef.current) { masterUnsubRef.current(); masterUnsubRef.current = null; }
    let active = true;
    const unsub = onSnapshot(
      collection(db, 'trainMasterData'),
      { includeMetadataChanges: false },
      snap => {
        if (!active) return;
        const map = {};
        snap.forEach(d => { map[d.id] = d.data(); });
        setMasterData(map);
        setLoadingData(false);
      },
      err => { if (!active) return; console.error('[master]', err); setLoadingData(false); }
    );
    masterUnsubRef.current = unsub;
    return () => { active = false; unsub(); masterUnsubRef.current = null; };
  }, [authReady, currentUser]);

  // ── Daily data for selected date ──────────────────────────────────────────
  useEffect(() => {
    if (!authReady || !currentUser || !db) return;
    let cancelled = false;
    getDocs(query(collection(db, 'trainDailyData'), where('date', '==', scheduleDate)))
      .then(snap => {
        if (cancelled) return;
        const docs = [];
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        setDailyDocs(docs);
      })
      .catch(err => console.error('[daily]', err));
    return () => { cancelled = true; };
  }, [authReady, currentUser, scheduleDate]);

  // ── Fleet merge ───────────────────────────────────────────────────────────
  const fleet = useMemo(() => TRAIN_IDS.map(tid => {
    const master = masterData[tid] || null;
    const daily = dailyDocs.find(d => d.train_id === tid) || null;
    const cert = master?.fitness_certificates || null;
    return {
      train_id: tid,
      isFit: isFitnessValid(cert, scheduleDate),
      hasMasterData: master !== null,
      depot: daily?.stabling_geometry?.yard || '',
      mileage: daily?.mileage?.current_mileage_km ?? null,
    };
  }), [masterData, dailyDocs, scheduleDate]);

  // ── Auto-regenerate ───────────────────────────────────────────────────────
  useEffect(() => { if (!loadingData) regenerate(); }, [fleet]); // eslint-disable-line

  const regenerate = () => {
    setIsGenerating(true);
    const result = buildSchedule(fleet);
    setAllTrips(result.allTrips);
    setStaticRows(result.staticRows);
    setGanttRows(result.ganttRows);
    setTimeout(() => setIsGenerating(false), 300);
  };

  // ── Metrics ───────────────────────────────────────────────────────────────
  const fitTotal = fleet.filter(t => t.isFit).length;
  const maintenanceCount = fleet.filter(t => !t.isFit && t.hasMasterData).length;
  const activeTrains = new Set(allTrips.map(t => t.trainId)).size;
  const totalTrips = allTrips.length;
  const efficiency = fitTotal > 0 ? ((activeTrains / fitTotal) * 100).toFixed(0) : '0';

  // ── Filtered trips for table ──────────────────────────────────────────────
  const filteredTrips = useMemo(() => {
    return allTrips.filter(t => {
      if (dirFilter === 'NB' && t.direction !== 'Northbound') return false;
      if (dirFilter === 'SB' && t.direction !== 'Southbound') return false;
      if (trainFilter && !t.trainId.toLowerCase().includes(trainFilter.toLowerCase())) return false;
      return true;
    });
  }, [allTrips, dirFilter, trainFilter]);

  const pct = (min) => `${(min / 1440) * 100}%`;

  const getStatusColor = (status) => ({
    'On Time': 'bg-gray-900 text-white',
    'Maintenance': 'bg-red-100 text-red-700 border border-red-300',
    'No Data': 'bg-gray-100 text-gray-400 border border-gray-200',
  }[status] || 'bg-gray-500 text-white');

  const exportCSV = () => {
    const rows = [
      ['Train ID', 'Departure', 'Arrival', 'Direction', 'Route', 'Status', 'Bay', 'Depot', 'Mileage (km)'],
      ...allTrips.map(t => [t.trainId, t.departure, t.arrival, t.direction, t.route, 'On Time', t.bay, t.depot, t.mileage ?? '—']),
      ...staticRows.map(r => [r.trainId, r.departure, r.arrival, r.direction, r.route, r.status, r.bay, r.depot, r.mileage ?? '—']),
    ];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `kmrl_schedule_${scheduleDate}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  // ── Auth gates ────────────────────────────────────────────────────────────
  if (!authReady) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Connecting to Firebase…</p>
      </div>
    </div>
  );
  if (!currentUser) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-500">Please sign in to view the schedule.</p>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Station timetable modal */}
      {selectedTrip && (
        <StationTimetableModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
      )}

      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-gray-900" />
                <h2 className="text-3xl font-bold text-gray-900">Train Scheduling</h2>
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700
                  bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Live Firebase
                </span>
                {loadingData && (
                  <span className="flex items-center gap-1.5 text-xs text-blue-600">
                    <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Loading…
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input type="date" value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg
                    text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"/>
                <button onClick={exportCSV}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg
                    text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
                  <Download className="h-4 w-4" /> Export CSV
                </button>
                <button onClick={regenerate} disabled={isGenerating}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium
                    hover:bg-gray-800 flex items-center gap-2 disabled:opacity-50">
                  <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                  Regenerate
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600 max-w-4xl">
              Each train alternates <strong>NB → SB → NB → SB</strong> strictly — it never repeats
              a direction without first completing the return. Click <strong>View Stations</strong>
              on any trip to see full stop-by-stop arrival, dwell, and departure times.
            </p>
            {!loadingData && fleet.filter(t => t.hasMasterData).length === 0 && (
              <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
                ⚠️ No Firebase data for {scheduleDate}. Upload via bulk upload then Regenerate.
              </div>
            )}
          </div>

          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Active Trains', value: activeTrains, sub: `${totalTrips} trips today`, icon: <Calendar className="h-5 w-5 text-gray-400" />, color: 'text-green-600' },
              { label: 'Fit for Service', value: fitTotal, sub: `${fitTotal}/30 certified`, icon: <TrendingUp className="h-5 w-5 text-gray-400" />, color: 'text-blue-600' },
              { label: 'In Maintenance', value: maintenanceCount, sub: 'Unfit — certs expired/missing', icon: <Wrench className="h-5 w-5 text-gray-400" />, color: 'text-red-600' },
              { label: 'Fleet Efficiency', value: `${efficiency}%`, sub: 'Strict NB↔SB alternation', icon: <Clock className="h-5 w-5 text-gray-400" />, color: 'text-green-600' },
            ].map(({ label, value, sub, icon, color }) => (
              <div key={label} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">{label}</span>{icon}
                </div>
                <div className="text-3xl font-bold text-gray-900">{value}</div>
                <div className={`text-xs mt-1 ${color}`}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ── Schedule table ────────────────────────────────────────────── */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="px-6 py-4 border-b flex flex-wrap items-center gap-3">
              <MapPin className="h-5 w-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Today&apos;s Schedule</h3>
              <span className="text-xs text-gray-400">({filteredTrips.length} trips shown)</span>

              {/* Filters */}
              <div className="ml-auto flex flex-wrap gap-2 items-center">
                {/* Train search */}
                <input
                  type="text"
                  placeholder="Filter train…"
                  value={trainFilter}
                  onChange={e => setTrainFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-gray-300 w-28"
                />
                {/* Direction filter */}
                <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
                  {[['All', 'All'], ['NB', '↑ NB'], ['SB', '↓ SB']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setDirFilter(val)}
                      className={`px-3 py-1.5 transition ${dirFilter === val
                        ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-auto max-h-[580px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-gray-200">
                  <tr>
                    {['Train', 'Dep', 'Arr', 'Dir', 'Route', 'Bay', 'Depot', 'Mileage', 'Stations'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-500
                        uppercase py-3 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((trip, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-semibold text-gray-900 whitespace-nowrap">{trip.trainId}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-700 text-xs">{trip.departure}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-700 text-xs">{trip.arrival}</td>
                      <td className="py-2.5 px-3">
                        {trip.direction === 'Northbound'
                          ? <span className="inline-flex px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200">↑ NB</span>
                          : <span className="inline-flex px-1.5 py-0.5 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">↓ SB</span>
                        }
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 text-xs max-w-[150px] truncate">{trip.route}</td>
                      <td className="py-2.5 px-3 text-gray-600 text-xs">{trip.bay}</td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs whitespace-nowrap">{trip.depot || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs whitespace-nowrap">
                        {trip.mileage != null ? `${trip.mileage.toLocaleString()} km` : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => setSelectedTrip(trip)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600
                            hover:text-blue-800 hover:underline whitespace-nowrap">
                          <MapPin className="w-3 h-3" /> View Stations
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Maintenance / no-data rows */}
                  {staticRows.map((r, i) => (
                    <tr key={`s${i}`} className="border-b border-gray-50 bg-gray-50/50">
                      <td className="py-2.5 px-3 font-semibold text-gray-500 whitespace-nowrap">{r.trainId}</td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs">—</td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs">—</td>
                      <td className="py-2.5 px-3 text-gray-300 text-xs">—</td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs">{r.route}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs">{r.bay}</td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs">{r.depot || '—'}</td>
                      <td />
                    </tr>
                  ))}

                  {filteredTrips.length === 0 && !loadingData && (
                    <tr><td colSpan={9} className="py-12 text-center text-sm text-gray-400">
                      No trips match your filter.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 24-Hour Gantt ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">24-Hour Operations Timeline</h3>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> ↑ NB</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> ↓ SB</span>
                <span className="text-gray-400">Each bar = one 55-min trip · Strictly alternating NB↔SB per train</span>
              </div>
            </div>

            {/* Hour markers */}
            <div className="flex mb-1 pl-20">
              {Array.from({ length: 13 }, (_, i) => i * 2).map(h => (
                <div key={h} className="flex-1 text-center text-xs text-gray-400">
                  {String(h).padStart(2, '0')}
                </div>
              ))}
            </div>
            <div className="mb-3 ml-20 h-px bg-gray-100" />

            <div className="space-y-1.5 max-h-[560px] overflow-y-auto">
              {ganttRows.length === 0 && (
                <p className="text-sm text-gray-300 text-center py-10">Generate schedule to see timeline.</p>
              )}
              {ganttRows.map(({ train, trips }) => (
                <div key={train.train_id} className="flex items-center gap-2 group">
                  <span className="text-xs font-medium text-gray-600 w-16 text-right flex-shrink-0">
                    {train.train_id}
                  </span>
                  <div className="flex-1 h-6 bg-gray-50 rounded relative border border-gray-100 overflow-hidden">
                    {/* Operating window shade */}
                    <div className="absolute inset-y-0 bg-gray-100 opacity-40"
                      style={{ left: pct(OP_START_MIN), width: pct(OP_END_MIN - OP_START_MIN) }} />
                    {trips.map((trip, ti) => {
                      // Verify strict alternation for tooltip
                      const prevDir = ti > 0 ? trips[ti - 1].direction : null;
                      const sameAsPrev = prevDir && prevDir === trip.direction;
                      return (
                        <div key={ti}
                          className={`absolute inset-y-0.5 rounded-sm cursor-pointer
                            ${trip.direction === 'Northbound' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-emerald-500 hover:bg-emerald-600'}
                            ${sameAsPrev ? 'ring-2 ring-red-500' : ''}
                          `}
                          style={{ left: pct(trip.startMin), width: pct(trip.endMin - trip.startMin) }}
                          title={`${trip.direction}: ${fmt(trip.startMin)} – ${fmt(trip.endMin)}${sameAsPrev ? ' ⚠ SAME DIR!' : ''}`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right flex-shrink-0">{trips.length}×</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Blue = Northbound (Aluva→Tripunithura) · Green = Southbound (Tripunithura→Aluva) ·
              Each train strictly alternates — gap between bars = 5 min terminal turnaround
            </p>
          </div>

        </main>
      </div>
    </>
  );
}