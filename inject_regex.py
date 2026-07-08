import re
import codecs

with codecs.open('바로알바.html', 'r', 'utf-8') as f:
    html = f.read()

# 1. Bento Banner
bento_regex = r'<!-- ① 급구 슬라이더 -->.*?</div>\s*</div>'
new_bento = """<!-- ① 당일 지급 벤토 배너 (급구 대체) -->
      <div class="bento-section" onclick="clearHomeFilter(); selectHomeSort('latest'); document.getElementById('home-search-results').style.display='block';">
        <div class="bento-banner">
          <div class="bento-top">
            <span class="bento-tag">당일 지급</span>
            <span class="bento-urgent">URGENT NOW</span>
          </div>
          <div class="bento-title">지금 당장 출근하고<br>오늘 바로 일당받기</div>
          <div class="bento-desc">급하게 일손이 필요한 사장님들이 기다리고 있어요!</div>
          <div class="bento-btn">전체보기 ➔</div>
        </div>
      </div>"""
html = re.sub(bento_regex, new_bento, html, flags=re.DOTALL)

# 2. Mannam Banner
mannam_regex = r'<!-- ⑤ 바로만남 배너 -->.*?</div>\s*</div>\s*</div>'
new_mannam = """<!-- ⑤ 프리미엄 바로만남 배너 -->
      <div onclick="openMannnamPanel()" style="padding:7px 12px 0;">
        <div class="mannam-banner">
          <div class="mb-left">
            <div class="mb-icon">💫</div>
            <div>
              <div class="mb-title">바로만남</div>
              <div class="mb-desc">바로스팟 · 바로미팅 — 새로운 인연 만들기</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="mb-new">NEW</span> <span style="font-size:18px; color:rgba(255,255,255,0.8)">›</span>
          </div>
        </div>
      </div>"""
html = re.sub(mannam_regex, new_mannam, html, flags=re.DOTALL)

# 3. My Page Menu
mypage_regex = r'(<div class="menu-item"[^>]*onclick="openPointHistory\(\)"[^>]*>)'
new_mypage = """<!-- 쿠폰 등록 메뉴 -->
          <div class="menu-item coupon-menu" onclick="openCouponSheet()">
            <div class="menu-title">🎫 프로모션 쿠폰 등록 / 티켓 조회</div><div class="menu-arrow">›</div>
          </div>
          \\1"""
html = re.sub(mypage_regex, new_mypage, html)

# 4. Bottom Sheet
if "couponSheet" not in html:
    bs_html = """
<!-- COUPON BOTTOM SHEET -->
<div class="overlay" id="couponOverlay" onclick="closeCouponSheet()"></div>
<div class="bottom-sheet" id="couponSheet">
  <div class="bs-handle"></div>
  <div>
    <div class="coupon-modal-title">💜 바로만남 쿠폰 & 티켓</div>
    <div style="font-size: 13px; color: #64748b; margin-top: 4px;">베타테스터 코드를 입력하고 식사권을 받으세요!</div>
  </div>
  <div class="coupon-input-wrap">
    <input type="text" class="coupon-input" id="couponInput" placeholder="쿠폰 코드 (예: BARO2026)">
    <button class="coupon-btn" onclick="registerCoupon()">등록</button>
  </div>
  <div class="ticket-card">
    <div>
      <div style="font-size: 15px; font-weight: 800; color: #0f172a;">내 바로만남 이용권</div>
      <div style="font-size: 12px; color: #64748b;">제휴 매장에서 QR 스캔으로 사용</div>
    </div>
    <div class="ticket-count" id="ticketCountDisplay">0장</div>
  </div>
</div>
<script>
  function openCouponSheet() {
    document.getElementById('couponOverlay').classList.add('show');
    setTimeout(() => { document.getElementById('couponSheet').classList.add('show'); }, 10);
  }
  function closeCouponSheet() {
    document.getElementById('couponSheet').classList.remove('show');
    setTimeout(() => { document.getElementById('couponOverlay').classList.remove('show'); }, 300);
  }
  function registerCoupon() {
    alert("쿠폰 코드가 확인되었습니다! (준비 중)");
  }
</script>
</body>
"""
    html = html.replace('</body>', bs_html)

with codecs.open('바로알바.html', 'w', 'utf-8') as f:
    f.write(html)

print("Regex injection complete.")
