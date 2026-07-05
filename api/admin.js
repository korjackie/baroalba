const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';
const ADMIN_EMAILS = ['jackie@multimove.co.kr', 'nicepkw@gmail.com', 'nicepkw@naver.com'];

function getEmailFromJWT(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.email || payload.user_metadata?.email || '';
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
      const [workers, postings, reports, apps, moims, bizRaw] = await Promise.all([
        sb('workers?select=id', svcKey).then(r => r.json()),
        sb('job_postings?select=id&status=neq.closed', svcKey).then(r => r.json()),
        sb('reports?select=id,status', svcKey).then(r => r.json()),
        sb(`applications?select=id&created_at=gte.${new Date().toISOString().slice(0,10)}`, svcKey).then(r => r.json()),
        sb('gatherings?select=id&status=eq.open', svcKey).then(r => r.json()),
        sb('businesses?select=id', svcKey).then(r => r.json()).catch(() => []),
      ]);
      const pending = (Array.isArray(reports) ? reports : []).filter(r => !r.status || r.status === 'pending').length;
      return res.json({
        workers: Array.isArray(workers) ? workers.length : 0,
        postings: Array.isArray(postings) ? postings.length : 0,
        pending_reports: pending,
        today_apps: Array.isArray(apps) ? apps.length : 0,
        moims: Array.isArray(moims) ? moims.length : 0,
        businesses: Array.isArray(bizRaw) ? bizRaw.length : 0,
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
          }
        } catch {}
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
      const data = await sb('job_categories?select=name,icon,display_order,active&order=display_order', svcKey).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 카테고리 추가 ─────────────────────────────────────────
    if (action === 'add_category' && req.method === 'POST') {
      const { name, icon, display_order } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const r = await sb('job_categories', svcKey, {
        method: 'POST',
        body: JSON.stringify({ name, icon: icon || '📋', display_order: display_order || 99, active: true }),
        headers: { 'Prefer': 'return=representation' }
      });
      return res.json(await r.json());
    }

    // ── 카테고리 수정 ─────────────────────────────────────────
    if (action === 'update_category' && req.method === 'PATCH') {
      const { name, newName, icon } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const updates = {};
      if (newName && newName !== name) updates.name = newName;
      if (icon !== undefined) updates.icon = icon;
      await sb(`job_categories?name=eq.${encodeURIComponent(name)}`, svcKey, {
        method: 'PATCH', body: JSON.stringify(updates)
      });
      return res.json({ ok: true });
    }

    // ── 카테고리 삭제 (soft) ──────────────────────────────────
    if (action === 'delete_category' && req.method === 'PATCH') {
      const { name } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      await sb(`job_categories?name=eq.${encodeURIComponent(name)}`, svcKey, {
        method: 'PATCH', body: JSON.stringify({ active: false })
      });
      return res.json({ ok: true });
    }

    // ── 모임 목록 ──────────────────────────────────────────────
    if (action === 'moims') {
      const data = await sb(
        'gatherings?select=id,title,category,gathering_date,host_id,current_count,max_count,status,is_public,location_name,created_at&order=created_at.desc&limit=200',
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
      const { id, title, category, gathering_date, location_name, max_count, is_public } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const updates = {};
      if (title !== undefined) updates.title = title.trim();
      if (category !== undefined) updates.category = category;
      if (gathering_date !== undefined) updates.gathering_date = gathering_date || null;
      if (location_name !== undefined) updates.location_name = location_name;
      if (max_count !== undefined) updates.max_count = parseInt(max_count) || 10;
      if (is_public !== undefined) updates.is_public = is_public;
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
