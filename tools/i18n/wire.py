# -*- coding: utf-8 -*-
"""텍스트 노드에 data-i18n을 부여한다. (wire/wire2의 데이터 유실 버그 수정판)

이전 버그: 이미 data-i18n이 붙은 태그를 만나면 continue 하면서 그 구간 텍스트를
결과 버퍼에 append 하지 않아, 건너뛴 구간이 통째로 삭제됐다(파일 344줄 유실).

이 버전은
 1) 어떤 분기에서도 소비한 구간을 반드시 buffer에 넣고
 2) 처리 후 '태그를 모두 제거한 순수 텍스트'가 처리 전과 완전히 동일한지 검증한다.
    (우리는 속성/span만 추가하므로 보이는 텍스트는 절대 변하면 안 된다)
검증 실패 시 파일을 쓰지 않고 종료한다.
"""
import io, re, sys, json

AFFIX = r'[\s\-·> -⯿　-〿️‍🀀-🫿]*'

def visible_text(html):
    """태그를 제거한 순수 텍스트(공백 정규화)"""
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', '', html)).strip()

def wire(path, mapping, start_marker=None, end_pattern=None):
    s = io.open(path, encoding='utf-8').read()
    head, body, tail = '', s, ''
    if start_marker:
        i = s.index(start_marker)
        m = re.search(end_pattern, s[i + 10:]) if end_pattern else None
        j = i + 10 + m.start() if m else len(s)
        head, body, tail = s[:i], s[i:j], s[j:]

    before_text = visible_text(body)
    report = {}

    for text, key in mapping.items():
        pat = re.compile(r'>(' + AFFIX + r')(' + re.escape(text) + r')(' + AFFIX + r')<')
        out, pos, cnt = [], 0, 0
        while True:
            m = pat.search(body, pos)
            if not m:
                break
            tag_open = body.rfind('<', 0, m.start())
            tag = body[tag_open:m.start() + 1]
            if 'data-i18n' in tag:
                out.append(body[pos:m.start() + 1])   # 반드시 보존
                pos = m.start() + 1
                continue
            pre, core, post = m.group(1), m.group(2), m.group(3)
            out.append(body[pos:m.start()])
            if not pre and not post:
                out.append(' data-i18n="%s">%s<' % (key, core))
            else:
                out.append('>%s<span data-i18n="%s">%s</span>%s<' % (pre, key, core, post))
            pos = m.end()
            cnt += 1
        out.append(body[pos:])
        body = ''.join(out)
        report[text] = cnt

    after_text = visible_text(body)
    if before_text != after_text:
        # 어디서 갈라졌는지 알려주고 중단
        for n in range(min(len(before_text), len(after_text))):
            if before_text[n] != after_text[n]:
                print('!! 텍스트 유실 감지 - 파일을 저장하지 않았습니다', file=sys.stderr)
                print('   before:', repr(before_text[max(0, n-60):n+60]), file=sys.stderr)
                print('   after :', repr(after_text[max(0, n-60):n+60]), file=sys.stderr)
                break
        else:
            print('!! 길이 불일치 %d -> %d, 저장 안 함' % (len(before_text), len(after_text)), file=sys.stderr)
        sys.exit(1)

    io.open(path, 'w', encoding='utf-8').write(head + body + tail)
    return report

if __name__ == '__main__':
    path = sys.argv[1]
    mapping = json.load(io.open(sys.argv[2], encoding='utf-8'))
    ls = sys.argv[3] if len(sys.argv) > 3 else None
    le = sys.argv[4] if len(sys.argv) > 4 else None
    rep = wire(path, mapping, ls, le)
    ok = sum(1 for v in rep.values() if v)
    print('연결 %d/%d종  (총 %d곳)  텍스트 무결성 검증 통과' % (ok, len(rep), sum(rep.values())))
    for t, n in rep.items():
        if n == 0:
            print('   MISS:', t[:44])
