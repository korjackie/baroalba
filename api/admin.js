const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';
const ADMIN_EMAILS = ['jackie@multimove.co.kr', 'nicepkw@gmail.com'];

function getEmailFromJWT(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.email || '';
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 관리자 인증
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const email = getEmailFromJWT(token);
  if (!ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: 'Forbidden' });

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const action = req.query.action;

  try {
    // ── 대시보드 통계 ──────────────────────────────────
    if (action === 'stats') {
      const [workers, postings, reports, apps] = await Promise.all([
        sb('workers?select=id', svcKey).then(r => r.json()),
        sb('job_postings?select=id&status=neq.closed', svcKey).then(r => r.json()),
        sb('reports?select=id,status', svcKey).then(r => r.json()),
        sb(`applications?select=id&created_at=gte.${new Date().toISOString().slice(0,10)}`, svcKey).then(r => r.json()),
      ]);
      const pending = (Array.isArray(reports) ? reports : []).filter(r => !r.status || r.status === 'pending').length;
      return res.json({
        workers: Array.isArray(workers) ? workers.length : 0,
        postings: Array.isArray(postings) ? postings.length : 0,
        pending_reports: pending,
        today_apps: Array.isArray(apps) ? apps.length : 0,
      });
    }

    // ── 신고 목록 ──────────────────────────────────────
    if (action === 'reports') {
      const reports = await sb('reports?select=*&order=created_at.desc&limit=100', svcKey).then(r => r.json());
      if (!Array.isArray(reports)) return res.json([]);

      // 대상 공고/사용자 이름 조회
      const jobIds = [...new Set(reports.filter(r => r.target_type === 'job').map(r => r.target_id))];
      const userIds = [...new Set(reports.filter(r => r.target_type === 'user').map(r => r.target_id))];
      const reporterIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];

      const [jobs, targets, reporters] = await Promise.all([
        jobIds.length ? sb(`job_postings?id=in.(${jobIds.join(',')})&select=id,title,biz_name`, svcKey).then(r => r.json()) : [],
        userIds.length ? sb(`workers?id=in.(${userIds.join(',')})&select=id,name,phone`, svcKey).then(r => r.json()) : [],
        reporterIds.length ? sb(`workers?id=in.(${reporterIds.join(',')})&select=id,name,phone`, svcKey).then(r => r.json()) : [],
      ]);

      const jobMap = Object.fromEntries((Array.isArray(jobs) ? jobs : []).map(j => [j.id, j]));
      const userMap = Object.fromEntries((Array.isArray(targets) ? targets : []).map(u => [u.id, u]));
      const repMap = Object.fromEntries((Array.isArray(reporters) ? reporters : []).map(u => [u.id, u]));

      const enriched = reports.map(r => ({
        ...r,
        target_name: r.target_type === 'job'
          ? (jobMap[r.target_id]?.title || r.target_id?.slice(0,8))
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
      await sb(`reports?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
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

    // ── 공고 강제 마감 ─────────────────────────────────
    if (action === 'close_posting' && req.method === 'PATCH') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sb(`job_postings?id=eq.${id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' })
      });
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

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('admin error:', e);
    return res.status(500).json({ error: e.message });
  }
};
