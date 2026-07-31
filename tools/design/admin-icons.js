/**
 * admin.html 메뉴 행 아이콘(.list-icon) 17개를 이모지 → 인라인 SVG 로 교체.
 * 앱은 Phase 74 에 같은 정리를 했는데 admin 만 빠져 있었다.
 * ⚠️ 카테고리 이모지(🍻🍜🍕🎨🎮🏋 = 모임 분야)·상태점(🟢🟡⚪⚫)·문구 안 ✅ 는
 *    데이터/의미를 나르므로 건드리지 않는다. .list-icon 안에 든 것만 대상.
 * admin.html 은 app.js 를 안 읽으므로 icon() 을 못 쓴다 → path 만 복붙해 인라인.
 */
const fs = require('fs');
const F = 'G:/내 드라이브/MultiMOVE/2. Projects/바로알바/prototype/admin.html';

// app.js ICON_PATHS 에서 그대로 가져온 것 (규칙 7 — 재해석 금지)
const P = {
  clip:   '<path d="M9 4.5H6.5A1.5 1.5 0 005 6v14a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 20V6a1.5 1.5 0 00-1.5-1.5H15"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/>',
  warn:   '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  brief:  '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M8.5 7V5a1.5 1.5 0 011.5-1.5h4A1.5 1.5 0 0115.5 5v2"/>',
  users:  '<circle cx="9.5" cy="8" r="3.2"/><path d="M3 20a6.5 6.5 0 0113 0"/><path d="M16.5 5.2a3.2 3.2 0 010 5.6M17.5 14.2a6.5 6.5 0 013.5 5.8"/>',
  pin:    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1116 0z"/><circle cx="12" cy="10" r="2.8"/>',
  user:   '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0115 0"/>',
  megaph: '<path d="M4 10v4a1.5 1.5 0 001.5 1.5H8l6 4.5V5.5L8 10H5.5A1.5 1.5 0 004 11.5z"/><path d="M17.5 9a4.5 4.5 0 010 6"/>',
  bolt:   '<path d="M13.5 2 4 13.4h6.2L9.8 22 20 10.4h-6.4L13.5 2z"/>',
  school: '<path d="M12 3.5L2.5 8.5 12 13.5l9.5-5L12 3.5z"/><path d="M6 11v5.5c0 1.7 2.7 3 6 3s6-1.3 6-3V11"/>',
  shield: '<path d="M12 2.8l7.5 3v6c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5v-6l7.5-3z"/>',
  trash:  '<path d="M3.5 6.5h17M9 6.5V4.2h6v2.3M6 6.5l1 13.3h10l1-13.3"/>',
  // 앱에 없어서 같은 선굵기·둥근끝 규칙으로 새로 그린 것
  store:  '<path d="M4 9.5V20h16V9.5"/><path d="M3 9.5l1.6-5.2h14.8L21 9.5a2.6 2.6 0 01-4.5 1.8 2.6 2.6 0 01-4.5 0 2.6 2.6 0 01-4.5 0A2.6 2.6 0 013 9.5z"/>',
  ticket: '<path d="M3.5 8.5V6.2h17v2.3a2.5 2.5 0 000 5v2.3h-17v-2.3a2.5 2.5 0 000-5z"/><path d="M13 6.2v11.6"/>',
};
const FILLED = new Set(['bolt']); // 앱에서 fill:1 인 것

const svg = (name) => {
  const d = P[name];
  const fill = FILLED.has(name) ? 'currentColor' : 'none';
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
};

// 이모지 → 아이콘 이름. 같은 이모지가 여러 뜻이면 줄 순서로 구분한다.
const MAP = [
  ['📋', 'clip'],    // 알바 공고 관리
  ['🚨', 'warn'],    // 신고 처리
  ['💼', 'brief'],   // 직장인증 심사
  ['🏕️', 'users'],   // 모임 관리
  ['🏕', 'users'],
  ['🤝', 'users'],   // 바로미팅 / 모임 분야
  ['📍', 'pin'],     // 바로스팟
  ['🍷', 'store'],   // 제휴 매장
  ['👨‍💼', 'user'],   // 매니저 권한
  ['👨', 'user'],
  ['📮', 'megaph'],  // 개설 요청함
  ['🎫', 'ticket'],  // 프로모션 쿠폰
  ['🎟️', 'ticket'],  // 이용권 가격
  ['🎟', 'ticket'],
  ['⚡', 'bolt'],    // 바로알바 업종
  ['📚', 'school'],  // 레슨/과외 과목
  ['🛡️', 'shield'],  // 최고 관리자
  ['🛡', 'shield'],
  ['🧹', 'trash'],   // 탈퇴자 정리
];

let s = fs.readFileSync(F, 'utf8');
let n = 0;
const miss = [];

// .list-icon 안의 내용만 교체 — 바깥 이모지는 절대 안 건드린다
s = s.replace(/(<div class="list-icon">)([\s\S]*?)(<\/div>)/g, (m, open, body, close) => {
  if (/<svg/.test(body)) return m;                 // 이미 처리됨
  const key = body.trim();
  const hit = MAP.find(([e]) => key === e);
  if (!hit) { miss.push(key); return m; }
  n++;
  return open + svg(hit[1]) + close;
});

if (process.argv.includes('--apply')) fs.writeFileSync(F, s, 'utf8');
console.log((process.argv.includes('--apply') ? '적용' : '드라이런') + ` — .list-icon ${n}개 교체`);
if (miss.length) console.log('  매핑 못 찾음:', miss.join(' '));
