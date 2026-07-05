const SB_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

// 서버 사이드 보너스 계산 (클라이언트 조작 방지)
// 5,000원 → +51,000P 런칭 이벤트 / 그 외 1만원당 1,000P
function getBonus(amount) {
  if (amount === 5000) return 51000;
  return Math.floor(amount / 10000) * 1000;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { paymentKey, orderId, amount, userId } = req.body;
  if (!paymentKey || !orderId || !amount || !userId) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }
  if (typeof amount !== 'number' || amount < 5000 || amount > 1000000) {
    return res.status(400).json({ error: '충전 금액 범위 오류' });
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

  // 보너스 계산
  const bonus = getBonus(amount);
  const totalPoints = amount + bonus;

  // 현재 잔액 조회
  const balRes = await fetch(
    `${SB_URL}/rest/v1/point_accounts?user_id=eq.${userId}&select=balance&limit=1`,
    { headers: sbHeaders }
  );
  const balRows = await balRes.json();
  const currentBalance = Array.isArray(balRows) && balRows.length ? (balRows[0].balance || 0) : 0;
  const newBalance = currentBalance + totalPoints;

  // point_accounts upsert
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
  const desc = bonus > 0
    ? `포인트 충전 ${amount.toLocaleString()}원 (+보너스 ${bonus.toLocaleString()}P)`
    : `포인트 충전 ${amount.toLocaleString()}원`;
  await fetch(`${SB_URL}/rest/v1/point_transactions`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      type: 'charge',
      amount: totalPoints,
      balance_after: newBalance,
      description: desc,
      payment_key: paymentKey,
      order_id: orderId,
    }),
  });

  return res.status(200).json({ success: true, balance: newBalance, totalPoints });
}
