module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, provider } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

  const displayName = name || '회원';
  const providerLabel = provider === 'kakao' ? '카카오' : provider === 'naver' ? '네이버' : '소셜';

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

    <!-- 헤더 -->
    <div style="background:#C8102E;padding:32px 24px 28px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px">바로알바</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px">실시간 초단기 알바 매칭</div>
    </div>

    <!-- 본문 -->
    <div style="padding:32px 24px">
      <div style="font-size:22px;font-weight:900;color:#111;margin-bottom:8px">환영합니다, ${displayName}님! 🎉</div>
      <div style="font-size:14px;color:#555;line-height:1.7;margin-bottom:24px">
        ${providerLabel} 계정으로 가입해 주셔서 감사합니다.<br>
        바로알바에서 지금 바로 내 주변 알바를 찾아보세요.
      </div>

      <!-- 주요 기능 카드 -->
      <div style="background:#FFF5F5;border-radius:14px;padding:20px;margin-bottom:20px">
        <div style="font-size:12px;font-weight:800;color:#C8102E;letter-spacing:0.5px;margin-bottom:14px">바로알바로 할 수 있는 것들</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;background:#C8102E;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🗺️</div>
            <div>
              <div style="font-size:13px;font-weight:800;color:#222">지도 기반 알바 탐색</div>
              <div style="font-size:12px;color:#888;margin-top:1px">내 위치 주변 공고 실시간 확인</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;background:#C8102E;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⚡</div>
            <div>
              <div style="font-size:13px;font-weight:800;color:#222">바로 지원하기</div>
              <div style="font-size:12px;color:#888;margin-top:1px">클릭 한 번으로 즉시 지원</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;background:#C8102E;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💬</div>
            <div>
              <div style="font-size:13px;font-weight:800;color:#222">업주와 실시간 채팅</div>
              <div style="font-size:12px;color:#888;margin-top:1px">지원 후 바로 연락 가능</div>
            </div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <a href="https://baroalba.multimove.co.kr" style="display:block;background:#C8102E;color:#fff;text-align:center;padding:16px;border-radius:14px;font-size:16px;font-weight:900;text-decoration:none;margin-bottom:16px">
        지금 바로 시작하기 →
      </a>

      <div style="font-size:12px;color:#aaa;text-align:center;line-height:1.6">
        앱을 홈 화면에 추가하면 더 빠르게 이용할 수 있어요.<br>
        문의: baroalba@multimove.co.kr
      </div>
    </div>

    <!-- 푸터 -->
    <div style="background:#f8f8f8;padding:16px 24px;border-top:1px solid #eee">
      <div style="font-size:11px;color:#bbb;text-align:center;line-height:1.7">
        MultiMOVE 주식회사 · 대표: 박근욱<br>
        사업자등록번호: 265-87-03885<br>
        본 메일은 바로알바 가입 시 자동 발송됩니다.
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
        subject: `[바로알바] 가입을 환영합니다, ${displayName}님! 🎉`,
        html
      })
    });
    if (!r.ok) {
      const err = await r.text();
      console.error('Resend welcome email error:', err);
      return res.status(500).json({ error: err });
    }
    return res.status(200).json({ ok: true });
  } catch(e) {
    console.error('welcome-email handler error:', e);
    return res.status(500).json({ error: e.message });
  }
};
