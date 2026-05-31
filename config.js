// ════════════════════════════════════════════════════════════
//  바로알바 — 환경설정
//  Supabase 프로젝트 생성 후 여기에 값을 입력하세요
// ════════════════════════════════════════════════════════════

const APP_CONFIG = {

  // ── Supabase ─────────────────────────────────────────────
  // app.supabase.com → Project Settings → API
  SUPABASE_URL:      'https://onwvbmllpycgswfzywjv.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ud3ZibWxscHljZ3N3Znp5d2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDMyNzksImV4cCI6MjA5NTc3OTI3OX0.CbwhyfqCZp_jjMbHUESVzbPDAZLNV2lpniUkouqLLmQ',

  // ── SNS OAuth ────────────────────────────────────────────
  // (Supabase Auth 설정 후 여기는 비워도 됩니다 — Supabase가 처리)
  KAKAO_JS_KEY:     '',   // developers.kakao.com → JavaScript 키
  NAVER_CLIENT_ID:  '',   // developers.naver.com → Client ID
  GOOGLE_CLIENT_ID: '',   // console.cloud.google.com → OAuth 클라이언트 ID

  // ── 앱 설정 ───────────────────────────────────────────────
  APP_NAME:    '바로알바',
  DEFAULT_LAT: 35.1520,   // 지도 기본 위치 (부산 하단동)
  DEFAULT_LNG: 128.9731,
  DEFAULT_RADIUS_M: 3000, // 기본 반경 3km
};
