const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

function getEmailFromJWT(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const raw = payload.email || payload.user_metadata?.email || payload.app_metadata?.email || '';
    return raw.toLowerCase().trim();
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

  // 관리자 인증 — app_admins 테이블 기준 (하드코딩 불필요, Supabase에서 직접 관리)
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const email = getEmailFromJWT(token);
  if (!email) return res.status(403).json({ error: 'Forbidden' });

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        mannnamToday, mannnamTotal, restaurants,
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
      ]);
      const pending = (Array.isArray(reports) ? reports : []).filter(r => !r.status || r.status === 'pending').length;
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
      });
    }

    // ── 바로만남 제휴매장 (관리자도 매니저와 동일하게 등록/수정 가능) ──
    if (action === 'barospot_restaurants') {
      const data = await sb(
        'barospot_restaurants?select=*&order=created_at.desc&limit=100',
        svcKey
      ).then(r => r.json());
      return res.json(Array.isArray(data) ? data : []);
    }

    // ── 제휴매장 등록/수정 ──────────────────────────────
    if (action === 'save_restaurant' && (req.method === 'POST' || req.method === 'PATCH')) {
      const { id, name, address, phone, menu_description, female_price, male_price, discount_pct } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: '식당명을 입력해주세요' });
      const payload = {
        name: name.trim(),
        address: (address || '').trim(),
        phone: (phone || '').trim(),
        menu_description: (menu_description || '').trim(),
        female_price: parseInt(female_price) || 0,
        male_price: parseInt(male_price) || 0,
        discount_pct: parseInt(discount_pct) || 5,
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
