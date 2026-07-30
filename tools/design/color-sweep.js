#!/usr/bin/env node
/**
 * 프리미엄 디자인 시스템 2차 — 색 스윕 (2026-07-31)
 * 설계: docs/superpowers/specs/2026-07-31-premium-design-system-design.md
 *
 * 회색 8단계 → 4단계(--ink-*), 밝은 회색 5종 → 선/면 2역할(--line / --surface-1).
 *
 * ⚠️ 문맥 분기 필수 — 같은 리터럴이 "선"과 "면" 두 역할을 겸한다.
 *    그냥 찾아바꾸기 하면 테두리가 배경색이 되어 선이 사라진다.
 *    (실측: #f5f5f5 는 border 39 / background 94 로 갈린다)
 *
 * ⚠️ var() 가 안 먹는 자리는 반드시 제외한다:
 *    - SVG 속성형  fill="#555" stroke="#555"  (101건) — 속성값은 CSS가 아니다
 *    - <meta content="#C8102E">                (5건)
 *    - 그라디언트 정지점 / box-shadow 색상 인자  — 역할 판정 불가
 *    이 스크립트는 "속성명: 값" 형태만 잡으므로 위 셋은 구조적으로 안 걸린다.
 *
 * 사용법:
 *   node tools/design/color-sweep.js            # 드라이런
 *   node tools/design/color-sweep.js --list     # "기타"(미치환) 사례 목록
 *   node tools/design/color-sweep.js --apply    # 적용
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const LIST  = process.argv.includes('--list');

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

// ── 텍스트 회색: color 속성 전용 (background-color / border-color 는 -color 라 안 걸림)
const INK = {
  '111': '--ink-900', '222': '--ink-900', '15181e': '--ink-900',
  '333': '--ink-600', '555': '--ink-600', '4e5661': '--ink-600',
  '666': '--ink-400', '888': '--ink-400', '838c98': '--ink-400',
  '2aa': null, // placeholder 방지용 (사용 안 함)
  'aaa': '--ink-400', 'bbb': '--ink-400',
};
delete INK['2aa'];

// ── 밝은 회색: 문맥(선/면)으로 갈린다
const NEUTRALS = ['eee', 'f0f0f0', 'e5e7eb', 'f5f5f5', 'f8f8f8'];

const inkKeys = Object.keys(INK).join('|');
const neuKeys = NEUTRALS.join('|');

// color: (앞에 하이픈·문자가 없어야 함 → background-color / border-color 제외)
const RE_INK = new RegExp(`(^|[^-\\w])(color\\s*:\\s*)#(${inkKeys})\\b`, 'gim');
// border 계열 → --line   /  background 계열 → --surface-1
const RE_BORDER = new RegExp(`(border[a-z-]*\\s*:\\s*[^;"'{}]*?)#(${neuKeys})\\b`, 'gi');
const RE_BG     = new RegExp(`(background[a-z-]*\\s*:\\s*[^;"'{}]*?)#(${neuKeys})\\b`, 'gi');

const stat = {};
const perFile = {};
const skipped = [];
let total = 0;

const bump = (k) => { stat[k] = (stat[k] || 0) + 1; total++; };

for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  let s = fs.readFileSync(abs, 'utf8');
  const before = s;
  let n = 0;

  // 1) 텍스트 회색
  s = s.replace(RE_INK, (m, pre, head, hex) => {
    const tok = INK[hex.toLowerCase()];
    if (!tok) return m;
    n++; bump(`color:#${hex} → ${tok}`);
    return `${pre}${head}var(${tok})`;
  });

  // 2) 선
  s = s.replace(RE_BORDER, (m, head, hex) => {
    n++; bump(`border #${hex} → --line`);
    return `${head}var(--line)`;
  });

  // 3) 면 — 단, 그라디언트는 정지점이라 역할 판정 불가 → 건드리지 않음
  s = s.replace(RE_BG, (m, head, hex) => {
    if (/gradient/i.test(head)) { skipped.push(`${rel}  [gradient] ${m.trim().slice(0, 70)}`); return m; }
    n++; bump(`background #${hex} → --surface-1`);
    return `${head}var(--surface-1)`;
  });

  perFile[rel] = n;
  if (APPLY && s !== before) fs.writeFileSync(abs, s, 'utf8');
}

console.log(APPLY ? '=== 적용 완료 ===' : '=== 드라이런 (파일 미변경) ===');
console.log('');
Object.keys(stat).sort().forEach(k => console.log(`  ${String(stat[k]).padStart(5)}  ${k}`));
console.log('');
console.log('파일별:');
Object.entries(perFile).forEach(([f, n]) => console.log(`  ${String(n).padStart(5)}  ${f}`));
console.log(`\n치환 총계 ${total} · 그라디언트 스킵 ${skipped.length}`);

if (LIST && skipped.length) {
  console.log('\n=== 스킵된 그라디언트 (눈으로 확인) ===');
  skipped.forEach(x => console.log('  ' + x));
}
if (!APPLY) console.log('\n적용: node tools/design/color-sweep.js --apply');
