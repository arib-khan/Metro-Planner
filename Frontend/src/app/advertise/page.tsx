// app/advertise/page.jsx
'use client';

/**
 * Public Ad Booking Page
 * 
 * Users can:
 *  1. Pick a station
 *  2. See pricing (set by admin per station)
 *  3. Choose duration (days)
 *  4. Paste a YouTube link
 *  5. Pay via Razorpay
 * 
 * After payment, a booking doc is created in Firestore:
 *   adBookings/{bookingId}
 *   {
 *     stationSlug, stationName, youtubeUrl, videoId,
 *     advertiserName, advertiserEmail, advertiserPhone,
 *     days, startDate, endDate,
 *     pricePerDay, totalAmount, currency: 'INR',
 *     razorpayOrderId, razorpayPaymentId,
 *     status: 'pending' | 'approved' | 'rejected' | 'refunded',
 *     refundId, refundedAt,
 *     createdAt, approvedAt, rejectedAt,
 *     adminNote,
 *     // Legacy admin-added ads (no payment) have source: 'admin'
 *     source: 'marketplace'
 *   }
 */

import { useState, useEffect } from 'react';
import {
    collection, doc, getDoc, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { STATIONS, nameToSlug } from '../lib/scheduleEngine';

// ─── helpers ──────────────────────────────────────────────────────────────────

const extractYouTubeId = (url) => {
    if (!url) return null;
    const patterns = [
        /youtu\.be\/([^?&#]+)/,
        /youtube\.com\/watch\?v=([^&#]+)/,
        /youtube\.com\/embed\/([^?&#]+)/,
        /youtube\.com\/shorts\/([^?&#]+)/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
};

const DAY_OPTIONS = [1, 3, 7, 14, 30];

const formatINR = (amount) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

// Extend Window to include Razorpay (loaded dynamically via CDN script)
declare global {
    interface Window {
        Razorpay: new (options: Record<string, unknown>) => {
            open: () => void;
            on: (event: string, handler: (response: unknown) => void) => void;
        };
    }
}

// Load Razorpay script
function loadRazorpay() {
    return new Promise((resolve) => {
        if (window.Razorpay) return resolve(true);
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.body.appendChild(s);
    });
}

// ─── Step components ───────────────────────────────────────────────────────────

function StepBadge({ n, active, done }) {
    return (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all
      ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-900' : 'bg-gray-800 text-gray-500'}`}>
            {done ? '✓' : n}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdvertisePage() {
    // Pricing map: slug → pricePerDay (INR)
    const [pricing, setPricing] = useState({});
    const [pricingLoading, setPricingLoading] = useState(true);

    // Form state
    const [selectedSlug, setSelectedSlug] = useState('');
    const [days, setDays] = useState(7);
    const [startDate, setStartDate] = useState(todayStr());
    const [ytUrl, setYtUrl] = useState('');
    const [adLabel, setAdLabel] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');

    // UI state
    const [step, setStep] = useState(1); // 1 station, 2 details, 3 payment, 4 confirm
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [bookingId, setBookingId] = useState(null);

    // Derived
    const selectedStation = STATIONS.find(s => nameToSlug(s.name) === selectedSlug);
    const pricePerDay = selectedSlug ? (pricing[selectedSlug] ?? 0) : 0;
    const totalAmount = pricePerDay * days;
    const videoId = extractYouTubeId(ytUrl);
    const endDate = startDate ? addDays(startDate, days - 1) : '';

    // ── Fetch station pricing ─────────────────────────────────────────────────
    useEffect(() => {
        if (!db) { setPricingLoading(false); return; }
        getDoc(doc(db, 'config', 'stationPricing'))
            .then(snap => {
                if (snap.exists()) setPricing(snap.data().prices ?? {});
            })
            .catch(console.error)
            .finally(() => setPricingLoading(false));
    }, []);

    // ── Razorpay payment flow ─────────────────────────────────────────────────
    const handlePayment = async () => {
        setError('');

        // Validations
        if (!selectedSlug) return setError('Please select a station.');
        if (!videoId) return setError('Invalid YouTube URL. Please check and try again.');
        if (!name.trim()) return setError('Please enter your name.');
        if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) return setError('Please enter a valid email.');
        if (!phone.trim() || phone.replace(/\D/g, '').length < 10) return setError('Please enter a valid 10-digit phone number.');
        if (pricePerDay === 0) return setError('This station has no pricing set yet. Please contact admin.');

        setSubmitting(true);

        try {
            const loaded = await loadRazorpay();
            if (!loaded) throw new Error('Razorpay SDK failed to load. Check your internet connection.');

            // ── Create Razorpay order via your API route ───────────────────────────
            // You must implement /api/razorpay/create-order that calls Razorpay Orders API
            const orderRes = await fetch('/api/razorpay/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: totalAmount * 100, currency: 'INR' }), // paise
            });

            if (!orderRes.ok) throw new Error('Failed to create payment order. Try again.');
            const { orderId, keyId } = await orderRes.json();

            // ── Open Razorpay checkout ─────────────────────────────────────────────
            await new Promise<void>((resolve, reject) => {
                const rzp = new window.Razorpay({
                    key: keyId,
                    amount: totalAmount * 100,
                    currency: 'INR',
                    name: 'KMRL Station Ads',
                    description: `Ad on ${selectedStation.name} for ${days} day${days > 1 ? 's' : ''}`,
                    order_id: orderId,
                    prefill: { name, email, contact: phone },
                    theme: { color: '#2563eb' },
                    handler: async (response) => {
                        // ── Payment succeeded — save booking to Firestore ───────────────
                        try {
                            const docRef = await addDoc(collection(db, 'adBookings'), {
                                stationSlug: selectedSlug,
                                stationName: selectedStation.name,
                                youtubeUrl: ytUrl,
                                videoId,
                                label: adLabel.trim() || selectedStation.name,
                                advertiserName: name.trim(),
                                advertiserEmail: email.trim(),
                                advertiserPhone: phone.trim(),
                                days,
                                startDate,
                                endDate,
                                pricePerDay,
                                totalAmount,
                                currency: 'INR',
                                razorpayOrderId: orderId,
                                razorpayPaymentId: response.razorpay_payment_id,
                                razorpaySignature: response.razorpay_signature,
                                status: 'pending',
                                source: 'marketplace',
                                createdAt: serverTimestamp(),
                            });
                            setBookingId(docRef.id);
                            setStep(4);
                            resolve();
                        } catch (fsErr) {
                            reject(new Error('Payment received but booking save failed. Contact support with your payment ID: ' + response.razorpay_payment_id));
                        }
                    },
                    modal: {
                        ondismiss: () => reject(new Error('Payment cancelled.')),
                    },
                });
                rzp.open();
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Step 4 — Success ─────────────────────────────────────────────────────
    if (step === 4) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto text-4xl">
                        🎉
                    </div>
                    <h1 className="text-2xl font-bold">Booking Received!</h1>
                    <p className="text-gray-400">
                        Your ad booking for <span className="text-white font-semibold">{selectedStation?.name}</span> is under review.
                        You&apos;ll receive an email at <span className="text-white font-semibold">{email}</span> once approved.
                    </p>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-left text-sm space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Booking ID</span>
                            <span className="font-mono text-xs text-gray-300">{bookingId?.slice(0, 8)}…</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Station</span>
                            <span>{selectedStation?.name}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Duration</span>
                            <span>{days} day{days > 1 ? 's' : ''} ({startDate} → {endDate})</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Amount Paid</span>
                            <span className="text-emerald-400 font-bold">{formatINR(totalAmount)}</span>
                        </div>
                    </div>
                    <div className="bg-amber-950/40 border border-amber-800 rounded-xl p-3 text-sm text-amber-300">
                        ⏳ Admin review typically takes 1–2 business hours. If rejected, a full refund is processed immediately.
                    </div>
                    <a href="/stations" className="inline-block mt-2 text-sm text-blue-400 hover:text-blue-300 transition">
                        ← Back to Stations
                    </a>
                </div>
            </div>
        );
    }

    // ─── Main form ─────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-bold">📢 Advertise on KMRL Stations</h1>
                        <p className="text-xs text-gray-500 mt-0.5">Reach thousands of daily commuters</p>
                    </div>
                    <a href="/stations" className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg transition">
                        ← Stations
                    </a>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

                {/* Progress bar */}
                <div className="flex items-center gap-3">
                    {[
                        { n: 1, label: 'Station' },
                        { n: 2, label: 'Ad Details' },
                        { n: 3, label: 'Payment' },
                    ].map(({ n, label }, i, arr) => (
                        <div key={n} className="flex items-center gap-3 flex-1">
                            <div className="flex items-center gap-2">
                                <StepBadge n={n} active={step === n} done={step > n} />
                                <span className={`text-xs font-medium hidden sm:block ${step === n ? 'text-white' : step > n ? 'text-emerald-400' : 'text-gray-600'}`}>
                                    {label}
                                </span>
                            </div>
                            {i < arr.length - 1 && (
                                <div className={`h-px flex-1 transition-all ${step > n ? 'bg-emerald-500' : 'bg-gray-800'}`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* ── STEP 1 — Choose Station ─────────────────────────────────────── */}
                {step === 1 && (
                    <div className="space-y-5">
                        <div>
                            <h2 className="text-base font-semibold mb-1">Choose a Station</h2>
                            <p className="text-xs text-gray-500">Your ad video will play on the selected station&apos;s display screens.</p>
                        </div>

                        {pricingLoading ? (
                            <div className="text-center py-8 text-gray-500 text-sm">Loading station pricing…</div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {STATIONS.map((s, i) => {
                                    const slug = nameToSlug(s.name);
                                    const price = pricing[slug];
                                    const isTerminus = i === 0 || i === 23;
                                    return (
                                        <button
                                            key={slug}
                                            onClick={() => setSelectedSlug(slug)}
                                            className={`text-left rounded-xl border p-3 transition hover:scale-[1.02]
                        ${selectedSlug === slug
                                                    ? 'border-blue-500 bg-blue-950/60 ring-2 ring-blue-700'
                                                    : 'border-gray-800 bg-gray-900 hover:bg-gray-800'}`}
                                        >
                                            <div className="text-[10px] font-mono text-gray-600">{String(i + 1).padStart(2, '0')}</div>
                                            <div className={`text-sm font-semibold leading-tight mt-0.5 ${isTerminus ? 'text-blue-300' : 'text-white'}`}>
                                                {s.name}
                                            </div>
                                            <div className="mt-1.5 text-xs font-bold">
                                                {price ? (
                                                    <span className="text-emerald-400">{formatINR(price)}<span className="text-gray-500 font-normal">/day</span></span>
                                                ) : (
                                                    <span className="text-gray-600">Pricing TBD</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {selectedSlug && (
                            <div className="bg-blue-950/30 border border-blue-800 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold">{selectedStation?.name}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">Selected station</p>
                                </div>
                                <button
                                    onClick={() => { setError(''); setStep(2); }}
                                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-5 py-2 rounded-lg transition"
                                >
                                    Continue →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── STEP 2 — Ad Details ─────────────────────────────────────────── */}
                {step === 2 && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold mb-1">Ad Details</h2>
                                <p className="text-xs text-gray-500">Your video & campaign duration</p>
                            </div>
                            <button onClick={() => setStep(1)} className="text-xs text-gray-500 hover:text-gray-300 transition">← Change station</button>
                        </div>

                        {/* Station + pricing summary */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
                            <div className="text-sm">
                                <span className="text-gray-400">Station: </span>
                                <span className="font-semibold">{selectedStation?.name}</span>
                            </div>
                            <span className="text-emerald-400 font-bold text-sm">{formatINR(pricePerDay)}/day</span>
                        </div>

                        {/* Duration */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Campaign Duration</label>
                            <div className="flex flex-wrap gap-2">
                                {DAY_OPTIONS.map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setDays(d)}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold border transition
                      ${days === d
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}
                                    >
                                        {d} day{d > 1 ? 's' : ''}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Start date */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                min={todayStr()}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                            />
                            {endDate && (
                                <p className="text-xs text-gray-500">Runs: {startDate} → {endDate} ({days} days)</p>
                            )}
                        </div>

                        {/* YouTube URL */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">YouTube Ad Video URL</label>
                            <input
                                type="url"
                                value={ytUrl}
                                onChange={e => setYtUrl(e.target.value)}
                                placeholder="https://youtube.com/watch?v=..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                            />
                            {ytUrl && !videoId && (
                                <p className="text-xs text-red-400">⚠ Could not extract video ID. Check the URL.</p>
                            )}
                            {videoId && (
                                <div className="flex items-center gap-2 text-xs text-emerald-400">
                                    ✓ Valid YouTube video —
                                    <a href={`https://youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer"
                                        className="underline hover:text-emerald-300">preview</a>
                                </div>
                            )}
                        </div>

                        {/* Ad label */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Ad Label <span className="text-gray-600">(optional)</span></label>
                            <input
                                type="text"
                                value={adLabel}
                                onChange={e => setAdLabel(e.target.value)}
                                placeholder="e.g. Summer Sale 2025"
                                maxLength={60}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        {/* Total */}
                        {pricePerDay > 0 && (
                            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-gray-500">{formatINR(pricePerDay)} × {days} days</p>
                                    <p className="text-lg font-bold text-white mt-0.5">Total: <span className="text-emerald-400">{formatINR(totalAmount)}</span></p>
                                </div>
                                <button
                                    disabled={!videoId}
                                    onClick={() => { setError(''); setStep(3); }}
                                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm px-5 py-2 rounded-lg transition"
                                >
                                    Continue →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── STEP 3 — Contact + Payment ─────────────────────────────────── */}
                {step === 3 && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold mb-1">Your Details & Payment</h2>
                                <p className="text-xs text-gray-500">We&apos;ll send booking confirmation to your email.</p>
                            </div>
                            <button onClick={() => setStep(2)} className="text-xs text-gray-500 hover:text-gray-300 transition">← Edit ad</button>
                        </div>

                        {/* Order summary */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Station</span>
                                <span className="font-medium">{selectedStation?.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Duration</span>
                                <span>{days} day{days > 1 ? 's' : ''} ({startDate} → {endDate})</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Video</span>
                                <a href={`https://youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline text-xs max-w-[180px] truncate">
                                    youtu.be/{videoId}
                                </a>
                            </div>
                            <div className="border-t border-gray-800 pt-2 flex justify-between font-bold">
                                <span>Total</span>
                                <span className="text-emerald-400 text-base">{formatINR(totalAmount)}</span>
                            </div>
                        </div>

                        {/* Contact fields */}
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-300">Full Name</label>
                                <input
                                    type="text" value={name} onChange={e => setName(e.target.value)}
                                    placeholder="Your name"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-300">Email</label>
                                <input
                                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-300">Phone</label>
                                <input
                                    type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                                    placeholder="+91 98765 43210"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-950/50 border border-red-800 rounded-xl p-3 text-sm text-red-300">
                                ⚠ {error}
                            </div>
                        )}

                        <button
                            onClick={handlePayment}
                            disabled={submitting}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed
                text-white font-bold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Processing…
                                </>
                            ) : (
                                <>💳 Pay {formatINR(totalAmount)} via Razorpay</>
                            )}
                        </button>

                        <p className="text-center text-xs text-gray-600">
                            🔒 Payments secured by Razorpay. If your ad is rejected, you&apos;ll receive an instant full refund.
                        </p>
                    </div>
                )}

            </main>
        </div>
    );
}