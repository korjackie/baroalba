// api/mannam-owner.js — 업주가 자기 매장을 바로만남 미팅 스팟으로 셀프 등록
// (관리자 인증이 아닌 일반 로그인 사용자 인증 - api/coupon.js와 동일한 패턴)
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = getUserIdFromJWT(token);
  if (!userId) return res.status(401).json({ error: '로그인이 필요합니다' });

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const bizRows = await sb(`businesses?kakao_uid=eq.${userId}&select=id,name,phone`, svcKey).then(r => r.json());
    const biz = Array.isArray(bizRows) ? bizRows[0] : null;
    if (!biz) return res.status(403).json({ error: '업주 계정에서만 이용할 수 있습니다' });

    if (req.method === 'GET' && req.query.action === 'my_spot') {
      const rows = await sb(`barospot_restaurants?business_id=eq.${biz.id}&select=*&limit=1`, svcKey).then(r => r.json());
      return res.json({ spot: Array.isArray(rows) ? rows[0] || null : null, bizName: biz.name });
    }

    if (req.method === 'POST' && req.query.action === 'submit_spot') {
      const { name, address, phone, menu_description, female_price, male_price, discount_pct } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: '매장명을 입력해주세요' });
      if (!address || !address.trim()) return res.status(400).json({ error: '주소를 입력해주세요' });

      const existing = await sb(`barospot_restaurants?business_id=eq.${biz.id}&select=id`, svcKey).then(r => r.json());
      const existingRow = Array.isArray(existing) ? existing[0] : null;

      const payload = {
        name: name.trim(),
        address: address.trim(),
        phone: (phone || '').trim(),
        menu_description: (menu_description || '').trim(),
        female_price: parseInt(female_price) || 0,
        male_price: parseInt(male_price) || 0,
        discount_pct: parseInt(discount_pct) || 0,
      };

      let r;
      if (existingRow) {
        // 이미 신청/승인된 건 수정 - 승인 상태(is_active)는 그대로 유지
        r = await sb(`barospot_restaurants?id=eq.${existingRow.id}`, svcKey, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        // 신규 신청은 항상 비활성(승인대기) 상태로 시작 - 관리자가 검토 후 활성화
        payload.business_id = biz.id;
        payload.is_active = false;
        r = await sb('barospot_restaurants', svcKey, { method: 'POST', body: JSON.stringify(payload) });
      }
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      const rows = await r.json();
      return res.json({ ok: true, spot: Array.isArray(rows) ? rows[0] : null });
    }

    return res.status(404).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
