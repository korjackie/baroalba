const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { paymentKey, orderId, amount, plan, businessId } = req.body;
  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  // 1. 토스페이먼츠 결제 승인
  const secretKey = process.env.TOSS_SECRET_KEY;
  const encoded = Buffer.from(secretKey + ':').toString('base64');

  const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  const tossData = await tossRes.json();
  if (!tossRes.ok) {
    return res.status(400).json({ error: tossData.message || '결제 승인 실패' });
  }

  // 2. Supabase 저장
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  // 결제 이력 저장
  await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      business_id: businessId,
      order_id: orderId,
      payment_key: paymentKey,
      amount,
      plan,
      status: 'paid',
      paid_at: new Date().toISOString(),
    }),
  });

  // 구독 정보 upsert
  await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      business_id: businessId,
      plan,
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      payment_key: paymentKey,
      order_id: orderId,
      amount,
    }),
  });

  // businesses 테이블 플랜 업데이트
  await fetch(`${SUPABASE_URL}/rest/v1/businesses?kakao_uid=eq.${businessId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ plan }),
  });

  return res.status(200).json({ success: true, plan });
}
