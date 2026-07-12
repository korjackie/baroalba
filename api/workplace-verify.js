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

function htmlPage(title, message, ok) {
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ── 이메일 링크 클릭 → 인증 완료 처리 (인증 불필요, 토큰 자체가 자격증명) ──
  if (req.method === 'GET') {
    const token = req.query.token;
    if (!token) { res.setHeader('Content-Type', 'text/html'); return res.status(400).send(htmlPage('잘못된 접근', '인증 링크가 올바르지 않아요.', false)); }
    const rows = await sb(`workers?workplace_verify_token=eq.${token}&select=id`, svcKey).then(r => r.json());
    if (!Array.isArray(rows) || !rows.length) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(404).send(htmlPage('이미 처리된 링크예요', '인증이 이미 완료됐거나 만료된 링크입니다.', false));
    }
    await sb(`workers?id=eq.${rows[0].id}`, svcKey, {
      method: 'PATCH',
      body: JSON.stringify({ workplace_verify_status: 'verified', workplace_verify_token: null })
    });
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlPage('직장인증 완료!', '바로알바 앱으로 돌아가시면<br>인증 배지가 표시됩니다.', true));
  }

  // ── 인증 메일 발송 (로그인한 본인만) ──
  if (req.method === 'POST') {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const userId = getUserIdFromJWT(token);
    if (!userId) return res.status(401).json({ error: '로그인이 필요합니다' });

    const { company, email, name } = req.body || {};
    if (!company || !email) return res.status(400).json({ error: 'company, email required' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

    const verifyToken = require('crypto').randomBytes(24).toString('hex');
    const patch = await sb(`workers?kakao_uid=eq.${userId}`, svcKey, {
      method: 'PATCH',
      body: JSON.stringify({
        workplace_name: company,
        workplace_verify_token: verifyToken,
        workplace_verify_status: 'pending',
      })
    });
    if (!patch.ok) return res.status(502).json({ error: await patch.text() });

    const confirmUrl = `https://baroalba.multimove.co.kr/api/workplace-verify?token=${verifyToken}`;
    const displayName = name || '회원';
    const html = `
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
        body: JSON.stringify({
          from: 'baroalba@multimove.co.kr',
          to: [email],
          subject: `[바로알바] 직장인증 메일을 확인해주세요`,
          html
        })
      });
      if (!r.ok) {
        const err = await r.text();
        return res.status(500).json({ error: err });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
