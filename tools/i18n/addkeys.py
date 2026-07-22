# -*- coding: utf-8 -*-
"""shared-lang.js의 TRANSLATIONS 8개 언어 블록에 키를 일괄 추가한다.
값에 작은따옴표가 들어가면 JS 문자열이 깨지므로 미리 검사한다."""
import io, re, sys, json

LANGS = ['ko','en','zh','ja','vi','ru','mn','np']

def add_keys(path, NEW, anchor='bento_tag'):
    for k, v in NEW.items():
        if len(v) != 8:
            sys.exit(f'값 개수 오류: {k} -> {len(v)}개')
        for x in v:
            if "'" in x:
                sys.exit(f"작은따옴표 포함(JS 깨짐): {k} -> {x}")
    s = io.open(path, encoding='utf-8').read()
    T = s.index('const TRANSLATIONS = {')
    added = 0
    for li, lang in enumerate(LANGS):
        m = re.search(r"\n  %s:\s*\{" % lang, s[T:])
        if not m:
            print('블록없음', lang); continue
        st = T + m.end(); d = 1; i = st
        while d > 0:
            if s[i] == '{': d += 1
            elif s[i] == '}': d -= 1
            i += 1
        blk = s[st:i]
        mm = re.search(r"\n(\s*)%s:" % anchor, blk)
        if not mm:
            print('앵커없음', lang); continue
        ind = mm.group(1)
        ins = ''.join("\n%s%s:'%s'," % (ind, k, v[li])
                      for k, v in NEW.items() if ("\n%s%s:" % (ind, k)) not in blk)
        s = s[:st] + blk[:mm.start()] + ins + blk[mm.start():] + s[i:]
        added += 1
    io.open(path, 'w', encoding='utf-8').write(s)
    return added

if __name__ == '__main__':
    NEW = json.load(io.open(sys.argv[1], encoding='utf-8'))
    n = add_keys('shared-lang.js', NEW)
    print('%d개 키 x %d개 언어 추가' % (len(NEW), n))
