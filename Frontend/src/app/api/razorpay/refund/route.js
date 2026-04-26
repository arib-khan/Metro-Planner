// app/api/razorpay/refund/route.js
// Calls Razorpay REST API directly — bypasses SDK bug with payments.refund()

import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { paymentId } = await req.json();

        if (!paymentId) {
            return NextResponse.json({ error: 'paymentId required' }, { status: 400 });
        }

        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

        // 1. Fetch payment status
        const paymentRes = await fetch(
            `https://api.razorpay.com/v1/payments/${paymentId}`,
            { headers: { Authorization: `Basic ${auth}` } }
        );
        const payment = await paymentRes.json();
        console.log('[refund] payment status:', payment.status, '| paise:', payment.amount);

        if (payment.status === 'refunded') {
            return NextResponse.json({ error: 'Already refunded.' }, { status: 400 });
        }
        if (payment.status === 'failed') {
            return NextResponse.json({ error: 'Payment failed — nothing to refund.' }, { status: 400 });
        }

        // 2. Capture first if only authorized
        if (payment.status === 'authorized') {
            console.log('[refund] capturing...');
            await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/capture`, {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount: payment.amount, currency: payment.currency }),
            });
        }

        // 3. Issue full refund
        const refundRes = await fetch(
            `https://api.razorpay.com/v1/payments/${paymentId}/refund`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount: payment.amount }), // full refund
            }
        );

        const refund = await refundRes.json();
        console.log('[refund] response:', JSON.stringify(refund, null, 2));

        if (!refundRes.ok) {
            return NextResponse.json(
                { error: refund?.error?.description ?? 'Refund failed' },
                { status: 500 }
            );
        }

        return NextResponse.json({ refundId: refund.id });
    } catch (err) {
        console.error('[refund] unexpected error:', err);
        return NextResponse.json({ error: err.message ?? 'Refund failed' }, { status: 500 });
    }
}