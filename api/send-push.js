import webpush from 'web-push';

const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';

webpush.setVapidDetails(
  'mailto:nicepkw@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, title, body, url } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // 구독 정보 조회
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${user_id}&select=subscription&limit=1`,
      { headers: adminHeaders }
    );
    const subData = await subRes.json();
    if (!subData?.length || !subData[0]?.subscription) {
      return res.status(404).json({ error: 'No push subscription found' });
    }

    const subscription = subData[0].subscription;
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, url: url || '/' }));
    return res.json({ ok: true });
  } catch (e) {
    // 410 Gone = 구독 만료 → DB에서 삭제
    if (e.statusCode === 410) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${user_id}`,
        { method: 'DELETE', headers: adminHeaders }
      );
      return res.status(410).json({ error: 'Subscription expired, removed' });
    }
    return res.status(500).json({ error: e.message });
  }
}
