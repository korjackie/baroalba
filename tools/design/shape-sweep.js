#!/usr/bin/env node
/**
 * 프리미엄 디자인 시스템 3차 — 모서리 · 그림자 스윕 (2026-07-31)
 * 설계: docs/superpowers/specs/2026-07-31-premium-design-system-design.md
 *
 * 모서리 23종 → 4종(+pill/원형 유지) · 그림자 82종 → 4종.
 *
 * ⚠️ 유색 그림자는 건드리지 않는다 — 빨강 FAB, 보라 모임, 분홍 위치버튼 같은
 *    브랜드 글로우는 "떠 있는 높이"가 아니라 "강조"를 나르는 색이다.
 *    중립 그림자(rgba(0,0,0,…))만 단계화한다.
 *
 * ⚠️ 그림자를 blur 만으로 나누면 토글 노브가 사라진다.
 *    `0 1px 3px rgba(0,0,0,0.3)` 처럼 blur 는 작은데 진한 것들은 흰 노브를 회색
 *    트랙 위에 띄우는 용도라, 카드용 .06 으로 내리면 안 보인다. 그래서 alpha 도 본다.
 *
 * 사용법:
 *   node tools/design/shape-sweep.js          # 드라이런
 *   node tools/design/shape-sweep.js --apply
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');

const TARGETS = [
  'assets/css/style.css',
  '바로알바.html',
  'assets/js/app.js',
  'assets/js/app_ui.js',
  'login.html',
  'admin.html',
  'worker.html',
  'mannnam.html',
];

// ── 모서리: px 값을 4단계로 흡수 ──────────────────────────────
function radiusToken(px) {
  const n = parseInt(px, 10);
  if (n >= 99)  return null;          // pill — 그대로 둔다
  if (n <= 9)   return 'var(--r-sm)';  // 8px  칩·작은 버튼
  if (n <= 13)  return 'var(--r)';     // 12px 카드·입력
  if (n <= 18)  return 'var(--r-lg)';  // 16px 큰 카드·패널
  return 'var(--r-xl)';                // 20px 시트·모달
}

// ── 그림자: 중립만 4단계로 ────────────────────────────────────
function shadowToken(val) {
  const v = val.trim();
  if (/^(none|inset)/i.test(v)) return null;
  if (/#[0-9a-fA-F]{3,6}/.test(v)) return null;              // hex 링 — 개별 처리
  // 색이 rgba(0,0,0,…) 가 아니면 브랜드 글로우 → 보존
  const colors = v.match(/rgba?\([^)]+\)/g) || [];
  if (!colors.length) return null;
  for (const c of colors) {
    const nums = c.match(/[\d.]+/g) || [];
    if (!(nums[0] === '0' && nums[1] === '0' && nums[2] === '0')) return null;
  }
  if (colors.length > 1) return null;                        // 다중 레이어 — 보존
  const alpha = parseFloat((colors[0].match(/[\d.]+/g) || [])[3] ?? '1');
  // "0 1px 4px" 처럼 offset-x, offset-y, blur 순 — blur 는 세번째 값.
  // ⚠️ 첫 offset 은 보통 단위 없는 `0` 이라 /px/ 로만 뽑으면 자리가 한 칸 밀려
  //    `0 12px 32px`(blur 32)를 blur 0 으로 읽는다. 색을 걷어낸 뒤 토큰으로 센다.
  const geom = v.replace(/rgba?\([^)]*\)/g, ' ').trim();
  const parts = geom.split(/\s+/).filter(Boolean);
  const blur = parts.length >= 3 ? parseFloat(parts[2]) : 0;
  if (blur <= 4)  return alpha >= 0.15 ? 'var(--shadow-xs)' : 'var(--shadow-sm)';
  if (blur <= 12) return 'var(--shadow-md)';
  return 'var(--shadow-lg)';
}

const stat = {};
const perFile = {};
const kept = [];
let total = 0;
const bump = k => { stat[k] = (stat[k] || 0) + 1; total++; };

for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  let s = fs.readFileSync(abs, 'utf8');
  const before = s;
  let n = 0;

  // 1) border-radius — 단일값·다중값 모두. 값 안의 각 px 를 개별 흡수한다.
  s = s.replace(/(border-radius\s*:\s*)([^;"'}\n]+)/gi, (m, head, val) => {
    if (/%/.test(val)) return m;                    // 50% 원형 — 유지
    if (!/\d+px/.test(val)) return m;
    let touched = false;
    const nv = val.replace(/(\d+)px/g, (mm, px) => {
      const tok = radiusToken(px);
      if (!tok) return mm;
      touched = true;
      return tok;
    });
    if (!touched) return m;
    n++; bump(`border-radius: ${val.trim()}  →  ${nv.trim()}`);
    return head + nv;
  });

  // 2) box-shadow
  s = s.replace(/(box-shadow\s*:\s*)([^;"'}\n]+)/gi, (m, head, val) => {
    const tok = shadowToken(val);
    if (!tok) { kept.push(`${rel}  ${val.trim().slice(0, 62)}`); return m; }
    n++; bump(`box-shadow → ${tok}`);
    return head + tok;
  });

  perFile[rel] = n;
  if (APPLY && s !== before) fs.writeFileSync(abs, s, 'utf8');
}

console.log(APPLY ? '=== 적용 완료 ===' : '=== 드라이런 (파일 미변경) ===');
console.log('\n[그림자]');
Object.keys(stat).filter(k => k.startsWith('box-shadow')).sort()
  .forEach(k => console.log(`  ${String(stat[k]).padStart(4)}  ${k}`));
console.log('\n[모서리] 상위 12종');
Object.keys(stat).filter(k => k.startsWith('border-radius'))
  .sort((a, b) => stat[b] - stat[a]).slice(0, 12)
  .forEach(k => console.log(`  ${String(stat[k]).padStart(4)}  ${k}`));
const rN = Object.keys(stat).filter(k => k.startsWith('border-radius')).reduce((a, k) => a + stat[k], 0);
console.log(`  … 모서리 총 ${rN}건 / ${Object.keys(stat).filter(k=>k.startsWith('border-radius')).length}종`);
console.log('\n[파일별]');
Object.entries(perFile).forEach(([f, x]) => console.log(`  ${String(x).padStart(4)}  ${f}`));
console.log(`\n치환 총계 ${total} · 보존한 그림자 ${kept.length}`);
if (!APPLY) {
  console.log('\n[보존된 그림자 — 브랜드 글로우/다중레이어/hex]');
  [...new Set(kept.map(x => x.replace(/^\S+\s+/, '')))].slice(0, 12).forEach(x => console.log('  ' + x));
  console.log('\n적용: node tools/design/shape-sweep.js --apply');
}
