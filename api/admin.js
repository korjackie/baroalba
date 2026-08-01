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

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 주소 → 좌표 서버사이드 지오코딩 (카카오 로컬 API, 주소검색 실패 시 키워드검색 폴백)
// 클라이언트(admin.html)도 같은 순서로 카카오 JS SDK를 이용해 시도하지만, SDK 로딩 타이밍이나
// 상세주소 포맷 이슈로 실패할 수 있어 서버에서 한 번 더(REST API로, SDK 로딩 이슈 없이) 시도한다.
async function geocodeAddress(address, name) {
  const restKey = process.env.KAKAO_REST_KEY;
  if (!restKey || (!address && !name)) return { lat: null, lng: null };
  const headers = { Authorization: `KakaoAK ${restKey}` };
  try {
    if (address) {
      const r = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`, { headers });
      const data = await r.json();
      const hit = data?.documents?.[0];
      if (hit) return { lat: parseFloat(hit.y), lng: parseFloat(hit.x) };
    }
    if (name) {
      const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(name)}`, { headers });
      const data = await r.json();
      const hit = data?.documents?.[0];
      if (hit) return { lat: parseFloat(hit.y), lng: parseFloat(hit.x) };
    }
  } catch (e) { console.error('[geocodeAddress] 실패:', e.message); }
  return { lat: null, lng: null };
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

// 범용 인앱 알림 + 푸시 발송 (제목/본문을 직접 넘기는 단순 버전)
// url: 푸시 클릭 시 이동할 딥링크(선택, 기본은 앱 메인) - 기존 호출부는 그대로 6개 인자만 넘겨도 동작함
async function notifyUser(userId, title, body, type, svcKey, req, url) {
  // 서비스별 알림 개별 차단 - type 접두어(barospot_/baromeeting_/moim_)로 카테고리를 판별해
  // workers.notify_* 컬럼이 명시적으로 false인 경우만 발송을 건너뛴다 (기본값 true)
  const prefCol = type?.startsWith('barospot_') ? 'notify_barospot'
    : type?.startsWith('baromeeting_') ? 'notify_baromeeting'
    : type?.startsWith('moim_') ? 'notify_moim' : null;
  if (prefCol) {
    const prefRows = await sb(`workers?kakao_uid=eq.${userId}&select=${prefCol}`, svcKey).then(r => r.json()).catch(() => []);
    if (prefRows?.[0]?.[prefCol] === false) return;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = host ? `https://${host}` : '';
  await sb('notifications', svcKey, {
    method: 'POST', headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ user_id: userId, title, body, type }),
  }).catch(() => {});
  if (baseUrl) {
    await fetch(`${baseUrl}/api/send-push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, title, body, url: url || '/바로알바.html', type }),
    }).catch(() => {});
  }
}

// recruiting_female → recruiting_male로 바뀌는 순간(여성 선점 또는 관리자 수동 매칭)
// 미리 신청(barospot_prebookings)해둔 남성들에게 "지금 신청하세요" 알림을 보낸다.
// 자동으로 신청/이용권 차감까지 하지 않는 이유: 결제성 행위는 본인이 직접 확인하고
// 눌러야 함 - 알림만 주고 실제 신청은 기존 applySpotEvent 플로우를 그대로 타게 한다.
async function notifyBarospotPrebookers(eventId, svcKey, req) {
  const rows = await sb(`barospot_prebookings?event_id=eq.${eventId}&select=user_id`, svcKey).then(r => r.json()).catch(() => []);
  if (!rows?.length) return;
  const evRows = await sb(`barospot_events?id=eq.${eventId}&select=event_date,barospot_restaurants(name)`, svcKey).then(r => r.json()).catch(() => []);
  const name = evRows?.[0]?.barospot_restaurants?.name || '바로스팟';
  for (const row of rows) {
    await notifyUser(row.user_id, '🍽️ 미리 신청하신 바로스팟이 열렸어요!', `${name} · 지금 바로 신청해보세요`, 'barospot_open', svcKey, req, `/바로알바.html?barospot=${eventId}`).catch(() => {});
  }
}

// 바로스팟 남성 신청 확정 - 관리자 확정(confirm_barospot_application)과 여성 본인의
// 블라인드 선택(select_barospot_candidate) 양쪽에서 공통으로 쓰는 로직.
// 확정 시: 이 신청 confirmed, 짝지어진 여성 신청도 자동 confirmed, 이벤트도 confirmed로
// 잠그고, 같은 이벤트의 다른 남성 경쟁자는 자동 취소. 실패 시 에러 문자열, 성공 시 null 반환.
async function confirmBarospotMale(applicationId, svcKey, req) {
  const appRows = await sb(`barospot_applications?id=eq.${applicationId}&select=id,user_id,event_id,gender,status`, svcKey).then(r => r.json());
  const app = appRows?.[0];
  if (!app) return '신청 정보를 찾을 수 없어요';
  if (!app.event_id) return '아직 매장이 배정되지 않은 신청이에요';
  if (app.gender !== 'male') return '여성 신청은 남성이 확정될 때 자동으로 함께 확정돼요';
  if (app.status !== 'pending') return '이미 처리된 신청이에요';

  await sb(`barospot_applications?id=eq.${applicationId}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) });
  await sb(`barospot_events?id=eq.${app.event_id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) });
  await notifyUser(app.user_id, '✅ 바로스팟 확정', '참가가 확정됐어요! 위치·거리 실시간 공유를 이용할 수 있어요.', 'barospot_confirmed', svcKey, req);

  const femaleRows = await sb(`barospot_applications?event_id=eq.${app.event_id}&gender=eq.female&status=eq.matched&select=id,user_id`, svcKey).then(r => r.json());
  for (const f of (femaleRows || [])) {
    await sb(`barospot_applications?id=eq.${f.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) });
    await notifyUser(f.user_id, '✅ 바로스팟 확정', '상대방이 확정돼서 만남이 확정됐어요!', 'barospot_confirmed', svcKey, req);
  }
  const otherMales = await sb(`barospot_applications?event_id=eq.${app.event_id}&gender=eq.male&status=eq.pending&id=neq.${applicationId}&select=id,user_id`, svcKey).then(r => r.json());
  for (const o of (otherMales || [])) {
    await sb(`barospot_applications?id=eq.${o.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
    await notifyUser(o.user_id, '바로스팟 신청 결과 안내', '아쉽지만 이번 바로스팟은 다른 분과 매칭됐어요.', 'barospot_cancelled', svcKey, req);
  }
  return null;
}

// 바로스팟 취소 시 원래 결제수단대로 환불 - pass면 이용권 1회 복구, points면 차감했던
// 금액 그대로 반환. trial(무료체험)은 애초에 차감된 게 없어 환불할 것도 없음.
async function _refundBarospotPayment(app, svcKey) {
  if (app.paid_method === 'pass') {
    const passRows = await sb(`barospot_passes?user_id=eq.${app.user_id}&gender=eq.${app.gender}&status=eq.active&select=id,remaining_count`, svcKey).then(r => r.json()).catch(() => []);
    const pass = passRows?.[0];
    if (pass) await sb(`barospot_passes?id=eq.${pass.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ remaining_count: pass.remaining_count + 1 }) });
  } else if (app.paid_method === 'points' && app.paid_amount) {
    const acctRows = await sb(`point_accounts?user_id=eq.${app.user_id}&select=id,balance`, svcKey).then(r => r.json()).catch(() => []);
    const acct = acctRows?.[0];
    if (acct) await sb(`point_accounts?id=eq.${acct.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ balance: acct.balance + app.paid_amount }) });
  }
}

// 포인트 지급/차감 시 인앱 알림 + 푸시 발송 (추천인 보상, 관리자 수동 지급 공통 사용)
async function notifyPointsGranted(userId, amount, reason, svcKey, req) {
  const title = amount > 0 ? '🎁 포인트가 지급됐어요' : '포인트 차감 안내';
  const body = reason || (amount > 0 ? `${amount.toLocaleString()}P가 지급됐어요` : `${Math.abs(amount).toLocaleString()}P가 차감됐어요`);
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = host ? `https://${host}` : '';

  await sb('notifications', svcKey, {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ user_id: userId, title, body, type: 'points_granted' }),
  }).catch(() => {});
  if (baseUrl) {
    await fetch(`${baseUrl}/api/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, title, body, url: '/바로알바.html', type: 'points_granted' }),
    }).catch(() => {});
  }
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

    // 추천인은 지금 앱을 보고 있지 않을 가능성이 높아 알림/푸시로 알려줘야 함
    // (신규가입자 본인은 클라이언트에서 즉시 토스트로도 뜨지만, 기록용으로 동일하게 남김)
    await notifyPointsGranted(newUserId, REFERRAL_REWARD_POINTS, '추천코드로 가입해서 포인트를 받았어요! 🎉', svcKey, req);
    await notifyPointsGranted(referrer.kakao_uid, REFERRAL_REWARD_POINTS, '내 추천코드로 친구가 가입해서 포인트를 받았어요! 🎉', svcKey, req);

    return res.json({ ok: true, credited: true, points: REFERRAL_REWARD_POINTS });
  }

  // ── 실시간 위치공유 - 다른 참가자 위치 조회 (관리자 아님, 로그인한 본인 세션) ──
  // live_shares는 RLS가 본인 행만 SELECT 허용하므로, "남의 위치를 본다"는 이 기능의 핵심을
  // 클라이언트에서 직접 조회하면 항상 빈 결과만 받게 됨(추천인 포인트 버그와 동일한 클래스) -
  // 서비스 롤 키로 조회하되, 요청자가 실제로 그 모임의 승인된 참가자인지 여기서 직접 검증한다.
  if (req.method === 'GET' && earlyAction === 'get_live_locations') {
    const llJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const requesterId = getSubFromJWT(llJwt);
    if (!requesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { context_type: ctxType, context_id: ctxId } = req.query;
    if (!ctxType || !ctxId) return res.status(400).json({ error: 'context_type, context_id required' });

    let authorized = false;
    if (ctxType === 'baromeeting') {
      const rows = await sb(`gathering_applications?gathering_id=eq.${ctxId}&applicant_id=eq.${requesterId}&status=eq.approved&select=id`, svcKey).then(r => r.json());
      authorized = Array.isArray(rows) && rows.length > 0;
    } else if (ctxType === 'barospot') {
      const rows = await sb(`barospot_applications?event_id=eq.${ctxId}&user_id=eq.${requesterId}&status=eq.confirmed&select=id`, svcKey).then(r => r.json());
      authorized = Array.isArray(rows) && rows.length > 0;
    } else {
      return res.status(400).json({ error: 'invalid context_type' });
    }
    if (!authorized) return res.status(403).json({ error: '이 모임의 승인된 참가자만 위치를 볼 수 있어요' });

    const ctxCol = ctxType === 'baromeeting' ? 'gathering_id' : 'barospot_event_id';
    const staleCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3분 이상 갱신 없으면 끊긴 것으로 간주
    const shares = await sb(
      `live_shares?context_type=eq.${ctxType}&${ctxCol}=eq.${ctxId}&status=eq.sharing&updated_at=gte.${staleCutoff}&user_id=neq.${requesterId}&select=user_id,lat,lng,distance_m,updated_at`,
      svcKey
    ).then(r => r.json());

    return res.json({ ok: true, travelers: Array.isArray(shares) ? shares : [] });
  }

  // ── 바로스팟 블라인드 후보 조회 (관리자 아님, 매칭된 여성 본인만) ──
  // 이름·전화번호는 빼고 나이·자기소개·노쇼이력·사진(클라이언트에서 블러 처리)만 반환한다
  if (req.method === 'GET' && earlyAction === 'get_barospot_candidates') {
    const bcJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const requesterId = getSubFromJWT(bcJwt);
    if (!requesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { application_id: myAppId } = req.query;
    if (!myAppId) return res.status(400).json({ error: 'application_id required' });

    const myAppRows = await sb(`barospot_applications?id=eq.${myAppId}&select=id,user_id,event_id,gender,status`, svcKey).then(r => r.json());
    const myApp = myAppRows?.[0];
    if (!myApp || myApp.user_id !== requesterId || myApp.gender !== 'female' || myApp.status !== 'matched' || !myApp.event_id) {
      return res.status(403).json({ error: '후보를 볼 수 있는 신청 건이 아니에요' });
    }

    const candidates = await sb(`barospot_applications?event_id=eq.${myApp.event_id}&gender=eq.male&status=eq.pending&select=id,user_id`, svcKey).then(r => r.json());
    const list = Array.isArray(candidates) ? candidates : [];
    const uids = list.map(c => c.user_id).filter(Boolean);
    let workerMap = {};
    if (uids.length) {
      const workers = await sb(`workers?kakao_uid=in.(${uids.join(',')})&select=kakao_uid,age,birth_date,bio,photo_url,dating_photo_url,noshow_count,job_category,body_type,interests,height_cm,mbti`, svcKey).then(r => r.json());
      workerMap = Object.fromEntries((workers || []).map(w => [w.kakao_uid, w]));
    }
    const result = list.map(c => {
      const w = workerMap[c.user_id] || {};
      let age = (w.age >= 15 && w.age <= 100) ? w.age : null;
      if (!age && w.birth_date) age = new Date().getFullYear() - new Date(w.birth_date).getFullYear();
      return {
        application_id: c.id, age, bio: w.bio || null, photo_url: w.dating_photo_url || w.photo_url || null, noshow_count: w.noshow_count || 0,
        job_category: w.job_category || null, body_type: w.body_type || null, interests: w.interests || [],
        height_cm: w.height_cm || null, mbti: w.mbti || null,
      };
    });
    return res.json({ ok: true, candidates: result });
  }

  // ── 남성이 "참가 가능한 스팟" 목록을 볼 때, 이미 배정된 여성의 블라인드 프로필 미리보기
  // (사진은 클라이언트에서 블러 처리) - 여성 후보 화면(get_barospot_candidates)과 동일한
  // 취지로, 블라인드라도 최소한의 정보(나이/직업군/체형/관심사)는 보고 신청 여부를
  // 판단할 수 있게 함. event_ids는 콤마로 구분된 여러 개를 한 번에 조회 ──
  if (req.method === 'GET' && earlyAction === 'barospot_event_previews') {
    const bepJwt = (req.headers.authorization || '').replace('Bearer ', '');
    if (!getSubFromJWT(bepJwt)) return res.status(401).json({ error: '로그인이 필요합니다' });
    const ids = String(req.query.event_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) return res.json({});
    const apps = await sb(`barospot_applications?event_id=in.(${ids.join(',')})&gender=eq.female&status=in.(matched,confirmed)&select=event_id,user_id`, svcKey).then(r => r.json()).catch(() => []);
    const uidByEvent = {};
    (Array.isArray(apps) ? apps : []).forEach(a => { uidByEvent[a.event_id] = a.user_id; });
    const uids = [...new Set(Object.values(uidByEvent))];
    let workerMap = {};
    if (uids.length) {
      const workers = await sb(`workers?kakao_uid=in.(${uids.join(',')})&select=kakao_uid,age,birth_date,bio,photo_url,dating_photo_url,job_category,body_type,interests,height_cm,mbti`, svcKey).then(r => r.json()).catch(() => []);
      workerMap = Object.fromEntries((Array.isArray(workers) ? workers : []).map(w => [w.kakao_uid, w]));
    }
    const result = {};
    Object.entries(uidByEvent).forEach(([eventId, uid]) => {
      const w = workerMap[uid];
      if (!w) return;
      let age = (w.age >= 15 && w.age <= 100) ? w.age : null;
      if (!age && w.birth_date) age = new Date().getFullYear() - new Date(w.birth_date).getFullYear();
      result[eventId] = { age, bio: w.bio || null, photo_url: w.dating_photo_url || w.photo_url || null, job_category: w.job_category || null, body_type: w.body_type || null, interests: w.interests || [], height_cm: w.height_cm || null, mbti: w.mbti || null };
    });
    return res.json(result);
  }

  // ── 바로스팟 후보 선택 (여성 본인이 직접 확정) - confirm_barospot_application의
  // 관리자 확정과 동일한 로직을 그대로 재사용, 권한만 "매칭된 여성 본인"으로 검증 ──
  if (req.method === 'POST' && earlyAction === 'select_barospot_candidate') {
    const scJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const requesterId = getSubFromJWT(scJwt);
    if (!requesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { application_id: myAppId, candidate_application_id: candId } = req.body || {};
    if (!myAppId || !candId) return res.status(400).json({ error: 'application_id, candidate_application_id required' });

    const myAppRows = await sb(`barospot_applications?id=eq.${myAppId}&select=id,user_id,event_id,gender,status`, svcKey).then(r => r.json());
    const myApp = myAppRows?.[0];
    if (!myApp || myApp.user_id !== requesterId || myApp.gender !== 'female' || myApp.status !== 'matched' || !myApp.event_id) {
      return res.status(403).json({ error: '선택 권한이 없는 신청 건이에요' });
    }
    const candRows = await sb(`barospot_applications?id=eq.${candId}&select=id,event_id,gender,status`, svcKey).then(r => r.json());
    const cand = candRows?.[0];
    if (!cand || cand.event_id !== myApp.event_id || cand.gender !== 'male' || cand.status !== 'pending') {
      return res.status(400).json({ error: '선택할 수 없는 후보예요' });
    }

    const err = await confirmBarospotMale(candId, svcKey, req);
    if (err) return res.status(400).json({ error: err });
    return res.json({ ok: true });
  }

  // ── 모임/바로미팅 그룹채팅 새 메시지 알림 - 지금까진 Realtime 구독으로 채팅창을
  // 열어놓은 사람에게만 실시간으로 보이고, 앱을 꺼놓은 다른 참가자에겐 푸시가 전혀
  // 안 가고 있었음. 발신자 제외 승인된 참가자+호스트 전원에게 발송 ──
  if (req.method === 'POST' && earlyAction === 'notify_gathering_chat') {
    const gcJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const senderId = getSubFromJWT(gcJwt);
    if (!senderId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { gathering_id: gcGatheringId, message: gcMessage } = req.body || {};
    if (!gcGatheringId) return res.status(400).json({ error: 'gathering_id required' });
    const gRows = await sb(`gatherings?id=eq.${gcGatheringId}&select=title,host_id,category`, svcKey).then(r => r.json()).catch(() => []);
    const gathering = gRows?.[0];
    const appRows = await sb(`gathering_applications?gathering_id=eq.${gcGatheringId}&status=eq.approved&select=applicant_id`, svcKey).then(r => r.json()).catch(() => []);
    const recipients = new Set((appRows || []).map(a => a.applicant_id));
    if (gathering?.host_id) recipients.add(gathering.host_id);
    recipients.delete(senderId);
    const title = gathering?.category === 'baromeeting' ? '🤝 바로미팅 새 메시지' : '💬 모임 새 메시지';
    const body = (gcMessage || '새 메시지가 도착했어요').slice(0, 60);
    const chatType = gathering?.category === 'baromeeting' ? 'baromeeting_chat' : 'moim_chat';
    for (const uid of recipients) {
      await notifyUser(uid, title, body, chatType, svcKey, req).catch(() => {});
    }
    return res.json({ ok: true });
  }

  // ── 남성이 신청하면 매칭된 여성에게 "새 후보가 있다" 알림 (남의 행에 알림을 써야 해서
  // 클라이언트 직접 처리 불가 - RLS가 조용히 막는 패턴이라 서버에서 처리) ──
  if (req.method === 'POST' && earlyAction === 'notify_barospot_new_candidate') {
    const nbcJwt = (req.headers.authorization || '').replace('Bearer ', '');
    if (!getSubFromJWT(nbcJwt)) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { event_id: nbcEventId } = req.body || {};
    if (!nbcEventId) return res.status(400).json({ error: 'event_id required' });
    const femaleRows = await sb(`barospot_applications?event_id=eq.${nbcEventId}&gender=eq.female&status=in.(matched,confirmed)&select=user_id`, svcKey).then(r => r.json()).catch(() => []);
    const femaleUid = femaleRows?.[0]?.user_id;
    if (femaleUid) {
      await notifyUser(femaleUid, '🍽️ 새로운 바로스팟 신청자가 있어요', '후보를 확인하고 선택해보세요', 'barospot_new_candidate', svcKey, req).catch(() => {});
    }
    return res.json({ ok: true });
  }

  // ── 바로스팟 선점 (여성 본인, 선착순) - 두 명이 동시에 눌러도 한 명만 성공하도록
  // "상태가 아직 recruiting_female일 때만" 조건부 UPDATE로 원자적으로 처리한다.
  // 경쟁에서 진 요청은 이 UPDATE가 0건 반영되어 자연스럽게 걸러진다(추가 락 불필요).
  // 원래 관리자 인증 게이트 아래(try 블록 안)에 있어서 일반회원(비관리자)이 선점 버튼을
  // 누르면 무조건 "Forbidden"(관리자 아님) 403으로 막히던 버그 - 다른 early-bypass
  // 액션들(get_live_locations 등)과 같은 위치인 게이트 이전으로 옮김 ──
  if (req.method === 'POST' && earlyAction === 'claim_barospot_event') {
    const cbJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const requesterId = getSubFromJWT(cbJwt);
    if (!requesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { event_id: claimEventId, paid_method: claimPaidMethod, paid_amount: claimPaidAmount } = req.body || {};
    if (!claimEventId) return res.status(400).json({ error: 'event_id required' });

    const claimRes = await fetch(`${SUPABASE_URL}/rest/v1/barospot_events?id=eq.${claimEventId}&status=eq.recruiting_female`, {
      method: 'PATCH',
      headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'recruiting_male' }),
    });
    const claimedRows = await claimRes.json();
    if (!claimRes.ok || !Array.isArray(claimedRows) || !claimedRows.length) {
      return res.status(409).json({ error: '이미 다른 분이 선점했어요' });
    }
    const insRes = await sb('barospot_applications', svcKey, {
      method: 'POST',
      body: JSON.stringify({ user_id: requesterId, event_id: claimEventId, gender: 'female', status: 'matched', paid_method: claimPaidMethod || null, paid_amount: claimPaidAmount || null }),
    });
    if (!insRes.ok) return res.status(502).json({ error: await insRes.text() });
    await notifyBarospotPrebookers(claimEventId, svcKey, req).catch(() => {});
    return res.json({ ok: true, event_id: claimEventId });
  }

  // ── 통합 채팅 시스템 (chat_rooms/chat_messages/chat_reads) - 알바채팅/바로미팅채팅/
  // 바로스팟채팅이 전부 이 하나의 스키마를 공유. 방 생성만 서버가 처리(자격 검증이
  // 필요해서) - 메시지 전송/조회는 RLS가 안전하게 허용하므로 클라이언트가 직접 처리 ──

  // 이 이벤트의 confirmed 신청 중 requesterId가 아닌 "상대방"의 user_id를 찾는다
  async function _getOtherConfirmedBarospotUser(eventId, requesterId) {
    const rows = await sb(`barospot_applications?event_id=eq.${eventId}&status=eq.confirmed&select=user_id`, svcKey).then(r => r.json()).catch(() => []);
    const other = (Array.isArray(rows) ? rows : []).find(r => r.user_id !== requesterId);
    return other?.user_id || null;
  }

  // context_type+context_id로 방을 get-or-create. 자격 검증은 RLS 정책과 동일한 기준으로
  // 여기서도 확인(서버가 방을 만들 때도 아무나 못 만들게).
  async function _ensureChatRoom(contextType, contextId, requesterId) {
    if (contextType === 'barospot') {
      const myRows = await sb(`barospot_applications?event_id=eq.${contextId}&user_id=eq.${requesterId}&status=eq.confirmed&select=id`, svcKey).then(r => r.json()).catch(() => []);
      if (!myRows?.length) return { error: '이 바로스팟의 확정 참가자만 채팅할 수 있어요' };
      const interestRows = await sb(`barospot_interests?event_id=eq.${contextId}&status=eq.accepted&select=id`, svcKey).then(r => r.json()).catch(() => []);
      if (!interestRows?.length) return { error: '아직 서로 호감 수락이 안 된 상태예요' };
      const col = 'barospot_event_id';
      let roomRows = await sb(`chat_rooms?${col}=eq.${contextId}&select=id`, svcKey).then(r => r.json()).catch(() => []);
      let roomId = roomRows?.[0]?.id;
      if (!roomId) {
        const created = await sb('chat_rooms', svcKey, { method: 'POST', body: JSON.stringify({ context_type: 'barospot', barospot_event_id: contextId }) }).then(r => r.json()).catch(() => []);
        roomId = created?.[0]?.id;
      }
      if (!roomId) return { error: '채팅방 생성에 실패했어요' };
      return { room_id: roomId };
    }
    return { error: '지원하지 않는 컨텍스트예요' };
  }

  if (req.method === 'POST' && earlyAction === 'ensure_chat_room') {
    const ecrJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const ecrRequesterId = getSubFromJWT(ecrJwt);
    if (!ecrRequesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { context_type: ecrContextType, context_id: ecrContextId } = req.body || {};
    if (!ecrContextType || !ecrContextId) return res.status(400).json({ error: 'context_type, context_id required' });
    const result = await _ensureChatRoom(ecrContextType, ecrContextId, ecrRequesterId);
    if (result.error) return res.status(403).json({ error: result.error });
    return res.json({ ok: true, room_id: result.room_id });
  }

  // 채팅창을 안 열어놓은 상대에게도 푸시가 가도록 - 컨텍스트별 수신자 해석
  if (req.method === 'POST' && earlyAction === 'notify_chat_message') {
    const ncmJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const ncmSenderId = getSubFromJWT(ncmJwt);
    if (!ncmSenderId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { room_id: ncmRoomId, message: ncmMessage } = req.body || {};
    if (!ncmRoomId) return res.status(400).json({ error: 'room_id required' });
    const roomRows = await sb(`chat_rooms?id=eq.${ncmRoomId}&select=context_type,barospot_event_id`, svcKey).then(r => r.json()).catch(() => []);
    const room = roomRows?.[0];
    if (!room) return res.json({ ok: true });
    const body = (ncmMessage || '새 메시지가 도착했어요').slice(0, 60);
    if (room.context_type === 'barospot') {
      const otherUid = await _getOtherConfirmedBarospotUser(room.barospot_event_id, ncmSenderId);
      if (otherUid) await notifyUser(otherUid, '💬 바로스팟 채팅 새 메시지', body, 'barospot_chat_message', svcKey, req).catch(() => {});
    }
    return res.json({ ok: true });
  }

  // ── 바로스팟 사후 호감표시 → 상호수락 → 채팅 오픈 ──────────────────────
  if (req.method === 'POST' && earlyAction === 'express_barospot_interest') {
    const eiJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const eiRequesterId = getSubFromJWT(eiJwt);
    if (!eiRequesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { event_id: eiEventId } = req.body || {};
    if (!eiEventId) return res.status(400).json({ error: 'event_id required' });
    const myRows = await sb(`barospot_applications?event_id=eq.${eiEventId}&user_id=eq.${eiRequesterId}&status=eq.confirmed&select=id`, svcKey).then(r => r.json()).catch(() => []);
    if (!myRows?.length) return res.status(403).json({ error: '확정된 참가자만 호감을 표시할 수 있어요' });
    const existing = await sb(`barospot_interests?event_id=eq.${eiEventId}&select=id`, svcKey).then(r => r.json()).catch(() => []);
    if (existing?.length) return res.status(409).json({ error: '이미 호감 표시가 진행 중이에요' });
    const targetUid = await _getOtherConfirmedBarospotUser(eiEventId, eiRequesterId);
    if (!targetUid) return res.status(404).json({ error: '상대방을 찾을 수 없어요' });
    const insRes = await sb('barospot_interests', svcKey, {
      method: 'POST',
      body: JSON.stringify({ event_id: eiEventId, initiator_user_id: eiRequesterId, target_user_id: targetUid, status: 'pending' }),
    });
    if (!insRes.ok) return res.status(502).json({ error: await insRes.text() });
    await notifyUser(targetUid, '💌 상대방이 호감을 표현했어요', '바로스팟에서 확인하고 수락 여부를 선택해보세요', 'barospot_interest', svcKey, req, `/바로알바.html?barospot_interest=${eiEventId}`).catch(() => {});
    return res.json({ ok: true });
  }

  // 어느 한쪽이 먼저 "종료하기"를 눌러 아직 아무도 호감표시 안 한 상태에서 바로 케이스를
  // 닫는 경우 - barospot_interests를 status='declined'로 바로 만들어(pending 단계 없이)
  // 이후 두 사람 다 "호감 표시하기" 버튼이 다시 안 뜨고 종료된 것으로 확정되게 함
  if (req.method === 'POST' && earlyAction === 'close_barospot_case') {
    const cbcJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const cbcRequesterId = getSubFromJWT(cbcJwt);
    if (!cbcRequesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { event_id: cbcEventId } = req.body || {};
    if (!cbcEventId) return res.status(400).json({ error: 'event_id required' });
    const myRows = await sb(`barospot_applications?event_id=eq.${cbcEventId}&user_id=eq.${cbcRequesterId}&status=eq.confirmed&select=id`, svcKey).then(r => r.json()).catch(() => []);
    if (!myRows?.length) return res.status(403).json({ error: '확정된 참가자만 종료할 수 있어요' });
    const existing = await sb(`barospot_interests?event_id=eq.${cbcEventId}&select=id`, svcKey).then(r => r.json()).catch(() => []);
    if (existing?.length) return res.status(409).json({ error: '이미 처리가 진행 중이에요' });
    const targetUid = await _getOtherConfirmedBarospotUser(cbcEventId, cbcRequesterId);
    if (!targetUid) return res.status(404).json({ error: '상대방을 찾을 수 없어요' });
    const insRes = await sb('barospot_interests', svcKey, {
      method: 'POST',
      body: JSON.stringify({ event_id: cbcEventId, initiator_user_id: cbcRequesterId, target_user_id: targetUid, status: 'declined', responded_at: new Date().toISOString() }),
    });
    if (!insRes.ok) return res.status(502).json({ error: await insRes.text() });
    await notifyUser(targetUid, '바로스팟 안내', '상대방과의 바로스팟이 종료됐어요', 'barospot_case_closed', svcKey, req).catch(() => {});
    return res.json({ ok: true });
  }

  if (req.method === 'POST' && earlyAction === 'respond_barospot_interest') {
    const riJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const riRequesterId = getSubFromJWT(riJwt);
    if (!riRequesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { event_id: riEventId, accept } = req.body || {};
    if (!riEventId || typeof accept !== 'boolean') return res.status(400).json({ error: 'event_id, accept required' });
    const rows = await sb(`barospot_interests?event_id=eq.${riEventId}&select=id,initiator_user_id,target_user_id,status`, svcKey).then(r => r.json()).catch(() => []);
    const interest = rows?.[0];
    if (!interest || interest.target_user_id !== riRequesterId || interest.status !== 'pending') {
      return res.status(403).json({ error: '응답할 수 있는 호감 표시가 없어요' });
    }
    const newStatus = accept ? 'accepted' : 'declined';
    const upd = await sb(`barospot_interests?id=eq.${interest.id}`, svcKey, {
      method: 'PATCH', body: JSON.stringify({ status: newStatus, responded_at: new Date().toISOString() }),
    });
    if (!upd.ok) return res.status(502).json({ error: await upd.text() });
    if (accept) {
      const roomResult = await _ensureChatRoom('barospot', riEventId, riRequesterId);
      await notifyUser(interest.initiator_user_id, '🎉 상대방이 호감을 수락했어요!', '채팅방이 열렸어요. 지금 대화를 시작해보세요', 'barospot_interest_accepted', svcKey, req, `/바로알바.html?barospot_chat=${riEventId}`).catch(() => {});
      return res.json({ ok: true, room_id: roomResult.room_id || null });
    } else {
      await notifyUser(interest.initiator_user_id, '바로스팟 안내', '아쉽지만 이번엔 채팅으로 이어지지 않았어요', 'barospot_interest_declined', svcKey, req).catch(() => {});
      return res.json({ ok: true });
    }
  }

  // ── 바로스팟 확정 후 자발적 취소 (일정 24시간 전까지만 전액환불) ──────────────
  // 한쪽이 취소하면 만남 자체가 성립 안 하므로 확정된 상대방 신청건도 함께 취소+환불하고 알림
  if (req.method === 'POST' && earlyAction === 'cancel_barospot_application') {
    const cbaJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const cbaRequesterId = getSubFromJWT(cbaJwt);
    if (!cbaRequesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { application_id: cbaAppId } = req.body || {};
    if (!cbaAppId) return res.status(400).json({ error: 'application_id required' });

    const appRows = await sb(`barospot_applications?id=eq.${cbaAppId}&select=id,user_id,event_id,gender,status,paid_method,paid_amount`, svcKey).then(r => r.json()).catch(() => []);
    const app = appRows?.[0];
    if (!app || app.user_id !== cbaRequesterId) return res.status(403).json({ error: '본인의 신청만 취소할 수 있어요' });
    if (app.status !== 'confirmed') return res.status(400).json({ error: '확정된 신청만 취소할 수 있어요' });
    if (!app.event_id) return res.status(400).json({ error: '이벤트 정보가 없어요' });

    const evRows = await sb(`barospot_events?id=eq.${app.event_id}&select=id,event_date`, svcKey).then(r => r.json()).catch(() => []);
    const ev = evRows?.[0];
    if (!ev) return res.status(404).json({ error: '이벤트를 찾을 수 없어요' });
    const hoursLeft = ev.event_date ? (new Date(ev.event_date).getTime() - Date.now()) / 3600000 : 999;
    if (hoursLeft < 24) return res.status(400).json({ error: '일정 24시간 이내에는 취소할 수 없어요' });

    const nowIso = new Date().toISOString();
    await sb(`barospot_applications?id=eq.${cbaAppId}`, svcKey, {
      method: 'PATCH', body: JSON.stringify({ status: 'cancelled', cancelled_at: nowIso }),
    });
    await _refundBarospotPayment(app, svcKey);

    // 확정된 상대방(있다면)도 함께 취소 + 환불 + 안내
    const otherRows = await sb(`barospot_applications?event_id=eq.${app.event_id}&status=eq.confirmed&user_id=neq.${cbaRequesterId}&select=id,user_id,gender,paid_method,paid_amount`, svcKey).then(r => r.json()).catch(() => []);
    for (const other of (otherRows || [])) {
      await sb(`barospot_applications?id=eq.${other.id}`, svcKey, {
        method: 'PATCH', body: JSON.stringify({ status: 'cancelled', cancelled_at: nowIso }),
      });
      await _refundBarospotPayment(other, svcKey);
      await notifyUser(other.user_id, '바로스팟 취소 안내', '상대방 사정으로 바로스팟이 취소돼서 결제하신 이용권/포인트가 전액 환불됐어요', 'barospot_cancelled_by_other', svcKey, req).catch(() => {});
    }
    await sb(`barospot_events?id=eq.${app.event_id}`, svcKey, {
      method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }),
    });
    return res.json({ ok: true });
  }

  // 만남 후 상호평가 (별점+태그) - 호감표시/채팅과 무관하게 확정 참가자면 누구나 남길 수 있음
  // (다시 만나고 싶은지와 별개로 노쇼/매너 등 신뢰도 지표로 쓰기 위함)
  if (req.method === 'POST' && earlyAction === 'submit_barospot_review') {
    const sbrJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const sbrRequesterId = getSubFromJWT(sbrJwt);
    if (!sbrRequesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const { event_id: sbrEventId, rating: sbrRating, tags: sbrTags } = req.body || {};
    if (!sbrEventId || !Number.isInteger(sbrRating) || sbrRating < 1 || sbrRating > 5) {
      return res.status(400).json({ error: 'event_id, rating(1~5) required' });
    }
    const myRows = await sb(`barospot_applications?event_id=eq.${sbrEventId}&user_id=eq.${sbrRequesterId}&status=eq.confirmed&select=id`, svcKey).then(r => r.json()).catch(() => []);
    if (!myRows?.length) return res.status(403).json({ error: '확정된 참가자만 평가할 수 있어요' });
    const revieweeId = await _getOtherConfirmedBarospotUser(sbrEventId, sbrRequesterId);
    if (!revieweeId) return res.status(404).json({ error: '상대방을 찾을 수 없어요' });
    const insRes = await sb('barospot_reviews?on_conflict=event_id,reviewer_id', svcKey, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ event_id: sbrEventId, reviewer_id: sbrRequesterId, reviewee_id: revieweeId, rating: sbrRating, tags: sbrTags || [] }),
    });
    if (!insRes.ok) return res.status(502).json({ error: await insRes.text() });
    return res.json({ ok: true });
  }

  // 서로 호감 수락된 이후에만 실명+실사진 등 상세 프로필 공개(전화번호는 절대 포함 안 함)
  if (req.method === 'GET' && earlyAction === 'get_barospot_revealed_profile') {
    const rpJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const rpRequesterId = getSubFromJWT(rpJwt);
    if (!rpRequesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const rpEventId = req.query.event_id;
    if (!rpEventId) return res.status(400).json({ error: 'event_id required' });
    const interestRows = await sb(`barospot_interests?event_id=eq.${rpEventId}&status=eq.accepted&select=id`, svcKey).then(r => r.json()).catch(() => []);
    if (!interestRows?.length) return res.status(403).json({ error: '아직 프로필을 볼 수 없어요' });
    const otherUid = await _getOtherConfirmedBarospotUser(rpEventId, rpRequesterId);
    if (!otherUid) return res.status(404).json({ error: '상대방을 찾을 수 없어요' });
    const wRows = await sb(`workers?kakao_uid=eq.${otherUid}&select=name,photo_url,dating_photo_url,age,birth_date,job_category,body_type,interests,height_cm,mbti,bio`, svcKey).then(r => r.json()).catch(() => []);
    const w = wRows?.[0];
    if (!w) return res.status(404).json({ error: '프로필을 찾을 수 없어요' });
    let age = (w.age >= 15 && w.age <= 100) ? w.age : null;
    if (!age && w.birth_date) age = new Date().getFullYear() - new Date(w.birth_date).getFullYear();
    // kakao_uid도 함께 반환 - 채팅방 신고하기 버튼이 신고 대상(target_id)으로 사용.
    // dating_photo_url(바로만남 전용 사진)이 있으면 그걸, 없으면 대표사진(photo_url)을 photo_url로 반환
    // - 클라이언트는 어떤 사진이 쓰였는지 신경 안 쓰고 photo_url 하나만 그대로 쓰면 됨
    return res.json({
      ok: true, kakao_uid: otherUid, name: w.name, photo_url: w.dating_photo_url || w.photo_url, age,
      job_category: w.job_category, body_type: w.body_type, interests: w.interests || [],
      height_cm: w.height_cm || null, mbti: w.mbti || null, bio: w.bio,
    });
  }

  // 채팅목록 화면에서 바로스팟 방이 여러 개면 위 API를 방 개수만큼 순차/병렬 호출해야 했는데,
  // 호출 1건마다 내부적으로 barospot_interests→barospot_applications→workers 3단 순차 조회 +
  // 서버리스 콜드스타트가 겹쳐서 채팅목록 로딩이 느려짐(2026-07-17 "채팅목록 3초 걸린다" 피드백).
  // event_id 여러 개를 한 번의 호출로 몰아서 처리 - 3단 조회를 event 개수와 무관하게 딱 2단
  // (interests+applications 병렬 → workers 1번)으로 끝냄.
  if (req.method === 'GET' && earlyAction === 'get_barospot_revealed_profiles_batch') {
    const rpbJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const rpbRequesterId = getSubFromJWT(rpbJwt);
    if (!rpbRequesterId) return res.status(401).json({ error: '로그인이 필요합니다' });
    const rpbEventIds = (req.query.event_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!rpbEventIds.length) return res.status(400).json({ error: 'event_ids required' });
    const idList = rpbEventIds.join(',');
    const [interestRows, appRows] = await Promise.all([
      sb(`barospot_interests?event_id=in.(${idList})&status=eq.accepted&select=event_id`, svcKey).then(r => r.json()).catch(() => []),
      sb(`barospot_applications?event_id=in.(${idList})&status=eq.confirmed&select=event_id,user_id`, svcKey).then(r => r.json()).catch(() => []),
    ]);
    const revealedEventIds = new Set((interestRows || []).map(r => r.event_id));
    const otherUidByEvent = {};
    (appRows || []).forEach(a => {
      if (revealedEventIds.has(a.event_id) && a.user_id !== rpbRequesterId) otherUidByEvent[a.event_id] = a.user_id;
    });
    const otherUids = [...new Set(Object.values(otherUidByEvent))];
    const wRows = otherUids.length
      ? await sb(`workers?kakao_uid=in.(${otherUids.join(',')})&select=kakao_uid,name,photo_url,dating_photo_url,age,birth_date,job_category,body_type,interests,height_cm,mbti,bio`, svcKey).then(r => r.json()).catch(() => [])
      : [];
    const workerByUid = {};
    (wRows || []).forEach(w => { workerByUid[w.kakao_uid] = w; });
    const result = {};
    rpbEventIds.forEach(eid => {
      const otherUid = otherUidByEvent[eid];
      const w = otherUid && workerByUid[otherUid];
      if (!w) return;
      let age = (w.age >= 15 && w.age <= 100) ? w.age : null;
      if (!age && w.birth_date) age = new Date().getFullYear() - new Date(w.birth_date).getFullYear();
      result[eid] = {
        kakao_uid: otherUid, name: w.name, photo_url: w.dating_photo_url || w.photo_url, age,
        job_category: w.job_category, body_type: w.body_type, interests: w.interests || [],
        height_cm: w.height_cm || null, mbti: w.mbti || null, bio: w.bio,
      };
    });
    return res.json({ ok: true, profiles: result });
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
        sb(`applications?select=id&applied_at=gte.${today}`, svcKey).then(r => r.json()),
        sb('gatherings?select=id&status=eq.open', svcKey).then(r => r.json()),
        sb('businesses?select=id', svcKey).then(r => r.json()).catch(() => []),
        sb(`workers?select=id&created_at=gte.${today}`, svcKey).then(r => r.json()),
        sb(`businesses?select=id&created_at=gte.${today}`, svcKey).then(r => r.json()).catch(() => []),
        sb(`gatherings?select=id&created_at=gte.${today}`, svcKey).then(r => r.json()),
        sb('gathering_applications?select=id', svcKey).then(r => r.json()).catch(() => []),
        sb(`barospot_applications?select=id&applied_at=gte.${today}`, svcKey).then(r => r.json()).catch(() => []),
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

    // ── 과거 추천인 가입 건 일회성 보정 (workers 행 자동생성 로직이 배포되기 전에
    // 추천링크로 가입한 사람은 workers 행 자체가 없어 회원목록에도 안 잡히고,
    // 추천인 포인트도 RLS로 막혀 누락됐었음 - 이메일로 auth 계정을 찾아 workers
    // 행을 만들고 양쪽 포인트를 소급 지급) ──
    if (action === 'backfill_referral' && req.method === 'POST') {
      const { email: beEmail, uid: beUidInput, code: beCode } = req.body || {};
      if ((!beEmail && !beUidInput) || !beCode) return res.status(400).json({ error: 'email 또는 uid, code required' });

      let beUid = beUidInput, targetUser = null;
      if (!beUid) {
        // uid를 직접 안 넘겼을 때만 이메일로 조회 - Table Editor 등에서 kakao_uid를 이미
        // 알고 있다면 uid로 바로 넘기는 게 이메일 오인(동명이인/오타) 위험이 없어 더 안전함
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(beEmail)}`, {
          headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` }
        });
        const authData = await authRes.json();
        targetUser = (authData.users || [])[0];
        if (!targetUser) return res.status(404).json({ error: '해당 이메일의 가입 계정을 찾을 수 없어요' });
        beUid = targetUser.id;
      }

      const refRows = await sb(`workers?referral_code=eq.${encodeURIComponent(beCode)}&select=kakao_uid`, svcKey).then(r => r.json());
      const referrer = Array.isArray(refRows) ? refRows[0] : null;
      if (!referrer) return res.status(404).json({ error: '해당 추천코드를 찾을 수 없어요' });
      if (referrer.kakao_uid === beUid) return res.status(400).json({ error: '본인 추천코드예요' });

      const meRows = await sb(`workers?kakao_uid=eq.${beUid}&select=id,referred_by`, svcKey).then(r => r.json());
      const me = Array.isArray(meRows) ? meRows[0] : null;
      if (me?.referred_by) return res.json({ ok: true, already: true });

      if (me) {
        await sb(`workers?id=eq.${me.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ referred_by: referrer.kakao_uid }) });
      } else {
        if (!targetUser) {
          const authRes2 = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${beUid}`, { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } });
          targetUser = authRes2.ok ? await authRes2.json() : {};
        }
        const meta = targetUser.user_metadata || {};
        const name = meta.full_name || meta.name || (targetUser.email ? targetUser.email.split('@')[0] : '알바생');
        await sb('workers', svcKey, { method: 'POST', body: JSON.stringify({ kakao_uid: beUid, name, referred_by: referrer.kakao_uid }) });
      }

      // 피추천인(친구) 본인 몫은 예전 코드에서도 "자기 행" update라 RLS 없이 이미 지급됐을
      // 가능성이 높음(중복지급 방지 위해 여기선 재지급하지 않음) - 실제 누락된 추천인 몫만 지급
      const REFERRAL_REWARD_POINTS = 3000;
      const acctRows = await sb(`point_accounts?user_id=eq.${referrer.kakao_uid}&select=id,balance`, svcKey).then(r => r.json());
      const acct = Array.isArray(acctRows) ? acctRows[0] : null;
      const newBalance = (acct?.balance || 0) + REFERRAL_REWARD_POINTS;
      if (acct) {
        await sb(`point_accounts?id=eq.${acct.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ balance: newBalance }) });
      } else {
        await sb('point_accounts', svcKey, { method: 'POST', body: JSON.stringify({ user_id: referrer.kakao_uid, balance: newBalance }) });
      }

      await notifyPointsGranted(referrer.kakao_uid, REFERRAL_REWARD_POINTS, '내 추천코드로 친구가 가입해서 포인트를 받았어요! 🎉', svcKey, req);

      return res.json({ ok: true, credited: true, referrerUid: referrer.kakao_uid, referrerBalance: newBalance });
    }

    // ── 잘못 연결된 추천 관계 해제 (오인으로 backfill_referral을 잘못 실행한 경우 되돌리기용) ──
    if (action === 'unlink_referral' && req.method === 'PATCH') {
      const { id: unlinkId } = req.body || {};
      if (!unlinkId) return res.status(400).json({ error: 'id required' });
      await sb(`workers?id=eq.${unlinkId}`, svcKey, { method: 'PATCH', body: JSON.stringify({ referred_by: null }) });
      return res.json({ ok: true });
    }

    // ── 수동 포인트 지급/보정 (CS 대응, 과거 데이터 보정용 - 서비스 롤 키로 RLS 우회) ──
    // userId는 workers.kakao_uid(=point_accounts.user_id) - 회원 상세 패널에서 이미 로드돼 있음
    if (action === 'grant_points' && req.method === 'POST') {
      const { userId: grantUid, amount, reason } = req.body || {};
      if (!grantUid || typeof amount !== 'number' || !amount) return res.status(400).json({ error: 'userId, amount required' });

      const acctRows = await sb(`point_accounts?user_id=eq.${grantUid}&select=id,balance`, svcKey).then(r => r.json());
      const acct = Array.isArray(acctRows) ? acctRows[0] : null;
      const newBalance = (acct?.balance || 0) + amount;
      if (acct) {
        await sb(`point_accounts?id=eq.${acct.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ balance: newBalance }) });
      } else {
        await sb('point_accounts', svcKey, { method: 'POST', body: JSON.stringify({ user_id: grantUid, balance: newBalance }) });
      }
      await sb('point_transactions', svcKey, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
        user_id: grantUid, type: amount > 0 ? 'admin_grant' : 'admin_deduct', amount, balance_after: newBalance,
        description: reason || '관리자 포인트 지급',
      }) }).catch(() => {}); // point_transactions는 참고용 로그 - 실패해도 지급 자체는 이미 반영됨
      await notifyPointsGranted(grantUid, amount, reason, svcKey, req);

      return res.json({ ok: true, balance: newBalance });
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
      const { id, name, address, phone, menu_description, base_price, naver_place_url } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: '식당명을 입력해주세요' });
      const payload = {
        name: name.trim(),
        address: (address || '').trim(),
        phone: (phone || '').trim(),
        menu_description: (menu_description || '').trim(),
        base_price: base_price ? parseInt(base_price) || 0 : 0,
        naver_place_url: naver_place_url || null,
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

    // ── 바로스팟 이벤트 목록 - 실제 status는 1:1 매칭 상태머신
    // (recruiting_female/recruiting_male/confirmed/done/cancelled - CHECK 제약으로 확인됨).
    // 정원(N명) 개념이 아니라 "여성 1명 + 남성 1명"을 매칭하는 스팟성 소개팅이라
    // female_max/male_max 같은 정원 컬럼은 쓰지 않는다 ──
    if (action === 'barospot_events') {
      const data = await sb(
        'barospot_events?select=id,restaurant_id,event_date,status,notes,address,lat,lng,barospot_restaurants(name,menu_description,base_price)&order=event_date.desc&limit=100',
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 바로스팟 개설 - 실제 흐름: 여성이 먼저 신청(매장 미배정) → 관리자가 이 액션으로
    // 매장/일시를 정해 "남성 모집중(recruiting_male)" 상태로 엶 → 남성들이 신청 →
    // 관리자가 한 명만 확정. new_restaurant가 오면(네이버 플레이스 검색으로 제휴목록에
    // 없는 새 장소를 고른 경우) barospot_restaurants에 먼저 등록하고 그 id를 사용한다 ──
    if (action === 'save_barospot_event' && (req.method === 'POST' || req.method === 'PATCH')) {
      let { id, restaurant_id, new_restaurant, event_date, notes, address } = req.body || {};
      if (!restaurant_id && new_restaurant?.name) {
        const rr = await sb('barospot_restaurants', svcKey, {
          method: 'POST',
          body: JSON.stringify({ name: new_restaurant.name.trim(), address: (new_restaurant.address || '').trim(), phone: '', menu_description: '', base_price: 0, is_active: true, naver_place_url: new_restaurant.naver_place_url || null }),
        });
        if (!rr.ok) return res.status(502).json({ error: '새 제휴매장 등록 실패: ' + await rr.text() });
        const rows = await rr.json();
        restaurant_id = rows?.[0]?.id;
      }
      if (!restaurant_id) return res.status(400).json({ error: '제휴매장을 선택하거나 새 장소를 검색해주세요' });
      if (!event_date) return res.status(400).json({ error: '일시를 입력해주세요' });
      const payload = {
        restaurant_id,
        event_date,
        notes: (notes || '').trim() || null,
        address: (address || '').trim() || null,
      };
      if (payload.address) {
        const geo = await geocodeAddress(payload.address, null);
        payload.lat = geo.lat; payload.lng = geo.lng;
      }
      let r, createdId = id;
      if (id) {
        r = await sb(`barospot_events?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        // 관리자가 매장/일시만 먼저 정해서 열고, 반경 내 "바로스팟 희망" 여성들에게 푸시로
        // 알려서 선착순으로 선점하게 하는 흐름 - 여성이 아직 없으니 recruiting_female로 시작
        payload.status = 'recruiting_female';
        r = await sb('barospot_events', svcKey, { method: 'POST', body: JSON.stringify(payload) });
      }
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      const savedRows = await r.json();
      createdId = createdId || savedRows?.[0]?.id;

      // 신규 개설 + 좌표 확보 성공 시에만 반경 5km 내 opt-in 여성에게 알림 발송
      if (!id && payload.lat != null && payload.lng != null && createdId) {
        const BAROSPOT_PUSH_RADIUS_KM = 5;
        const candidates = await sb(`workers?barospot_interested=eq.true&last_lat=not.is.null&last_lng=not.is.null&select=kakao_uid,last_lat,last_lng`, svcKey).then(r => r.json()).catch(() => []);
        const nearby = (Array.isArray(candidates) ? candidates : []).filter(w => haversineKm(payload.lat, payload.lng, w.last_lat, w.last_lng) <= BAROSPOT_PUSH_RADIUS_KM);
        for (const w of nearby) {
          await notifyUser(w.kakao_uid, '🍽️ 근처에 바로스팟이 열렸어요!', '먼저 신청하는 분에게 선점 기회가 있어요 - 지금 확인해보세요', 'barospot_offer', svcKey, req);
        }
      }
      return res.json({ ok: true });
    }

    // ── 바로스팟 취소 - 이벤트와 아직 확정 안 된 연결 신청들을 함께 취소 처리 ──
    if (action === 'cancel_barospot_event' && req.method === 'PATCH') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await sb(`barospot_events?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      const apps = await sb(`barospot_applications?event_id=eq.${id}&status=neq.cancelled&select=id,user_id`, svcKey).then(r => r.json());
      for (const a of (apps || [])) {
        await sb(`barospot_applications?id=eq.${a.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
        await notifyUser(a.user_id, '바로스팟 취소 안내', '신청하신 바로스팟이 취소됐어요.', 'barospot_cancelled', svcKey, req);
      }
      return res.json({ ok: true });
    }

    // ── 바로스팟 완료 처리 (만남이 끝난 뒤) ──
    // noshow_kakao_uids: 실제로 안 나온 사람의 kakao_uid 배열(0~2명) - 노쇼 처리하면
    // workers.noshow_count가 올라가고, 이는 신청 자격 기준(_checkBarospotEligibility)과
    // 그대로 연결돼 노쇼 이력이 쌓인 사람은 다음 바로스팟 신청 자체가 막힌다
    if (action === 'complete_barospot_event' && req.method === 'PATCH') {
      const { id, noshow_kakao_uids } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await sb(`barospot_events?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      for (const uid of (Array.isArray(noshow_kakao_uids) ? noshow_kakao_uids : [])) {
        const wRows = await sb(`workers?kakao_uid=eq.${uid}&select=id,noshow_count`, svcKey).then(r => r.json());
        const w = wRows?.[0];
        if (!w) continue;
        await sb(`workers?id=eq.${w.id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ noshow_count: (w.noshow_count || 0) + 1 }) });
        await notifyUser(uid, '⚠️ 노쇼 처리 안내', '바로스팟 노쇼로 처리됐어요. 반복되면 신청이 제한될 수 있어요.', 'barospot_noshow', svcKey, req);
      }
      return res.json({ ok: true });
    }

    // ── 바로스팟 신청 목록 (여성: 매장배정 대기, 남성: 확정대기 등) - event_id로도 필터 가능
    // (완료 처리 시 "누가 노쇼했는지" 고르기 위해 특정 이벤트의 확정자만 조회할 때 사용) ──
    if (action === 'barospot_applications') {
      const statusFilter = req.query.status;
      const eventFilter = req.query.event_id;
      let url = 'barospot_applications?select=id,event_id,user_id,gender,status,applied_at,barospot_events(event_date,barospot_restaurants(name))&order=applied_at.desc&limit=200';
      if (statusFilter) url += `&status=eq.${encodeURIComponent(statusFilter)}`;
      if (eventFilter) url += `&event_id=eq.${encodeURIComponent(eventFilter)}`;
      const apps = await sb(url, svcKey).then(r => r.json());
      const list = Array.isArray(apps) ? apps : [];
      const userIds = [...new Set(list.map(a => a.user_id).filter(Boolean))];
      let nameMap = {};
      if (userIds.length) {
        const workers = await sb(`workers?kakao_uid=in.(${userIds.join(',')})&select=kakao_uid,name,phone,rating,review_count,noshow_count`, svcKey).then(r => r.json());
        nameMap = Object.fromEntries((workers || []).map(w => [w.kakao_uid, w]));
      }
      return res.json(list.map(a => ({ ...a, worker: nameMap[a.user_id] || null })));
    }

    // ── 여성 신청을 특정 이벤트(매장)에 매칭 - 남성은 신청 시 이미 event_id를 직접 고르므로 대상 아님 ──
    if (action === 'match_barospot_application' && req.method === 'POST') {
      const { application_id, event_id } = req.body || {};
      if (!application_id || !event_id) return res.status(400).json({ error: 'application_id, event_id required' });
      const appRows = await sb(`barospot_applications?id=eq.${application_id}&select=id,user_id`, svcKey).then(r => r.json());
      const app = appRows?.[0];
      if (!app) return res.status(404).json({ error: '신청 정보를 찾을 수 없어요' });
      // 이 이벤트가 아직 recruiting_female(선점 전)이면 관리자가 수동 매칭한 것도
      // 선점과 동일하게 recruiting_male로 전환해줘야 남성 목록에 노출된다. 실제로
      // 전환이 일어났을 때만(중복 알림 방지) 미리 신청자들에게 알림을 보낸다
      const flipRes = await sb(`barospot_events?id=eq.${event_id}&status=eq.recruiting_female`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'recruiting_male' }) }).catch(() => null);
      if (flipRes?.ok) {
        const flipped = await flipRes.json().catch(() => []);
        if (flipped?.length) await notifyBarospotPrebookers(event_id, svcKey, req).catch(() => {});
      }
      const r = await sb(`barospot_applications?id=eq.${application_id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ event_id, status: 'matched' }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      await notifyUser(app.user_id, '🍽️ 바로스팟 매장 배정 완료', '식당이 배정됐어요! 남성 신청자가 확정되면 다시 알려드릴게요.', 'barospot_matched', svcKey, req);
      return res.json({ ok: true });
    }

    // ── 남성 신청 확정 - 1:1 매칭이라 한 이벤트에 남성 한 명만 확정될 수 있음.
    // 확정 시: 이 신청 confirmed, 짝지어진 여성 신청도 자동 confirmed, 이벤트 status도
    // confirmed로 잠그고, 같은 이벤트의 다른 남성 신청(경쟁자)은 자동 취소한다 ──
    if (action === 'confirm_barospot_application' && req.method === 'PATCH') {
      const { application_id } = req.body || {};
      if (!application_id) return res.status(400).json({ error: 'application_id required' });
      const err = await confirmBarospotMale(application_id, svcKey, req);
      if (err) return res.status(400).json({ error: err });
      return res.json({ ok: true });
    }

    // ── 신청 취소 (개별 신청 1건만 취소 - 환불 로직 없음, 필요 시 별도 요청) ──
    if (action === 'cancel_barospot_application' && req.method === 'PATCH') {
      const { application_id } = req.body || {};
      if (!application_id) return res.status(400).json({ error: 'application_id required' });
      const appRows = await sb(`barospot_applications?id=eq.${application_id}&select=id,user_id`, svcKey).then(r => r.json());
      const app = appRows?.[0];
      if (!app) return res.status(404).json({ error: '신청 정보를 찾을 수 없어요' });
      const r = await sb(`barospot_applications?id=eq.${application_id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      await notifyUser(app.user_id, '바로스팟 신청 취소 안내', '신청이 취소됐어요. 문의사항은 고객센터로 연락해주세요.', 'barospot_cancelled', svcKey, req);
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

      // 클라이언트(카카오 JS SDK) 지오코딩이 실패했으면 서버에서 REST API로 한 번 더 시도
      // (SDK 로딩 타이밍 문제와 무관하게 서버가 좌표 확보의 최종 책임을 짐)
      if (payload.lat === null || payload.lng === null) {
        const geo = await geocodeAddress(payload.location_address, payload.location_name);
        if (geo.lat !== null) { payload.lat = geo.lat; payload.lng = geo.lng; }
      }

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

      // 신규 개설 + 좌표 확보 성공 시 반경 5km 내 알림 opt-in(notify_enabled) 회원에게 발송
      // (바로스팟과 동일한 workers.last_lat/last_lng 위치 데이터 재사용)
      if (!id && payload.lat != null && payload.lng != null) {
        const BM_NOTIFY_RADIUS_KM = 5;
        const nearbyWorkers = await sb(`workers?notify_enabled=eq.true&last_lat=not.is.null&last_lng=not.is.null&select=kakao_uid,last_lat,last_lng`, svcKey).then(r => r.json()).catch(() => []);
        const nearby = (Array.isArray(nearbyWorkers) ? nearbyWorkers : []).filter(w => haversineKm(payload.lat, payload.lng, w.last_lat, w.last_lng) <= BM_NOTIFY_RADIUS_KM);
        for (const w of nearby) {
          await notifyUser(w.kakao_uid, '🤝 근처에 바로미팅이 열렸어요!', `"${payload.title}" - 지금 확인해보세요`, 'baromeeting_offer', svcKey, req);
        }
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

    // ── 바로미팅 완료 처리 + 노쇼 체크 (바로스팟의 complete_barospot_event와 동일한 취지) -
    // 승인만 되고 나면 관리자가 아무 조치도 취할 수 없었던 것("승인 이후엔 컨트롤 기능이
    // 없다"는 피드백)을 보완 - 모임을 closed로 마감하면서 노쇼 신고된 인원은 노쇼 카운트를
    // 올려 바로스팟 자격심사(_checkBarospotEligibility)에도 함께 반영되게 한다 ──
    if (action === 'complete_baromeeting' && req.method === 'PATCH') {
      const { id, noshow_applicant_ids } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await sb(`gatherings?id=eq.${id}`, svcKey, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      for (const uid of (Array.isArray(noshow_applicant_ids) ? noshow_applicant_ids : [])) {
        const wRows = await sb(`workers?kakao_uid=eq.${uid}&select=noshow_count`, svcKey).then(res2 => res2.json()).catch(() => []);
        const cur = wRows?.[0]?.noshow_count || 0;
        await sb(`workers?kakao_uid=eq.${uid}`, svcKey, { method: 'PATCH', body: JSON.stringify({ noshow_count: cur + 1 }) }).catch(() => {});
        await notifyUser(uid, '바로미팅 노쇼 안내', '신청하신 바로미팅에 노쇼로 기록됐어요. 반복되면 이후 이용이 제한될 수 있어요.', 'baromeeting_noshow', svcKey, req).catch(() => {});
      }
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
    // limit=100은 회원이 늘면서 오래된/일부 회원이 목록에서 통째로 빠지는 원인이 됐음
    // (검색 기능도 없어 "누락"처럼 보였음) - 검색 UI 추가와 함께 상한을 대폭 올림
    if (action === 'users') {
      const data = await sb(
        'workers?select=id,name,phone,rating,review_count,noshow_count,is_banned,created_at&order=created_at.desc&limit=2000',
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 가입 회원(auth) 목록 — 관리자 지정 화면용 (2026-08-01) ──
    // ⚠️ 반드시 auth 계정 기준이어야 한다. 관리자 판정이 auth.jwt()->>'email' 로 이뤄지므로
    //    (is_app_admin() / 이 파일의 게이트 둘 다) 다른 출처의 이메일을 쓰면 목록에서 고른
    //    사람과 실제로 권한이 생기는 사람이 어긋날 수 있다.
    //    workers 에 email 이 있는지는 불확실하고 businesses 에는 아예 없다(Phase 81 확인).
    if (action === 'auth_users') {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
        headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` }
      });
      if (!r.ok) return res.status(502).json({ error: 'auth 목록 조회 실패: ' + (await r.text()).slice(0, 200) });
      const j = await r.json().catch(() => ({}));
      const users = (j.users || []).filter(u => u && u.email);
      const uids = users.map(u => u.id).slice(0, 2000);
      const inList = uids.join(',');
      const [adminRows, wRows, bRows] = await Promise.all([
        sb('app_admins?select=email', svcKey).then(x => x.json()).catch(() => []),
        uids.length ? sb(`workers?kakao_uid=in.(${inList})&select=kakao_uid,name`, svcKey).then(x => x.json()).catch(() => []) : [],
        uids.length ? sb(`businesses?kakao_uid=in.(${inList})&select=kakao_uid,name,biz_name`, svcKey).then(x => x.json()).catch(() => []) : [],
      ]);
      const adminSet = new Set((Array.isArray(adminRows) ? adminRows : []).map(a => String(a.email || '').toLowerCase()));
      const wMap = {}, bMap = {};
      (Array.isArray(wRows) ? wRows : []).forEach(w => { if (w.name) wMap[w.kakao_uid] = w.name; });
      (Array.isArray(bRows) ? bRows : []).forEach(b => { bMap[b.kakao_uid] = b.biz_name || b.name || ''; });
      const out = users.map(u => ({
        email: u.email,
        name: bMap[u.id] || wMap[u.id] || '',
        role: bMap[u.id] ? 'business' : (wMap[u.id] ? 'worker' : ''),
        provider: (u.app_metadata && u.app_metadata.provider) || '',
        created_at: u.created_at,
        is_admin: adminSet.has(String(u.email).toLowerCase()),
      }));
      out.sort((a, b2) => (a.name || a.email).localeCompare(b2.name || b2.email, 'ko'));
      return res.json(out);
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
        sb(`applications?worker_id=eq.${id}&select=id,status,applied_at,job_posting_id,employer_rating,review:employer_review,reviewed_at:employer_reviewed_at,biz_rating&order=applied_at.desc&limit=20`, svcKey).then(r => r.json()),
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

      // 포인트 잔액 (point_accounts.user_id = workers.kakao_uid)
      let pointBalance = null;
      if (worker.kakao_uid) {
        const acctRows = await sb(`point_accounts?user_id=eq.${worker.kakao_uid}&select=balance`, svcKey).then(r => r.json()).catch(() => null);
        pointBalance = Array.isArray(acctRows) && acctRows[0] ? (acctRows[0].balance || 0) : 0;
      }

      const appList = Array.isArray(apps) ? apps : [];
      const jobIds = [...new Set(appList.map(a => a.job_posting_id).filter(Boolean))];
      const jobs = jobIds.length
        ? await sb(`job_postings?id=in.(${jobIds.join(',')})&select=id,title,biz_name`, svcKey).then(r => r.json())
        : [];
      const jobMap = Object.fromEntries((Array.isArray(jobs) ? jobs : []).map(j => [j.id, j]));
      return res.json({
        worker: { ...worker, auth_email: authEmail, auth_provider: authProvider, point_balance: pointBalance },
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
        hostIds.length ? sb(`workers?kakao_uid=in.(${hostIds.join(',')})&select=kakao_uid,name,phone`, svcKey).then(r => r.json()).catch(() => []) : [],
        hostIds.length ? sb(`businesses?kakao_uid=in.(${hostIds.join(',')})&select=kakao_uid,name,phone`, svcKey).then(r => r.json()).catch(() => []) : [],
      ]);
      const hostMap = {};
      (Array.isArray(workers) ? workers : []).forEach(h => { hostMap[h.kakao_uid] = { name: h.name, phone: h.phone }; });
      (Array.isArray(bizzes) ? bizzes : []).forEach(b => { if (!hostMap[b.kakao_uid]) hostMap[b.kakao_uid] = { name: b.name, phone: b.phone }; });
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
