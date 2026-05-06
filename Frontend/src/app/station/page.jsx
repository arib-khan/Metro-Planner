'use client';

/**
 * app/stations/page.jsx
 *
 * Index page listing all 24 KMRL stations.
 * Each card links to /station/[slug] — the individual station display page.
 */

import { STATIONS, nameToSlug } from '../lib/scheduleEngine';
export default function StationsIndex() {
    const termini = [0, 23];

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            🚇 Kochi Metro — Station Announcements
                        </h1>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Select a station to view its live departure board and automatic voice announcements
                        </p>
                    </div>
                    <a href="/scheduling"
                        className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg transition">
                        ← Schedule
                    </a>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8">
                {/* Line diagram */}
                <div className="mb-8 overflow-x-auto">
                    <div className="flex items-center gap-0 min-w-max mx-auto px-4 py-3">
                        {STATIONS.map((s, i) => {
                            const slug = nameToSlug(s.name);
                            const isTerminus = termini.includes(i);
                            return (
                                <div key={s.name} className="flex items-center">
                                    {/* Station dot + label */}
                                    <a href={`/station/${slug}`}
                                        className="flex flex-col items-center group relative"
                                        title={s.name}>
                                        <span className={`block rounded-full border-2 border-white transition-transform group-hover:scale-125
                      ${isTerminus ? 'w-4 h-4 bg-white' : 'w-3 h-3 bg-blue-500'}`} />
                                        <span className="mt-1.5 text-[9px] text-gray-500 group-hover:text-white transition
                      whitespace-nowrap transform -rotate-45 origin-top-left translate-y-2 translate-x-1">
                                            {s.name}
                                        </span>
                                    </a>
                                    {/* Line segment */}
                                    {i < STATIONS.length - 1 && (
                                        <div className="w-5 h-0.5 bg-blue-600 shrink-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Station grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {STATIONS.map((s, i) => {
                        const slug = nameToSlug(s.name);
                        const isTerminus = termini.includes(i);
                        return (
                            <a key={s.name} href={`/station/${slug}`}
                                className={`group relative rounded-2xl border p-4 transition hover:scale-[1.02] hover:shadow-lg
                  ${isTerminus
                                        ? 'border-blue-700 bg-blue-950/40 hover:bg-blue-950/60'
                                        : 'border-gray-800 bg-gray-900 hover:bg-gray-800'}`}>

                                {/* Station number */}
                                <div className="text-[10px] font-mono text-gray-600 mb-1">
                                    {String(i + 1).padStart(2, '0')}
                                </div>

                                {/* Station name */}
                                <div className={`text-sm font-semibold leading-tight mb-2
                  ${isTerminus ? 'text-blue-300' : 'text-white'}`}>
                                    {s.name}
                                </div>

                                {/* Terminus tag */}
                                {isTerminus && (
                                    <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mb-2">
                                        Terminus
                                    </div>
                                )}

                                {/* Arrow */}
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-1 text-[10px] text-gray-600">
                                        {!isTerminus && (
                                            <>
                                                <span className="text-blue-500">↑</span>
                                                <span className="text-emerald-500">↓</span>
                                            </>
                                        )}
                                        {i === 0 && <span className="text-emerald-500">↓ SB only</span>}
                                        {i === 23 && <span className="text-blue-500">↑ NB only</span>}
                                    </div>
                                    <svg viewBox="0 0 20 20" fill="currentColor"
                                        className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition">
                                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </a>
                        );
                    })}
                </div>

                <p className="text-center text-xs text-gray-700 mt-8">
                    Each station page auto-announces trains using your browser&apos;s built-in Web Speech API — no server or API key needed.
                </p>
            </main>
        </div>
    );
}