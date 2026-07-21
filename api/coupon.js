const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

function getUserIdFromJWT(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub || '';
  } catch { return ''; }
}

function sb(path, svcKey, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': svcKey,
      'Authorization': `Bearer ${svcKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(opts.headers || {})
    }
  });
}

// coupons 테이블에 없는 코드는 추천인 코드일 수 있어 여기서 한 번 더 시도한다.
// api/admin.js의 process_referral과 동일한 규칙(자기 자신 코드 제외, 중복 지급 방지,
// 서비스 롤 키로 RLS 우회, 지급 시 알림 발송)을 coupon.js 안에서 그대로 재현한다 -
// 두 파일이 서로 다른 서버리스 함수라 헬퍼를 직접 공유할 수 없어 복제함.
const REFERRAL_REWARD_POINTS = 3000;

async function creditPoints(userId, amount, svcKey) {
  const acctRows = await sb(`point_accounts?user_id=eq.${userId}&select=id,balance`, svcKey).then(r => r.json());
  const acct = Array.isArray(acctRows) ? acctRows[0] : null;
  if (acct) {
    await sb(`point_accounts?id=eq.${acct.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ balance: (acct.balance || 0) + amount }) });
  } else {
    await sb('point_accounts', svcKey, { method: 'POST', body: JSON.stringify({ user_id: userId, balance: amount }) });
  }
}

async function notifyPointsGranted(userId, amount, reason, svcKey, req) {
  const title = '🎁 포인트가 지급됐어요';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = host ? `https://${host}` : '';
  await sb('notifications', svcKey, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: userId, title, body: reason, type: 'points_granted' }) }).catch(() => {});
  if (baseUrl) {
    await fetch(`${baseUrl}/api/send-push`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, title, body: reason, url: '/바로알바.html', type: 'points_granted' }) }).catch(() => {});
  }
}

async function tryRedeemReferralCode(code, userId, svcKey, req) {
  const refRows = await sb(`workers?referral_code=eq.${encodeURIComponent(code)}&select=kakao_uid`, svcKey).then(r => r.json());
  const referrer = Array.isArray(refRows) ? refRows[0] : null;
  if (!referrer || referrer.kakao_uid === userId) return null; // 코드 아님 - coupon.js 쪽 404로 처리되게 null 반환

  const meRows = await sb(`workers?kakao_uid=eq.${userId}&select=id,referred_by`, svcKey).then(r => r.json());
  const me = Array.isArray(meRows) ? meRows[0] : null;
  if (me?.referred_by) return { ok: true, already: true, granted: 0, tickets: undefined };

  if (me) {
    await sb(`workers?id=eq.${me.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ referred_by: referrer.kakao_uid }) });
  } else {
    await sb('workers', svcKey, { method: 'POST', body: JSON.stringify({ kakao_uid: userId, name: '알바생', referred_by: referrer.kakao_uid }) });
  }

  await creditPoints(userId, REFERRAL_REWARD_POINTS, svcKey);
  await creditPoints(referrer.kakao_uid, REFERRAL_REWARD_POINTS, svcKey);
  await notifyPointsGranted(userId, REFERRAL_REWARD_POINTS, '추천코드로 가입해서 포인트를 받았어요! 🎉', svcKey, req);
  await notifyPointsGranted(referrer.kakao_uid, REFERRAL_REWARD_POINTS, '내 추천코드로 친구가 가입해서 포인트를 받았어요! 🎉', svcKey, req);

  return { ok: true, referral: true, points: REFERRAL_REWARD_POINTS };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = getUserIdFromJWT(token);
  if (!userId) return res.status(401).json({ error: '로그인이 필요합니다' });

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  async function myTicketTotal() {
    const rows = await sb(`coupon_redemptions?user_id=eq.${userId}&select=coupons(pass_qty)`, svcKey).then(r => r.json());
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((sum, r) => sum + (r.coupons?.pass_qty || 0), 0);
  }

  try {
    if (req.method === 'GET' && req.query.action === 'my_tickets') {
      return res.json({ tickets: await myTicketTotal() });
    }

    if (req.method === 'POST') {
      const code = (req.body?.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: '쿠폰 코드를 입력해주세요' });

      const coupons = await sb(`coupons?code=eq.${encodeURIComponent(code)}&select=*&limit=1`, svcKey).then(r => r.json());
      const coupon = Array.isArray(coupons) ? coupons[0] : null;

      // 쿠폰 테이블에 없으면 추천인 코드일 수 있음 - 가입 화면과 이 입력창을 사용자
      // 입장에서 "같은 코드 입력란" 하나로 취급하기로 해서, 여기서도 처리해준다
      if (!coupon) {
        const refResult = await tryRedeemReferralCode(code, userId, svcKey, req);
        if (refResult) return res.json(refResult);
        return res.status(404).json({ error: '존재하지 않는 코드입니다' });
      }
      if (!coupon.is_active) return res.status(400).json({ error: '더 이상 사용할 수 없는 쿠폰입니다' });
      if (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) {
        return res.status(400).json({ error: '유효기간이 지난 쿠폰입니다' });
      }

      const myRedemptions = await sb(
        `coupon_redemptions?coupon_id=eq.${coupon.id}&user_id=eq.${userId}&select=id`, svcKey
      ).then(r => r.json());
      if (Array.isArray(myRedemptions) && myRedemptions.length >= (coupon.max_uses_per_user || 1)) {
        return res.status(400).json({ error: '이미 사용한 쿠폰입니다' });
      }

      if (coupon.max_uses !== null && coupon.max_uses !== undefined) {
        const allRedemptions = await sb(`coupon_redemptions?coupon_id=eq.${coupon.id}&select=id`, svcKey).then(r => r.json());
        if (Array.isArray(allRedemptions) && allRedemptions.length >= coupon.max_uses) {
          return res.status(400).json({ error: '모두 소진된 쿠폰입니다' });
        }
      }

      const insertRes = await sb('coupon_redemptions', svcKey, {
        method: 'POST',
        body: JSON.stringify({ coupon_id: coupon.id, user_id: userId })
      });
      if (!insertRes.ok) return res.status(502).json({ error: await insertRes.text() });

      await sb(`coupons?id=eq.${coupon.id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ uses_count: (coupon.uses_count || 0) + 1 })
      });

      return res.json({ ok: true, granted: coupon.pass_qty, tickets: await myTicketTotal() });
    }

    return res.status(404).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
