# 바로알바 OG 이미지 생성 (1200x630)
#
# 실행: 저장소 루트에서  python3 tools/make-og.py
#       (Pillow만 있으면 됨. 출력물 icons/og-share-wide.png)
#
# 루트의 make-og.js는 쓰지 말 것 - node canvas 패키지가 설치돼 있지 않아
# 한 번도 실행된 적이 없고, 색도 구브랜드(#FF4B4B)에 멈춰 있다.
#
# 문구를 바꾸면 반드시 랜딩(index.html)의 히어로·칩 문구와 맞출 것.
# 공유 카드와 실제 페이지가 다른 말을 하면 안 된다.
# 기존 og-share.png는 앱 아이콘을 정사각형(1005x1004)으로 늘린 것이라
# 카톡/페북 공유 시 서비스가 뭔지 전혀 전달되지 않았음.
# 랜딩(index.html)의 히어로와 같은 문구/색/줄바꿈을 써서 한눈에 읽히게 만든다.
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
SAFE = W - 140                                # 좌우 70px는 반드시 비운다
RED, RED_DK = (200, 16, 46), (150, 10, 33)    # --red / --red-dark (랜딩과 동일)

BD, RG = "C:/Windows/Fonts/malgunbd.ttf", "C:/Windows/Fonts/malgun.ttf"

img = Image.new("RGB", (W, H), RED)
d = ImageDraw.Draw(img)

# 세로 그라데이션 - 단색보다 덜 밋밋하고 썸네일로 줄어도 텍스트 대비가 유지된다
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(RED, RED_DK)))


def fit(path, size, text):
    """SAFE 폭을 넘으면 들어갈 때까지 폰트를 줄인다. 문구를 나중에 손봐도
    글자가 이미지 밖으로 잘려나가지 않게 하는 안전장치."""
    while size > 12:
        fo = ImageFont.truetype(path, size)
        if d.textlength(text, font=fo) <= SAFE:
            return fo
        size -= 2
    return ImageFont.truetype(path, 12)


def center(text, font, y, fill=(255, 255, 255)):
    x0, _, x1, _ = d.textbbox((0, 0), text, font=font)
    d.text(((W - (x1 - x0)) / 2 - x0, y), text, font=font, fill=fill)


# ── 아이콘: 흰 라운드 카드 안에 넣는다. 아이콘 자체 배경이 코랄레드(#F4514E)라
#    크림슨 배경 위에 그냥 올리면 두 빨강이 부딪혀 지저분해 보임.
CARD, PAD = 112, 12
card = Image.new("RGBA", (CARD, CARD), (0, 0, 0, 0))
ImageDraw.Draw(card).rounded_rectangle([0, 0, CARD - 1, CARD - 1], radius=26, fill=(255, 255, 255, 255))
icon = Image.open("icons/icon-512.png").convert("RGBA").resize((CARD - PAD * 2, CARD - PAD * 2), Image.LANCZOS)
card.paste(icon, (PAD, PAD), icon)
img.paste(card, ((W - CARD) // 2, 40), card)

# ── 텍스트: 랜딩 히어로와 같은 위계·같은 줄바꿈 (브랜드 → 두 줄 헤드라인 → 보조 → 칩)
center("바로알바", fit(BD, 44, "바로알바"), 172)
center("지금 일하고,", fit(BD, 68, "지금 일하고,"), 232)
center("오늘 받는 초단기 알바", fit(BD, 68, "오늘 받는 초단기 알바"), 320)
center("지도에서 바로 찾고, 바로 지원하세요", fit(RG, 34, "지도에서 바로 찾고, 바로 지원하세요"), 428, (255, 214, 220))

# ── 하단 칩: 구분점을 흐리게 해 항목이 각각 읽히도록
chips, cf, dot = ["지도로 찾기", "급구 알림", "당일 정산", "8개 언어"], ImageFont.truetype(RG, 30), "   ·   "
wch = [d.textlength(c, font=cf) for c in chips]
wdot = d.textlength(dot, font=cf)
x, y = (W - (sum(wch) + wdot * (len(chips) - 1))) / 2, 516
for i, c in enumerate(chips):
    d.text((x, y), c, font=cf, fill=(255, 255, 255)); x += wch[i]
    if i < len(chips) - 1:
        d.text((x, y), dot, font=cf, fill=(255, 150, 165)); x += wdot

img.save("icons/og-share-wide.png", optimize=True)
print("생성 완료: icons/og-share-wide.png")
