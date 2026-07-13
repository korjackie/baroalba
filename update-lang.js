const fs = require('fs'); let app = fs.readFileSync('shared-lang.js', 'utf8'); const koStart = app.indexOf('ko: ['); const koEnd = app.indexOf('],', koStart) + 2; const newKo = \ko: [
    { title: '바로알바', desc: '외국어 지원! 외국인 구인/구직을 돕습니다.\\n사장님도 알바생도 바로 구하고 바로 일해요.', chips: ['???? 한국어', '???? English', '???? 中文', '???? 日本語', '???? Ti?ng Vi?t', '???? Русский', '???? Монгол', '???? ??????'] },
    { title: '바로모임', desc: '퇴근 후 동네 친구들과\\n취미를 공유하고 네트워킹을 즐겨보세요.', chips: ['? 소셜 모임', '?? 동네 네트워킹', '?? 취미 공유'] },
    { title: '바로만남', desc: '새로운 만남이 기다립니다.\\n나와 잘 맞는 설레는 인연도 찾아보세요.', chips: ['?? 두근두근 만남', '? 특별한 인연', '?? 새로운 시작'] },
    { title: '바로미팅 & 바로스팟', desc: '다대다 미팅으로 즐거운 시간을!\\n우리 동네 가장 핫한 스팟도 소개합니다.', chips: ['?? 다대다 미팅', '?? 핫플레이스', '?? 트렌디한 스팟'] },
    { title: '당신의 새로운 일상,\\n지금 바로 시작하세요', desc: '단기 알바부터 특별한 모임과 인연까지\\n모든 준비가 끝났습니다.', chips: ['? 프로필 설정', '?? 신원 인증', '?? 혜택 받기'] }
  ],\; app = app.substring(0, koStart) + newKo + app.substring(koEnd); fs.writeFileSync('shared-lang.js', app);
