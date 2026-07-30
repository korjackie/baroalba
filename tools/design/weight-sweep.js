#!/usr/bin/env node
/**
 * 프리미엄 디자인 시스템 1차 — 글자 굵기 스윕 (2026-07-31)
 * 설계: docs/superpowers/specs/2026-07-31-premium-design-system-design.md
 *
 * 7종(300~900) → 4종(400/500/600/700). 상대 위계는 보존한 채 전체를 한 단계 내린다.
 *
 * ⚠️ 순차 치환 금지 — 900→700 을 먼저 돌리면 그 결과가 700→500 규칙에 다시 걸려
 *    900이 500까지 내려간다. 반드시 replace 콜백으로 "한 번만" 순회할 것.
 *
 * 사용법:
 *   node tools/design/weight-sweep.js          # 드라이런 (파일 안 건드림)
 *   node tools/design/weight-sweep.js --apply  # 실제 적용
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');

// 대상: 앱 4파일 + 독립 HTML 5개.
// 독립 HTML 은 앱 CSS/JS 를 안 쓰므로 전역 처리가 자동으로 안 따라온다(Phase 66·68-B).
const TARGETS = [
  'assets/css/style.css',
  '바로알바.html',
  'assets/js/app.js',
  'assets/js/app_ui.js',
  'index.html',
  'login.html',
  'admin.html',
  'worker.html',
  'mannnam.html',
];

// 현재값 → 신규값. 상대 순서 보존(900>800>700>600 → 700>600>500>500).
const MAP = {
  '900': '700',  // 제목·시급·로고
  '800': '600',  // 부제·버튼·배지
  '700': '500',  // 메타·본문강조
  '600': '500',
  '500': '400',
  '400': '400',  // 변화 없음(카운트만)
  '300': '400',  // 한글에서 300은 너무 얇다
  '200': '400',
  '100': '400',
  'bold': '500',    // = 700 취급
  'bolder': '500',
  'lighter': '400',
  'normal': '400',
};

// CSS 속성(font-weight: 800) 과 JS 프로퍼티(fontWeight = '800') 양쪽을 잡는다.
const RE_CSS = /(font-weight\s*:\s*)(\d{3}|bold|bolder|lighter|normal)\b/gi;
const RE_JS  = /(fontWeight\s*=\s*['"])(\d{3}|bold|bolder|lighter|normal)(['"])/g;

const tally = {};        // from → count
const perFile = {};      // file → changed count
let totalChanged = 0;
let totalSeen = 0;

for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.log(`  (없음, 건너뜀) ${rel}`); continue; }

  const src = fs.readFileSync(abs, 'utf8');
  let changed = 0;

  const step = (text) => text
    .replace(RE_CSS, (m, head, val) => {
      const key = String(val).toLowerCase();
      const next = MAP[key];
      totalSeen++;
      tally[key] = (tally[key] || 0) + 1;
      if (next === undefined || next === key) return m;
      changed++;
      return head + next;
    })
    .replace(RE_JS, (m, head, val, tail) => {
      const key = String(val).toLowerCase();
      const next = MAP[key];
      totalSeen++;
      tally['js:' + key] = (tally['js:' + key] || 0) + 1;
      if (next === undefined || next === key) return m;
      changed++;
      return head + next + tail;
    });

  const out = step(src);

  perFile[rel] = changed;
  totalChanged += changed;

  if (APPLY && changed > 0) fs.writeFileSync(abs, out, 'utf8');
}

// ── 리포트 ──────────────────────────────────────────────
console.log(APPLY ? '=== 적용 완료 ===' : '=== 드라이런 (파일 미변경) ===');
console.log('');
console.log('현재값별 발견 건수 (→ 신규값):');
Object.keys(tally).sort().forEach(k => {
  const raw = k.replace(/^js:/, '');
  const to = MAP[raw] ?? '(매핑없음)';
  const mark = to === raw ? '  = 변화없음' : '';
  console.log(`  ${k.padEnd(10)} ${String(tally[k]).padStart(5)} 건  →  ${to}${mark}`);
});
console.log('');
console.log('파일별 변경 건수:');
Object.entries(perFile).forEach(([f, n]) => {
  console.log(`  ${String(n).padStart(5)}  ${f}`);
});
console.log('');
console.log(`발견 총계 ${totalSeen} · 변경 총계 ${totalChanged}`);
if (!APPLY) console.log('\n적용하려면: node tools/design/weight-sweep.js --apply');
