import re
import codecs

# 1. Update style.css
with codecs.open('assets/css/style.css', 'r', 'utf-8') as f:
    css = f.read()

# Replace font-family in html, body
old_body_css = r"font-family:\s*-apple-system,\s*'Apple SD Gothic Neo',\s*'Noto Sans KR',\s*sans-serif;"
new_body_css = "font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif; letter-spacing: -0.01em;"
css = re.sub(old_body_css, new_body_css, css)

# Replace the injected block
injected_block_regex = r'/\* ── INJECTED DESIGN IMPROVEMENTS ── \*/.*'
premium_css = """/* ── INJECTED DESIGN IMPROVEMENTS ── */
/* 벤토 배너 */
.bento-section { padding: 0 12px 12px; }
.bento-banner { background: linear-gradient(160deg, #111827 0%, #1f2937 100%); border-radius: 24px; padding: 28px 24px; color: white; display: flex; flex-direction: column; position: relative; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05); }
.bento-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.bento-tag { background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%); padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 900; box-shadow: 0 4px 12px rgba(225,29,72,0.3); }
.bento-urgent { color: #f43f5e; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; }
.bento-title { font-size: 22px; font-weight: 900; line-height: 1.4; margin-bottom: 8px; letter-spacing: -0.5px; }
.bento-desc { font-size: 14px; color: #9ca3af; line-height: 1.5; }
.bento-btn { margin-top: 20px; background: #ffffff; color: #111827; padding: 10px 20px; border-radius: 24px; font-size: 13px; font-weight: 800; align-self: flex-start; box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: transform 0.2s; }
.bento-btn:active { transform: scale(0.96); }

/* 바로모임 티어 */
.moim-card { transition: all 0.2s ease; }
.moim-card.pro { background: linear-gradient(145deg, #ffffff 0%, #faf5ff 100%); border: 1px solid rgba(139, 92, 246, 0.15); box-shadow: 0 8px 24px rgba(139, 92, 246, 0.08); }
.moim-card.basic { background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.04); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); }
.tier-badge { display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 12px; }
.tier-pro { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #ffffff; box-shadow: 0 2px 8px rgba(109, 40, 217, 0.25); }
.tier-basic { background: #f1f5f9; color: #64748b; }

/* 바로만남 프리미엄 배너 */
.mannam-banner { margin: 12px; background: linear-gradient(135deg, #be123c 0%, #e11d48 50%, #f43f5e 100%); border-radius: 20px; padding: 20px 24px; color: white; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 30px rgba(225, 29, 72, 0.25), inset 0 1px 0 rgba(255,255,255,0.2); position: relative; overflow: hidden; }
.mannam-banner::before { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 60%); pointer-events: none; }
.mb-left { display: flex; align-items: center; gap: 16px; position: relative; z-index: 1; }
.mb-icon { width: 44px; height: 44px; background: rgba(255, 255, 255, 0.15); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.mb-title { font-size: 18px; font-weight: 900; margin-bottom: 4px; letter-spacing: -0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.mb-desc { font-size: 12px; opacity: 0.85; font-weight: 500; }
.mb-new { background: rgba(255, 255, 255, 0.2); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 900; backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.1); }

/* 쿠폰 모달 & 메뉴 */
.menu-item.coupon-menu { background: #faf5ff; }
.menu-item.coupon-menu .menu-title { color: #7c3aed; }
.overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 9998; display: none; opacity: 0; transition: opacity 0.3s; }
.overlay.show { display: block; opacity: 1; }
.bottom-sheet { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-radius: 24px 24px 0 0; padding: 24px 20px; z-index: 9999; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); display: flex; flex-direction: column; gap: 20px; box-shadow: 0 -4px 20px rgba(0,0,0,0.1); }
.bottom-sheet.show { transform: translateY(0); }
.bs-handle { width: 40px; height: 4px; background: #e2e8f0; border-radius: 4px; margin: 0 auto 8px; }
.coupon-modal-title { font-size: 18px; font-weight: 900; color: #0f172a; }
.coupon-input-wrap { display: flex; gap: 8px; }
.coupon-input { flex: 1; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; font-size: 15px; outline: none; transition: 0.2s; }
.coupon-input:focus { border-color: #7c3aed; background: white; }
.coupon-btn { background: #7c3aed; color: white; border: none; border-radius: 12px; padding: 0 20px; font-size: 15px; font-weight: 800; cursor: pointer; }
.ticket-card { background: linear-gradient(135deg, #f5f3ff, #faf5ff); border: 1px solid #ede9fe; border-radius: 16px; padding: 20px; display: flex; align-items: center; justify-content: space-between; }
.ticket-count { font-size: 28px; font-weight: 900; color: #7c3aed; }

/* Moim Text Styles */
.mc-cat { font-size: 10px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 6px; display: inline-block; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.04); }
.mc-title { font-size: 15px; font-weight: 800; color: #111; margin-bottom: 8px; line-height: 1.4; letter-spacing: -0.3px; }
.mc-date { font-size: 12px; color: #64748b; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }
.mc-date::before { content: '📅'; font-size: 11px; }
.mc-slots { font-size: 12px; color: #64748b; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 4px; }
.mc-slots::before { content: '🧑‍🤝‍🧑'; font-size: 11px; }
.mc-fee { font-size: 13px; font-weight: 800; padding-top: 8px; border-top: 1px dashed #e2e8f0; }"""

css = re.sub(injected_block_regex, premium_css, css, flags=re.DOTALL)

with codecs.open('assets/css/style.css', 'w', 'utf-8') as f:
    f.write(css)

# 2. Update 바로알바.html
with codecs.open('바로알바.html', 'r', 'utf-8') as f:
    html = f.read()

# Inject Pretendard web font if not exists
pretendard_link = '<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />'
if pretendard_link not in html:
    html = html.replace('</head>', f'  {pretendard_link}\n</head>')

with codecs.open('바로알바.html', 'w', 'utf-8') as f:
    f.write(html)

print("Aesthetic upgrade complete.")
