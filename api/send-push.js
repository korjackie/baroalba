const webpush = require('web-push');
const { GoogleAuth } = require('google-auth-library');

const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';
const FIREBASE_PROJECT_ID = 'baroalba-32850';

webpush.setVapidDetails(
  'mailto:nicepkw@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function getFCMAccessToken() {
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function sendFCM(fcmToken, title, body, url) {
  const accessToken = await getFCMAccessToken();
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          data: { url: url || '/바로알바.html' },
          android: {
            priority: 'high',
            notification: { sound: 'default', channel_id: 'baroalba_channel' }
          }
        }
      })
    }
  );
  return res.ok;
}

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
    // 1. FCM 토큰 조회 → FCM으로 발송 (앱 종료 시에도 수신)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const fcmRes = await fetch(
        `${SUPABASE_URL}/rest/v1/fcm_tokens?user_id=eq.${user_id}&select=token&limit=1`,
        { headers: adminHeaders }
      );
      const fcmData = await fcmRes.json();
      if (fcmData?.length && fcmData[0]?.token) {
        const ok = await sendFCM(fcmData[0].token, title, body, url);
        if (ok) return res.json({ ok: true, via: 'fcm' });
      }
    }

    // 2. FCM 실패 시 Web Push 폴백
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${user_id}&select=subscription&limit=1`,
      { headers: adminHeaders }
    );
    const subData = await subRes.json();
    if (!subData?.length || !subData[0]?.subscription) {
      return res.status(404).json({ error: 'No push endpoint found' });
    }

    const subscription = subData[0].subscription;
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, url: url || '/' }));
    return res.json({ ok: true, via: 'webpush' });

  } catch (e) {
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
