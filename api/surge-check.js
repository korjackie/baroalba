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
    return res.json({ updated: 0, checked: 0 });
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

  return res.json({ updated, checked: surgePostings.length, results });
}
