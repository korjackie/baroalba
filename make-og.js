// node make-og.js 실행하면 icons/og-image.png 생성
const { createCanvas } = require('canvas');
const fs = require('fs');

const w = 1200, h = 630;
const canvas = createCanvas(w, h);
const ctx = canvas.getContext('2d');

// 배경
ctx.fillStyle = '#FF4B4B';
ctx.fillRect(0, 0, w, h);

// 번개 이모지 대신 텍스트
ctx.font = 'bold 120px sans-serif';
ctx.fillStyle = 'white';
ctx.textAlign = 'center';
ctx.fillText('⚡', w/2, 260);

// 앱 이름
ctx.font = 'bold 100px sans-serif';
ctx.fillText('바로알바', w/2, 400);

// 슬로건
ctx.font = '44px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.85)';
ctx.fillText('지금 바로 주변 알바 찾기', w/2, 490);

// 저장
fs.writeFileSync('./icons/og-image.png', canvas.toBuffer('image/png'));
console.log('og-image.png 생성 완료');
