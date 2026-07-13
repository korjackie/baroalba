const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

function getEmailFromJWT(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const raw = payload.email || payload.user_metadata?.email || payload.app_metadata?.email || '';
    return raw.toLowerCase().trim();
  } catch { return ''; }
}

function getSubFromJWT(token) {
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

function wvHtmlPage(title, message, ok) {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="max-width:360px;margin:20px;background:#fff;border-radius:20px;padding:40px 28px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <div style="font-size:44px;margin-bottom:14px">${ok ? '✅' : '⚠️'}</div>
    <div style="font-size:18px;font-weight:900;color:#111;margin-bottom:8px">${title}</div>
    <div style="font-size:14px;color:#666;line-height:1.6">${message}</div>
  </div>
</body></html>`;
}

// 바로미팅 인원/장소 수정 시 확정 참가자 전원에게 인앱 알림 + 푸시 발송
async function notifyBaromeetApplicants(gatheringId, meetingTitle, svcKey, req) {
  const appsRes = await sb(`gathering_applications?gathering_id=eq.${gatheringId}&status=eq.approved&select=applicant_id`, svcKey);
  const apps = await appsRes.json();
  const applicantIds = [...new Set((apps || []).map(a => a.applicant_id).filter(Boolean))];
  if (!applicantIds.length) return;

  const title = '🤝 바로미팅 정보 변경 안내';
  const body = `"${meetingTitle}" 미팅의 인원/장소 정보가 변경되었어요. 확인해주세요!`;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = host ? `https://${host}` : '';

  await Promise.allSettled(applicantIds.map(async userId => {
    await sb('notifications', svcKey, {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ user_id: userId, title, body, type: 'baromeeting_update' }),
    });
    if (baseUrl) {
      await fetch(`${baseUrl}/api/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, title, body, url: '/바로알바.html', type: 'baromeeting_update' }),
      });
    }
  }));
}

// 승인/거절 시마다 실제 승인건수 기준으로 성별 정원 카운트를 재계산 - 수동 +1/-1 방식은
// 과거 데이터(승인단계 도입 전 신청건 등)와 어긋나면 영구적으로 드리프트되는 문제가 있었음
async function recomputeBaromeetCounts(gatheringId, svcKey) {
  const appsRes = await sb(`gathering_applications?gathering_id=eq.${gatheringId}&status=eq.approved&select=applicant_id`, svcKey);
  const apps = await appsRes.json();
  const applicantIds = [...new Set((apps || []).map(a => a.applicant_id).filter(Boolean))];
  let male = 0, female = 0;
  if (applicantIds.length) {
    const workersRes = await sb(`workers?kakao_uid=in.(${applicantIds.join(',')})&select=kakao_uid,gender`, svcKey);
    const workers = await workersRes.json();
    (workers || []).forEach(w => {
      if (w.gender === 'male') male++;
      else if (w.gender === 'female') female++;
    });
  }
  await sb(`gatherings?id=eq.${gatheringId}`, svcKey, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ baromeeting_male_cur: male, baromeeting_female_cur: female }),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const earlyAction = req.query.action;

  // ── 직장인증 이메일 링크 클릭 → 인증 완료 (관리자 인증 불필요 - 토큰 자체가 자격증명) ──
  // Vercel Hobby 플랜의 서버리스 함수 12개 제한 때문에 별도 파일(api/workplace-verify.js)
  // 대신 기존 admin.js에 병합함 - 그래서 아래 관리자 전용 게이트보다 먼저 처리해야 함
  if (req.method === 'GET' && earlyAction === 'workplace_verify_confirm') {
    const wvToken = req.query.token;
    if (!wvToken) { res.setHeader('Content-Type', 'text/html'); return res.status(400).send(wvHtmlPage('잘못된 접근', '인증 링크가 올바르지 않아요.', false)); }
    const rows = await sb(`workers?workplace_verify_token=eq.${wvToken}&select=id`, svcKey).then(r => r.json());
    if (!Array.isArray(rows) || !rows.length) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(404).send(wvHtmlPage('이미 처리된 링크예요', '인증이 이미 완료됐거나 만료된 링크입니다.', false));
    }
    await sb(`workers?id=eq.${rows[0].id}`, svcKey, {
      method: 'PATCH',
      body: JSON.stringify({ workplace_verify_status: 'verified', workplace_verify_token: null })
    });
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(wvHtmlPage('직장인증 완료!', '바로알바 앱으로 돌아가시면<br>인증 배지가 표시됩니다.', true));
  }

  // ── 직장인증 메일 발송 (관리자 아님, 로그인한 본인 인증) ──
  if (req.method === 'POST' && earlyAction === 'workplace_verify_send') {
    const wvJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const userId = getSubFromJWT(wvJwt);
    if (!userId) return res.status(401).json({ error: '로그인이 필요합니다' });

    const { company, email: wvEmail, name } = req.body || {};
    if (!company || !wvEmail) return res.status(400).json({ error: 'company, email required' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

    const verifyToken = require('crypto').randomBytes(24).toString('hex');
    const patch = await sb(`workers?kakao_uid=eq.${userId}`, svcKey, {
      method: 'PATCH',
      body: JSON.stringify({ workplace_name: company, workplace_verify_token: verifyToken, workplace_verify_status: 'pending' })
    });
    if (!patch.ok) return res.status(502).json({ error: await patch.text() });

    const confirmUrl = `https://baroalba.multimove.co.kr/api/admin?action=workplace_verify_confirm&token=${verifyToken}`;
    const displayName = name || '회원';
    const wvHtml = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif">
  <div style="max-width:480px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#7C3AED;padding:32px 24px 28px;text-align:center">
      <div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.5px">💼 직장인증</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px">바로만남 신뢰 배지</div>
    </div>
    <div style="padding:32px 24px">
      <div style="font-size:16px;font-weight:800;color:#111;margin-bottom:10px">${displayName}님, 안녕하세요!</div>
      <div style="font-size:14px;color:#555;line-height:1.7;margin-bottom:24px">
        <b>${company}</b> 소속 직장인증을 위해 아래 버튼을 눌러주세요.<br>인증 완료 시 바로만남에서 인증 배지가 표시됩니다.
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <a href="${confirmUrl}" style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px">인증 완료하기</a>
      </div>
      <div style="font-size:12px;color:#aaa;text-align:center">본인이 요청하지 않았다면 이 메일을 무시하세요.</div>
    </div>
  </div>
</body>
</html>`;

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'baroalba@multimove.co.kr', to: [wvEmail], subject: `[바로알바] 직장인증 메일을 확인해주세요`, html: wvHtml })
      });
      if (!r.ok) return res.status(500).json({ error: await r.text() });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── 추천인 가입 처리 (관리자 아님, 로그인한 본인 세션으로 호출) ──
  // 반드시 서비스 롤 키로 처리해야 함: 추천인의 point_accounts는 신규가입자 세션
  // 기준으로는 "남의 행"이라 RLS가 UPDATE를 조용히 막아버림 (0 rows affected, 에러 없음) -
  // assign_mannnam_manager와 동일한 클래스의 버그. 신규가입자 본인 몫은 클라이언트에서도
  // 성공하지만 추천인 몫만 누락되는 형태로 나타났음.
  if (req.method === 'POST' && earlyAction === 'process_referral') {
    const refJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const newUserId = getSubFromJWT(refJwt);
    if (!newUserId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'code required' });

    const REFERRAL_REWARD_POINTS = 3000;
    const meRows = await sb(`workers?kakao_uid=eq.${newUserId}&select=id,referred_by`, svcKey).then(r => r.json());
    const me = Array.isArray(meRows) ? meRows[0] : null;
    if (me?.referred_by) return res.json({ ok: true, already: true }); // 이미 처리됨 - 중복 지급 방지

    const refRows = await sb(`workers?referral_code=eq.${encodeURIComponent(code)}&select=kakao_uid`, svcKey).then(r => r.json());
    const referrer = Array.isArray(refRows) ? refRows[0] : null;
    if (!referrer || referrer.kakao_uid === newUserId) return res.json({ ok: true, skipped: true });

    if (me) {
      await sb(`workers?id=eq.${me.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ referred_by: referrer.kakao_uid }) });
    } else {
      let name = '알바생';
      try {
        const payload = JSON.parse(Buffer.from(refJwt.split('.')[1], 'base64').toString());
        const meta = payload.user_metadata || {};
        name = meta.full_name || meta.name || (payload.email ? payload.email.split('@')[0] : name);
      } catch {}
      await sb('workers', svcKey, { method: 'POST', body: JSON.stringify({ kakao_uid: newUserId, name, referred_by: referrer.kakao_uid }) });
    }

    async function creditPointsServer(userId, amount) {
      const acctRows = await sb(`point_accounts?user_id=eq.${userId}&select=id,balance`, svcKey).then(r => r.json());
      const acct = Array.isArray(acctRows) ? acctRows[0] : null;
      if (acct) {
        await sb(`point_accounts?id=eq.${acct.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ balance: (acct.balance || 0) + amount }) });
      } else {
        await sb('point_accounts', svcKey, { method: 'POST', body: JSON.stringify({ user_id: userId, balance: amount }) });
      }
    }
    await creditPointsServer(newUserId, REFERRAL_REWARD_POINTS);
    await creditPointsServer(referrer.kakao_uid, REFERRAL_REWARD_POINTS);

    return res.json({ ok: true, credited: true, points: REFERRAL_REWARD_POINTS });
  }

  // 관리자 인증 — app_admins 테이블 기준 (하드코딩 불필요, Supabase에서 직접 관리)
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const email = getEmailFromJWT(token);
  if (!email) return res.status(403).json({ error: 'Forbidden' });

  const adminCheck = await sb(`app_admins?email=ilike.${encodeURIComponent(email)}&select=email&limit=1`, svcKey);
  const adminRows = await adminCheck.json();
  if (!Array.isArray(adminRows) || adminRows.length === 0) return res.status(403).json({ error: 'Forbidden' });
  const action = req.query.action;

  try {
    // ── 대시보드 통계 ──────────────────────────────────
    if (action === 'stats') {
      const today = new Date().toISOString().slice(0, 10);
      const [
        workers, postings, reports, apps, moims, bizRaw,
        workersToday, bizToday, moimsToday, gatheringApps,
        mannnamToday, mannnamTotal, restaurants, baromeetings, gatheringReqs, communityPosts,
      ] = await Promise.all([
        sb('workers?select=id', svcKey).then(r => r.json()),
        sb('job_postings?select=id&status=neq.closed', svcKey).then(r => r.json()),
        sb('reports?select=id,status', svcKey).then(r => r.json()),
        sb(`applications?select=id&created_at=gte.${today}`, svcKey).then(r => r.json()),
        sb('gatherings?select=id&status=eq.open', svcKey).then(r => r.json()),
        sb('businesses?select=id', svcKey).then(r => r.json()).catch(() => []),
        sb(`workers?select=id&created_at=gte.${today}`, svcKey).then(r => r.json()),
        sb(`businesses?select=id&created_at=gte.${today}`, svcKey).then(r => r.json()).catch(() => []),
        sb(`gatherings?select=id&created_at=gte.${today}`, svcKey).then(r => r.json()),
        sb('gathering_applications?select=id', svcKey).then(r => r.json()).catch(() => []),
        sb(`barospot_applications?select=id&created_at=gte.${today}`, svcKey).then(r => r.json()).catch(() => []),
        sb('barospot_applications?select=id', svcKey).then(r => r.json()).catch(() => []),
        sb('barospot_restaurants?select=id&is_active=eq.true', svcKey).then(r => r.json()).catch(() => []),
        sb('gatherings?select=id&category=eq.baromeeting&status=eq.open', svcKey).then(r => r.json()).catch(() => []),
        sb('gathering_requests?select=id,status', svcKey).then(r => r.json()).catch(() => []),
        sb('community_posts?select=id', svcKey).then(r => r.json()).catch(() => []),
      ]);
      const pending = (Array.isArray(reports) ? reports : []).filter(r => !r.status || r.status === 'pending').length;
      const pendingReqs = (Array.isArray(gatheringReqs) ? gatheringReqs : []).filter(r => !r.status || r.status !== 'done').length;
      const arrLen = a => Array.isArray(a) ? a.length : 0;
      return res.json({
        workers: arrLen(workers),
        postings: arrLen(postings),
        pending_reports: pending,
        today_apps: arrLen(apps),
        moims: arrLen(moims),
        businesses: arrLen(bizRaw),
        today_signups: arrLen(workersToday) + arrLen(bizToday),
        moims_today: arrLen(moimsToday),
        moim_participants: arrLen(gatheringApps),
        mannnam_today: arrLen(mannnamToday),
        mannnam_total: arrLen(mannnamTotal),
        mannnam_restaurants: arrLen(restaurants),
        baromeetings_open: arrLen(baromeetings),
        pending_gathering_requests: pendingReqs,
        community_posts: arrLen(communityPosts),
      });
    }

    // ── 수동 포인트 지급/보정 (CS 대응, 과거 데이터 보정용 - 서비스 롤 키로 RLS 우회) ──
    if (action === 'grant_points' && req.method === 'POST') {
      const { email: grantEmail, amount, reason } = req.body || {};
      if (!grantEmail || typeof amount !== 'number') return res.status(400).json({ error: 'email, amount required' });
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(grantEmail)}`, {
        headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` }
      });
      const authData = await authRes.json();
      const targetUser = (authData.users || [])[0];
      if (!targetUser) return res.status(404).json({ error: '해당 이메일의 계정을 찾을 수 없어요' });

      const acctRows = await sb(`point_accounts?user_id=eq.${targetUser.id}&select=id,balance`, svcKey).then(r => r.json());
      const acct = Array.isArray(acctRows) ? acctRows[0] : null;
      const newBalance = (acct?.balance || 0) + amount;
      if (acct) {
        await sb(`point_accounts?id=eq.${acct.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ balance: newBalance }) });
      } else {
        await sb('point_accounts', svcKey, { method: 'POST', body: JSON.stringify({ user_id: targetUser.id, balance: newBalance }) });
      }
      return res.json({ ok: true, balance: newBalance, reason: reason || null });
    }

    // ── 바로만남 매니저 지정/해제 (서비스 롤 키로 처리 - businesses RLS가 admin
    // 세션의 UPDATE를 막고 있어 클라이언트에서 직접 update()하면 조용히 실패했음) ──
    if (action === 'assign_mannnam_manager' && req.method === 'PATCH') {
      const { biz_id } = req.body || {};
      if (!biz_id) return res.status(400).json({ error: 'biz_id required' });
      const r = await sb(`businesses?id=eq.${biz_id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ mannnam_role: 'manager' }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      const rows = await r.json();
      return res.json({ ok: true, biz: Array.isArray(rows) ? rows[0] : null });
    }
    if (action === 'remove_mannnam_manager' && req.method === 'PATCH') {
      const { biz_id } = req.body || {};
      if (!biz_id) return res.status(400).json({ error: 'biz_id required' });
      const r = await sb(`businesses?id=eq.${biz_id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ mannnam_role: null }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 바로만남 제휴매장 (관리자도 매니저와 동일하게 등록/수정 가능) ──
    // NOTE: business_id/businesses(name) 조인은 DDL(mannam_spot_business_link_ddl.sql)
    // 실행 후에만 안전함 - 컬럼/관계가 없으면 PostgREST가 400을 던져 목록 전체가 깨짐.
    // DDL 실행 확인 후 select=*,businesses(name) 으로 교체 예정.
    if (action === 'barospot_restaurants') {
      const data = await sb(
        'barospot_restaurants?select=*&order=created_at.desc&limit=100',
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 제휴매장 등록/수정 ──────────────────────────────
    // 실제 barospot_restaurants 스키마: name, address, phone, menu_description,
    // base_price(단일 가격, 성별 구분 없음), photo_url, is_active, business_id.
    // (이전 코드는 female_price/male_price/discount_pct를 저장하려 했는데 그런
    // 컬럼이 애초에 존재한 적이 없어 매번 PGRST204로 저장이 실패하고 있었음)
    if (action === 'save_restaurant' && (req.method === 'POST' || req.method === 'PATCH')) {
      const { id, name, address, phone, menu_description, base_price } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: '식당명을 입력해주세요' });
      const payload = {
        name: name.trim(),
        address: (address || '').trim(),
        phone: (phone || '').trim(),
        menu_description: (menu_description || '').trim(),
        base_price: base_price ? parseInt(base_price) || 0 : 0,
      };
      let r;
      if (id) {
        r = await sb(`barospot_restaurants?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        payload.is_active = true;
        r = await sb('barospot_restaurants', svcKey, { method: 'POST', body: JSON.stringify(payload) });
      }
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 제휴매장 활성/비활성 토글 ───────────────────────
    if (action === 'toggle_restaurant' && req.method === 'PATCH') {
      const { id, is_active } = req.body || {};
      if (!id || is_active === undefined) return res.status(400).json({ error: 'id, is_active required' });
      const r = await sb(`barospot_restaurants?id=eq.${id}`, svcKey, {
        method: 'PATCH', body: JSON.stringify({ is_active: !!is_active })
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 쿠폰 목록 ──────────────────────────────────────
    if (action === 'coupons') {
      const data = await sb(
        'coupons?select=*&order=created_at.desc&limit=200',
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 쿠폰 생성 ──────────────────────────────────────
    if (action === 'create_coupon' && req.method === 'POST') {
      const { code, ticket_count, max_uses, max_uses_per_user, expires_at } = req.body || {};
      if (!code || !code.trim()) return res.status(400).json({ error: '쿠폰 코드를 입력해주세요' });
      const r = await sb('coupons', svcKey, {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          ticket_count: parseInt(ticket_count) || 1,
          max_uses: max_uses ? parseInt(max_uses) : null,
          max_uses_per_user: parseInt(max_uses_per_user) || 1,
          expires_at: expires_at || null,
        })
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 쿠폰 활성/비활성 토글 ───────────────────────────
    if (action === 'toggle_coupon' && req.method === 'PATCH') {
      const { id, is_active } = req.body || {};
      if (!id || is_active === undefined) return res.status(400).json({ error: 'id, is_active required' });
      const r = await sb(`coupons?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !!is_active })
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 쿠폰 삭제 ──────────────────────────────────────
    if (action === 'delete_coupon' && req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sb(`coupons?id=eq.${id}`, svcKey, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    // ── 바로스팟 이용권 가격표 ───────────────────────────
    if (action === 'barospot_pass_products') {
      const data = await sb(
        'barospot_pass_products?select=*&order=gender.asc,display_order.asc',
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    if (action === 'save_pass_product' && (req.method === 'POST' || req.method === 'PATCH')) {
      const { id, gender, qty, price, label, discount_pct, display_order } = req.body || {};
      if (!gender || !['female', 'male'].includes(gender)) return res.status(400).json({ error: 'gender(female/male) required' });
      if (!label || !label.trim()) return res.status(400).json({ error: '이용권 이름을 입력해주세요' });
      const payload = {
        gender,
        qty: parseInt(qty) || 1,
        price: parseInt(price) || 0,
        label: label.trim(),
        discount_pct: parseInt(discount_pct) || 0,
        display_order: parseInt(display_order) || 0,
      };
      let r;
      if (id) {
        r = await sb(`barospot_pass_products?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        payload.is_active = true;
        r = await sb('barospot_pass_products', svcKey, { method: 'POST', body: JSON.stringify(payload) });
      }
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    if (action === 'toggle_pass_product' && req.method === 'PATCH') {
      const { id, is_active } = req.body || {};
      if (!id || is_active === undefined) return res.status(400).json({ error: 'id, is_active required' });
      const r = await sb(`barospot_pass_products?id=eq.${id}`, svcKey, {
        method: 'PATCH', body: JSON.stringify({ is_active: !!is_active })
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    if (action === 'delete_pass_product' && req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sb(`barospot_pass_products?id=eq.${id}`, svcKey, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    // ── 커뮤니티 게시판 관리 (부적절한 게시글/댓글 삭제) ──────
    if (action === 'community_posts') {
      const rows = await sb(
        'community_posts?select=id,category,title,content,is_anonymous,comments_count,created_at,workers(name),businesses(biz_name)&order=created_at.desc&limit=100',
        svcKey
      ).then(r => r.json()).catch(() => []);
      return res.json(Array.isArray(rows) ? rows : []);
    }
    if (action === 'community_comments') {
      const postId = req.query.post_id;
      if (!postId) return res.status(400).json({ error: 'post_id required' });
      const rows = await sb(
        `community_comments?post_id=eq.${postId}&select=id,content,is_anonymous,created_at,workers(name),businesses(biz_name)&order=created_at.asc`,
        svcKey
      ).then(r => r.json()).catch(() => []);
      return res.json(Array.isArray(rows) ? rows : []);
    }
    if (action === 'delete_community_post' && req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sb(`community_comments?post_id=eq.${id}`, svcKey, { method: 'DELETE' });
      const r = await sb(`community_posts?id=eq.${id}`, svcKey, { method: 'DELETE' });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }
    if (action === 'delete_community_comment' && req.method === 'DELETE') {
      const { id, post_id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await sb(`community_comments?id=eq.${id}`, svcKey, { method: 'DELETE' });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      if (post_id) {
        const remain = await sb(`community_comments?post_id=eq.${post_id}&select=id`, svcKey).then(r2 => r2.json());
        await sb(`community_posts?id=eq.${post_id}`, svcKey, {
          method: 'PATCH', body: JSON.stringify({ comments_count: Array.isArray(remain) ? remain.length : 0 })
        });
      }
      return res.json({ ok: true });
    }
    if (action === 'edit_community_post' && req.method === 'PATCH') {
      const { id, title, content } = req.body || {};
      if (!id || !title || !content) return res.status(400).json({ error: 'id, title, content required' });
      const r = await sb(`community_posts?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ title, content }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }
    if (action === 'edit_community_comment' && req.method === 'PATCH') {
      const { id, content } = req.body || {};
      if (!id || !content) return res.status(400).json({ error: 'id, content required' });
      const r = await sb(`community_comments?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ content }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 모임/만남 개설 요청함 (유저가 앱 FAB에서 남긴 요청) ──
    if (action === 'gathering_requests') {
      const reqs = await sb('gathering_requests?select=id,requester_id,request_type,region,description,status,created_at&order=created_at.desc&limit=200', svcKey).then(r => r.json());
      const rows = Array.isArray(reqs) ? reqs : [];
      const ids = [...new Set(rows.map(r => r.requester_id).filter(Boolean))];
      let nameMap = {};
      if (ids.length) {
        const workers = await sb(`workers?kakao_uid=in.(${ids.join(',')})&select=kakao_uid,name`, svcKey).then(r => r.json());
        nameMap = Object.fromEntries((workers || []).map(w => [w.kakao_uid, w.name]));
      }
      return res.json(rows.map(r => ({ ...r, requester_name: nameMap[r.requester_id] || null })));
    }
    if (action === 'mark_gathering_request_done' && req.method === 'PATCH') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await sb(`gathering_requests?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 직장인증 심사 (바로만남 신뢰배지) ─────────────────
    if (action === 'workplace_verify_requests') {
      const rows = await sb(
        'workers?select=id,name,workplace_name,workplace_verify_method,workplace_verify_doc_url&workplace_verify_status=eq.pending&limit=200',
        svcKey
      ).then(r => r.json()).catch(() => []);
      return res.json(Array.isArray(rows) ? rows : []);
    }
    if (action === 'review_workplace_verify' && req.method === 'PATCH') {
      const { worker_id, status } = req.body || {};
      if (!worker_id || !['verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'worker_id, status(verified/rejected) required' });
      const r = await sb(`workers?id=eq.${worker_id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ workplace_verify_status: status }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 바로미팅 목록 (관리자 개설/관리) ─────────────────
    if (action === 'baromeetings') {
      const data = await sb(
        "gatherings?select=id,title,description,location_name,location_address,gathering_date,entry_fee,status,baromeeting_male_max,baromeeting_female_max,baromeeting_male_cur,baromeeting_female_cur,target_age_range,created_at&category=eq.baromeeting&order=gathering_date.desc&limit=100",
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 바로미팅 신청자 현황 (이름/성별/연락처/신청상태) ──────
    if (action === 'baromeeting_applicants') {
      const gatheringId = req.query.gathering_id;
      if (!gatheringId) return res.status(400).json({ error: 'gathering_id required' });
      const apps = await sb(
        `gathering_applications?gathering_id=eq.${gatheringId}&select=id,applicant_id,status,applied_at,fee_paid&order=applied_at.desc`,
        svcKey
      ).then(r => r.json());
      const applicantIds = [...new Set((apps || []).map(a => a.applicant_id).filter(Boolean))];
      let workerMap = {};
      if (applicantIds.length) {
        const workers = await sb(
          `workers?kakao_uid=in.(${applicantIds.join(',')})&select=kakao_uid,name,gender,phone`,
          svcKey
        ).then(r => r.json());
        workerMap = Object.fromEntries((workers || []).map(w => [w.kakao_uid, w]));
      }
      const merged = (apps || []).map(a => ({ ...a, worker: workerMap[a.applicant_id] || null }));
      return res.json(merged);
    }

    // ── 바로미팅 신청자 승인 ──────────────────────────────
    if (action === 'approve_baromeet_applicant' && req.method === 'POST') {
      const { application_id } = req.body || {};
      if (!application_id) return res.status(400).json({ error: 'application_id required' });
      const appRows = await sb(`gathering_applications?id=eq.${application_id}&select=id,applicant_id,gathering_id,status`, svcKey).then(r => r.json());
      const app = appRows?.[0];
      if (!app) return res.status(404).json({ error: '신청 정보를 찾을 수 없어요' });

      const r = await sb(`gathering_applications?id=eq.${application_id}`, svcKey, {
        method: 'PATCH', body: JSON.stringify({ status: 'approved' }),
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      await recomputeBaromeetCounts(app.gathering_id, svcKey);

      const gRows = await sb(`gatherings?id=eq.${app.gathering_id}&select=title`, svcKey).then(r => r.json());
      const meetingTitle = gRows?.[0]?.title || '바로미팅';
      const title = '✅ 바로미팅 참가 승인';
      const body = `"${meetingTitle}" 참가가 승인되었어요! 단체채팅방에 입장해보세요.`;
      await sb('notifications', svcKey, {
        method: 'POST', headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: app.applicant_id, title, body, type: 'baromeeting_approved' }),
      });
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (host) {
        await fetch(`https://${host}/api/send-push`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: app.applicant_id, title, body, url: '/바로알바.html', type: 'baromeeting_approved' }),
        }).catch(() => {});
      }
      return res.json({ ok: true });
    }

    // ── 바로미팅 신청자 거절 (자리 반납 + 알림) ──────────────
    if (action === 'reject_baromeet_applicant' && req.method === 'POST') {
      const { application_id } = req.body || {};
      if (!application_id) return res.status(400).json({ error: 'application_id required' });
      const appRows = await sb(`gathering_applications?id=eq.${application_id}&select=id,applicant_id,gathering_id,status`, svcKey).then(r => r.json());
      const app = appRows?.[0];
      if (!app) return res.status(404).json({ error: '신청 정보를 찾을 수 없어요' });

      const r = await sb(`gathering_applications?id=eq.${application_id}`, svcKey, {
        method: 'PATCH', body: JSON.stringify({ status: 'rejected' }),
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      await recomputeBaromeetCounts(app.gathering_id, svcKey);

      const gRows2 = await sb(`gatherings?id=eq.${app.gathering_id}&select=title`, svcKey).then(r => r.json());
      const meetingTitle = gRows2?.[0]?.title || '바로미팅';
      const title = '🙏 바로미팅 참가 거절 안내';
      const body = `"${meetingTitle}" 참가 신청이 거절되었어요. 결제하신 포인트/이용권 환불은 고객센터로 문의해주세요.`;
      await sb('notifications', svcKey, {
        method: 'POST', headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: app.applicant_id, title, body, type: 'baromeeting_rejected' }),
      });
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (host) {
        await fetch(`https://${host}/api/send-push`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: app.applicant_id, title, body, url: '/바로알바.html', type: 'baromeeting_rejected' }),
        }).catch(() => {});
      }
      return res.json({ ok: true });
    }

    // ── 신청자 개인에게 공지 메시지 발송 (인앱 알림 + 푸시) ──
    if (action === 'notify_applicant' && req.method === 'POST') {
      const { user_id, message } = req.body || {};
      if (!user_id || !message?.trim()) return res.status(400).json({ error: 'user_id, message required' });
      const title = '📢 바로미팅 안내';
      const body = message.trim();
      await sb('notifications', svcKey, {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id, title, body, type: 'baromeeting_notice' }),
      });
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (host) {
        await fetch(`https://${host}/api/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, title, body, url: '/바로알바.html', type: 'baromeeting_notice' }),
        });
      }
      return res.json({ ok: true });
    }

    // ── 바로미팅 개설/수정 ────────────────────────────────
    if (action === 'save_baromeeting' && (req.method === 'POST' || req.method === 'PATCH')) {
      const { id, title, description, location_name, location_address, gathering_date, entry_fee, male_max, female_max, age_range, lat, lng } = req.body || {};
      if (!title || !title.trim()) return res.status(400).json({ error: '미팅 제목을 입력해주세요' });
      if (!gathering_date) return res.status(400).json({ error: '일시를 입력해주세요' });
      const payload = {
        title: title.trim(),
        description: (description || '').trim() || null,
        location_name: (location_name || '').trim() || null,
        location_address: (location_address || '').trim() || null,
        gathering_date,
        entry_fee: parseInt(entry_fee) || 0,
        baromeeting_male_max: parseInt(male_max) || 4,
        baromeeting_female_max: parseInt(female_max) || 4,
        target_age_range: age_range || null,
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
      };

      // 수정인 경우 인원/장소가 실제로 바뀌었는지 미리 확인 (신청자 알림 발송 여부 판단용)
      let prev = null;
      if (id) {
        const prevRes = await sb(`gatherings?id=eq.${id}&select=location_name,location_address,baromeeting_male_max,baromeeting_female_max`, svcKey);
        const prevRows = await prevRes.json();
        prev = prevRows?.[0] || null;
      }

      let r;
      if (id) {
        r = await sb(`gatherings?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        const hostId = getSubFromJWT(token);
        payload.host_id = hostId;
        payload.category = 'baromeeting';
        payload.is_public = true;
        payload.status = 'open';
        payload.baromeeting_male_cur = 0;
        payload.baromeeting_female_cur = 0;
        r = await sb('gatherings', svcKey, { method: 'POST', body: JSON.stringify(payload) });
      }
      if (!r.ok) return res.status(502).json({ error: await r.text() });

      // 인원/장소가 바뀐 수정이면 확정 참가자 전원에게 알림 발송 (실패해도 저장 자체는 성공 처리)
      if (id && prev && (
        prev.location_name !== payload.location_name ||
        prev.location_address !== payload.location_address ||
        prev.baromeeting_male_max !== payload.baromeeting_male_max ||
        prev.baromeeting_female_max !== payload.baromeeting_female_max
      )) {
        notifyBaromeetApplicants(id, payload.title, svcKey, req).catch(e => console.error('[save_baromeeting] 알림 발송 실패:', e));
      }

      return res.json({ ok: true });
    }

    // ── 바로미팅 마감/재오픈 ──────────────────────────────
    if (action === 'toggle_baromeeting' && req.method === 'PATCH') {
      const { id, status } = req.body || {};
      if (!id || !status) return res.status(400).json({ error: 'id, status required' });
      const r = await sb(`gatherings?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 바로미팅 삭제 ─────────────────────────────────────
    if (action === 'delete_baromeeting' && req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sb(`gatherings?id=eq.${id}`, svcKey, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    // ── 신고 목록 ──────────────────────────────────────
    if (action === 'reports') {
      const reports = await sb('reports?select=*&order=created_at.desc&limit=100', svcKey).then(r => r.json());
      if (!Array.isArray(reports)) return res.json([]);

      // 대상 공고/모임/바로미팅/사용자 이름 조회
      const jobIds = [...new Set(reports.filter(r => r.target_type === 'job').map(r => r.target_id))];
      const userIds = [...new Set(reports.filter(r => r.target_type === 'user').map(r => r.target_id))];
      const gatheringIds = [...new Set(reports.filter(r => r.target_type === 'moim' || r.target_type === 'gathering').map(r => r.target_id))];
      const reporterIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];

      const [jobs, targets, gatherings, reporters] = await Promise.all([
        jobIds.length ? sb(`job_postings?id=in.(${jobIds.join(',')})&select=id,title,biz_name`, svcKey).then(r => r.json()) : [],
        userIds.length ? sb(`workers?id=in.(${userIds.join(',')})&select=id,name,phone`, svcKey).then(r => r.json()) : [],
        gatheringIds.length ? sb(`gatherings?id=in.(${gatheringIds.join(',')})&select=id,title,category`, svcKey).then(r => r.json()) : [],
        reporterIds.length ? sb(`workers?id=in.(${reporterIds.join(',')})&select=id,name,phone`, svcKey).then(r => r.json()) : [],
      ]);

      const jobMap = Object.fromEntries((Array.isArray(jobs) ? jobs : []).map(j => [j.id, j]));
      const userMap = Object.fromEntries((Array.isArray(targets) ? targets : []).map(u => [u.id, u]));
      const gatheringMap = Object.fromEntries((Array.isArray(gatherings) ? gatherings : []).map(g => [g.id, g]));
      const repMap = Object.fromEntries((Array.isArray(reporters) ? reporters : []).map(u => [u.id, u]));

      const enriched = reports.map(r => ({
        ...r,
        target_name: r.target_type === 'job'
          ? (jobMap[r.target_id]?.title || r.target_id?.slice(0,8))
          : (r.target_type === 'moim' || r.target_type === 'gathering')
          ? (gatheringMap[r.target_id]?.title || r.target_id?.slice(0,8))
          : (userMap[r.target_id]?.name || r.target_id?.slice(0,8)),
        target_biz: jobMap[r.target_id]?.biz_name || '',
        reporter_name: repMap[r.reporter_id]?.name || r.reporter_id?.slice(0,8),
        reporter_phone: repMap[r.reporter_id]?.phone || '',
      }));

      return res.json(enriched);
    }

    // ── 신고 상태 변경 ─────────────────────────────────
    if (action === 'update_report' && req.method === 'PATCH') {
      const { id, status } = req.body || {};
      if (!id || !status) return res.status(400).json({ error: 'id, status required' });
      const r = await sb(`reports?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 공고 목록 ──────────────────────────────────────
    if (action === 'postings') {
      const data = await sb(
        'job_postings?select=id,title,biz_name,status,current_wage,start_time,needed_count,filled_count,created_at&order=created_at.desc&limit=100',
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 공고 상세 (마감된 공고도 관리자는 조회 가능해야 함) ──
    if (action === 'posting_detail') {
      const pid = req.query.id;
      if (!pid) return res.status(400).json({ error: 'id required' });
      const rows = await sb(
        `job_postings?id=eq.${pid}&select=id,title,biz_name,status,category,work_type,current_wage,base_wage,start_time,work_end_date,duration_hours,needed_count,filled_count,address,description,age_limit,is_remote,created_at,businesses(name,phone,rating)`,
        svcKey
      ).then(r => r.json());
      const p = Array.isArray(rows) ? rows[0] : null;
      if (!p) return res.status(404).json({ error: '공고를 찾을 수 없습니다' });
      return res.json(p);
    }

    // ── 공고 강제 마감 ─────────────────────────────────
    if (action === 'close_posting' && req.method === 'PATCH') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await sb(`job_postings?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' })
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    // ── 회원 목록 ──────────────────────────────────────
    if (action === 'users') {
      const data = await sb(
        'workers?select=id,name,phone,rating,review_count,noshow_count,is_banned,created_at&order=created_at.desc&limit=100',
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 노쇼 초기화 ────────────────────────────────────
    if (action === 'reset_noshow' && req.method === 'PATCH') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sb(`workers?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ noshow_count: 0 })
      });
      return res.json({ ok: true });
    }

    // ── 계정 정지/해제 ─────────────────────────────────
    if (action === 'ban_user' && req.method === 'PATCH') {
      const { id, is_banned } = req.body || {};
      if (!id || is_banned === undefined) return res.status(400).json({ error: 'id, is_banned required' });
      await sb(`workers?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ is_banned: !!is_banned })
      });
      return res.json({ ok: true });
    }

    // ── 기존 탈퇴자 개인정보 일괄 정리 ───────────────────
    // 인증 계정(auth.users)은 이미 삭제됐지만 workers 테이블에 이름/전화번호/사진 등이
    // 그대로 남아있던 기존 탈퇴자들을 찾아 개인식별 정보만 익명화한다 (행/이력은 유지)
    if (action === 'cleanup_withdrawn_workers' && req.method === 'POST') {
      const workers = await sb(
        'workers?select=id,kakao_uid,name,phone,photo_url,birth_date,age,gender,region,bio&kakao_uid=not.is.null',
        svcKey
      ).then(r => r.json());
      const list = Array.isArray(workers) ? workers : [];
      const alreadyClean = w => w.name === '탈퇴한 사용자' && !w.phone && !w.photo_url && !w.birth_date && !w.gender;
      const targets = list.filter(w => !alreadyClean(w));

      const withdrawn = [];
      for (const w of targets) {
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${w.kakao_uid}`, {
          headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` }
        });
        if (!authRes.ok) withdrawn.push(w.id); // 404 등 = 인증 계정이 이미 삭제된 탈퇴자
      }

      if (withdrawn.length) {
        const r = await sb(`workers?id=in.(${withdrawn.join(',')})`, svcKey, {
          method: 'PATCH',
          body: JSON.stringify({
            name: '탈퇴한 사용자', phone: null, photo_url: null,
            birth_date: null, age: null, gender: null, region: null, bio: null,
          })
        });
        if (!r.ok) return res.status(502).json({ error: await r.text() });
      }
      return res.json({ ok: true, checked: targets.length, cleaned: withdrawn.length });
    }

    // ── 회원 상세 ──────────────────────────────────────────────
    if (action === 'user_detail') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const [workerArr, apps] = await Promise.all([
        sb(`workers?id=eq.${id}&select=*`, svcKey).then(r => r.json()),
        sb(`applications?worker_id=eq.${id}&select=id,status,applied_at,job_posting_id,employer_rating,review,reviewed_at,biz_rating&order=applied_at.desc&limit=20`, svcKey).then(r => r.json()),
      ]);
      const worker = Array.isArray(workerArr) ? workerArr[0] : null;
      if (!worker) return res.status(404).json({ error: 'User not found' });

      // Supabase Auth에서 이메일 + 로그인 provider 조회
      let authEmail = null, authProvider = null;
      if (worker.kakao_uid) {
        try {
          const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${worker.kakao_uid}`, {
            headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` }
          });
          if (authRes.ok) {
            const au = await authRes.json();
            authEmail = au.email || null;
            const identity = (au.identities || [])[0];
            authProvider = identity?.provider || au.app_metadata?.provider || 'email';
          } else {
            console.error('[user_detail] auth admin lookup failed', worker.kakao_uid, authRes.status, await authRes.text().catch(()=>''));
          }
        } catch (e) { console.error('[user_detail] auth admin lookup error', worker.kakao_uid, e.message); }
      }

      const appList = Array.isArray(apps) ? apps : [];
      const jobIds = [...new Set(appList.map(a => a.job_posting_id).filter(Boolean))];
      const jobs = jobIds.length
        ? await sb(`job_postings?id=in.(${jobIds.join(',')})&select=id,title,biz_name`, svcKey).then(r => r.json())
        : [];
      const jobMap = Object.fromEntries((Array.isArray(jobs) ? jobs : []).map(j => [j.id, j]));
      return res.json({
        worker: { ...worker, auth_email: authEmail, auth_provider: authProvider },
        applications: appList.map(a => ({
          ...a,
          job_title: jobMap[a.job_posting_id]?.title || '(삭제된 공고)',
          biz_name: jobMap[a.job_posting_id]?.biz_name || '-',
        })),
      });
    }

    // ── 카테고리 목록 ─────────────────────────────────────────
    if (action === 'categories') {
      const svcType = req.query.service_type || 'baroalba';
      // service_type 컬럼이 없을 때를 대비해 fallback 처리
      const filteredResp = await sb(
        `job_categories?select=name,icon,display_order,active&service_type=eq.${encodeURIComponent(svcType)}&order=display_order`,
        svcKey
      );
      if (!filteredResp.ok && svcType === 'baroalba') {
        // DDL 미실행 상태 — service_type 없이 전체 반환
        const data = await sb('job_categories?select=name,icon,display_order,active&order=display_order', svcKey).then(r => r.json());
        return res.json(Array.isArray(data) ? data : []);
      }
      const data = await filteredResp.json();
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 카테고리 추가 ─────────────────────────────────────────
    if (action === 'add_category' && req.method === 'POST') {
      const { name, icon, display_order, service_type } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const r = await sb('job_categories', svcKey, {
        method: 'POST',
        body: JSON.stringify({ name, icon: icon || '📋', display_order: display_order || 99, active: true, service_type: service_type || 'baroalba' }),
        headers: { 'Prefer': 'return=representation' }
      });
      return res.json(await r.json());
    }

    // ── 카테고리 수정 ─────────────────────────────────────────
    if (action === 'update_category' && req.method === 'PATCH') {
      const { name, newName, icon, service_type } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const svc = service_type || 'baroalba';
      const updates = {};
      if (newName && newName !== name) updates.name = newName;
      if (icon !== undefined) updates.icon = icon;
      await sb(`job_categories?name=eq.${encodeURIComponent(name)}&service_type=eq.${encodeURIComponent(svc)}`, svcKey, {
        method: 'PATCH', body: JSON.stringify(updates)
      });
      return res.json({ ok: true });
    }

    // ── 카테고리 삭제 (soft) ──────────────────────────────────
    if (action === 'delete_category' && req.method === 'PATCH') {
      const { name, service_type } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const svc = service_type || 'baroalba';
      await sb(`job_categories?name=eq.${encodeURIComponent(name)}&service_type=eq.${encodeURIComponent(svc)}`, svcKey, {
        method: 'PATCH', body: JSON.stringify({ active: false })
      });
      return res.json({ ok: true });
    }

    // ── 모임 목록 ──────────────────────────────────────────────
    if (action === 'moims') {
      const data = await sb(
        'gatherings?select=id,title,category,sub_category,description,gathering_date,host_id,current_count,max_count,status,is_public,location_name,location_address,entry_fee,skill_level,skill_desc,gender_req,created_at&order=created_at.desc&limit=200',
        svcKey
      ).then(r => r.json());
      const list = Array.isArray(data) ? data : [];
      const hostIds = [...new Set(list.map(m => m.host_id).filter(Boolean))];
      // workers + businesses 두 테이블 모두 조회
      const [workers, bizzes] = await Promise.all([
        hostIds.length ? sb(`workers?id=in.(${hostIds.join(',')})&select=id,name,phone`, svcKey).then(r => r.json()).catch(() => []) : [],
        hostIds.length ? sb(`businesses?owner_id=in.(${hostIds.join(',')})&select=owner_id,name,phone`, svcKey).then(r => r.json()).catch(() => []) : [],
      ]);
      const hostMap = {};
      (Array.isArray(workers) ? workers : []).forEach(h => { hostMap[h.id] = { name: h.name, phone: h.phone }; });
      (Array.isArray(bizzes) ? bizzes : []).forEach(b => { if (!hostMap[b.owner_id]) hostMap[b.owner_id] = { name: b.name, phone: b.phone }; });
      return res.json(list.map(m => ({
        ...m,
        host_name: hostMap[m.host_id]?.name || '(알 수 없음)',
        host_phone: hostMap[m.host_id]?.phone || '',
      })));
    }

    // ── 모임 제목/내용 수정 ───────────────────────────────────
    if (action === 'update_moim' && req.method === 'PATCH') {
      const { id, title, category, gathering_date, location_name, max_count, is_public, description, entry_fee, gender_req } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const updates = {};
      if (title !== undefined) updates.title = title.trim();
      if (category !== undefined) updates.category = category;
      if (gathering_date !== undefined) updates.gathering_date = gathering_date || null;
      if (location_name !== undefined) updates.location_name = location_name;
      if (max_count !== undefined) updates.max_count = parseInt(max_count) || 10;
      if (is_public !== undefined) updates.is_public = is_public;
      if (description !== undefined) updates.description = description || null;
      if (entry_fee !== undefined) updates.entry_fee = parseInt(entry_fee) || 0;
      if (gender_req !== undefined) updates.gender_req = gender_req;
      if (!Object.keys(updates).length) return res.status(400).json({ error: 'no fields to update' });
      await sb(`gatherings?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      return res.json({ ok: true });
    }

    // ── 모임 상태 변경 (강제마감 / 재오픈) ───────────────────
    if (action === 'close_moim' && req.method === 'PATCH') {
      const { id, status } = req.body || {};
      if (!id || !status) return res.status(400).json({ error: 'id, status required' });
      await sb(`gatherings?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      return res.json({ ok: true });
    }

    // ── 모임 삭제 ─────────────────────────────────────────────
    if (action === 'delete_moim' && req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sb(`gatherings?id=eq.${id}`, svcKey, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('admin error:', e);
    return res.status(500).json({ error: e.message });
  }
};
