'use client';

/**
 * app/station/[slug]/page.jsx
 *
 * Individual station display page — one page per station.
 *
 * URL examples
 * ────────────────────────────────────────────────────────────────────────────
 *   /station/Aluva
 *   /station/MG-Road
 *   /station/Ernakulam-South
 *   /station/Tripunithura-Terminal
 *
 * What this page does
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Loads today's fleet from Firebase (same collections as scheduling page)
 *  2. Builds the full day's timetable using scheduleEngine.buildAllTrips()
 *  3. Filters to only the trains that stop at THIS station → station calls
 *  4. Shows a live departure board split into NB and SB columns
 *  5. Runs the announcement engine every 10 s:
 *       • Approaching — 2 min before a train arrives here
 *       • Arriving    — when the train reaches this station
 *       • Departing   — when the train leaves this station
 *  6. Speaks announcements using the browser's Web Speech API (free, no server)
 *  7. Keeps an on-screen log of every announcement fired today
 */

import { use, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection, onSnapshot, getDocs, query, where } from 'firebase/firestore';
import { db, waitForAuthReady } from '../../firebase/config';
import {
    STATIONS, STATION_BY_SLUG,
    slugToName, nameToSlug,
    buildFleet, buildAllTrips, getStationCalls,
    buildAnnouncementText,
    fmt, fmtClock, nowMin, todayStr,
    CUE_WINDOW_SEC, OP_START_MIN, OP_END_MIN,
} from '../../lib/scheduleEngine';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// TTS — dual engine
//   English   → Web Speech API (built-in, no network needed)
//   Malayalam → Google Translate TTS (free, no API key, real native voice)
//   Hindi     → Google Translate TTS (free, no API key, real native voice)
//
// Google Translate TTS URL:
//   https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=<lang>&q=<text>
// ─────────────────────────────────────────────────────────────────────────────

// Reusable Audio element for Google TTS (created once, reused per call)
let _ttsAudio = null;
function getTTSAudio() {
    if (!_ttsAudio && typeof window !== 'undefined') {
        _ttsAudio = new Audio();
        _ttsAudio.crossOrigin = 'anonymous';
    }
    return _ttsAudio;
}

// Google Translate TTS — Malayalam and Hindi
// Splits long text into ≤180-char chunks (Google's limit) and plays sequentially
function speakGoogleTTS(text, gtLang, onDone) {
    const audio = getTTSAudio();
    if (!audio) { onDone?.(); return; }

    const MAX = 180;
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= MAX) { chunks.push(remaining); break; }
        let cut = remaining.lastIndexOf('.', MAX);
        if (cut <= 0) cut = remaining.lastIndexOf(' ', MAX);
        if (cut <= 0) cut = MAX;
        chunks.push(remaining.slice(0, cut + 1).trim());
        remaining = remaining.slice(cut + 1).trim();
    }

    let idx = 0;
    const playNext = () => {
        if (idx >= chunks.length) { onDone?.(); return; }
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${gtLang}&q=${encodeURIComponent(chunks[idx++])}`;
        audio.src = url;
        audio.onended = playNext;
        audio.onerror = () => onDone?.();
        audio.play().catch(() => onDone?.());
    };
    playNext();
}

// Web Speech API — English only (voices always available in browser)
function speakWebSpeech(text, onDone) {
    if (typeof window === 'undefined' || !window.speechSynthesis) { onDone?.(); return; }
    window.speechSynthesis.cancel();

    const go = () => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-IN';
        utter.rate = 0.88;
        utter.pitch = 0.95;
        utter.volume = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang === 'en-IN')
            || voices.find(v => v.lang.startsWith('en'));
        if (voice) utter.voice = voice;
        utter.onend = () => onDone?.();
        utter.onerror = () => onDone?.();
        window.speechSynthesis.speak(utter);
    };

    // getVoices() is async on first load — wait if not ready yet
    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.onvoiceschanged = null;
            go();
        };
    } else {
        go();
    }
}

// Entry point — routes to the right engine by language
function speakText(text, lang, onDone) {
    if (typeof window === 'undefined') { onDone?.(); return; }
    if (lang === 'ml') { speakGoogleTTS(text, 'ml', onDone); return; }
    if (lang === 'hi') { speakGoogleTTS(text, 'hi', onDone); return; }
    speakWebSpeech(text, onDone);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
    approaching: { dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Approaching' },
    arriving: { dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Arriving' },
    departing: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Departing' },
};

// Returns the state of a station call relative to current time
function getCallStatus(call, now) {
    const arr = call.arrivalMin;
    const dep = call.departMin;
    if (arr !== null && now >= arr - 2 && now < arr) return 'approaching';
    if (arr !== null && now >= arr && (dep === null || now < dep)) return 'arriving';
    if (dep !== null && now >= dep && now < dep + 1) return 'departing';
    return null;
}

// Minutes until a call's arrival at this station
function minsUntil(call, now) {
    const t = call.arrivalMin ?? call.departMin ?? 0;
    return Math.round(t - now);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTURE BOARD ROW — one train approaching/at/leaving this station
// ─────────────────────────────────────────────────────────────────────────────
function DepartureBoardRow({ call, now, isLive, onManualAnnounce }) {
    const status = getCallStatus(call, now);
    const minAway = minsUntil(call, now);
    const arrTime = call.arrivalTime;
    const depTime = call.departTime;
    const isNB = call.direction === 'Northbound';

    return (
        <div className={`relative flex items-center gap-4 px-5 py-4 border-b border-gray-800 last:border-0 transition-colors
      ${status === 'arriving' ? 'bg-blue-950/60' : status === 'approaching' ? 'bg-amber-950/40' : 'bg-transparent'}
      ${isLive ? 'hover:bg-gray-800/40' : ''}`}>

            {/* Status pulse dot */}
            <div className="flex-shrink-0 w-3 flex items-center justify-center">
                {status ? (
                    <span className={`block w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status].dot}
            ${status === 'arriving' ? 'animate-pulse' : ''}`} />
                ) : (
                    <span className="block w-2 h-2 rounded-full bg-gray-700" />
                )}
            </div>

            {/* Train ID + direction */}
            <div className="w-24 flex-shrink-0">
                <div className="text-sm font-bold text-white font-mono">{call.trainId}</div>
                <div className={`text-xs font-semibold mt-0.5
          ${isNB ? 'text-blue-400' : 'text-emerald-400'}`}>
                    {isNB ? '↑ Northbound' : '↓ Southbound'}
                </div>
            </div>

            {/* Arrival time (big, prominent) */}
            <div className="flex-1">
                <div className="text-2xl font-bold font-mono text-white tracking-tight">{arrTime}</div>
                {depTime && (
                    <div className="text-xs text-gray-500 mt-0.5">Departs {depTime}</div>
                )}
            </div>

            {/* Time until / status badge */}
            <div className="flex-shrink-0 text-right">
                {status ? (
                    <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border
            ${STATUS_COLORS[status].badge}`}>
                        {STATUS_COLORS[status].label}
                    </span>
                ) : minAway > 0 && minAway <= 60 ? (
                    <div>
                        <span className="text-lg font-bold text-white">{minAway}</span>
                        <span className="text-xs text-gray-500 ml-1">min</span>
                    </div>
                ) : minAway <= 0 ? (
                    <span className="text-xs text-gray-600 font-medium">Departed</span>
                ) : (
                    <div>
                        <span className="text-base font-semibold text-gray-400">{arrTime}</span>
                    </div>
                )}
            </div>

            {/* Next station */}
            {call.nextStation && (
                <div className="hidden sm:block flex-shrink-0 text-right w-32">
                    <div className="text-[10px] text-gray-600 uppercase tracking-wide">Next</div>
                    <div className="text-xs text-gray-400 font-medium leading-tight">{call.nextStation}</div>
                </div>
            )}

            {/* Manual announce button */}
            <button
                onClick={() => onManualAnnounce(call)}
                className="flex-shrink-0 p-2 rounded-lg text-gray-600 hover:text-white hover:bg-gray-700 transition"
                title="Announce this train">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENT LOG ENTRY
// ─────────────────────────────────────────────────────────────────────────────
function LogEntry({ entry, isLatest }) {
    const cfg = STATUS_COLORS[entry.type] || STATUS_COLORS.arriving;
    return (
        <div className={`px-4 py-3 border-b border-gray-800 last:border-0
      ${isLatest ? 'bg-gray-800/60' : ''}`}>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${cfg.badge}`}>
                    {cfg.label}
                </span>
                <span className="font-mono text-[11px] text-gray-500">{entry.time}</span>
                <span className="text-[11px] font-bold text-white">{entry.trainId}</span>
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded border
          ${entry.direction === 'Northbound'
                        ? 'bg-blue-900/60 text-blue-400 border-blue-700'
                        : 'bg-emerald-900/60 text-emerald-400 border-emerald-700'}`}>
                    {entry.direction === 'Northbound' ? '↑ NB' : '↓ SB'}
                </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{entry.text}</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function StationPage({ params }) {
    // Next.js 15+ — params is a Promise, must unwrap with use()
    const { slug } = use(params);
    const stationName = slugToName(slug);
    const stationMeta = STATION_BY_SLUG[slug];

    // ── State ─────────────────────────────────────────────────────────────────
    const [authReady, setAuthReady] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [masterData, setMasterData] = useState({});
    const [dailyDocs, setDailyDocs] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [allTrips, setAllTrips] = useState([]);
    const [nowTime, setNowTime] = useState(nowMin());     // ticks every second
    const [clockStr, setClockStr] = useState('--:--:--');
    const [lang, setLang] = useState('en');
    const [muted, setMuted] = useState(false);
    const [announceLog, setAnnounceLog] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeTab, setActiveTab] = useState('board');      // 'board' | 'log'

    // Refs
    const firedCues = useRef(new Set());
    const speakQueue = useRef([]);
    const speakingRef = useRef(false);
    const allTripsRef = useRef([]);
    const mutedRef = useRef(false);
    const langRef = useRef('en');
    const masterUnsub = useRef(null);

    // Sync refs
    useEffect(() => { allTripsRef.current = allTrips; }, [allTrips]);
    useEffect(() => { mutedRef.current = muted; }, [muted]);
    useEffect(() => { langRef.current = lang; }, [lang]);

    // ── Auth ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        waitForAuthReady().then(u => { setCurrentUser(u); setAuthReady(true); });
    }, []);

    // ── Firebase master data ──────────────────────────────────────────────────
    useEffect(() => {
        if (!authReady || !currentUser || !db) { setLoadingData(false); return; }
        if (masterUnsub.current) masterUnsub.current();
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
            err => { if (!active) return; console.error(err); setLoadingData(false); }
        );
        masterUnsub.current = unsub;
        return () => { active = false; unsub(); };
    }, [authReady, currentUser]);

    // ── Firebase daily data ───────────────────────────────────────────────────
    useEffect(() => {
        if (!authReady || !currentUser || !db) return;
        const today = todayStr();
        let cancelled = false;
        getDocs(query(collection(db, 'trainDailyData'), where('date', '==', today)))
            .then(snap => {
                if (cancelled) return;
                const docs = [];
                snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                setDailyDocs(docs);
            })
            .catch(console.error);
        return () => { cancelled = true; };
    }, [authReady, currentUser]);

    // ── Build schedule ────────────────────────────────────────────────────────
    useEffect(() => {
        if (loadingData) return;
        const fleet = buildFleet(masterData, dailyDocs, todayStr());
        setAllTrips(buildAllTrips(fleet));
        firedCues.current.clear();
    }, [masterData, dailyDocs, loadingData]);

    // ── Live clock (ticks every second) ──────────────────────────────────────
    useEffect(() => {
        const tick = () => {
            const n = nowMin();
            setNowTime(n);
            setClockStr(fmtClock(n));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // ── Station calls derived from schedule ───────────────────────────────────
    const stationCalls = useMemo(
        () => getStationCalls(allTrips, stationName),
        [allTrips, stationName]
    );

    // Split into NB and SB
    const nbCalls = useMemo(() => stationCalls.filter(c => c.direction === 'Northbound'), [stationCalls]);
    const sbCalls = useMemo(() => stationCalls.filter(c => c.direction === 'Southbound'), [stationCalls]);

    // Show trains that arrived within last 5 min or arriving within next 180 min
    // 180 min window lets staff see upcoming trains well before service starts
    const upcoming = useMemo(() => {
        return stationCalls.filter(c => {
            const t = c.arrivalMin ?? c.departMin ?? 0;
            return t >= nowTime - 5 && t <= nowTime + 180;
        });
    }, [stationCalls, nowTime]);

    const nbUpcoming = useMemo(() => upcoming.filter(c => c.direction === 'Northbound'), [upcoming]);
    const sbUpcoming = useMemo(() => upcoming.filter(c => c.direction === 'Southbound'), [upcoming]);

    // ── Speech queue drain ────────────────────────────────────────────────────
    const drainQueue = useCallback(() => {
        if (speakingRef.current || speakQueue.current.length === 0) return;
        const item = speakQueue.current.shift();
        speakingRef.current = true;
        setIsPlaying(true);
        setAnnounceLog(prev => [...prev.slice(-99), item.entry]);
        speakText(item.text, item.lang, () => {
            speakingRef.current = false;
            setIsPlaying(false);
            // 4 s gap so back-to-back announcements don't blur together
            setTimeout(drainQueue, 4000);
        });
    }, []);

    const enqueue = useCallback((text, l, entry) => {
        speakQueue.current.push({ text, lang: l, entry });
        drainQueue();
    }, [drainQueue]);

    // ── ANNOUNCEMENT ENGINE ───────────────────────────────────────────────────
    // Runs every 10 seconds.
    // For each station call at THIS station checks three cue times:
    //   A: arrivalMin - 2  → approaching
    //   B: arrivalMin      → arriving
    //   C: departMin       → departing
    // Each cue fires exactly once (keyed by trainId + tripDepMin + type).
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const tick = () => {
            const nowT = nowMin();
            // Only run announcement engine during operating hours (06:00 – 23:00)
            if (nowT < OP_START_MIN || nowT > OP_END_MIN) return;
            const nowSec = nowT * 60;
            const l = langRef.current;
            const isMuted = mutedRef.current;
            const calls = getStationCalls(allTripsRef.current, stationName);

            for (const call of calls) {
                const base = `${call.trainId}|${call.tripDepMin}`;

                // Skip trips that are far in the future or already long gone
                const refTime = call.arrivalMin ?? call.departMin ?? 0;
                if (refTime < nowT - 5 || refTime > nowT + 95) continue;

                // ── A: Approaching (2 min before arrival) ─────────────────────────
                if (call.arrivalMin !== null) {
                    const tSec = (call.arrivalMin - 2) * 60;
                    const key = `${base}|approaching`;
                    if (!firedCues.current.has(key) && Math.abs(nowSec - tSec) <= CUE_WINDOW_SEC) {
                        firedCues.current.add(key);
                        const text = buildAnnouncementText({
                            type: 'approaching', stationName, trainId: call.trainId,
                            arrivalTime: call.arrivalTime, nextStation: call.nextStation,
                            direction: call.direction, lang: l,
                        });
                        if (!isMuted && text) {
                            enqueue(text, l, {
                                type: 'approaching', trainId: call.trainId,
                                direction: call.direction, text,
                                time: fmt(call.arrivalMin - 2),
                            });
                        }
                    }
                }

                // ── B: Arriving ────────────────────────────────────────────────────
                if (call.arrivalMin !== null) {
                    const tSec = call.arrivalMin * 60;
                    const key = `${base}|arriving`;
                    if (!firedCues.current.has(key) && Math.abs(nowSec - tSec) <= CUE_WINDOW_SEC) {
                        firedCues.current.add(key);
                        const text = buildAnnouncementText({
                            type: 'arriving', stationName, trainId: call.trainId,
                            arrivalTime: call.arrivalTime, nextStation: call.nextStation,
                            direction: call.direction, lang: l,
                        });
                        if (!isMuted && text) {
                            enqueue(text, l, {
                                type: 'arriving', trainId: call.trainId,
                                direction: call.direction, text,
                                time: call.arrivalTime,
                            });
                        }
                    }
                }

                // ── C: Departing ───────────────────────────────────────────────────
                if (call.departMin !== null) {
                    const tSec = call.departMin * 60;
                    const key = `${base}|departing`;
                    if (!firedCues.current.has(key) && Math.abs(nowSec - tSec) <= CUE_WINDOW_SEC) {
                        firedCues.current.add(key);
                        const text = buildAnnouncementText({
                            type: 'departing', stationName, trainId: call.trainId,
                            arrivalTime: call.arrivalTime, nextStation: call.nextStation,
                            direction: call.direction, lang: l,
                        });
                        if (!isMuted && text) {
                            enqueue(text, l, {
                                type: 'departing', trainId: call.trainId,
                                direction: call.direction, text,
                                time: call.departTime ?? call.arrivalTime,
                            });
                        }
                    }
                }
            }
        };

        // Don't fire on mount — wait for the first 10s tick.
        // Firing immediately on mount risks using stale allTripsRef data
        // and can trigger phantom announcements before operating hours.
        const id = setInterval(tick, 10_000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stationName, enqueue]);

    // ── Manual announce for any train ─────────────────────────────────────────
    const handleManualAnnounce = useCallback((call) => {
        const l = langRef.current;
        const text = buildAnnouncementText({
            type: 'arriving', stationName, trainId: call.trainId,
            arrivalTime: call.arrivalTime, nextStation: call.nextStation,
            direction: call.direction, lang: l,
        });
        if (text) {
            enqueue(text, l, {
                type: 'arriving', trainId: call.trainId,
                direction: call.direction, text,
                time: call.arrivalTime,
            });
        }
    }, [stationName, enqueue]);

    // ── Not found ─────────────────────────────────────────────────────────────
    if (!stationMeta) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">🚇</div>
                    <h1 className="text-2xl font-bold mb-2">Station not found</h1>
                    <p className="text-gray-400 mb-6">"{stationName}" is not a valid KMRL station.</p>
                    <a href="/station" className="px-5 py-2.5 bg-white text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-100">
                        Browse all stations →
                    </a>
                </div>
            </div>
        );
    }

    const isTerminus = stationMeta.index === 0 || stationMeta.index === 23;
    const stationNum = String(stationMeta.index + 1).padStart(2, '0');

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col">

            {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">

                    {/* Back + station name */}
                    <div className="flex items-center gap-3 min-w-0">
                        <a href="/station"
                            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </a>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-mono">STN {stationNum}</span>
                                {isTerminus && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-300 border border-gray-600 uppercase tracking-wide">
                                        Terminus
                                    </span>
                                )}
                            </div>
                            <h1 className="text-lg font-bold text-white leading-tight truncate">{stationName}</h1>
                        </div>
                    </div>

                    {/* Right controls */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Live clock */}
                        <div className="hidden sm:block font-mono text-sm text-gray-400 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
                            {clockStr}
                        </div>

                        {/* Language switcher */}
                        <div className="flex rounded-lg overflow-hidden border border-gray-700 text-[11px] font-bold">
                            {['en', 'ml', 'hi'].map(l => (
                                <button key={l} onClick={() => { setLang(l); firedCues.current.clear(); }}
                                    className={`px-2.5 py-1.5 transition ${lang === l ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                                    {l.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        {/* Mute toggle */}
                        <button
                            onClick={() => {
                                setMuted(m => !m);
                                if (!muted && typeof window !== 'undefined') window.speechSynthesis?.cancel();
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition
                ${muted
                                    ? 'bg-red-900/60 border-red-700 text-red-400'
                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                            {muted ? (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                </svg>
                            )}
                            {muted ? 'Muted' : 'Live'}
                            {isPlaying && !muted && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Tab switcher */}
                <div className="max-w-5xl mx-auto px-4 flex gap-0 border-t border-gray-800">
                    {[['board', 'Departure Board'], ['log', 'Announcement Log']].map(([id, label]) => (
                        <button key={id} onClick={() => setActiveTab(id)}
                            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition
                ${activeTab === id
                                    ? 'border-white text-white'
                                    : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                            {label}
                            {id === 'log' && announceLog.length > 0 && (
                                <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400">
                                    {announceLog.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </header>

            {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
            <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">

                {/* Loading */}
                {loadingData && (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-center">
                            <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm text-gray-500">Loading timetable…</p>
                        </div>
                    </div>
                )}

                {/* ── DEPARTURE BOARD TAB ───────────────────────────────────────── */}
                {!loadingData && activeTab === 'board' && (
                    <div className="space-y-6">

                        {/* Station info bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-800">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">
                                    Station {stationNum} of 24 · {isTerminus ? 'Terminus' : 'Intermediate'} · Kochi Metro Blue Line
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    {STATIONS.filter(s => s.index === stationMeta.index - 1)[0] && (
                                        <span>← {STATIONS[stationMeta.index - 1]?.name}</span>
                                    )}
                                    <span className="text-gray-800">·</span>
                                    {STATIONS.filter(s => s.index === stationMeta.index + 1)[0] && (
                                        <span>{STATIONS[stationMeta.index + 1]?.name} →</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold font-mono text-white">{clockStr}</div>
                                <div className="text-xs text-gray-600 mt-0.5">
                                    {stationCalls.length} trains today
                                </div>
                            </div>
                        </div>

                        {/* No data warning */}
                        {allTrips.length === 0 && !loadingData && (
                            <div className="bg-amber-950/40 border border-amber-800 rounded-xl px-5 py-4 text-sm text-amber-300">
                                ⚠ No train data in Firebase for today. Upload via bulk upload on the scheduling page.
                            </div>
                        )}

                        {/* NB + SB columns */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* Northbound */}
                            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                                <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2 bg-blue-950/30">
                                    <span className="text-lg font-bold text-blue-400">↑</span>
                                    <div>
                                        <div className="text-sm font-bold text-white">Northbound</div>
                                        <div className="text-xs text-gray-500">towards Aluva</div>
                                    </div>
                                    <span className="ml-auto text-xs text-gray-600">{nbUpcoming.length} upcoming</span>
                                </div>
                                {nbUpcoming.length === 0 ? (
                                    <div className="px-5 py-10 text-center text-sm text-gray-600">
                                        No northbound trains in the next 3 hours
                                    </div>
                                ) : (
                                    nbUpcoming.map((call, i) => (
                                        <DepartureBoardRow
                                            key={`nb-${call.trainId}-${call.tripDepMin}`}
                                            call={call}
                                            now={nowTime}
                                            isLive
                                            onManualAnnounce={handleManualAnnounce}
                                        />
                                    ))
                                )}
                            </div>

                            {/* Southbound */}
                            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                                <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2 bg-emerald-950/30">
                                    <span className="text-lg font-bold text-emerald-400">↓</span>
                                    <div>
                                        <div className="text-sm font-bold text-white">Southbound</div>
                                        <div className="text-xs text-gray-500">towards Tripunithura Terminal</div>
                                    </div>
                                    <span className="ml-auto text-xs text-gray-600">{sbUpcoming.length} upcoming</span>
                                </div>
                                {sbUpcoming.length === 0 ? (
                                    <div className="px-5 py-10 text-center text-sm text-gray-600">
                                        No southbound trains in the next 3 hours
                                    </div>
                                ) : (
                                    sbUpcoming.map((call, i) => (
                                        <DepartureBoardRow
                                            key={`sb-${call.trainId}-${call.tripDepMin}`}
                                            call={call}
                                            now={nowTime}
                                            isLive
                                            onManualAnnounce={handleManualAnnounce}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Full timetable toggle */}
                        <details className="group">
                            <summary className="cursor-pointer list-none flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 select-none">
                                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 group-open:rotate-90 transition-transform">
                                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                </svg>
                                Full day timetable ({stationCalls.length} trains)
                            </summary>

                            <div className="mt-4 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                                <div className="grid grid-cols-2 divide-x divide-gray-800">
                                    {/* All NB */}
                                    <div>
                                        <div className="px-4 py-2.5 border-b border-gray-800 text-xs font-semibold text-blue-400 bg-blue-950/20">
                                            ↑ All Northbound ({nbCalls.length})
                                        </div>
                                        <div className="max-h-72 overflow-y-auto divide-y divide-gray-800/60">
                                            {nbCalls.map((call, i) => {
                                                const isPast = (call.arrivalMin ?? call.departMin ?? 0) < nowTime - 2;
                                                return (
                                                    <div key={i} className={`px-4 py-2 flex items-center justify-between gap-3 ${isPast ? 'opacity-40' : ''}`}>
                                                        <span className="text-xs font-mono font-bold text-white">{call.trainId}</span>
                                                        <span className="text-sm font-bold font-mono text-white">{call.arrivalTime}</span>
                                                        <button onClick={() => handleManualAnnounce(call)}
                                                            className="p-1 text-gray-600 hover:text-white rounded transition">
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* All SB */}
                                    <div>
                                        <div className="px-4 py-2.5 border-b border-gray-800 text-xs font-semibold text-emerald-400 bg-emerald-950/20">
                                            ↓ All Southbound ({sbCalls.length})
                                        </div>
                                        <div className="max-h-72 overflow-y-auto divide-y divide-gray-800/60">
                                            {sbCalls.map((call, i) => {
                                                const isPast = (call.arrivalMin ?? call.departMin ?? 0) < nowTime - 2;
                                                return (
                                                    <div key={i} className={`px-4 py-2 flex items-center justify-between gap-3 ${isPast ? 'opacity-40' : ''}`}>
                                                        <span className="text-xs font-mono font-bold text-white">{call.trainId}</span>
                                                        <span className="text-sm font-bold font-mono text-white">{call.arrivalTime}</span>
                                                        <button onClick={() => handleManualAnnounce(call)}
                                                            className="p-1 text-gray-600 hover:text-white rounded transition">
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </details>

                    </div>
                )}

                {/* ── ANNOUNCEMENT LOG TAB ──────────────────────────────────────── */}
                {!loadingData && activeTab === 'log' && (
                    <div>
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold text-white">Announcement Log</h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Every voice announcement fired at {stationName} today
                                </p>
                            </div>
                            {announceLog.length > 0 && (
                                <button onClick={() => setAnnounceLog([])}
                                    className="text-xs text-gray-600 hover:text-gray-400 transition">
                                    Clear log
                                </button>
                            )}
                        </div>

                        {announceLog.length === 0 ? (
                            <div className="bg-gray-900 rounded-2xl border border-gray-800 px-6 py-16 text-center">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
                                    className="w-10 h-10 text-gray-700 mx-auto mb-3">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                </svg>
                                <p className="text-sm text-gray-600 font-medium">No announcements yet</p>
                                <p className="text-xs text-gray-700 mt-1">
                                    Announcements fire automatically when trains approach, arrive, and depart.
                                </p>
                            </div>
                        ) : (
                            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                                {[...announceLog].reverse().map((entry, i) => (
                                    <LogEntry key={i} entry={entry} isLatest={i === 0} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* ── BOTTOM STATUS BAR ─────────────────────────────────────────────── */}
            <footer className="border-t border-gray-800 bg-gray-900/60 backdrop-blur">
                <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-gray-600">
                    <span>
                        {isPlaying && !muted && (
                            <span className="flex items-center gap-1.5 text-emerald-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                Speaking…
                            </span>
                        )}
                        {!isPlaying && (
                            <span>
                                {muted ? '🔇 Muted' : '🔊 Listening for trains'}
                                {' · '}Web Speech API · Browser-native · Free
                            </span>
                        )}
                    </span>
                    <span>
                        <a href="/station" className="hover:text-gray-400 transition">All stations</a>
                        <span className="mx-1.5">·</span>
                        <a href="/scheduling" className="hover:text-gray-400 transition">Schedule</a>
                    </span>
                </div>
            </footer>

        </div>
    );
}