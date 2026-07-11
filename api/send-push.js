const { GoogleAuth } = require('google-auth-library');

const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';
const FIREBASE_PROJECT_ID = 'baroalba-32850';

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

async function sendFCM(fcmToken, title, body, url, appId, type) {
  const accessToken = await getFCMAccessToken();
  // data-only 메시지로 전송 - 최상위 notification 필드가 있으면 앱이 백그라운드/종료
  // 상태일 때 안드로이드 시스템이 onMessageReceived()를 거치지 않고 기본 알림을
  // 자동 표시해버려서, 인라인 답장 액션 버튼을 붙이는 커스텀 코드가 항상 스킵됨
  // (포그라운드에서만 우연히 동작하던 버그의 원인). data-only로 보내면 앱 상태와
  // 무관하게 항상 커스텀 코드가 실행된다.
  const fcmData = { title: title || '바로알바', body: body || '', url: url || '/바로알바.html' };
  if (appId) fcmData.app_id = String(appId);
  if (type) fcmData.type = type;

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
          data: fcmData,
          android: { priority: 'high' }
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

  const { user_id, title, body, url, app_id, type } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // FCM 토큰 조회 → FCM으로 발송
    const fcmRes = await fetch(
      `${SUPABASE_URL}/rest/v1/fcm_tokens?user_id=eq.${user_id}&select=token&limit=1`,
      { headers: adminHeaders }
    );
    const fcmData = await fcmRes.json();
    if (!fcmData?.length || !fcmData[0]?.token) {
      return res.status(404).json({ error: 'No FCM token found' });
    }
    const ok = await sendFCM(fcmData[0].token, title, body, url, app_id, type);
    if (ok) return res.json({ ok: true, via: 'fcm' });
    return res.status(500).json({ error: 'FCM send failed' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
