/**
 * lib/scheduleEngine.js
 *
 * Single source of truth for all KMRL scheduling logic.
 * Used by:
 *   - app/scheduling/page.jsx       (full schedule overview)
 *   - app/station/[slug]/page.jsx   (per-station display + announcements)
 *
 * Exports
 * ────────────────────────────────────────────────────────────────────────────
 *  STATIONS              — ordered array of 24 stations (Aluva → Tripunithura)
 *  STATION_SLUGS         — map: slug → station name  (e.g. "MG-Road" → "MG Road")
 *  STATION_NAMES         — map: name → slug
 *  OP_START_MIN          — 360  (06:00)
 *  OP_END_MIN            — 1380 (23:00)
 *  TRAIN_IDS             — ["KMRL-1" … "KMRL-30"]
 *  CUE_WINDOW_SEC        — 18  (seconds either side of a trigger time)
 *
 *  fmt(min)              — "HH:MM"
 *  fmtClock(min)         — "HH:MM:SS"
 *  nowMin()              — current time in minutes from midnight
 *  todayStr()            — "YYYY-MM-DD"
 *  slugToName(slug)      — "MG-Road" → "MG Road"
 *  nameToSlug(name)      — "MG Road" → "MG-Road"
 *
 *  isFitnessValid(cert, date)          — boolean
 *  buildFleet(masterData, dailyDocs, date) — array of fleet objects
 *  buildAllTrips(fleet)                — sorted array of all trips with stops[]
 *
 *  getStationCalls(allTrips, stationName)
 *    — for a given station name, returns every trip that visits it with:
 *        { trainId, direction, route, arrivalMin, departMin, nextStation,
 *          prevStation, isTerminus, stop }
 *
 *  buildAnnouncementText({ type, stationName, trainId, arrivalTime,
 *                          nextStation, direction, lang })
 *    — returns the announcement text for one cue
 */

// ─────────────────────────────────────────────────────────────────────────────
// Station data
// ─────────────────────────────────────────────────────────────────────────────
export const STATIONS = [
    { name: 'Aluva', cumMin: 0, index: 0 },
    { name: 'Pulinchodu', cumMin: 2.5, index: 1 },
    { name: 'Companypady', cumMin: 5, index: 2 },
    { name: 'Ambattukavu', cumMin: 7.5, index: 3 },
    { name: 'Muttom', cumMin: 10, index: 4 },
    { name: 'Kalamassery', cumMin: 13, index: 5 },
    { name: 'CUSAT', cumMin: 16, index: 6 },
    { name: 'Pathadipalam', cumMin: 18.5, index: 7 },
    { name: 'Edappally', cumMin: 21, index: 8 },
    { name: 'Changampuzha Park', cumMin: 23.5, index: 9 },
    { name: 'Palarivattom', cumMin: 26, index: 10 },
    { name: 'JLN Stadium', cumMin: 28.5, index: 11 },
    { name: 'Kaloor Town Hall', cumMin: 31, index: 12 },
    { name: 'MG Road', cumMin: 33.5, index: 13 },
    { name: "Maharaja's College", cumMin: 36, index: 14 },
    { name: 'Ernakulam South', cumMin: 38.5, index: 15 },
    { name: 'Kadavanthra', cumMin: 41, index: 16 },
    { name: 'Elamkulam', cumMin: 43.5, index: 17 },
    { name: 'Vyttila', cumMin: 46, index: 18 },
    { name: 'Thaikoodam', cumMin: 48, index: 19 },
    { name: 'Petta', cumMin: 50, index: 20 },
    { name: 'Vadakkekotta', cumMin: 51.5, index: 21 },
    { name: 'SN Junction', cumMin: 53, index: 22 },
    { name: 'Tripunithura Terminal', cumMin: 55, index: 23 },
];

// Slug helpers — URL-safe names
export const nameToSlug = (name) => name.replace(/\s+/g, '-').replace(/'/g, '');
export const slugToName = (slug) => {
    const found = STATIONS.find(s => nameToSlug(s.name) === slug);
    return found?.name ?? slug.replace(/-/g, ' ');
};

// Quick lookup maps
export const STATION_BY_NAME = Object.fromEntries(STATIONS.map(s => [s.name, s]));
export const STATION_BY_SLUG = Object.fromEntries(STATIONS.map(s => [nameToSlug(s.name), s]));

// ─────────────────────────────────────────────────────────────────────────────
// Timing constants
// ─────────────────────────────────────────────────────────────────────────────
const N_STATIONS = STATIONS.length;
const DWELL_SEC = 30;               // 30 s at intermediate stations
const TERMINAL_TURNAROUND = 5;                // 5 min turnaround at termini
export const ONE_WAY_MIN = STATIONS[N_STATIONS - 1].cumMin; // 55
export const CYCLE_MIN = ONE_WAY_MIN + TERMINAL_TURNAROUND; // 60
export const OP_START_MIN = 6 * 60; // 360
export const OP_END_MIN = 23 * 60; // 1380
export const CUE_WINDOW_SEC = 18;    // fire within ±18 s of trigger time
export const TRAIN_IDS = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
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
// Fitness check
// ─────────────────────────────────────────────────────────────────────────────
export const isFitnessValid = (cert, date) => {
    if (!cert) return false;
    const { rolling_stock_validity: rs, signalling_validity: sig, telecom_validity: tel } = cert;
    return !!(rs >= date && sig >= date && tel >= date);
};

// ─────────────────────────────────────────────────────────────────────────────
// Build fleet from Firestore data
// ─────────────────────────────────────────────────────────────────────────────
export const buildFleet = (masterData, dailyDocs, date) =>
    TRAIN_IDS.map(tid => {
        const master = masterData[tid] || null;
        const daily = dailyDocs.find(d => d.train_id === tid) || null;
        const cert = master?.fitness_certificates || null;
        return {
            train_id: tid,
            isFit: isFitnessValid(cert, date),
            hasMasterData: master !== null,
            depot: daily?.stabling_geometry?.yard || '',
            mileage: daily?.mileage?.current_mileage_km ?? null,
        };
    });

// ─────────────────────────────────────────────────────────────────────────────
// computeStops — full 24-stop timetable for one trip
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
        const arrMin = cursor + travelMin;
        const isLast = i === ordered.length - 1;
        const dwell = isLast ? TERMINAL_TURNAROUND * 60 : DWELL_SEC;

        stops.push({
            station: ordered[i].name, isTerminus: isLast,
            arrivalMin: arrMin, dwellSec: dwell,
            departMin: isLast ? null : arrMin + dwell / 60,
        });
        cursor = arrMin + (isLast ? 0 : dwell / 60);
    }
    return stops;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildAllTrips — generates every trip for the day
// ─────────────────────────────────────────────────────────────────────────────
export const buildAllTrips = (fleet) => {
    const fit = fleet.filter(t => t.isFit);
    const N = fit.length;
    const allTrips = [];

    // Split fleet exactly in half:
    //   First  half → start Northbound  from Aluva               at 06:00
    //   Second half → start Southbound  from Tripunithura Terminal at 06:00
    // Each group staggers only within itself so both groups genuinely
    // start at OP_START_MIN and cover the full line from minute one.
    // A train alternates NB→SB→NB each full trip, so it is NEVER in
    // two places at once — trip window [depMin, arrMin] never overlaps
    // with the same train's next trip window.
    const half = Math.floor(N / 2);
    const nbTrains = fit.slice(0, half);
    const sbTrains = fit.slice(half);
    const nbStagger = nbTrains.length > 1 ? CYCLE_MIN / nbTrains.length : 0;
    const sbStagger = sbTrains.length > 1 ? CYCLE_MIN / sbTrains.length : 0;

    const scheduleGroup = (trains, stagger, firstDirection) => {
        trains.forEach((train, i) => {
            let cursor = OP_START_MIN + i * stagger;
            let direction = firstDirection;
            while (cursor + ONE_WAY_MIN <= OP_END_MIN) {
                const isNB = direction === 'Northbound';
                const stops = computeStops(cursor, direction);
                allTrips.push({
                    trainId: train.train_id,
                    direction,
                    route: isNB ? 'Aluva → Tripunithura Terminal' : 'Tripunithura Terminal → Aluva',
                    depMin: cursor,
                    arrMin: cursor + ONE_WAY_MIN,
                    stops,
                });
                cursor += CYCLE_MIN;
                direction = direction === 'Northbound' ? 'Southbound' : 'Northbound';
            }
        });
    };

    scheduleGroup(nbTrains, nbStagger, 'Northbound');
    scheduleGroup(sbTrains, sbStagger, 'Southbound');

    allTrips.sort((a, b) => a.depMin - b.depMin);
    return allTrips;
};

// ─────────────────────────────────────────────────────────────────────────────
// computeRemainingExposure
//
// Returns how many exposure minutes remain for a branding campaign right now.
//
// Each trip a train COMPLETES (arrMin <= nowT) consumes ONE_WAY_MIN minutes
// of exposure — the train was moving through all stations, visible to riders.
//
//   remaining = exposure_minutes − (completedTrips × ONE_WAY_MIN)
//
// Returns null if no branding / no exposure_minutes set.
// Returns { total, remaining, used, completedTrips, pct, status }
//   status: 'full' | 'active' | 'low' | 'exhausted'
// ─────────────────────────────────────────────────────────────────────────────
export const computeRemainingExposure = (trainId, branding, allTrips, nowT) => {
    if (!branding || !branding.exposure_minutes) return null;
    const total = branding.exposure_minutes;
    const now = nowT ?? nowMin();
    const trainTrips = allTrips.filter(t => t.trainId === trainId);
    const completedTrips = trainTrips.filter(t => t.arrMin <= now).length;
    const used = completedTrips * ONE_WAY_MIN;
    const remaining = Math.max(0, total - used);
    const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
    const status = remaining === 0 ? 'exhausted'
        : pct <= 20 ? 'low'
            : completedTrips > 0 ? 'active'
                : 'full';
    return { total, remaining, used, completedTrips, pct, status };
};

// ─────────────────────────────────────────────────────────────────────────────
// getStationCalls
// For a given station, extracts exactly what happens at that station for
// every trip that passes through — with arrival time, departure time,
// and neighbouring stations.
// ─────────────────────────────────────────────────────────────────────────────
export const getStationCalls = (allTrips, stationName) => {
    const calls = [];

    for (const trip of allTrips) {
        const stopIdx = trip.stops.findIndex(s => s.station === stationName);
        if (stopIdx === -1) continue; // this trip doesn't visit this station

        const stop = trip.stops[stopIdx];
        const prevStop = stopIdx > 0 ? trip.stops[stopIdx - 1] : null;
        const nextStop = stopIdx < trip.stops.length - 1 ? trip.stops[stopIdx + 1] : null;

        calls.push({
            trainId: trip.trainId,
            direction: trip.direction,
            route: trip.route,
            isTerminus: stop.isTerminus,
            arrivalMin: stop.arrivalMin,   // null at origin terminus
            departMin: stop.departMin,    // null at destination terminus
            dwellSec: stop.dwellSec,
            nextStation: nextStop?.station ?? null,
            prevStation: prevStop?.station ?? null,
            // For announcement text: the formatted arrival time string
            arrivalTime: stop.arrivalMin !== null ? fmt(stop.arrivalMin) : fmt(trip.depMin),
            departTime: stop.departMin !== null ? fmt(stop.departMin) : null,
            tripDepMin: trip.depMin,       // used as unique trip identifier
        });
    }

    // ── Dedup: a physical train cannot be at two stations at the same time ─────
    // If the same trainId has two calls whose trip time-windows overlap,
    // keep only the one whose trip started earlier.
    // Trip window = [tripDepMin, tripDepMin + ONE_WAY_MIN].
    const deduped = calls.filter(call => {
        const sameTrainOtherCalls = calls.filter(
            c => c.trainId === call.trainId && c.tripDepMin !== call.tripDepMin
        );
        for (const other of sameTrainOtherCalls) {
            const aStart = call.tripDepMin;
            const aEnd = call.tripDepMin + ONE_WAY_MIN;
            const bStart = other.tripDepMin;
            const bEnd = other.tripDepMin + ONE_WAY_MIN;
            // Trips overlap → keep the one that departed first
            if (aStart < bEnd && aEnd > bStart) {
                if (aStart > bStart) return false; // this trip is the later one — drop it
            }
        }
        return true;
    });

    // Sort by the time this station is visited
    deduped.sort((a, b) => {
        const tA = a.arrivalMin ?? a.departMin ?? 0;
        const tB = b.arrivalMin ?? b.departMin ?? 0;
        return tA - tB;
    });

    return deduped;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildAnnouncementText
// Generates the spoken text for one announcement cue at a specific station.
//
// type          'approaching' | 'arriving' | 'departing'
// stationName   e.g. "MG Road"
// trainId       e.g. "KMRL-5"
// arrivalTime   e.g. "09:33"  (shown in the spoken text)
// nextStation   e.g. "Maharaja's College" (shown on departing)
// direction     'Northbound' | 'Southbound'
// lang          'en' | 'ml' | 'hi'
// ─────────────────────────────────────────────────────────────────────────────
export function buildAnnouncementText({ type, stationName, trainId, arrivalTime, nextStation, direction, lang }) {
    const isTerminus = stationName === 'Aluva' || stationName === 'Tripunithura Terminal';
    const toEnd = direction === 'Northbound' ? 'Tripunithura Terminal' : 'Aluva';
    const t = trainId;
    const s = stationName;
    const at = arrivalTime;  // "HH:MM"
    const ns = nextStation;

    // ── English ────────────────────────────────────────────────────────────────
    if (lang === 'en') {
        if (type === 'approaching') {
            return isTerminus
                ? `Attention please. ${t}, arriving at ${at}, is now approaching ${s}. This train terminates here. All passengers, please prepare to deboard and collect your belongings. Mind the gap.`
                : `Attention please. ${t} is now approaching ${s}, arriving at ${at}. Passengers alighting at ${s}, please be ready to deboard. Mind the gap between the train and the platform.`;
        }
        if (type === 'arriving') {
            return isTerminus
                ? `Attention please. ${t} has arrived at ${s}. This is the last stop. All passengers are requested to deboard. Thank you for travelling with Kochi Metro.`
                : `Attention please. ${t} is now arriving at ${s} at ${at}. Doors are opening. Passengers alighting here, please deboard carefully.`;
        }
        if (type === 'departing') {
            return isTerminus
                ? `Attention. ${t} is now departing ${s} towards ${toEnd}. Doors are closing. Please stand clear of the doors. Have a safe journey.`
                : `Attention. ${t} is now departing ${s}. Doors are closing. This train is bound for ${toEnd}. The next station is ${ns || 'the next stop'}. Please stand clear of the doors.`;
        }
    }

    // ── Malayalam ──────────────────────────────────────────────────────────────
    if (lang === 'ml') {
        if (type === 'approaching') {
            return isTerminus
                ? `ശ്രദ്ധിക്കുക. ${t} ട്രെയിൻ ${at}-ന് ${s} ടെർമിനൽ സ്റ്റേഷനിൽ എത്തും. എല്ലാ യാത്രക്കാരും ഇറങ്ങാൻ തയ്യാറാകുക. ട്രെയിനും പ്ലാറ്റ്ഫോമും തമ്മിലുള്ള വിടവ് ശ്രദ്ധിക്കുക.`
                : `ശ്രദ്ധിക്കുക. ${t} ട്രെയിൻ ${at}-ന് ${s}-ൽ എത്തും. ${s}-ൽ ഇറങ്ങുന്ന യാത്രക്കാർ തയ്യാറാകുക. ട്രെയിനും പ്ലാറ്റ്ഫോമും തമ്മിലുള്ള വിടവ് ശ്രദ്ധിക്കുക.`;
        }
        if (type === 'arriving') {
            return isTerminus
                ? `ശ്രദ്ധിക്കുക. ${t} ${s} ടെർമിനൽ സ്റ്റേഷനിൽ എത്തിയിരിക്കുന്നു. ഇത് അവസാന സ്റ്റോപ്പ് ആണ്. എല്ലാ യാത്രക്കാരും ഇറങ്ങേണ്ടതാണ്. കൊച്ചി മെട്രോ തിരഞ്ഞെടുത്തതിന് നന്ദി.`
                : `ശ്രദ്ധിക്കുക. ${t} ${at}-ന് ${s}-ൽ എത്തിയിരിക്കുന്നു. വാതിലുകൾ തുറക്കുന്നു. ഇറങ്ങുന്ന യാത്രക്കാർ ശ്രദ്ധയോടെ ഇറങ്ങുക.`;
        }
        if (type === 'departing') {
            return isTerminus
                ? `ശ്രദ്ധിക്കുക. ${t} ${s}-ൽ നിന്ന് ${toEnd}-ലേക്ക് പുറപ്പെടുകയാണ്. വാതിലുകൾ അടയ്ക്കുന്നു. ദയവായി വാതിലുകളിൽ നിന്ന് മാറി നിൽക്കുക.`
                : `ശ്രദ്ധിക്കുക. ${t} ${s}-ൽ നിന്ന് ${toEnd}-ലേക്ക് പോകുന്നു. വാതിലുകൾ അടയ്ക്കുന്നു. അടുത്ത സ്റ്റേഷൻ ${ns || ''} ആണ്.`;
        }
    }

    // ── Hindi ──────────────────────────────────────────────────────────────────
    if (lang === 'hi') {
        if (type === 'approaching') {
            return isTerminus
                ? `कृपया ध्यान दें। ${t} ${at} बजे ${s} टर्मिनल स्टेशन पर पहुँचेगी। सभी यात्री उतरने के लिए तैयार रहें। ट्रेन और प्लेटफॉर्म के बीच की दूरी का ध्यान रखें।`
                : `कृपया ध्यान दें। ${t} ${at} बजे ${s} पर पहुँचेगी। ${s} पर उतरने वाले यात्री तैयार रहें।`;
        }
        if (type === 'arriving') {
            return isTerminus
                ? `कृपया ध्यान दें। ${t} ${s} टर्मिनल स्टेशन पर पहुँच गई है। यह अंतिम स्टॉप है। सभी यात्री कृपया उतरें। कोची मेट्रो में यात्रा के लिए धन्यवाद।`
                : `कृपया ध्यान दें। ${t} ${at} बजे ${s} पर पहुँच रही है। दरवाजे खुल रहे हैं। उतरने वाले यात्री सावधानी से उतरें।`;
        }
        if (type === 'departing') {
            return isTerminus
                ? `ध्यान दें। ${t} ${s} से ${toEnd} की ओर रवाना हो रही है। दरवाजे बंद हो रहे हैं। कृपया दरवाजों से दूर रहें।`
                : `ध्यान दें। ${t} ${s} से ${toEnd} की ओर रवाना हो रही है। दरवाजे बंद हो रहे हैं। अगला स्टेशन ${ns || ''} है।`;
        }
    }

    return '';
}