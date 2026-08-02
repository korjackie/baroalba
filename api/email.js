/**
 * 이메일 발송 통합 엔드포인트 (Resend)
 *
 * ⚠️ 왜 합쳤나 (2026-07-28)
 *    Vercel Hobby 플랜은 배포당 서버리스 함수 12개가 상한인데 api/ 가 정확히 12개로
 *    꽉 차 있어서, /job/:id 용 함수를 추가하려면 슬롯을 하나 비워야 했다.
 *    welcome-email.js + report-notify.js 는 둘 다 Resend로 메일 한 통 보내는 같은
 *    계열이라 여기로 합쳤다. 두 핸들러 본문은 원본을 그대로 복붙한 것이다(재해석 금지).
 *
 * ⚠️ 호출하는 쪽 코드는 바꾸지 않았다. vercel.json 리라이트가 옛 주소를 그대로 살린다:
 *      /api/welcome-email  → /api/email?kind=welcome
 *      /api/report-notify  → /api/email?kind=report
 *    그러니 app.js 등에서 기존 주소로 계속 호출해도 정상 동작한다.
 *    이 파일을 나눌 일이 생기면 그 리라이트도 같이 정리할 것.
 */

const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

async function sbGet(path, serviceKey) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
  });
  return r.ok ? r.json() : null;
}

async function sendResend(RESEND_KEY, payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// ══════════════════════════════════════════════════════════════
//  가입 환영 메일 (구 /api/welcome-email)
// ══════════════════════════════════════════════════════════════
async function handleWelcome(req, res, RESEND_KEY) {
  const { email, name, provider } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

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
    const r = await sendResend(RESEND_KEY, {
      from: 'baroalba@multimove.co.kr',
      to: [email],
      subject: `[바로알바] 가입을 환영합니다, ${displayName}님! 🎉`,
      html
    });
    if (!r.ok) {
      const err = await r.text();
      console.error('Resend welcome email error:', err);
      return res.status(500).json({ error: err });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('welcome-email handler error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ══════════════════════════════════════════════════════════════
//  신고 접수 알림 (구 /api/report-notify)
// ══════════════════════════════════════════════════════════════
// reports 의 reporter_id·target_id 는 workers.id 가 아니라 kakao_uid(=auth uid) 다.
// app.js 가 `reporter_id: currentUser.id` / openReportModal('user', uid) 로 넣기 때문.
// 예전엔 id 로만 찾아서 신고 메일의 신고자·대상이 항상 "ID: <uuid>" 로만 나갔다.
// (Phase 59-B 모임 주최자 · Phase 87 관리자 신고목록과 같은 유형의 사본)
// 옛 데이터에 workers.id 가 들어간 행이 있을 수 있어 두 키 모두로 찾는다.
const personFilter = uid => `or=(kakao_uid.eq.${uid},id.eq.${uid})`;

async function handleReport(req, res, RESEND_KEY) {
  const { target_type, target_id, reason, detail, reporter_id } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'reason required' });

  const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 공고 제목 + 업주명 조회
  let targetLabel = `ID: ${target_id}`;
  let reporterLabel = `ID: ${reporter_id}`;

  if (SVC_KEY) {
    try {
      if (target_type === 'job' && target_id) {
        const jobs = await sbGet(`job_postings?id=eq.${target_id}&select=title,biz_name&limit=1`, SVC_KEY);
        if (jobs?.[0]) {
          const j = jobs[0];
          targetLabel = `${j.title || '(제목없음)'}${j.biz_name ? ' · ' + j.biz_name : ''} (${target_id.slice(0, 8)}…)`;
        }
      } else if ((target_type === 'user' || target_type === 'worker') && target_id) {
        const users = await sbGet(`workers?${personFilter(target_id)}&select=name,phone&limit=1`, SVC_KEY);
        if (users?.[0]) {
          const u = users[0];
          targetLabel = `${u.name || '(이름없음)'}${u.phone ? ' · ' + u.phone : ''} (${target_id.slice(0, 8)}…)`;
        }
      } else if ((target_type === 'moim' || target_type === 'gathering') && target_id) {
        const gs = await sbGet(`gatherings?id=eq.${target_id}&select=title,category&limit=1`, SVC_KEY);
        if (gs?.[0]) targetLabel = `${gs[0].title || '(제목없음)'} (${target_id.slice(0, 8)}…)`;
      }
      if (reporter_id) {
        const reporters = await sbGet(`workers?${personFilter(reporter_id)}&select=name,phone&limit=1`, SVC_KEY);
        if (reporters?.[0]) {
          const r = reporters[0];
          reporterLabel = `${r.name || '(이름없음)'}${r.phone ? ' · ' + r.phone : ''} (${reporter_id.slice(0, 8)}…)`;
        }
      }
    } catch (e) {
      console.error('lookup error:', e);
    }
  }

  const typeLabel = target_type === 'job' ? '공고'
    : (target_type === 'moim' || target_type === 'gathering') ? '모임' : '사용자';
  const html = `
    <h2 style="color:#FF4B4B">바로알바 신고 접수</h2>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
      <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold;width:120px">신고 대상</td><td style="padding:8px">${typeLabel} · ${targetLabel}</td></tr>
      <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">신고 사유</td><td style="padding:8px">${reason}</td></tr>
      <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">상세 내용</td><td style="padding:8px">${detail || '(없음)'}</td></tr>
      <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">신고자</td><td style="padding:8px">${reporterLabel}</td></tr>
    </table>
    <p style="font-size:12px;color:#aaa;margin-top:16px">Supabase → Table Editor → reports 에서 확인하세요.</p>
  `;

  try {
    const r = await sendResend(RESEND_KEY, {
      from: 'baroalba@multimove.co.kr',
      to: ['baroalba@multimove.co.kr'],
      subject: `[바로알바] ${typeLabel} 신고 — ${reason} · ${targetLabel}`,
      html
    });
    if (!r.ok) {
      const err = await r.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: err });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('report-notify error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ══════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

  const kind = req.query.kind;
  if (kind === 'welcome') return handleWelcome(req, res, RESEND_KEY);
  if (kind === 'report') return handleReport(req, res, RESEND_KEY);
  return res.status(400).json({ error: 'unknown kind' });
};
