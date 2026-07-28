const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

export default async function handler(req, res) {
  // cron-job.org에서 보내는 시크릿 헤더로 인증
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    'apikey': serviceKey,
    'Authorization': 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
  };

  const closed = await autoCloseExpiredPostings(headers);

  // surge_enabled인 공고 전체 조회
  const fetchRes = await fetch(
    SUPABASE_URL + '/rest/v1/job_postings?surge_enabled=eq.true&status=in.(open,urgent)&select=id,current_wage,base_wage,surge_max_wage,surge_amount,surge_interval_min,updated_at',
    { headers }
  );
  if (!fetchRes.ok) {
    return res.status(500).json({ error: 'DB fetch failed' });
  }
  const surgePostings = await fetchRes.json();
  if (!surgePostings?.length) {
    return res.json({ updated: 0, checked: 0, closed });
  }

  const now = Date.now();
  let updated = 0;
  const results = [];

  for (const p of surgePostings) {
    const intervalMs = (p.surge_interval_min || 30) * 60 * 1000;
    const lastUpdate = new Date(p.updated_at).getTime();
    const elapsed = now - lastUpdate;
    if (elapsed < intervalMs) continue;

    const cyclesPassed = Math.floor(elapsed / intervalMs);
    const maxWage = p.surge_max_wage || 9999999;
    const currentWage = p.current_wage || p.base_wage || 0;
    const newWage = Math.min(currentWage + (p.surge_amount || 1000) * cyclesPassed, maxWage);
    if (newWage <= currentWage) continue;

    const patchRes = await fetch(
      SUPABASE_URL + '/rest/v1/job_postings?id=eq.' + p.id,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          current_wage: newWage,
          status: 'urgent',
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (patchRes.ok) {
      updated++;
      results.push({ id: p.id, from: currentWage, to: newWage, cycles: cyclesPassed });
    }
  }

  return res.json({ updated, checked: surgePostings.length, results, closed });
}

// app.js의 autoCloseExpiredPostings() 와 동일 로직(규칙 7) - 업주가 로그인해야만
// 돌던 걸 전체 공고 대상으로 여기서도 돌린다 (docs/PROGRESS.md "공고 자동 마감" 참고)
async function autoCloseExpiredPostings(headers) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  let closed = 0;

  // 1) work_end_date 기준: 종료일 지난 공고
  const endedRes = await fetch(
    SUPABASE_URL + '/rest/v1/job_postings?status=in.(open,urgent)&work_end_date=not.is.null&work_end_date=lt.' + today,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ status: 'closed' }),
    }
  );
  if (endedRes.ok) closed += (await endedRes.json()).length;

  // 2) start_time + duration_hours 기준: 단건 공고(work_end_date 없음)가 끝난 경우
  const oneshotRes = await fetch(
    SUPABASE_URL + '/rest/v1/job_postings?status=in.(open,urgent)&work_end_date=is.null&start_time=not.is.null&select=id,start_time,duration_hours',
    { headers }
  );
  if (oneshotRes.ok) {
    const oneshots = await oneshotRes.json();
    const expiredIds = oneshots.filter(p => {
      const end = new Date(p.start_time);
      end.setHours(end.getHours() + (p.duration_hours || 0));
      return end < now;
    }).map(p => p.id);
    if (expiredIds.length) {
      const patchRes = await fetch(
        SUPABASE_URL + '/rest/v1/job_postings?id=in.(' + expiredIds.join(',') + ')',
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ status: 'closed' }),
        }
      );
      if (patchRes.ok) closed += expiredIds.length;
    }
  }

  return closed;
}
