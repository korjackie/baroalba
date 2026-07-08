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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = getUserIdFromJWT(token);
  if (!userId) return res.status(401).json({ error: '로그인이 필요합니다' });

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  async function myTicketTotal() {
    const rows = await sb(`coupon_redemptions?user_id=eq.${userId}&select=coupons(ticket_count)`, svcKey).then(r => r.json());
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((sum, r) => sum + (r.coupons?.ticket_count || 0), 0);
  }

  try {
    if (req.method === 'GET' && req.query.action === 'my_tickets') {
      return res.json({ tickets: await myTicketTotal() });
    }

    if (req.method === 'POST') {
      const code = (req.body?.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: '쿠폰 코드를 입력해주세요' });

      const coupons = await sb(`coupons?code=eq.${encodeURIComponent(code)}&select=*&limit=1`, svcKey).then(r => r.json());
      const coupon = Array.isArray(coupons) ? coupons[0] : null;
      if (!coupon) return res.status(404).json({ error: '존재하지 않는 쿠폰 코드입니다' });
      if (!coupon.is_active) return res.status(400).json({ error: '더 이상 사용할 수 없는 쿠폰입니다' });
      if (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) {
        return res.status(400).json({ error: '유효기간이 지난 쿠폰입니다' });
      }

      const myRedemptions = await sb(
        `coupon_redemptions?coupon_id=eq.${coupon.id}&user_id=eq.${userId}&select=id`, svcKey
      ).then(r => r.json());
      if (Array.isArray(myRedemptions) && myRedemptions.length >= coupon.max_uses_per_user) {
        return res.status(400).json({ error: '이미 사용한 쿠폰입니다' });
      }

      if (coupon.max_uses !== null && coupon.max_uses !== undefined) {
        const allRedemptions = await sb(`coupon_redemptions?coupon_id=eq.${coupon.id}&select=id`, svcKey).then(r => r.json());
        if (Array.isArray(allRedemptions) && allRedemptions.length >= coupon.max_uses) {
          return res.status(400).json({ error: '모두 소진된 쿠폰입니다' });
        }
      }

      const insertRes = await sb('coupon_redemptions', svcKey, {
        method: 'POST',
        body: JSON.stringify({ coupon_id: coupon.id, user_id: userId })
      });
      if (!insertRes.ok) return res.status(502).json({ error: await insertRes.text() });

      await sb(`coupons?id=eq.${coupon.id}`, svcKey, {
        method: 'PATCH',
        body: JSON.stringify({ used_count: (coupon.used_count || 0) + 1 })
      });

      return res.json({ ok: true, granted: coupon.ticket_count, tickets: await myTicketTotal() });
    }

    return res.status(404).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
