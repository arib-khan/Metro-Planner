// src/app/components/TrainAnimation.jsx
'use client';

import { useEffect, useRef, useState } from "react";

const SCREEN_W = 1200;
const METRO_W = 490;

export default function TrainAnimation() {
    const [metroX, setMetroX] = useState(-METRO_W);
    const animRef = useRef(null);
    const startRef = useRef(null);

    useEffect(() => {
        const duration = 9000;
        const total = SCREEN_W + METRO_W + 100;
        const animate = (ts) => {
            if (!startRef.current) startRef.current = ts;
            const p = (ts - startRef.current) / duration;
            setMetroX(-METRO_W + p * total);
            if (p < 1) {
                animRef.current = requestAnimationFrame(animate);
            } else {
                startRef.current = null;
                setMetroX(-METRO_W);
                setTimeout(() => { animRef.current = requestAnimationFrame(animate); }, 1800);
            }
        };
        animRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animRef.current);
    }, []);

    return (
        <div className="relative w-full overflow-hidden" style={{ height: "220px" }}>
            {/* ── SVG Scene ── */}
            <svg
                width="100%" height="100%"
                viewBox="0 0 1200 220"
                preserveAspectRatio="xMidYMid slice"
                className="absolute inset-0"
            >
                <defs>
                    <linearGradient id="ta-sky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#bde0f7" />
                        <stop offset="100%" stopColor="#e8f6fd" />
                    </linearGradient>
                    <linearGradient id="ta-water" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5ab4dc" />
                        <stop offset="100%" stopColor="#2e88b8" />
                    </linearGradient>
                    <linearGradient id="ta-pillar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#cbd8e4" />
                        <stop offset="100%" stopColor="#a8bfcc" />
                    </linearGradient>
                    <linearGradient id="ta-beam" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dce8f0" />
                        <stop offset="100%" stopColor="#b8ceda" />
                    </linearGradient>
                    <filter id="ta-shadow">
                        <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="rgba(0,60,120,0.15)" />
                    </filter>
                </defs>

                {/* Sky */}
                <rect width="1200" height="220" fill="url(#ta-sky)" />

                {/* Sun */}
                <circle cx="1080" cy="28" r="28" fill="#ffe566" opacity="0.9" />
                <circle cx="1080" cy="28" r="20" fill="#fff8a0" />
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a, i) => (
                    <line key={i}
                        x1={1080 + 32 * Math.cos(a * Math.PI / 180)} y1={28 + 32 * Math.sin(a * Math.PI / 180)}
                        x2={1080 + 46 * Math.cos(a * Math.PI / 180)} y2={28 + 46 * Math.sin(a * Math.PI / 180)}
                        stroke="#ffe566" strokeWidth="2.5" opacity="0.5" />
                ))}

                {/* Clouds */}
                <g opacity="0.92">
                    <ellipse cx="140" cy="24" rx="54" ry="18" fill="white" />
                    <ellipse cx="108" cy="28" rx="34" ry="15" fill="white" />
                    <ellipse cx="176" cy="28" rx="38" ry="14" fill="white" />
                </g>
                <g opacity="0.85">
                    <ellipse cx="520" cy="20" rx="46" ry="16" fill="white" />
                    <ellipse cx="494" cy="24" rx="30" ry="12" fill="white" />
                    <ellipse cx="550" cy="24" rx="33" ry="12" fill="white" />
                </g>
                <g opacity="0.78">
                    <ellipse cx="800" cy="30" rx="38" ry="14" fill="white" />
                    <ellipse cx="778" cy="33" rx="26" ry="11" fill="white" />
                    <ellipse cx="826" cy="33" rx="28" ry="11" fill="white" />
                </g>

                {/* ── KOCHI MONUMENTS ── */}

                {/* 1. Chinese Fishing Nets - Fort Kochi */}
                <g transform="translate(18,36)" filter="url(#ta-shadow)">
                    <rect x="26" y="0" width="6" height="88" fill="#9b7320" />
                    <line x1="26" y1="6" x2="-22" y2="24" stroke="#9b7320" strokeWidth="5" />
                    <line x1="26" y1="6" x2="92" y2="16" stroke="#9b7320" strokeWidth="5" />
                    <polygon points="-22,24 92,16 64,80 2,85" fill="rgba(50,90,70,0.22)" stroke="#5a7a60" strokeWidth="1.5" />
                    {[-22, 4, 30, 56, 80].map((x, i) => (
                        <line key={i} x1={x} y1={24 - i} x2={2 + i * 12} y2="85" stroke="#4a6850" strokeWidth="1" opacity="0.65" />
                    ))}
                    <line x1="26" y1="6" x2="32" y2="60" stroke="#9b7320" strokeWidth="3" />
                    <ellipse cx="32" cy="63" rx="6" ry="4" fill="#7a5210" />
                </g>

                {/* 2. Dutch Palace / Mattancherry */}
                <g transform="translate(155,44)" filter="url(#ta-shadow)">
                    <rect x="0" y="34" width="98" height="54" fill="#eed9a0" />
                    <polygon points="-10,34 49,5 108,34" fill="#c85828" />
                    <polygon points="12,34 49,16 86,34" fill="#d86840" />
                    {[8, 32, 58, 76].map(x => (<rect key={x} x={x} y="46" width="13" height="18" fill="#6090c0" rx="1" opacity="0.75" />))}
                    <rect x="41" y="66" width="16" height="22" fill="#8b6030" rx="2" />
                    {[6, 44, 82].map(x => (<rect key={x} x={x} y="34" width="5" height="54" fill="#d4b060" opacity="0.45" />))}
                    <rect x="41" y="1" width="16" height="12" fill="#c85828" />
                </g>

                {/* 3. St. Francis Church */}
                <g transform="translate(330,24)" filter="url(#ta-shadow)">
                    <rect x="8" y="54" width="70" height="66" fill="#f2eada" />
                    <polygon points="8,54 43,20 78,54" fill="#e8e0c8" />
                    <rect x="30" y="7" width="26" height="50" fill="#e0d4b8" />
                    <polygon points="30,7 43,-12 56,7" fill="#ccc0a0" />
                    <line x1="43" y1="-22" x2="43" y2="-8" stroke="#8b6030" strokeWidth="3" />
                    <line x1="37" y1="-17" x2="49" y2="-17" stroke="#8b6030" strokeWidth="3" />
                    <path d="M34,26 Q43,15 52,26" fill="none" stroke="#b0a080" strokeWidth="2" />
                    <circle cx="43" cy="30" r="3" fill="#8b6030" opacity="0.5" />
                    <path d="M18,66 Q26,54 34,66" fill="#6090c0" opacity="0.7" />
                    <path d="M52,66 Q60,54 68,66" fill="#6090c0" opacity="0.7" />
                    <path d="M31,120 L31,88 Q43,74 55,88 L55,120" fill="#9b7040" opacity="0.8" />
                </g>

                {/* 4. Paradesi Synagogue */}
                <g transform="translate(492,36)" filter="url(#ta-shadow)">
                    <rect x="5" y="42" width="84" height="64" fill="#f8f2e0" />
                    <polygon points="0,42 47,18 94,42" fill="#ece8d0" />
                    <rect x="32" y="4" width="28" height="42" fill="#f0eacc" />
                    <polygon points="32,4 46,-9 60,4" fill="#e4dcc0" />
                    <circle cx="46" cy="23" r="9" fill="white" stroke="#c8b870" strokeWidth="1.5" />
                    <line x1="46" y1="23" x2="46" y2="16" stroke="#444" strokeWidth="1.5" />
                    <line x1="46" y1="23" x2="52" y2="23" stroke="#444" strokeWidth="1.5" />
                    {[10, 58].map(x => (
                        <g key={x}>
                            <rect x={x} y="52" width="15" height="22" fill="#6090c0" rx="1" opacity="0.75" />
                            <path d={`M${x},52 Q${x + 7.5},42 ${x + 15},52`} fill="#5080b0" opacity="0.6" />
                        </g>
                    ))}
                    <rect x="36" y="82" width="20" height="24" fill="#9b7040" rx="2" />
                </g>

                {/* 5. Fort Kochi Lighthouse */}
                <g transform="translate(675,28)" filter="url(#ta-shadow)">
                    <rect x="22" y="82" width="20" height="36" fill="#e8e0d0" />
                    <polygon points="14,82 32,6 50,82" fill="white" />
                    {[0, 1, 2, 3].map(i => (
                        <polygon key={i} points={`${14 + i * 2},${82 - i * 19} ${32},${6 + i * 19 - 19} ${50 - i * 2},${82 - i * 19}`} fill="#e63946" opacity="0.32" />
                    ))}
                    <rect x="24" y="3" width="16" height="14" fill="#c8d8e8" rx="1" stroke="#a8c0d0" strokeWidth="1" />
                    <polygon points="22,3 32,-7 42,3" fill="#e0d8c8" />
                    <circle cx="32" cy="10" r="5" fill="#ffe566" opacity="0.9" />
                    <circle cx="32" cy="10" r="9" fill="#ffe566" opacity="0.22" />
                    <rect x="20" y="3" width="24" height="3" fill="#a8c0d0" rx="1" />
                </g>

                {/* 6. Kerala Houseboat on Vembanad */}
                <g transform="translate(808,112)">
                    <ellipse cx="60" cy="32" rx="62" ry="10" fill="#8b6820" opacity="0.75" />
                    <rect x="5" y="10" width="110" height="22" fill="#d4a840" />
                    <path d="M5,10 Q60,-12 115,10" fill="#c89420" stroke="#a07810" strokeWidth="1.5" />
                    <path d="M5,10 Q60,0 115,10" fill="#d4a030" opacity="0.4" />
                    {[14, 38, 64, 88].map(x => (<rect key={x} x={x} y="12" width="16" height="11" fill="#87ceeb" rx="1" opacity="0.7" />))}
                    <path d="M-10,36 Q30,42 60,36 Q90,30 130,36" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" />
                </g>

                {/* 7. Indo-Portuguese Colonial Arched Building */}
                <g transform="translate(992,44)" filter="url(#ta-shadow)">
                    <rect x="0" y="34" width="135" height="76" fill="#f4ead0" />
                    {[5, 37, 70, 103].map(x => (
                        <path key={x} d={`M${x},110 L${x},58 Q${x + 16},42 ${x + 32},58 L${x + 32},110`} fill="#ecdcc0" stroke="#d4c080" strokeWidth="1" />
                    ))}
                    <rect x="0" y="28" width="135" height="9" fill="#ecdcc0" />
                    {[0, 22, 44, 66, 88, 110].map(x => (<rect key={x} x={x} y="16" width="16" height="16" fill="#e4d4b0" rx="1" />))}
                    <ellipse cx="67" cy="16" rx="26" ry="12" fill="#ecdcc0" />
                    <polygon points="55,16 67,-1 79,16" fill="#e4d4b0" />
                    <circle cx="67" cy="-1" r="3" fill="#c8a840" />
                </g>

                {/* Palm Trees */}
                <g transform="translate(620,74)">
                    <rect x="10" y="0" width="5" height="60" fill="#9b7320" transform="rotate(5,12,60)" />
                    {[-30, -15, 0, 15, 30].map((a, i) => (
                        <ellipse key={i} cx={12 + i * 3} cy={i % 2 === 0 ? -5 : 0} rx="22" ry="7" fill="#3a9a4e" opacity="0.85" transform={`rotate(${a} 12 0)`} />
                    ))}
                </g>
                <g transform="translate(740,84)">
                    <rect x="10" y="0" width="5" height="50" fill="#9b7320" transform="rotate(-4,12,50)" />
                    {[-25, -10, 5, 20, 35].map((a, i) => (
                        <ellipse key={i} cx={12 + i * 2} cy={i % 2 === 0 ? -4 : 2} rx="18" ry="6" fill="#3a9a4e" opacity="0.8" transform={`rotate(${a} 12 0)`} />
                    ))}
                </g>

                {/* Vembanad Lake Water */}
                <rect x="0" y="168" width="1200" height="52" fill="url(#ta-water)" />
                {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                    <path key={i} d={`M${i * 160} 176 Q${i * 160 + 80} ${172 + i % 3 * 4} ${i * 160 + 160} 176`}
                        stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" fill="none">
                        <animateTransform attributeName="transform" type="translate" values="0,0;10,0;0,0" dur={`${3.5 + i * 0.25}s`} repeatCount="indefinite" />
                    </path>
                ))}
                {/* Sun reflection on water */}
                <ellipse cx="1080" cy="180" rx="70" ry="9" fill="rgba(255,230,80,0.13)" />

                {/* Elevated Metro Viaduct Pillars */}
                {[80, 220, 370, 520, 670, 820, 970, 1120].map(x => (
                    <g key={x}>
                        <rect x={x - 10} y="130" width="20" height="68" fill="url(#ta-pillar)" rx="2" />
                        <rect x={x - 18} y="190" width="36" height="9" fill="#a8bfcc" rx="2" />
                        <rect x={x - 10} y="132" width="4" height="64" fill="rgba(0,0,0,0.06)" rx="1" />
                    </g>
                ))}

                {/* Track Beam */}
                <rect x="0" y="122" width="1200" height="16" fill="url(#ta-beam)" />
                <rect x="0" y="134" width="1200" height="5" fill="#9ab8cc" />

                {/* Rails */}
                <rect x="0" y="120" width="1200" height="3" fill="#8898a8" rx="1" />
                <rect x="0" y="128" width="1200" height="3" fill="#8898a8" rx="1" />

                {/* Overhead Catenary Wires */}
                {[0, 1, 2, 3, 4, 5].map(i => (
                    <path key={i} d={`M${i * 200} 92 Q${i * 200 + 100} 99 ${i * 200 + 200} 92`}
                        stroke="#aaa" strokeWidth="0.9" fill="none" opacity="0.5" />
                ))}
                {[200, 400, 600, 800, 1000].map(x => (
                    <line key={x} x1={x} y1="92" x2={x} y2="122" stroke="#bbb" strokeWidth="0.7" opacity="0.45" />
                ))}
            </svg>

            {/* ── KOCHI METRO TRAIN ── */}
            <svg
                style={{
                    position: "absolute",
                    top: "38px",
                    left: `${metroX}px`,
                    width: `${METRO_W}px`,
                    height: "88px",
                    transition: "none",
                    filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.18))"
                }}
                viewBox="0 0 490 72"
                overflow="visible"
            >
                {/* Train shadow */}
                <ellipse cx="245" cy="70" rx="215" ry="4" fill="rgba(0,0,0,0.1)" />

                {/* ── CAR 2 — rear ── */}
                <g>
                    <rect x="4" y="3" width="232" height="52" fill="#d01025" rx="5" />
                    <rect x="4" y="29" width="232" height="13" fill="white" />
                    <rect x="4" y="38" width="232" height="17" fill="#1b3f6e" />
                    <rect x="4" y="2" width="232" height="5" fill="#b00c22" rx="3" />
                    {/* Tail end */}
                    <polygon points="4,3 -13,20 -13,44 4,55" fill="#b00c22" />
                    <polygon points="4,29 -13,29 -13,38 4,38" fill="white" />
                    <polygon points="4,38 -13,38 -13,55 4,55" fill="#163565" />
                    {/* Tail light */}
                    <ellipse cx="-9" cy="35" rx="5" ry="5" fill="#ff3344" opacity="0.95" />
                    <ellipse cx="-9" cy="35" rx="9" ry="9" fill="#ff3344" opacity="0.18" />
                    {/* Windows */}
                    {[12, 52, 92, 132, 172, 208].map(x => (
                        <g key={x}>
                            <rect x={x} y="7" width="30" height="19" fill="#c8e8f8" rx="2" opacity="0.92" />
                            <rect x={x + 1} y="8" width="10" height="8" fill="rgba(255,255,255,0.65)" rx="1" />
                        </g>
                    ))}
                    {/* KMRL branding */}
                    <text x="120" y="38" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="bold" fontFamily="Arial, sans-serif">KOCHI METRO · KMRL</text>
                    {/* Door seams */}
                    {[46, 86, 166, 206].map(x => (
                        <line key={x} x1={x} y1="3" x2={x} y2="55" stroke="#9a0018" strokeWidth="1.2" opacity="0.35" />
                    ))}
                    {/* Wheels */}
                    {[32, 76, 156, 200].map(wx => (
                        <g key={wx}>
                            <rect x={wx - 14} y="54" width="28" height="6" fill="#2a3848" rx="1" />
                            <circle cx={wx} cy="63" r="9" fill="#1c2a38" stroke="#4a6a88" strokeWidth="1.5" />
                            <circle cx={wx} cy="63" r="5" fill="#243444" />
                            <circle cx={wx} cy="63" r="2" fill="#3a5268" />
                            <line x1={wx - 9} y1="63" x2={wx + 9} y2="63" stroke="#4a6a88" strokeWidth="1.5">
                                <animateTransform attributeName="transform" type="rotate" from={`0 ${wx} 63`} to={`360 ${wx} 63`} dur="0.32s" repeatCount="indefinite" />
                            </line>
                            <line x1={wx} y1="54" x2={wx} y2="72" stroke="#4a6a88" strokeWidth="1.5">
                                <animateTransform attributeName="transform" type="rotate" from={`0 ${wx} 63`} to={`360 ${wx} 63`} dur="0.32s" repeatCount="indefinite" />
                            </line>
                        </g>
                    ))}
                    {/* Inter-car coupler */}
                    <rect x="232" y="25" width="18" height="8" fill="#182838" rx="2" />
                </g>

                {/* ── CAR 1 — front ── */}
                <g transform="translate(250,0)">
                    <rect x="0" y="3" width="232" height="52" fill="#d01025" rx="5" />
                    <rect x="0" y="29" width="232" height="13" fill="white" />
                    <rect x="0" y="38" width="232" height="17" fill="#1b3f6e" />
                    <rect x="0" y="2" width="232" height="5" fill="#b00c22" rx="3" />
                    {/* Aerodynamic nose */}
                    <polygon points="232,3 252,20 252,46 232,55" fill="#b00c22" />
                    <polygon points="232,29 252,29 252,38 232,38" fill="white" />
                    <polygon points="232,38 252,38 252,55 232,55" fill="#163565" />
                    {/* Headlight */}
                    <ellipse cx="248" cy="23" rx="8" ry="6" fill="#fffbe0" opacity="0.95" />
                    <ellipse cx="248" cy="23" rx="5" ry="4" fill="white" />
                    <polygon points="256,23 292,11 292,35" fill="rgba(255,240,120,0.1)" />
                    {/* Destination board */}
                    <rect x="180" y="6" width="46" height="12" fill="#1b3f6e" rx="2" />
                    <text x="203" y="15" textAnchor="middle" fill="#88ccff" fontSize="5" fontWeight="bold" fontFamily="Arial, sans-serif">ALUVA ▶</text>
                    {/* Windows */}
                    {[8, 48, 88, 128, 168].map(x => (
                        <g key={x}>
                            <rect x={x} y="7" width="30" height="19" fill="#c8e8f8" rx="2" opacity="0.92" />
                            <rect x={x + 1} y="8" width="10" height="8" fill="rgba(255,255,255,0.65)" rx="1" />
                        </g>
                    ))}
                    <text x="116" y="38" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="bold" fontFamily="Arial, sans-serif">KOCHI METRO · KMRL</text>
                    {[46, 86, 126, 166].map(x => (
                        <line key={x} x1={x} y1="3" x2={x} y2="55" stroke="#9a0018" strokeWidth="1.2" opacity="0.35" />
                    ))}
                    {/* Wheels */}
                    {[32, 76, 156, 200].map(wx => (
                        <g key={wx}>
                            <rect x={wx - 14} y="54" width="28" height="6" fill="#2a3848" rx="1" />
                            <circle cx={wx} cy="63" r="9" fill="#1c2a38" stroke="#4a6a88" strokeWidth="1.5" />
                            <circle cx={wx} cy="63" r="5" fill="#243444" />
                            <circle cx={wx} cy="63" r="2" fill="#3a5268" />
                            <line x1={wx - 9} y1="63" x2={wx + 9} y2="63" stroke="#4a6a88" strokeWidth="1.5">
                                <animateTransform attributeName="transform" type="rotate" from={`0 ${wx} 63`} to={`360 ${wx} 63`} dur="0.32s" repeatCount="indefinite" />
                            </line>
                            <line x1={wx} y1="54" x2={wx} y2="72" stroke="#4a6a88" strokeWidth="1.5">
                                <animateTransform attributeName="transform" type="rotate" from={`0 ${wx} 63`} to={`360 ${wx} 63`} dur="0.32s" repeatCount="indefinite" />
                            </line>
                        </g>
                    ))}
                </g>
            </svg>
        </div>
    );
}