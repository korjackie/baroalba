#!/usr/bin/env node
/**
 * 프리미엄 5차 — 간격 리듬 정리 (2026-07-31)
 *
 * 🔴 설계문서(4-4절)의 "4/8 그리드"는 이 앱에 안 맞는다.
 *    실측: gap 의 53%가 4의 배수가 아니고, 최다값이 6px(153) · 10px(97) 이다.
 *    이걸 8 로 올리면 칩이 넓어져 줄바꿈이 터진다. 이 앱의 실제 리듬은 2px 단위이고,
 *    "정보 밀도를 유지한다"는 절충안 방향과도 2px 쪽이 맞다. → 2px 그리드로 재정의.
 *
 * 2px 기준으로 보면 이상치는 홀수값뿐이다(4,600개 중 591개, 13%).
 * 전부 한 단계 "줄이는" 방향으로만 맞춘다 — 늘리면 넘치거나 줄바꿈이 생기지만
 * 줄이면 그럴 일이 없다. 1px 차이라 눈에 띄는 변화도 아니다.
 *
 * ⚠️ 제외 대상
 *   - 1px : 대부분 배지·칩의 미세조정이라 0px 로 만들면 붙어버린다
 *   - 음수 : -5px → -4px 는 "덜 튀어나옴"이라 의도가 바뀔 수 있다
 *   - padding/margin/gap 외 속성 (border-radius 는 3차에서 이미 처리)
 *
 * 사용법: node tools/design/space-sweep.js [--apply]
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
];

// padding / margin / gap 계열의 "값 부분"만 잡는다
const RE = /\b(padding|margin|gap|row-gap|column-gap)([a-z-]*)\s*:\s*([^;"'}\n]+)/gi;

const stat = {};
const perFile = {};
let total = 0;

for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  let s = fs.readFileSync(abs, 'utf8');
  const before = s;
  let n = 0;

  s = s.replace(RE, (m, prop, suffix, val) => {
    // 값 안의 각 px 를 개별 처리. 앞에 '-' 가 붙은 음수는 건드리지 않는다.
    const nv = val.replace(/(-?)(\d+)px/g, (mm, sign, num) => {
      if (sign === '-') return mm;
      const v = parseInt(num, 10);
      if (v <= 1) return mm;          // 1px·0px 제외
      if (v % 2 === 0) return mm;     // 이미 짝수
      const next = v - 1;             // 줄이는 방향
      n++; total++;
      const k = `${v}px → ${next}px`;
      stat[k] = (stat[k] || 0) + 1;
      return `${next}px`;
    });
    // 선언부를 재조립하면 공백·포맷이 미묘하게 바뀐다. 값 앞부분은 원문 그대로 두고
    // 뒤의 값만 갈아끼운다.
    return nv === val ? m : m.slice(0, m.length - val.length) + nv;
  });

  perFile[rel] = n;
  if (APPLY && s !== before) fs.writeFileSync(abs, s, 'utf8');
}

console.log(APPLY ? '=== 적용 완료 ===\n' : '=== 드라이런 (파일 미변경) ===\n');
Object.entries(stat).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}건  ${k}`));
console.log('\n파일별:');
Object.entries(perFile).forEach(([f, v]) => console.log(`  ${String(v).padStart(4)}  ${f}`));
console.log(`\n치환 총계 ${total}`);
if (!APPLY) console.log('\n적용: node tools/design/space-sweep.js --apply');
