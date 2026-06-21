from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1024, 500

# Background gradient (coral red to slightly darker)
img = Image.new('RGB', (W, H), '#EF4444')
draw = ImageDraw.Draw(img)

# Gradient: left side lighter, right side darker
for x in range(W):
    r = int(239 - (x / W) * 40)
    g = int(68 - (x / W) * 20)
    b = int(68 - (x / W) * 20)
    draw.line([(x, 0), (x, H)], fill=(r, g, b))

# Load logo
logo_path = os.path.join(os.path.dirname(__file__), '바로알바 최종로고.png')
logo = Image.open(logo_path).convert('RGBA')
logo_size = 200
logo = logo.resize((logo_size, logo_size), Image.LANCZOS)

# Center logo slightly left
logo_x = 120
logo_y = (H - logo_size) // 2
img.paste(logo, (logo_x, logo_y), logo)

# Text
try:
    font_path = "C:/Windows/Fonts/malgunbd.ttf"  # Malgun Gothic Bold
    font_title = ImageFont.truetype(font_path, 72)
    font_sub = ImageFont.truetype(font_path, 32)
    font_tag = ImageFont.truetype(font_path, 26)
except:
    font_title = ImageFont.load_default()
    font_sub = font_title
    font_tag = font_title

text_x = 380
title = "바로알바"
sub1 = "내 주변 단기알바"
sub2 = "지금 바로 찾기"
tag = "위치기반 · 즉시매칭 · 채팅연결"

draw.text((text_x, 120), title, font=font_title, fill='white')
draw.text((text_x, 210), sub1, font=font_sub, fill='rgba(255,255,255,220)')
draw.text((text_x, 255), sub2, font=font_sub, fill='rgba(255,255,255,220)')

# Tag pill background
tag_y = 320
tag_w = 420
tag_h = 44
draw.rounded_rectangle([text_x, tag_y, text_x + tag_w, tag_y + tag_h], radius=22, fill=(0,0,0,60))
draw.text((text_x + 16, tag_y + 8), tag, font=font_tag, fill='white')

out_path = os.path.join(os.path.dirname(__file__), 'feature-graphic.png')
img.save(out_path)
print(f"Saved: {out_path}")
print(f"Size: {img.size}")
