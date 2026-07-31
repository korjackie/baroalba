#!/usr/bin/env node
/**
 * 프리미엄 4차 — 앱 밖 화면의 팔레트 통일 (2026-07-31)
 *
 * 1~3차는 앱(바로알바.html/app.js/app_ui.js/style.css)과 독립 HTML 을 훑었지만,
 * 색 치환이 거의 안 걸린 파일이 있었다 — index.html 0건, admin.html 2건.
 * 앱과 아예 다른 색 체계를 쓰고 있었기 때문이다.
 *
 *   index.html : 자체 토큰(--ink/--body/--muted/--line/--soft). 값은 앱과 거의 같아
 *                이름만 다른 셈 — 구조는 두고 값만 앱에 맞춘다(위험 최소).
 *   admin.html : Tailwind Slate 팔레트. slate 와 ink 둘 다 쿨그레이라 매핑이 자연스럽다.
 *                ⚠️ #ef4444(위험·삭제)는 브랜드 레드로 바꾸지 않는다 — 관리자 도구에서
 *                   "삭제"가 브랜드색이 되면 의미가 뒤섞인다.
 *   worker.html: --red 가 #FF4B4B 라 브랜드 레드(#C8102E)와 달랐다. 브랜드는 하나여야 한다.
 *
 * 사용법: node tools/design/palette-align.js [--apply]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');

const log = [];
const rec = (f, what) => log.push(`  ${f.padEnd(12)} ${what}`);

// ── index.html : 자체 토큰 값만 앱 팔레트로 정렬 ────────────────
{
  const f = 'index.html';
  const abs = path.join(ROOT, f);
  let s = fs.readFileSync(abs, 'utf8');
  const before = s;
  // 왼쪽이 기존 값, 오른쪽이 앱 토큰 값. 이름(--ink/--body/…)은 그대로 둔다.
  const pairs = [
    ['--ink:#16181d',  '--ink:#15181E'],   // ≈ --ink-900
    ['--body:#454b57', '--body:#4E5661'],  // ≈ --ink-600
    ['--muted:#6b7280','--muted:#838C98'], // → --ink-400 (여기만 눈에 띄게 달랐다)
    ['--line:#e6e8ec', '--line:#E3E7EC'],  // ≈ --line
    ['--soft:#f7f8fa', '--soft:#F4F6F8'],  // ≈ --surface-1
  ];
  let n = 0;
  for (const [a, b] of pairs) {
    if (s.includes(a)) { s = s.split(a).join(b); n++; rec(f, `${a}  →  ${b}`); }
    else rec(f, `!! 못찾음: ${a}`);
  }
  if (APPLY && s !== before) fs.writeFileSync(abs, s, 'utf8');
  rec(f, `토큰 ${n}개 정렬`);
}

// ── admin.html : Slate → Ink ───────────────────────────────────
{
  const f = 'admin.html';
  const abs = path.join(ROOT, f);
  let s = fs.readFileSync(abs, 'utf8');
  const before = s;
  let n = 0;

  // 글자색 (background-color / border-color 는 -color 라 안 걸린다)
  const INK = {
    '1e293b': '--ink-900', '334155': '--ink-600',
    '64748b': '--ink-600', '94a3b8': '--ink-400', 'cbd5e1': '--ink-200',
  };
  s = s.replace(new RegExp(`(^|[^-\\w])(color\\s*:\\s*)#(${Object.keys(INK).join('|')})\\b`, 'gim'),
    (m, pre, head, hex) => { n++; return `${pre}${head}var(${INK[hex.toLowerCase()]})`; });

  // 테두리
  s = s.replace(/(border[a-z-]*\s*:\s*[^;"'{}]*?)#(e2e8f0|f1f5f9|f8fafc|cbd5e1)\b/gi,
    (m, head) => { n++; return `${head}var(--line)`; });

  // 배경 (그라디언트는 정지점이라 제외 — 3차까지와 같은 규칙)
  s = s.replace(/(background[a-z-]*\s*:\s*[^;"'{}]*?)#(f1f5f9|f8fafc)\b/gi,
    (m, head) => { if (/gradient/i.test(head)) return m; n++; return `${head}var(--surface-1)`; });
  s = s.replace(/(background[a-z-]*\s*:\s*[^;"'{}]*?)#(1e293b)\b/gi,
    (m, head) => { if (/gradient/i.test(head)) return m; n++; return `${head}var(--ink-900)`; });

  if (APPLY && s !== before) fs.writeFileSync(abs, s, 'utf8');
  rec(f, `${n}건 치환 (Slate → Ink). #ef4444(위험·삭제)는 의도적으로 보존`);
}

// ── worker.html : 브랜드 레드 통일 ──────────────────────────────
{
  const f = 'worker.html';
  const abs = path.join(ROOT, f);
  let s = fs.readFileSync(abs, 'utf8');
  const before = s;
  let n = 0;
  if (s.includes('--red:#FF4B4B')) { s = s.split('--red:#FF4B4B').join('--red:#C8102E'); n++; rec(f, '--red:#FF4B4B → #C8102E (브랜드 통일)'); }
  const m = s.match(/#ff4b4b\b/gi);
  if (m) { s = s.replace(/#ff4b4b\b/gi, 'var(--red)'); n += m.length; rec(f, `리터럴 #ff4b4b ${m.length}건 → var(--red)`); }
  if (APPLY && s !== before) fs.writeFileSync(abs, s, 'utf8');
  rec(f, `${n}건 처리`);
}

console.log(APPLY ? '=== 적용 완료 ===\n' : '=== 드라이런 (파일 미변경) ===\n');
log.forEach(l => console.log(l));
if (!APPLY) console.log('\n적용: node tools/design/palette-align.js --apply');
