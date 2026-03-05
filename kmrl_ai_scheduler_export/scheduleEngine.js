/**
 * lib/scheduleEngine.js  (AI-Enhanced Edition)
 *
 * Drop-in replacement for the original scheduleEngine.js.
 * All original exports are preserved and unchanged.
 * New AI exports are added at the bottom.
 *
 * New exports
 * ────────────────────────────────────────────────────────────────────────────
 *  AI_API_BASE                — base URL for the Python AI backend
 *  fetchAISchedule(date?)     — fetches AI-ranked fleet for a given date
 *  fetchFleetStatus()         — fetches fit / not-fit / cert-warn breakdown
 *  fetchDemandForecast(date?) — fetches passenger demand forecast
 *  fetchModelMetrics()        — fetches ML model performance stats
 *  logDelayEvent(entry)       — posts a delay event to the live log
 *  buildAllTripsAI(aiSchedule, fleet) — builds trips using AI priority order
 *
 * The AI scheduler reorders the fleet before assigning departure slots:
 *   1. Fit trains (highest reliability score first)
 *   2. Cert-warning trains (usable but flagged)
 *   3. NOT FIT trains → placed at end / given no-service slots
 */

// ─────────────────────────────────────────────────────────────────────────────
// Station data  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const STATIONS = [
    { name: 'Aluva',                  cumMin: 0,    index: 0  },
    { name: 'Pulinchodu',             cumMin: 2.5,  index: 1  },
    { name: 'Companypady',            cumMin: 5,    index: 2  },
    { name: 'Ambattukavu',            cumMin: 7.5,  index: 3  },
    { name: 'Muttom',                 cumMin: 10,   index: 4  },
    { name: 'Kalamassery',            cumMin: 13,   index: 5  },
    { name: 'CUSAT',                  cumMin: 16,   index: 6  },
    { name: 'Pathadipalam',           cumMin: 18.5, index: 7  },
    { name: 'Edappally',              cumMin: 21,   index: 8  },
    { name: 'Changampuzha Park',      cumMin: 23.5, index: 9  },
    { name: 'Palarivattom',           cumMin: 26,   index: 10 },
    { name: 'JLN Stadium',            cumMin: 28.5, index: 11 },
    { name: 'Kaloor Town Hall',       cumMin: 31,   index: 12 },
    { name: 'MG Road',                cumMin: 33.5, index: 13 },
    { name: "Maharaja's College",     cumMin: 36,   index: 14 },
    { name: 'Ernakulam South',        cumMin: 38.5, index: 15 },
    { name: 'Kadavanthra',            cumMin: 41,   index: 16 },
    { name: 'Elamkulam',              cumMin: 43.5, index: 17 },
    { name: 'Vyttila',                cumMin: 46,   index: 18 },
    { name: 'Thaikoodam',             cumMin: 48,   index: 19 },
    { name: 'Petta',                  cumMin: 50,   index: 20 },
    { name: 'Vadakkekotta',           cumMin: 51.5, index: 21 },
    { name: 'SN Junction',            cumMin: 53,   index: 22 },
    { name: 'Tripunithura Terminal',  cumMin: 55,   index: 23 },
];

export const nameToSlug = (name) => name.replace(/\s+/g, '-').replace(/'/g, '');
export const slugToName = (slug) => {
    const found = STATIONS.find(s => nameToSlug(s.name) === slug);
    return found?.name ?? slug.replace(/-/g, ' ');
};
export const STATION_BY_NAME = Object.fromEntries(STATIONS.map(s => [s.name, s]));
export const STATION_BY_SLUG = Object.fromEntries(STATIONS.map(s => [nameToSlug(s.name), s]));

// ─────────────────────────────────────────────────────────────────────────────
// Timing constants  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const N_STATIONS          = STATIONS.length;
const DWELL_SEC           = 30;
const TERMINAL_TURNAROUND = 5;
export const ONE_WAY_MIN  = STATIONS[N_STATIONS - 1].cumMin;   // 55
export const CYCLE_MIN    = ONE_WAY_MIN + TERMINAL_TURNAROUND; // 60
export const OP_START_MIN = 6 * 60;   // 360
export const OP_END_MIN   = 23 * 60;  // 1380
export const CUE_WINDOW_SEC = 18;
export const TRAIN_IDS    = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);

// ─────────────────────────────────────────────────────────────────────────────
// Formatters  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const fmt = (m) => {
    const r = Math.round(m);
    return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
};
export const fmtClock = (m) => {
    const s = Math.round(m * 60);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const todayStr = () => new Date().toISOString().split('T')[0];
export const nowMin = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
};

// ─────────────────────────────────────────────────────────────────────────────
// Fitness check  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const isFitnessValid = (cert, date) => {
    if (!cert) return false;
    const { rolling_stock_validity: rs, signalling_validity: sig, telecom_validity: tel } = cert;
    return !!(rs >= date && sig >= date && tel >= date);
};

// ─────────────────────────────────────────────────────────────────────────────
// Build fleet  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const buildFleet = (masterData, dailyDocs, date) =>
    TRAIN_IDS.map(tid => {
        const master = masterData[tid] || null;
        const daily  = dailyDocs.find(d => d.train_id === tid) || null;
        const cert   = master?.fitness_certificates || null;
        return {
            train_id:      tid,
            isFit:         isFitnessValid(cert, date),
            hasMasterData: master !== null,
            depot:         daily?.stabling_geometry?.yard || '',
            mileage:       daily?.mileage?.current_mileage_km ?? null,
        };
    });

// ─────────────────────────────────────────────────────────────────────────────
// computeStops  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const computeStops = (departureMin, direction) => {
    const ordered = direction === 'Northbound' ? [...STATIONS] : [...STATIONS].reverse();
    const stops = [];

    stops.push({
        station: ordered[0].name, isTerminus: true,
        arrivalMin: null, dwellSec: TERMINAL_TURNAROUND * 60,
        departMin: departureMin,
    });

    let cursor = departureMin;
    for (let i = 1; i < ordered.length; i++) {
        const travelMin = Math.abs(ordered[i].cumMin - ordered[i - 1].cumMin);
        const arrMin    = cursor + travelMin;
        const isLast    = i === ordered.length - 1;
        const dwell     = isLast ? TERMINAL_TURNAROUND * 60 : DWELL_SEC;

        stops.push({
            station:    ordered[i].name,
            isTerminus: isLast,
            arrivalMin: arrMin,
            dwellSec:   dwell,
            departMin:  isLast ? arrMin + TERMINAL_TURNAROUND : arrMin + DWELL_SEC / 60,
        });
        cursor = arrMin;
    }
    return stops;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildAllTrips  (unchanged original — uses raw fleet order)
// ─────────────────────────────────────────────────────────────────────────────
export const buildAllTrips = (fleet) => {
    const fitFleet  = fleet.filter(t => t.isFit);
    const N         = fitFleet.length;
    const TOTAL_MIN = OP_END_MIN - OP_START_MIN;  // 1020
    const HEADWAY   = CYCLE_MIN / N;               // minutes between trains

    const trips = [];

    fitFleet.forEach((train, idx) => {
        const firstDep  = OP_START_MIN + idx * HEADWAY;
        const direction = idx % 2 === 0 ? 'Northbound' : 'Southbound';
        let   dep       = firstDep;
        let   dir       = direction;

        while (dep < OP_END_MIN) {
            const stops = computeStops(dep, dir);
            const arrMin = stops[stops.length - 1].arrivalMin;

            if (arrMin > OP_END_MIN) break;

            trips.push({
                trainId:   train.train_id,
                direction: dir,
                route:     dir === 'Northbound' ? 'Aluva → Tripunithura Terminal' : 'Tripunithura Terminal → Aluva',
                depMin:    dep,
                arrMin,
                stops,
            });

            dep += CYCLE_MIN;
            dir = dir === 'Northbound' ? 'Southbound' : 'Northbound';
        }
    });

    return trips.sort((a, b) => a.depMin - b.depMin);
};

// ─────────────────────────────────────────────────────────────────────────────
// computeRemainingExposure  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const computeRemainingExposure = (trainId, branding, allTrips, nowT) => {
    if (!branding || !branding.exposure_minutes) return null;
    const total        = branding.exposure_minutes;
    const now          = nowT ?? nowMin();
    const trainTrips   = allTrips.filter(t => t.trainId === trainId);
    const completed    = trainTrips.filter(t => t.arrMin <= now).length;
    const used         = completed * ONE_WAY_MIN;
    const remaining    = Math.max(0, total - used);
    const pct          = total > 0 ? Math.round((remaining / total) * 100) : 0;
    const status       = remaining === 0 ? 'exhausted'
        : pct <= 20 ? 'low'
        : completed > 0 ? 'active'
        : 'full';
    return { total, remaining, used, completedTrips: completed, pct, status };
};

// ─────────────────────────────────────────────────────────────────────────────
// getStationCalls  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const getStationCalls = (allTrips, stationName) => {
    const calls = [];
    for (const trip of allTrips) {
        const stopIdx = trip.stops.findIndex(s => s.station === stationName);
        if (stopIdx === -1) continue;
        const stop     = trip.stops[stopIdx];
        const prevStop = stopIdx > 0 ? trip.stops[stopIdx - 1] : null;
        const nextStop = stopIdx < trip.stops.length - 1 ? trip.stops[stopIdx + 1] : null;
        calls.push({
            trainId:     trip.trainId,
            direction:   trip.direction,
            route:       trip.route,
            isTerminus:  stop.isTerminus,
            arrivalMin:  stop.arrivalMin,
            departMin:   stop.departMin,
            dwellSec:    stop.dwellSec,
            nextStation: nextStop?.station ?? null,
            prevStation: prevStop?.station ?? null,
            arrivalTime: stop.arrivalMin !== null ? fmt(stop.arrivalMin) : fmt(trip.depMin),
            departTime:  stop.departMin  !== null ? fmt(stop.departMin)  : null,
            tripDepMin:  trip.depMin,
        });
    }
    const deduped = calls.filter(call => {
        const sameTrainOther = calls.filter(c => c.trainId === call.trainId && c.tripDepMin !== call.tripDepMin);
        for (const other of sameTrainOther) {
            const aEnd = call.tripDepMin + ONE_WAY_MIN;
            const bEnd = other.tripDepMin + ONE_WAY_MIN;
            if (call.tripDepMin < bEnd && aEnd > other.tripDepMin)
                if (call.tripDepMin > other.tripDepMin) return false;
        }
        return true;
    });
    deduped.sort((a, b) => (a.arrivalMin ?? a.departMin ?? 0) - (b.arrivalMin ?? b.departMin ?? 0));
    return deduped;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildAnnouncementText  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export function buildAnnouncementText({ type, stationName, trainId, arrivalTime, nextStation, direction, lang }) {
    const isTerminus = stationName === 'Aluva' || stationName === 'Tripunithura Terminal';
    const toEnd = direction === 'Northbound' ? 'Tripunithura Terminal' : 'Aluva';
    const t = trainId, s = stationName, at = arrivalTime, ns = nextStation;

    if (lang === 'en') {
        if (type === 'approaching') return isTerminus
            ? `Attention please. ${t}, arriving at ${at}, is now approaching ${s}. This train terminates here. All passengers, please prepare to deboard and collect your belongings. Mind the gap.`
            : `Attention please. ${t} is now approaching ${s}, arriving at ${at}. Passengers alighting at ${s}, please be ready to deboard. Mind the gap between the train and the platform.`;
        if (type === 'arriving') return isTerminus
            ? `Attention please. ${t} has arrived at ${s}. This is the last stop. All passengers are requested to deboard. Thank you for travelling with Kochi Metro.`
            : `Attention please. ${t} is now arriving at ${s} at ${at}. Doors are opening. Passengers alighting here, please deboard carefully.`;
        if (type === 'departing') return isTerminus
            ? `Attention. ${t} is now departing ${s} towards ${toEnd}. Doors are closing. Please stand clear of the doors. Have a safe journey.`
            : `Attention. ${t} is now departing ${s}. Doors are closing. This train is bound for ${toEnd}. The next station is ${ns || 'the next stop'}. Please stand clear of the doors.`;
    }
    if (lang === 'ml') {
        if (type === 'approaching') return isTerminus
            ? `ശ്രദ്ധിക്കുക. ${t} ട്രെയിൻ ${at}-ന് ${s} ടെർമിനൽ സ്റ്റേഷനിൽ എത്തും. എല്ലാ യാത്രക്കാരും ഇറങ്ങാൻ തയ്യാറാകുക.`
            : `ശ്രദ്ധിക്കുക. ${t} ട്രെയിൻ ${at}-ന് ${s}-ൽ എത്തും. ${s}-ൽ ഇറങ്ങുന്ന യാത്രക്കാർ തയ്യാറാകുക.`;
        if (type === 'arriving') return isTerminus
            ? `ശ്രദ്ധിക്കുക. ${t} ${s} ടെർമിനൽ സ്റ്റേഷനിൽ എത്തിയിരിക്കുന്നു. ഇത് അവസാന സ്റ്റോപ്പ് ആണ്.`
            : `ശ്രദ്ധിക്കുക. ${t} ${at}-ന് ${s}-ൽ എത്തിയിരിക്കുന്നു. വാതിലുകൾ തുറക്കുന്നു.`;
        if (type === 'departing') return isTerminus
            ? `ശ്രദ്ധിക്കുക. ${t} ${s}-ൽ നിന്ന് ${toEnd}-ലേക്ക് പുറപ്പെടുകയാണ്.`
            : `ശ്രദ്ധിക്കുക. ${t} ${s}-ൽ നിന്ന് ${toEnd}-ലേക്ക് പോകുന്നു. അടുത്ത സ്റ്റേഷൻ ${ns || ''} ആണ്.`;
    }
    if (lang === 'hi') {
        if (type === 'approaching') return isTerminus
            ? `कृपया ध्यान दें। ${t} ${at} बजे ${s} टर्मिनल स्टेशन पर पहुँचेगी।`
            : `कृपया ध्यान दें। ${t} ${at} बजे ${s} पर पहुँचेगी।`;
        if (type === 'arriving') return isTerminus
            ? `कृपया ध्यान दें। ${t} ${s} टर्मिनल स्टेशन पर पहुँच गई है। यह अंतिम स्टॉप है।`
            : `कृपया ध्यान दें। ${t} ${at} बजे ${s} पर पहुँच रही है।`;
        if (type === 'departing') return isTerminus
            ? `ध्यान दें। ${t} ${s} से ${toEnd} की ओर रवाना हो रही है।`
            : `ध्यान दें। ${t} ${s} से ${toEnd} की ओर रवाना हो रही है। अगला स्टेशन ${ns || ''} है।`;
    }
    return '';
}


// ═════════════════════════════════════════════════════════════════════════════
//  ██████╗  AI-ENHANCED ADDITIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Base URL of the Python AI backend.
 * Change this to your deployed server URL in production.
 */
export const AI_API_BASE = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:8000';


// ── API Helpers ───────────────────────────────────────────────────────────────

/**
 * Fetch AI-ranked fleet schedule for a specific date (or today).
 * Returns the full response from GET /schedule/{date}
 *
 * @param {string|null} dateStr  "YYYY-MM-DD" or null for today
 * @returns {Promise<Object>} { date, summary, schedule: [...] }
 */
export async function fetchAISchedule(dateStr = null) {
    const d = dateStr ?? new Date().toISOString().split('T')[0];
    const res = await fetch(`${AI_API_BASE}/schedule/${d}`);
    if (!res.ok) throw new Error(`AI schedule fetch failed: ${res.statusText}`);
    return res.json();
}

/**
 * Fetch full fleet status grouped by condition.
 * Returns { fit, cert_warning, not_fit }
 */
export async function fetchFleetStatus() {
    const res = await fetch(`${AI_API_BASE}/fleet/status`);
    if (!res.ok) throw new Error(`Fleet status fetch failed: ${res.statusText}`);
    return res.json();
}

/**
 * Fetch demand forecast for a specific date (or today).
 * Returns { date, peak_hours, busiest_stations, hourly_by_station }
 */
export async function fetchDemandForecast(dateStr = null) {
    const d = dateStr ?? new Date().toISOString().split('T')[0];
    const res = await fetch(`${AI_API_BASE}/demand/forecast/${d}`);
    if (!res.ok) throw new Error(`Demand forecast fetch failed: ${res.statusText}`);
    return res.json();
}

/**
 * Fetch ML model performance metrics.
 * Returns { mae, r2, trained_at, feature_importance }
 */
export async function fetchModelMetrics() {
    const res = await fetch(`${AI_API_BASE}/model/metrics`);
    if (!res.ok) throw new Error(`Model metrics fetch failed: ${res.statusText}`);
    return res.json();
}

/**
 * Post a delay event to the live log (feeds future retraining).
 *
 * @param {{ train_id, date, trip_no?, delay_minutes, is_weekend? }} entry
 */
export async function logDelayEvent(entry) {
    const res = await fetch(`${AI_API_BASE}/logs/delay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`Delay log failed: ${res.statusText}`);
    return res.json();
}


// ── AI-Prioritised Trip Builder ───────────────────────────────────────────────

/**
 * buildAllTripsAI
 *
 * Identical logic to buildAllTrips(), but reorders the fleet using the
 * AI reliability ranking before assigning departure slots.
 *
 * NOT FIT trains (has_open_high_wo) are excluded from active slots.
 * CERT WARN trains are placed after fully fit trains.
 *
 * @param {Array}  aiSchedule  Array from fetchAISchedule().schedule
 * @param {Array}  fleet       Array from buildFleet()
 * @returns {Array} sorted trip objects (same shape as buildAllTrips)
 */
export const buildAllTripsAI = (aiSchedule, fleet) => {
    // Build a lookup: train_id → fleet object
    const fleetMap = Object.fromEntries(fleet.map(t => [t.train_id, t]));

    // Sort by AI rank; exclude NOT FIT trains
    const ranked = aiSchedule
        .filter(r => r.status !== 'NOT_FIT')        // remove flagged trains
        .sort((a, b) => a.rank - b.rank)             // reliability rank ascending
        .map(r => fleetMap[r.train_id])
        .filter(Boolean);

    if (ranked.length === 0) return buildAllTrips(fleet); // fallback

    const N       = ranked.length;
    const HEADWAY = CYCLE_MIN / N;
    const trips   = [];

    ranked.forEach((train, idx) => {
        const firstDep  = OP_START_MIN + idx * HEADWAY;
        const direction = idx % 2 === 0 ? 'Northbound' : 'Southbound';
        let   dep       = firstDep;
        let   dir       = direction;

        while (dep < OP_END_MIN) {
            const stops  = computeStops(dep, dir);
            const arrMin = stops[stops.length - 1].arrivalMin;
            if (arrMin > OP_END_MIN) break;

            trips.push({
                trainId:   train.train_id,
                direction: dir,
                route:     dir === 'Northbound'
                    ? 'Aluva → Tripunithura Terminal'
                    : 'Tripunithura Terminal → Aluva',
                depMin:    dep,
                arrMin,
                stops,
                // AI metadata (useful for UI display)
                ai: {
                    rank:              aiSchedule.find(r => r.train_id === train.train_id)?.rank,
                    reliability_score: aiSchedule.find(r => r.train_id === train.train_id)?.reliability_score,
                    status:            aiSchedule.find(r => r.train_id === train.train_id)?.status,
                },
            });

            dep += CYCLE_MIN;
            dir = dir === 'Northbound' ? 'Southbound' : 'Northbound';
        }
    });

    return trips.sort((a, b) => a.depMin - b.depMin);
};


// ── React hook for AI schedule ────────────────────────────────────────────────

/**
 * useAISchedule (React hook)
 *
 * Fetches the AI schedule and returns { loading, error, schedule, summary }.
 * Import and use in any page.jsx:
 *
 *   import { useAISchedule } from '@/lib/scheduleEngine';
 *   const { schedule, loading } = useAISchedule();
 *
 * @param {string|null} dateStr   "YYYY-MM-DD" or null for today
 * @param {number}      refreshMs Auto-refresh interval in ms (0 = disabled)
 */
export function useAISchedule(dateStr = null, refreshMs = 0) {
    // This is a lightweight hook stub — import React in the calling file.
    // Full implementation below uses dynamic import to keep this file isomorphic.
    throw new Error(
        'useAISchedule must be used inside a React component. ' +
        'Import React and use fetchAISchedule() with useState/useEffect instead.'
    );
}

/* ── Convenience: full React hook (paste into page.jsx) ─────────────────────
 *
 * import { useState, useEffect } from 'react';
 * import { fetchAISchedule } from '@/lib/scheduleEngine';
 *
 * export function useAISchedule(dateStr = null, refreshMs = 60_000) {
 *     const [data, setData]       = useState(null);
 *     const [loading, setLoading] = useState(true);
 *     const [error, setError]     = useState(null);
 *
 *     async function load() {
 *         try {
 *             setLoading(true);
 *             const result = await fetchAISchedule(dateStr);
 *             setData(result);
 *             setError(null);
 *         } catch (e) {
 *             setError(e.message);
 *         } finally {
 *             setLoading(false);
 *         }
 *     }
 *
 *     useEffect(() => {
 *         load();
 *         if (refreshMs > 0) {
 *             const id = setInterval(load, refreshMs);
 *             return () => clearInterval(id);
 *         }
 *     }, [dateStr]);
 *
 *     return { loading, error, schedule: data?.schedule ?? [], summary: data?.summary ?? {} };
 * }
 */
