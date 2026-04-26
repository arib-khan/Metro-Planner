// app/station/[slug]/page.jsx
// 
// Changes from original:
//  - adVideos now fetched from BOTH stationAds (admin-added) AND approved adBookings
//  - Booking-sourced ads are filtered by startDate/endDate (only run on their booked days)
//  - Admin-added ads (source: 'admin') always show (no date filter, legacy behaviour)

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  slugToName,
  buildFleet,
  buildAllTrips,
  getStationCalls,
  buildAnnouncementText,
  fmt, fmtClock, nowMin, todayStr,
  CUE_WINDOW_SEC,
} from '../../lib/scheduleEngine';

// ─── helpers ──────────────────────────────────────────────────────────────────
const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'ml', label: 'ML' },
  { code: 'hi', label: 'HI' },
];

const ANNOUNCE_BUFFER_SEC = 10;

// ─── YouTube IFrame Player hook (unchanged) ───────────────────────────────────
function useYouTubePlayer(containerRef, videoIds, enabled) {
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const pendingMuteRef = useRef(null);

  useEffect(() => {
    if (!enabled || !videoIds.length) return;
    if (window.YT?.Player) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }, [enabled, videoIds.length]);

  useEffect(() => {
    if (!enabled || !videoIds.length || !containerRef.current) return;
    const create = () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) { }
        playerRef.current = null;
        readyRef.current = false;
      }
      const [first] = videoIds;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: first,
        playerVars: {
          autoplay: 1, mute: 1, loop: 1,
          playlist: videoIds.join(','),
          controls: 0, rel: 0, modestbranding: 1,
          iv_load_policy: 3, playsinline: 1, disablekb: 1, fs: 0,
        },
        events: {
          onReady: (e) => {
            readyRef.current = true;
            e.target.playVideo();
            if (pendingMuteRef.current === true) e.target.mute();
            if (pendingMuteRef.current === false) e.target.unMute();
            pendingMuteRef.current = null;
          },
          onError: (e) => console.warn('[YT player] error code:', e.data),
        },
      });
    };
    if (window.YT?.Player) { create(); }
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); create(); };
    }
    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) { }
        playerRef.current = null;
        readyRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoIds.join(',')]);

  const mutePlayer = useCallback(() => {
    if (readyRef.current && playerRef.current) { playerRef.current.mute(); pendingMuteRef.current = null; }
    else { pendingMuteRef.current = true; }
  }, []);

  const unmutePlayer = useCallback(() => {
    if (readyRef.current && playerRef.current) {
      playerRef.current.unMute();
      playerRef.current.setVolume(80);
      pendingMuteRef.current = null;
    } else { pendingMuteRef.current = false; }
  }, []);

  return { mutePlayer, unmutePlayer };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StationPage() {
  const { slug } = useParams();
  const stationName = slugToName(slug);
  const today = todayStr();

  // ── 1. Fleet data ──────────────────────────────────────────────────────────
  const [masterData, setMasterData] = useState({});
  const [masterReady, setMasterReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!db) { setMasterReady(true); return; }
    const unsub = onSnapshot(collection(db, 'trainMasterData'),
      (snap) => {
        const map = {};
        snap.forEach(d => { map[d.id] = d.data(); });
        setMasterData(map);
        setMasterReady(true);
      },
      (err) => { console.error('[station] masterData error:', err); setMasterReady(true); }
    );
    return () => unsub();
  }, []);

  // ── 2. Ad videos — merged from stationAds + approved adBookings ────────────
  //
  // stationAds/{slug}.videos   → admin-added (always shown) + approved marketplace ads
  //                               already written here when admin approves a booking
  //
  // We additionally filter marketplace ads by today's date window so they
  // automatically start and stop on the right day.

  const [adVideos, setAdVideos] = useState([]);

  useEffect(() => {
    if (!db) return;

    // Listen to stationAds doc (contains both admin ads and approved marketplace ads)
    const unsub = onSnapshot(
      doc(db, 'stationAds', slug),
      (snap) => {
        if (!snap.exists()) { setAdVideos([]); return; }
        const allVideos = snap.data().videos ?? [];

        // Filter: admin ads always show; marketplace ads only on their booked dates
        const active = allVideos.filter(v => {
          if (v.source === 'admin') return true; // always show admin ads
          // Marketplace ad: check date window
          if (!v.startDate || !v.endDate) return true; // no date restriction = always show
          return today >= v.startDate && today <= v.endDate;
        });

        setAdVideos(active);
      },
      (err) => console.error('[station] adVideos error:', err)
    );
    return () => unsub();
  }, [slug, today]);

  const videoIds = adVideos.map(v => v.id).filter(Boolean);

  // ── 3. Build trips ─────────────────────────────────────────────────────────
  const allTrips = useMemo(() => {
    if (!masterReady) return [];
    const fleet = buildFleet(masterData, [], today);
    return buildAllTrips(fleet);
  }, [masterReady, masterData, today]);

  const allCalls = useMemo(
    () => getStationCalls(allTrips, stationName),
    [allTrips, stationName]
  );

  // ── 4. Live clock ──────────────────────────────────────────────────────────
  const [nowT, setNowT] = useState(nowMin);
  const clockStr = useMemo(() => fmtClock(nowT), [nowT]);
  useEffect(() => {
    const id = setInterval(() => setNowT(nowMin()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── 5. Speech synthesis ────────────────────────────────────────────────────
  const [lang, setLang] = useState('en');
  const [announcementsOn, setAnnouncementsOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const spokenCues = useRef(new Set());
  const playerContainerRef = useRef(null);
  const { mutePlayer, unmutePlayer } = useYouTubePlayer(playerContainerRef, videoIds, videoIds.length > 0);

  const speak = useCallback((text) => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang === 'ml' ? 'ml-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN';
    utt.rate = 0.9;
    utt.onstart = () => { setIsSpeaking(true); mutePlayer(); };
    utt.onend = () => { setIsSpeaking(false); unmutePlayer(); };
    utt.onerror = () => { setIsSpeaking(false); unmutePlayer(); };
    window.speechSynthesis.speak(utt);
  }, [lang, mutePlayer, unmutePlayer]);

  // ── 6. Announcement cue engine ─────────────────────────────────────────────
  useEffect(() => {
    if (!announcementsOn) return;
    const id = setInterval(() => {
      const nowSec = nowMin() * 60;
      for (const call of allCalls) {
        const args = {
          stationName, trainId: call.trainId,
          arrivalTime: call.arrivalTime, nextStation: call.nextStation,
          direction: call.direction, lang,
        };
        const depSec = (call.departMin ?? 0) * 60;
        const arrSec = (call.arrivalMin ?? call.departMin ?? 0) * 60;
        const dwellSec = call.dwellSec ?? 30;

        const cues = [
          { key: `${call.trainId}-${call.tripDepMin}-approach-${stationName}`, type: 'approaching', trigger: arrSec - 180 },
          { key: `${call.trainId}-${call.tripDepMin}-arriving-${stationName}`, type: 'arriving', trigger: arrSec },
          { key: `${call.trainId}-${call.tripDepMin}-departing-${stationName}`, type: 'departing', trigger: depSec ?? arrSec + dwellSec },
        ];

        for (const c of cues) {
          if (!spokenCues.current.has(c.key) && Math.abs(nowSec - c.trigger) <= CUE_WINDOW_SEC) {
            spokenCues.current.add(c.key);
            speak(buildAnnouncementText({ type: c.type, ...args }));
          }
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [announcementsOn, allCalls, lang, stationName, speak]);

  // ── 7. Upcoming trains ─────────────────────────────────────────────────────
  const upcoming = useMemo(() =>
    allCalls.filter(c => (c.arrivalMin ?? c.departMin ?? 0) >= nowT - 1).slice(0, 12),
    [allCalls, nowT]
  );
  const nextTrain = upcoming[0] ?? null;
  const minsUntilNext = nextTrain
    ? Math.max(0, Math.round((nextTrain.arrivalMin ?? nextTrain.departMin) - nowT))
    : null;

  // ── Loading gate ───────────────────────────────────────────────────────────
  if (!masterReady) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading schedule…</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">🚇 {stationName}</h1>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{clockStr}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {LANGS.map(l => (
                <button key={l.code} onClick={() => setLang(l.code)}
                  className={`px-2.5 py-1 text-xs font-bold transition
                    ${lang === l.code ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { if (!announcementsOn) spokenCues.current.clear(); setAnnouncementsOn(v => !v); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition
                ${announcementsOn
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
              {announcementsOn ? '🔊 ON' : '🔇 OFF'}
            </button>
            <a href="/stations"
              className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg transition">
              ← Stations
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6 flex-1">

        {/* ── Ad video player ─────────────────────────────────────────────── */}
        {videoIds.length > 0 && (
          <div className="relative rounded-2xl overflow-hidden bg-black border border-gray-800 aspect-video">
            <div ref={playerContainerRef} className="w-full h-full" />

            {isSpeaking && (
              <div className="absolute inset-0 flex flex-col items-center justify-center
                bg-black/70 backdrop-blur-sm z-10 gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-end gap-1 h-8">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="w-1.5 bg-blue-400 rounded-full animate-pulse"
                        style={{ height: `${20 + (i % 3) * 12}px`, animationDelay: `${i * 0.1}s`, animationDuration: '0.6s' }} />
                    ))}
                  </div>
                  <p className="text-white font-bold text-lg">Announcement</p>
                  <div className="flex items-end gap-1 h-8">
                    {[5, 4, 3, 2, 1].map(i => (
                      <div key={i} className="w-1.5 bg-blue-400 rounded-full animate-pulse"
                        style={{ height: `${20 + (i % 3) * 12}px`, animationDelay: `${i * 0.1}s`, animationDuration: '0.6s' }} />
                    ))}
                  </div>
                </div>
                <p className="text-gray-400 text-sm">Ad paused · resuming after announcement</p>
              </div>
            )}

            <div className="absolute bottom-2 left-3 z-10 pointer-events-none">
              <span className="bg-black/60 text-gray-400 text-[10px] px-2 py-0.5 rounded-full">
                Advertisement
              </span>
            </div>

            {/* Advertise CTA — shown when no ads are playing */}
            {videoIds.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <a href="/advertise"
                  className="text-sm text-blue-400 hover:text-blue-300 underline transition">
                  📢 Advertise here
                </a>
              </div>
            )}
          </div>
        )}

        {/* CTA when no ads */}
        {videoIds.length === 0 && (
          <a href="/advertise"
            className="block rounded-2xl border border-dashed border-gray-700 p-5 text-center hover:border-blue-700 hover:bg-blue-950/20 transition group">
            <p className="text-2xl mb-2">📢</p>
            <p className="text-sm font-semibold text-gray-300 group-hover:text-white transition">Advertise at {stationName}</p>
            <p className="text-xs text-gray-600 mt-1">Reach thousands of daily commuters · Book a slot →</p>
          </a>
        )}

        {/* ── Next train hero ──────────────────────────────────────────────── */}
        {nextTrain ? (
          <div className="rounded-2xl border border-blue-700 bg-blue-950/40 p-5">
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-wide mb-2">Next Train</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{nextTrain.trainId}</p>
                <p className="text-sm text-gray-400 mt-0.5">{nextTrain.direction} · {nextTrain.route}</p>
                {nextTrain.nextStation && (
                  <p className="text-xs text-gray-500 mt-1">Next stop: {nextTrain.nextStation}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-3xl font-mono font-bold text-blue-300">
                  {fmt(nextTrain.arrivalMin ?? nextTrain.departMin)}
                </p>
                {minsUntilNext !== null && (
                  <p className="text-xs text-gray-400 mt-1">
                    {minsUntilNext === 0 ? 'Arriving now' : `in ${minsUntilNext} min`}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 text-center text-gray-500 text-sm">
            No more services today.
          </div>
        )}

        {/* ── Departure board ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Upcoming Departures</h2>
            <span className="text-xs text-gray-600 font-mono">{today}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-600 border-b border-gray-800">
                <th className="text-left px-4 py-2">Train</th>
                <th className="text-left px-4 py-2">Direction</th>
                <th className="text-left px-4 py-2 hidden sm:table-cell">Next Stop</th>
                <th className="text-right px-4 py-2">Arrives</th>
                <th className="text-right px-4 py-2">Departs</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-600 py-8">No upcoming services</td>
                </tr>
              ) : upcoming.map((c) => (
                <tr key={`${c.trainId}-${c.tripDepMin}`}
                  className="border-t border-gray-800/60 hover:bg-gray-800/30 transition">
                  <td className="px-4 py-3 font-mono font-bold text-xs">{c.trainId}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${c.direction === 'Northbound' ? 'text-blue-400' : 'text-emerald-400'}`}>
                      {c.direction === 'Northbound' ? '↑ NB' : '↓ SB'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{c.nextStation ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {c.arrivalMin !== null ? fmt(c.arrivalMin) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-400">
                    {c.departMin !== null ? fmt(c.departMin) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs text-gray-700 pb-4">
          Schedule reflects today&apos;s operational fleet. Unfit or grounded trains are excluded.
        </p>
      </main>
    </div>
  );
}