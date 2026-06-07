// Vercel 서버리스 함수 — 네이버 OAuth 콜백 처리
// 1. Naver access_token으로 프로필 조회 (CORS 없이)
// 2. Supabase Admin API로 계정 생성/확인 (이메일 확인 자동 처리)
// 3. 세션 반환

const SUPABASE_URL     = 'https://onwvbmllpycgswfzywjv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ud3ZibWxscHljZ3N3Znp5d2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDMyNzksImV4cCI6MjA5NTc3OTI3OX0.CbwhyfqCZp_jjMbHUESVzbPDAZLNV2lpniUkouqLLmQ';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { access_token } = req.query;
  if (!access_token) return res.status(400).json({ error: 'access_token required' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set in Vercel env' });

  try {
    // ── 1. Naver 프로필 조회 ──────────────────────────────────
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const profileData = await profileRes.json();

    if (profileData.resultcode !== '00') {
      return res.status(401).json({ error: '네이버 프로필 조회 실패: ' + (profileData.message || 'unknown') });
    }

    const { id: naverId, email: naverEmail, name, mobile, gender: naverGender } = profileData.response;
    const email       = naverEmail || `naver_${naverId}@baroalba.kr`;
    const password    = `naver_${naverId}_baro2024!`;
    const phone       = (mobile || '').replace(/-/g, '');
    const displayName = name || '네이버사용자';
    // 네이버 성별: 'M'→'male', 'F'→'female', 'U'→미제공
    const gender = naverGender === 'M' ? 'male' : naverGender === 'F' ? 'female' : null;

    // ── 2. 기존 계정 확인 (비밀번호 로그인은 클라이언트에서 SDK로 처리) ────
    const siRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const siData = await siRes.json();
    // 기존 계정 로그인 성공 → 클라이언트가 signInWithPassword 로 직접 처리
    if (siData.access_token) return res.json({ email, password });

    // ── 3. Admin API로 기존 유저 찾기 ────────────────────────
    const adminHeaders = {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    };

    // 이메일로 유저 검색 (per_page 최대 1000)
    const listRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders });
    const listData = await listRes.json();
    const existing = (listData.users || []).find(u => u.email === email);

    if (existing) {
      // 이메일 확인 + 비밀번호 재설정
      const upRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          email_confirm: true,
          password,
          user_metadata: {
            full_name: displayName,
            phone,
            provider: 'naver',
            naver_id: naverId,
            baroalba_role: existing.user_metadata?.baroalba_role || ''
          }
        })
      });
      if (!upRes.ok) {
        const err = await upRes.json();
        return res.status(500).json({ error: '계정 업데이트 실패: ' + JSON.stringify(err) });
      }
    } else {
      // 신규 계정 생성 (이메일 자동 확인)
      const crRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          email, password, email_confirm: true,
          user_metadata: { full_name: displayName, phone, gender, provider: 'naver', naver_id: naverId, baroalba_role: '' }
        })
      });
      const crData = await crRes.json();
      if (!crRes.ok) return res.status(500).json({ error: '계정 생성 실패: ' + JSON.stringify(crData) });
    }

    // ── 4. 계정 준비 완료 → 클라이언트가 signInWithPassword로 직접 처리
    // (setSession 대신 SDK 직접 로그인으로 403 문제 해결)
    return res.json({ email, password });

  } catch (e) {
    console.error('naver-auth error:', e);
    return res.status(500).json({ error: e.message });
  }
}
