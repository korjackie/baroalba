// 관리자·매니저 지정 시 이메일 + 앱 푸시 + 인앱 알림 발송
const SB_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { role, email, name, userId } = req.body || {};
  // role: 'admin' | 'mannnam_manager'
  if (!email || !role) return res.status(400).json({ error: 'email and role required' });

  const RESEND_KEY = process.env.RESEND_API_KEY;

  const isAdmin   = role === 'admin';
  const isMannnam = role === 'mannnam_manager';

  const displayName = name || '담당자';
  const roleLabel   = isAdmin ? '바로알바 운영 관리자' : '바로만남 매니저';
  const accentColor = isAdmin ? '#C8102E' : '#7C3AED';
  const loginUrl    = isAdmin ? 'https://baroalba.multimove.co.kr/admin.html' : 'https://baroalba.multimove.co.kr/mannnam.html';
  const loginLabel  = isAdmin ? '관리자 페이지 바로가기' : '매니저 페이지 바로가기';

  const results = {};

  // ── 이메일 ───────────────────────────────────────────────
  if (RESEND_KEY) {
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif">
  <div style="max-width:480px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:${accentColor};padding:28px 24px;text-align:center">
      <div style="font-size:26px;font-weight:900;color:#fff">바로알바</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px">${roleLabel} 권한 안내</div>
    </div>
    <div style="padding:32px 24px">
      <div style="font-size:20px;font-weight:900;color:#111;margin-bottom:10px">${displayName}님,<br>축하드립니다! 🎉</div>
      <div style="font-size:14px;color:#555;line-height:1.8;margin-bottom:24px">
        회원님이 <b>${roleLabel}</b>로 지정되었습니다.<br>
        아래 버튼을 눌러 ${isAdmin ? '관리자' : '매니저'} 페이지에 접속하세요.
      </div>
      ${isMannnam ? `
      <div style="background:#F5F3FF;border-radius:14px;padding:18px;margin-bottom:20px">
        <div style="font-size:12px;font-weight:800;color:${accentColor};margin-bottom:10px">매니저가 할 수 있는 것들</div>
        <div style="font-size:13px;color:#444;line-height:1.8">
          🏪 제휴 식당 등록 및 관리<br>
          📅 바로스팟 이벤트 개설<br>
          👩 여성 신청자 배정·확정<br>
          👨 남성 참가자 승인·관리
        </div>
      </div>` : `
      <div style="background:#FFF5F5;border-radius:14px;padding:18px;margin-bottom:20px">
        <div style="font-size:12px;font-weight:800;color:${accentColor};margin-bottom:10px">관리자 권한으로 할 수 있는 것들</div>
        <div style="font-size:13px;color:#444;line-height:1.8">
          📋 공고·회원·신고 관리<br>
          🤝 모임 관리<br>
          ⚙️ 서비스 설정 변경<br>
          💜 바로만남 매니저 지정
        </div>
      </div>`}
      <a href="${loginUrl}" style="display:block;background:${accentColor};color:#fff;text-align:center;padding:15px;border-radius:14px;font-size:15px;font-weight:900;text-decoration:none;margin-bottom:14px">
        ${loginLabel} →
      </a>
      <div style="font-size:12px;color:#aaa;text-align:center;line-height:1.6">
        권한 관련 문의: baroalba@multimove.co.kr
      </div>
    </div>
    <div style="background:#f8f8f8;padding:14px 24px;border-top:1px solid #eee">
      <div style="font-size:11px;color:#bbb;text-align:center;line-height:1.7">
        MultiMOVE 주식회사 · 대표: 박근욱<br>본 메일은 권한 지정 시 자동 발송됩니다.
      </div>
    </div>
  </div>
</body>
</html>`;

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'baroalba@multimove.co.kr',
          to: [email],
          subject: `[바로알바] ${displayName}님, ${roleLabel}로 지정되셨습니다`,
          html,
        }),
      });
      results.email = r.ok ? 'ok' : await r.text();
    } catch (e) {
      results.email = 'error: ' + e.message;
    }
  } else {
    results.email = 'skip: no RESEND_KEY';
  }

  // ── 앱 푸시 ──────────────────────────────────────────────
  // 2026-08-01 (Phase 81): 예전엔 클라이언트가 push_subscriptions 에서
  // endpoint/p256dh/auth/fcm_token 을 읽어 pushSubs 로 넘겨줬다. 그런데 그 4개 컬럼은
  // 실재하지 않아(실제 스키마는 subscription JSON 하나) 그 쿼리가 매번 400 이었고,
  // pushSubs 는 항상 빈 배열이라 **이 푸시는 한 번도 발송된 적이 없다**.
  // 게다가 여기서 쓰던 legacy FCM(fcm.googleapis.com/fcm/send)은 구글이 종료했다.
  // → 앱의 다른 알림과 똑같이 /api/send-push 에 user_id 만 넘기고, 토큰 조회(fcm_tokens)와
  //   FCM v1 발송은 서버가 하도록 통일한다.
  if (userId) {
    const base = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000';
    try {
      const r = await fetch(`${base}/api/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          title: `🎉 ${roleLabel} 지정 안내`,
          body: `${displayName}님이 ${roleLabel}로 지정되었습니다. 탭하여 접속하세요.`,
          url: loginUrl,
          type: role,
        }),
      });
      results.push = r.ok ? 'ok' : await r.text();
    } catch (e) {
      results.push = 'error: ' + e.message;
    }
  } else {
    results.push = 'skip: no userId';
  }

  // ── 인앱 알림 (notifications 테이블) ────────────────────
  const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (userId && SVC_KEY) {
    const notiTitle = `🎉 ${roleLabel} 권한이 부여되었습니다`;
    const notiBody  = `${displayName}님, 바로알바 ${roleLabel}로 지정되셨습니다. ${isAdmin ? 'admin.html' : 'mannnam.html'}에서 관리 기능을 이용하세요.`;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          'apikey': SVC_KEY,
          'Authorization': `Bearer ${SVC_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ user_id: userId, title: notiTitle, body: notiBody, type: role }),
      });
      results.inapp = r.ok ? 'ok' : await r.text();
    } catch (e) {
      results.inapp = 'error: ' + e.message;
    }
  } else {
    results.inapp = userId ? 'skip: no SVC_KEY' : 'skip: no userId';
  }

  return res.status(200).json({ ok: true, results });
};
