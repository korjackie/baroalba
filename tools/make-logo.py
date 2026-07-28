# 헤더용 축소 로고 마크 생성 (tools/make-og.py 와 같은 방식 — Pillow)
#
# 왜 필요한가: 원본 `icons/바로알바 최종로고.png` 는 1005x1005 / 715KB 다.
# 헤더에서는 30px(모바일 25~27px)로만 쓰는데 원본을 그대로 걸면 랜딩 첫 화면에서
# 715KB 를 받게 된다 — Phase 61 에서 OG 이미지 715KB 를 SW 프리캐시에서 걷어냈던 것과
# 같은 유형의 낭비다.
#
# 실행: python tools/make-logo.py   (prototype 폴더에서)
import os
from PIL import Image

SRC = 'icons/바로알바 최종로고.png'
OUT = 'icons/logo-mark-96.png'
SIZE = 96  # CSS 30px 의 3배 — 레티나에서도 안 뭉갠다

img = Image.open(SRC).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)
img.save(OUT, optimize=True)

print(f'{OUT}: {img.size}, {os.path.getsize(OUT) / 1024:.1f}KB '
      f'(원본 {os.path.getsize(SRC) / 1024:.0f}KB)')
