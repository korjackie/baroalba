// 공유 카드(OG) 이미지 굽기 —  node tools/og/build-og.js
//
// tools/og/og-share.html 을 헤드리스 크롬으로 1200x630 PNG 로 찍어
// icons/og-card-YYMMDD.png 로 저장한다.
//
// ⚠️ 파일명에 날짜를 넣는 이유: 카카오는 URL 단위로 스크랩 결과를 캐시한다.
//    같은 파일명에 덮어쓰면 한동안 옛 이미지가 계속 나간다. 새 파일명이면 즉시 반영된다.
//    (카카오 캐시를 직접 지우려면 developers.kakao.com 도구를 써야 하는데 사람 손이 필요하다)
// ⚠️ node-canvas 같은 네이티브 의존성을 쓰지 않는다. 이 저장소는 이미 헤드리스 크롬으로
//    CSS 계산값을 검증하고 있어(PROGRESS ⑤) 같은 도구를 재사용하는 편이 설치 부담이 없다.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(__dirname, 'og-share.html');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function findChrome() {
  const hit = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (!hit) {
    console.error('크롬을 찾지 못했습니다. CHROME_CANDIDATES 에 경로를 추가하세요.');
    process.exit(1);
  }
  return hit;
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

const outName = process.argv[2] || `og-card-${stamp()}.png`;
const out = path.join(ROOT, 'icons', outName);

execFileSync(findChrome(), [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--force-device-scale-factor=1',
  '--window-size=1200,630',
  '--default-background-color=00000000',
  // 웹폰트(Pretendard)를 받아올 시간을 준다. 없으면 시스템 고딕으로 떨어져 자간이 달라진다
  '--virtual-time-budget=6000',
  `--screenshot=${out}`,
  `file://${SRC.replace(/\\/g, '/')}`,
], { stdio: 'inherit' });

const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`\n생성 완료: icons/${outName}  (${kb}KB)`);
console.log('다음: og:image 메타 3곳 + Kakao imageUrl 들을 이 파일명으로 바꿀 것');
