import re
import codecs

with codecs.open('assets/js/app.js', 'r', 'utf-8') as f:
    js = f.read()

# Replace _moimHomeCard function using regex
moim_regex = r'(function _moimHomeCard\(m\) \{).*?(return `<div onclick="openMoimDetail.*?</div>`;\s*\})'

new_func = """function _moimHomeCard(m) {
  const catColor = { 스포츠:'#2563eb',취미:'#7c3aed',친목:'#0891b2',기타:'#6b7280' };
  const cat = m.category || '기타';
  const color = catColor[cat] || '#7c3aed';
  const dateStr = m.gathering_date ? new Date(m.gathering_date).toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}) : '일정 미정';
  const rem = (m.max_count||10) - (m.current_count||0);
  
  // 랜덤하게 PRO/BASIC 티어 부여 (데모용)
  const isPro = Math.random() > 0.5;
  const tierClass = isPro ? 'pro' : 'basic';
  const tierBadge = isPro ? 'PRO' : 'BASIC';
  const tierBadgeClass = isPro ? 'tier-pro' : 'tier-basic';
  
  return `<div onclick="openMoimDetail('${m.id}')" class="moim-card ${tierClass}" style="flex-shrink:0;width:160px;background:#fff;border-radius:12px;padding:16px;cursor:pointer;">
    <span class="tier-badge ${tierBadgeClass}">${tierBadge}</span>
    <div class="mc-cat" style="color:${color}">${cat.toUpperCase()}</div>
    <div class="mc-title">${m.title}</div>
    <div class="mc-date">${dateStr}</div>
    <div class="mc-slots">${rem > 0 ? rem + '자리 남음' : '마감'}</div>
    <div class="mc-fee" style="color:#d97706">각자 분담</div>
  </div>`;
}"""

js = re.sub(moim_regex, new_func, js, flags=re.DOTALL)

with codecs.open('assets/js/app.js', 'w', 'utf-8') as f:
    f.write(js)

print("Moim regex injection complete.")
