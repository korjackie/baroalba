const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

async function sbGet(path, serviceKey) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
  });
  return r.ok ? r.json() : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { target_type, target_id, reason, detail, reporter_id } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'reason required' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

  // 공고 제목 + 업주명 조회
  let targetLabel = `ID: ${target_id}`;
  let reporterLabel = `ID: ${reporter_id}`;

  if (SVC_KEY) {
    try {
      if (target_type === 'job' && target_id) {
        const jobs = await sbGet(`job_postings?id=eq.${target_id}&select=title,biz_name&limit=1`, SVC_KEY);
        if (jobs?.[0]) {
          const j = jobs[0];
          targetLabel = `${j.title || '(제목없음)'}${j.biz_name ? ' · ' + j.biz_name : ''} (${target_id.slice(0,8)}…)`;
        }
      } else if (target_type === 'user' && target_id) {
        const users = await sbGet(`workers?id=eq.${target_id}&select=name,phone&limit=1`, SVC_KEY);
        if (users?.[0]) {
          const u = users[0];
          targetLabel = `${u.name || '(이름없음)'}${u.phone ? ' · ' + u.phone : ''} (${target_id.slice(0,8)}…)`;
        }
      }
      if (reporter_id) {
        const reporters = await sbGet(`workers?id=eq.${reporter_id}&select=name,phone&limit=1`, SVC_KEY);
        if (reporters?.[0]) {
          const r = reporters[0];
          reporterLabel = `${r.name || '(이름없음)'}${r.phone ? ' · ' + r.phone : ''} (${reporter_id.slice(0,8)}…)`;
        }
      }
    } catch(e) {
      console.error('lookup error:', e);
    }
  }

  const typeLabel = target_type === 'job' ? '공고' : '사용자';
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
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'baroalba@multimove.co.kr',
        to: ['baroalba@multimove.co.kr'],
        subject: `[바로알바] ${typeLabel} 신고 — ${reason} · ${targetLabel}`,
        html
      })
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
};
