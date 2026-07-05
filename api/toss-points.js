const SB_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { paymentKey, orderId, amount, userId } = req.body;
  if (!paymentKey || !orderId || !amount || !userId) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }
  if (typeof amount !== 'number' || amount < 100 || amount > 500000) {
    return res.status(400).json({ error: '충전 금액 범위 초과' });
  }

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sbHeaders = {
    apikey: svcKey,
    Authorization: `Bearer ${svcKey}`,
    'Content-Type': 'application/json',
  };

  // 중복 주문 체크
  const dupCheck = await fetch(
    `${SB_URL}/rest/v1/point_transactions?order_id=eq.${encodeURIComponent(orderId)}&select=id&limit=1`,
    { headers: sbHeaders }
  );
  const dupRows = await dupCheck.json();
  if (Array.isArray(dupRows) && dupRows.length > 0) {
    return res.status(409).json({ error: '이미 처리된 주문입니다' });
  }

  // 토스페이먼츠 결제 승인
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

  // 현재 잔액 조회
  const balRes = await fetch(
    `${SB_URL}/rest/v1/point_accounts?user_id=eq.${userId}&select=balance&limit=1`,
    { headers: sbHeaders }
  );
  const balRows = await balRes.json();
  const currentBalance = Array.isArray(balRows) && balRows.length ? (balRows[0].balance || 0) : 0;
  const newBalance = currentBalance + amount;

  // point_accounts upsert (잔액 갱신)
  await fetch(`${SB_URL}/rest/v1/point_accounts`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      balance: newBalance,
      updated_at: new Date().toISOString(),
    }),
  });

  // point_transactions 기록
  await fetch(`${SB_URL}/rest/v1/point_transactions`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      type: 'charge',
      amount,
      balance_after: newBalance,
      description: `포인트 충전 ${amount.toLocaleString()}P`,
      payment_key: paymentKey,
      order_id: orderId,
    }),
  });

  return res.status(200).json({ success: true, balance: newBalance });
}
