// Vercel 서버리스 함수 — 네이버 OAuth 콜백 처리
// 1. Naver access_token으로 프로필 조회 (CORS 없이)
// 2. Supabase Admin API로 계정 생성/확인 (이메일 확인 자동 처리)
// 3. 세션 반환

const SUPABASE_URL     = 'https://onwvbmllpycgswfzywjv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ud3ZibWxscHljZ3N3Znp5d2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDMyNzksImV4cCI6MjA5NTc3OTI3OX0.CbwhyfqCZp_jjMbHUESVzbPDAZLNV2lpniUkouqLLmQ';

// 전화번호 표기 흔들림(010-1234-5678 / 01012345678) 모두 매칭되도록 후보를 만든다
function _phoneVariants(raw) {
  const d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.length < 10) return [];
  const set = new Set([d]);
  if (d.length === 11) set.add(`${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`);
  if (d.length === 10) set.add(`${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`);
  return [...set];
}
function _maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '';
  return local.slice(0, 2) + '*'.repeat(Math.max(1, local.length - 2)) + '@' + domain;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── 아이디(이메일) 찾기 ──────────────────────────────────
  // 예전엔 login.html이 비로그인 상태에서 workers.email을 전화번호로 직접 조회했다.
  // 즉 아무나 전화번호만 넣으면 가입 이메일을 알아낼 수 있었고, 응답에 원본 이메일이
  // 그대로 실려왔다(마스킹은 클라이언트에서만). workers 개인정보 컬럼을 anon에서
  // 차단(2026-07-21)하면서 이 경로를 서버로 옮기고, 마스킹된 값만 내보낸다.
  if (req.query.action === 'find_id') {
    const raw = req.method === 'POST' ? (req.body?.phone) : req.query.phone;
    const variants = _phoneVariants(raw);
    if (!variants.length) return res.status(400).json({ error: '전화번호를 정확히 입력해주세요.' });

    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!svcKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' });

    const orExpr = variants.map(v => `phone.eq.${encodeURIComponent(v)}`).join(',');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/workers?select=email&or=(${orExpr})&limit=1`, {
      headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` }
    });
    if (!r.ok) return res.status(502).json({ error: await r.text() });
    const rows = await r.json();
    const email = Array.isArray(rows) && rows[0]?.email;
    // 원본 이메일은 절대 내보내지 않는다
    return res.json(email ? { found: true, masked: _maskEmail(email) } : { found: false });
  }

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

    // ── 2. Admin API로 기존 유저 찾기 (항상 메타데이터 최신화) ──────────
    const adminHeaders = {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    };

    // 이메일로 유저 검색 (per_page 최대 1000)
    const listRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders });
    const listData = await listRes.json();
    const existing = (listData.users || []).find(u => u.email === email);

    // 공통 메타데이터 (Naver 최신 프로필 항상 반영)
    const userMeta = {
      full_name: displayName,
      phone,
      gender,
      provider: 'naver',
      naver_id: naverId,
      baroalba_role: existing?.user_metadata?.baroalba_role || ''
    };

    if (existing) {
      // 기존 유저: 비밀번호 + 메타데이터 업데이트 (name/phone/gender 항상 최신화)
      const upRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ email_confirm: true, password, user_metadata: userMeta })
      });
      if (!upRes.ok) {
        const err = await upRes.json();
        return res.status(500).json({ error: '계정 업데이트 실패: ' + JSON.stringify(err) });
      }
    } else {
      // 신규 유저: 계정 생성 (이메일 자동 확인)
      const crRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: userMeta })
      });
      const crData = await crRes.json();
      if (!crRes.ok) return res.status(500).json({ error: '계정 생성 실패: ' + JSON.stringify(crData) });
    }

    // ── 3. 계정 준비 완료 → 클라이언트가 signInWithPassword로 직접 처리
    return res.json({ email, password });

  } catch (e) {
    console.error('naver-auth error:', e);
    return res.status(500).json({ error: e.message });
  }
}
