// app/api/razorpay/create-order/route.js
//
// POST /api/razorpay/create-order
// Body: { amount: number (paise), currency: 'INR' }
// Returns: { orderId, keyId }
//
// Set these in your .env.local:
//   RAZORPAY_KEY_ID=rzp_live_xxx
//   RAZORPAY_KEY_SECRET=xxx
//   NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxx  (used client-side for checkout)

import Razorpay from 'razorpay';
import { NextResponse } from 'next/server';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export async function POST(req) {
    try {
        const { amount, currency = 'INR' } = await req.json();

        if (!amount || amount < 100) {
            return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
        }

        const order = await razorpay.orders.create({
            amount,          // in paise
            currency,
            receipt: `kmrl_ad_${Date.now()}`,
            payment_capture: 1,
        });

        return NextResponse.json({
            orderId: order.id,
            keyId: process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) {
        console.error('[razorpay/create-order]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}