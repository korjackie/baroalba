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
// 2026-08-02 하향(3,000 → 1,000). 계정당 1회 제한만으로는 계정을 여러 개 만들어 서로
// 추천하는 것을 못 막고, 추천인 쪽은 상한이 아예 없어 무한히 쌓였다.
// ⚠️ 이 두 상수는 api/admin.js 의 process_referral 에도 같은 값으로 복제돼 있다 - 한쪽만
// 고치면 가입 직후 경로와 쿠폰 입력창 경로의 지급액이 갈린다. 반드시 같이 바꿀 것.
const REFERRAL_REWARD_POINTS = 1000;
const REFERRAL_MAX_PER_REFERRER = 10;

// 추천인이 지금까지 몇 명을 데려왔는지(= 이 추천인을 referred_by 로 가진 회원 수).
// 상한에 걸리면 신규 가입자에게는 그대로 주되 추천인 쪽 지급만 멈춘다.
async function countReferralsBy(referrerId, svcKey) {
  const rows = await sb(`workers?referred_by=eq.${referrerId}&select=id`, svcKey).then(r => r.json());
  return Array.isArray(rows) ? rows.length : 0;
}

async function creditPoints(userId, amount, svcKey) {
  const acctRows = await sb(`point_accounts?user_id=eq.${userId}&select=id,balance`, svcKey).then(r => r.json());
  const acct = Array.isArray(acctRows) ? acctRows[0] : null;
  if (acct) {
    await sb(`point_accounts?id=eq.${acct.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ balance: (acct.balance || 0) + amount }) });
  } else {
    await sb('point_accounts', svcKey, { method: 'POST', body: JSON.stringify({ user_id: userId, balance: amount }) });
  }
}

// 쿠폰이 주는 "이용권"은 바로스팟이 실제로 차감하는 barospot_passes 에 쌓여야 한다.
// 여기가 통째로 없어서 그동안 쿠폰을 등록해도 이용권이 1장도 생기지 않았다(2026-08-02).
// upsert 규칙은 구매 흐름 buySpotPass() 와 동일하게 맞춘다 - total_count 는 NOT NULL 이라
// 신규 발급 시 빠뜨리면 "null value in column total_count" 로 실패한다(그때 겪은 버그).
async function grantBarospotPass(userId, gender, qty, svcKey) {
  const rows = await sb(
    `barospot_passes?user_id=eq.${userId}&gender=eq.${gender}&status=eq.active&select=id,remaining_count,total_count`, svcKey
  ).then(r => r.json());
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row) {
    return sb(`barospot_passes?id=eq.${row.id}`, svcKey, {
      method: 'PATCH',
      body: JSON.stringify({ remaining_count: (row.remaining_count || 0) + qty, total_count: (row.total_count || 0) + qty })
    });
  }
  return sb('barospot_passes', svcKey, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, gender, remaining_count: qty, total_count: qty, status: 'active' })
  });
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

  // referred_by 를 쓰기 전에 세어야 방금 이 사람이 포함되지 않는다
  const priorCount = await countReferralsBy(referrer.kakao_uid, svcKey);
  const referrerCapped = priorCount >= REFERRAL_MAX_PER_REFERRER;

  if (me) {
    await sb(`workers?id=eq.${me.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ referred_by: referrer.kakao_uid }) });
  } else {
    await sb('workers', svcKey, { method: 'POST', body: JSON.stringify({ kakao_uid: userId, name: '알바생', referred_by: referrer.kakao_uid }) });
  }

  await creditPoints(userId, REFERRAL_REWARD_POINTS, svcKey);
  await notifyPointsGranted(userId, REFERRAL_REWARD_POINTS, '추천코드로 가입해서 포인트를 받았어요! 🎉', svcKey, req);
  if (!referrerCapped) {
    await creditPoints(referrer.kakao_uid, REFERRAL_REWARD_POINTS, svcKey);
    await notifyPointsGranted(referrer.kakao_uid, REFERRAL_REWARD_POINTS, '내 추천코드로 친구가 가입해서 포인트를 받았어요! 🎉', svcKey, req);
  }

  return { ok: true, referral: true, points: REFERRAL_REWARD_POINTS, referrerCapped };
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

  // ⚠️ 예전엔 coupon_redemptions 의 pass_qty 합계를 돌려줬는데, 그건 "지금까지 받은 총량"
  // 이지 잔여가 아니었고 무엇보다 **바로스팟이 실제로 차감하는 저장소가 아니었다**.
  // 마이페이지가 "이용권 1장"을 보여주는 동안 바로스팟 신청화면은 0장이라 포인트로
  // 결제되던 원인(2026-08-02 발견). 두 화면이 같은 값을 보도록 barospot_passes 를 읽는다.
  async function myTicketTotal() {
    const rows = await sb(`barospot_passes?user_id=eq.${userId}&status=eq.active&select=remaining_count`, svcKey).then(r => r.json());
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((sum, r) => sum + (r.remaining_count || 0), 0);
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

      // 적립 대상 성별을 먼저 확정한다 - 쿠폰에 성별 지정이 있으면 그쪽, 없으면 이 회원의
      // 성별. 성별은 가입 직후 필수 게이트(showMandatoryGenderGate)에서 받으므로 사실상
      // 항상 있지만, 없으면 사용 이력만 남고 이용권은 안 생기는 상태가 되므로 소진 전에 막는다.
      const wRows = await sb(`workers?kakao_uid=eq.${userId}&select=gender`, svcKey).then(r => r.json());
      const passGender = coupon.gender || (Array.isArray(wRows) ? wRows[0]?.gender : null);
      if (!passGender) {
        // retryable: 조건(성별 입력)만 갖춰지면 성공할 수 있는 실패라는 표시.
        // 클라이언트가 코드를 버리지 않고 다음 진입 때 다시 시도한다. 한국어 에러 문구를
        // 클라이언트가 문자열 비교하는 것보다 안전하다(문구를 고치면 조용히 깨진다).
        return res.status(400).json({ error: '성별을 먼저 설정한 뒤 쿠폰을 등록해주세요', retryable: true });
      }

      const insertRes = await sb('coupon_redemptions', svcKey, {
        method: 'POST',
        body: JSON.stringify({ coupon_id: coupon.id, user_id: userId })
      });
      if (!insertRes.ok) return res.status(502).json({ error: await insertRes.text() });

      const qty = coupon.pass_qty || 1;
      const grantRes = await grantBarospotPass(userId, passGender, qty, svcKey);
      if (!grantRes.ok) {
        // 이용권이 안 들어갔는데 "사용됨"으로 남으면 재시도조차 막히므로 사용 이력을 되돌린다
        const inserted = await insertRes.json().catch(() => null);
        const rid = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
        if (rid) await sb(`coupon_redemptions?id=eq.${rid}`, svcKey, { method: 'DELETE' }).catch(() => {});
        return res.status(502).json({ error: await grantRes.text() });
      }

      await sb(`coupons?id=eq.${coupon.id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ uses_count: (coupon.uses_count || 0) + 1 })
      });

      return res.json({ ok: true, granted: qty, tickets: await myTicketTotal() });
    }

    return res.status(404).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
