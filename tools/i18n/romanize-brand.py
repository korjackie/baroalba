# -*- coding: utf-8 -*-
"""브랜드명 로마자 통일 (2026-08-01, Phase 83)

한국어 블록은 한글 그대로 두고, 나머지 7개 언어의 번역문에 박혀 있는
한글 브랜드명을 로마자로 바꾼다. 브랜드명 키 4개도 8개 언어에 새로 넣는다.

왜: 한글을 못 읽는 사용자에게 브랜드명이 통째로 안 읽혔다. 영어만 'Spot · Meeting'
으로 현지화돼 있고 나머지 6개는 한글이라 규칙 자체가 서 있지 않았다.
언어별 음차(데바나가리·키릴)를 만들면 6벌을 검증 없이 찍어내야 해서, 어느 문자권에서도
읽히는 로마자 한 벌로 통일한다.

드라이런이 기본이다. 파일을 쓰려면 --apply 를 준다. (tools/design/* 와 같은 관례)
"""
import io, os, re, sys, argparse

sys.stdout.reconfigure(encoding='utf-8')
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'shared-lang.js')
SRC = os.path.normpath(SRC)

# 긴 것부터 — 앞부분이 겹치는 토큰이 없어도 순서를 고정해 두는 게 안전하다
BRAND = [
    ('바로브랜딩', 'BaroBranding'),
    ('바로미팅',  'BaroMeeting'),
    ('바로만남',  'BaroMannam'),
    ('바로스팟',  'BaroSpot'),
    ('바로모임',  'BaroMoim'),
    ('바로알바',  'BaroAlba'),
]

# 홈 카드 제목·헤더 로고가 쓸 신규 키 (한국어는 한글, 나머지는 로마자)
NEW_KEYS = {
    'brand_alba':     ('바로알바',   'BaroAlba'),
    'brand_moim':     ('바로모임',   'BaroMoim'),
    'brand_mannam':   ('바로만남',   'BaroMannam'),
    'brand_branding': ('바로브랜딩', 'BaroBranding'),
}

LANGS = ['ko', 'en', 'zh', 'ja', 'vi', 'mn', 'ru', 'np']


def find_blocks(lines):
    """TRANSLATIONS 안의 언어 블록 경계. mannam_desc 를 포함하는 블록만 고른다."""
    marks = []
    for i, l in enumerate(lines, 1):
        m = re.match(r'^\s{2}(' + '|'.join(LANGS) + r'):\s*\{\s*$', l)
        if m:
            marks.append((i, m.group(1)))
    blocks = []
    for idx, (ln, code) in enumerate(marks):
        end = marks[idx + 1][0] - 1 if idx + 1 < len(marks) else len(lines)
        if any('mannam_desc:' in lines[k - 1] for k in range(ln, end + 1)):
            blocks.append((code, ln, end))
    return blocks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='실제로 파일을 쓴다 (기본은 드라이런)')
    args = ap.parse_args()

    text = io.open(SRC, encoding='utf-8').read()
    lines = text.split('\n')
    blocks = find_blocks(lines)
    print(f'언어 블록 {len(blocks)}개: ' + ', '.join(f'{c}({s}~{e})' for c, s, e in blocks))
    if len(blocks) != 8:
        print('🔴 블록이 8개가 아니다. 중단.')
        return 1

    changed, inserted = 0, 0
    out = list(lines)

    for code, s, e in blocks:
        # ── 1) 비한국어 블록의 문자열 안 브랜드명 치환 ──
        if code != 'ko':
            for i in range(s, e + 1):
                orig = out[i - 1]
                new = orig
                for ko, ro in BRAND:
                    new = new.replace(ko, ro)
                if new != orig:
                    changed += 1
                    if not args.apply and changed <= 5:
                        print(f'  [{code}] {i}\n     - {orig.strip()[:96]}\n     + {new.strip()[:96]}')
                    out[i - 1] = new

    # ── 2) 신규 키 삽입 (mannam_desc 줄 바로 아래) ──
    # 뒤에서부터 넣어야 앞쪽 줄번호가 안 밀린다
    anchors = []
    for code, s, e in blocks:
        for i in range(s, e + 1):
            if re.match(r'^\s*mannam_desc:', out[i - 1]):
                anchors.append((code, i))
                break
    for code, i in sorted(anchors, key=lambda x: -x[1]):
        if any(f'{k}:' in l for k in NEW_KEYS for l in out[max(0, i - 3):i + 6]):
            print(f'  [{code}] 이미 브랜드 키가 있음 — 건너뜀')
            continue
        indent = re.match(r'^(\s*)', out[i - 1]).group(1)
        pairs = []
        for key, (ko_v, ro_v) in NEW_KEYS.items():
            v = ko_v if code == 'ko' else ro_v
            pairs.append(f"{key}:'{v}'")
        # ⚠️ 구분자는 반드시 쉼표다. 공백으로 join 하면 SyntaxError 가 난다
        #    (2026-08-01 첫 시도에서 실제로 밟았고 node --check 로 잡았다)
        out.insert(i, indent + ', '.join(pairs) + ',')
        inserted += 1

    print(f'\n치환 {changed}줄 / 키 삽입 {inserted}개 블록')
    if args.apply:
        io.open(SRC, 'w', encoding='utf-8', newline='').write('\n'.join(out))
        print('✅ shared-lang.js 에 적용함')
    else:
        print('(드라이런 — 실제로 쓰려면 --apply)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
