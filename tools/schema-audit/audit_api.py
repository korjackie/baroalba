#!/usr/bin/env python3
"""api/*.js 전수 스키마 대조 — 코드가 참조하는 테이블·컬럼이 실제 DB에 있는지 확인.

    python tools/schema-audit/audit_api.py            # api/ 전체
    python tools/schema-audit/audit_api.py api/admin.js

왜 필요한가 (CLAUDE.md 13-9)
    `const { data } = await ...` 로 에러를 삼키는 패턴 때문에, 없는 컬럼을 참조하면
    크래시 없이 "조용히 빈 화면"만 남는다. 코드를 아무리 읽어도 안 잡히고, 살아있는
    DB에 쿼리해서 대조하는 게 유일한 검출법이다.

판정 규칙 (2026-08-02 Phase 87 에서 정정)
    PostgreSQL 은 **이름 해석 → 권한 검사** 순서라, anon 이 못 읽는 컬럼도
    존재하면 42501(401), 없으면 42703(400) 이 온다. 즉

        200          → 컬럼 있음
        401 / 42501  → 컬럼 있음 (권한만 없음). **이것도 존재 확정이다**
        400 / 42703  → 컬럼 없음  ← 이것만 버그
        404 / PGRST205 → 테이블 자체가 없음

    이 구분이 중요한 이유: `workers` 에는 anon 컬럼 단위 grant 가 걸려 있어
    (name·age·bio·rating 등 공개 필드만 허용, kakao_uid·phone·last_lat 등은 차단)
    `select=*` 이나 PII 컬럼은 전부 401 이 온다. 401 을 "판정 불가"로 처리하면
    workers·applications·chat_rooms 가 통째로 감사에서 빠진다.

    서버함수는 service_role 로 돌기 때문에 401 자체는 버그가 아니다.

이 스크립트가 잡지 못하는 것 (반드시 눈으로 볼 것)
    · 동적 컬럼명 `select=${col}` — 실행 끝에 목록으로 찍어준다
    · **잘못된 키로 조인** — 컬럼은 양쪽 다 존재하므로 절대 안 잡힌다.
      (예: reports.reporter_id 는 kakao_uid 인데 workers.id 로 조인 → 이름이 항상 공란)
      저장하는 쪽 코드에서 그 값이 무엇인지 역추적해야 발견된다.
      전례: Phase 59-B 모임 주최자, Phase 87 신고 목록·신고 메일
"""
import re, os, sys, urllib.request, urllib.error
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API = os.path.join(ROOT, 'api')
# 공개 anon 키 (sw.js 의 SB_ANON 과 동일 — 존재 확인용이라 값은 읽지 않는다)
K = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ud3ZibWxs'
     'cHljZ3N3Znp5d2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDMyNzksImV4cCI6MjA5NTc3OTI3OX0'
     '.CbwhyfqCZp_jjMbHUESVzbPDAZLNV2lpniUkouqLLmQ')
B = 'https://onwvbmllpycgswfzywjv.supabase.co/rest/v1/'

refs = defaultdict(lambda: defaultdict(set))
embeds = defaultdict(set)
dynamic = []


def add_select(table, val, where):
    depth, buf, parts = 0, '', []
    for ch in val:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(buf); buf = ''
        else:
            buf += ch
    if buf:
        parts.append(buf)
    for p in parts:
        p = p.strip()
        if not p or p == '*':
            continue
        if '(' in p:
            embeds[table].add((p.split('(')[0].split(':')[-1].split('!')[0], where)); continue
        if ':' in p:
            p = p.split(':', 1)[1]
        p = p.split('!')[0].split('.')[0]
        if '${' in p or not p:
            dynamic.append((where, table, p)); continue
        refs[table][p].add(where)


def add_query(table, qs, where):
    for param in qs.split('&'):
        if '=' not in param:
            continue
        k, v = param.split('=', 1)
        k = k.strip()
        if '${' in k:
            dynamic.append((where, table, param)); continue
        if k == 'select':
            add_select(table, v, where)
        elif k in ('order', 'on_conflict'):
            for o in v.split(','):
                c = o.split('.')[0].strip()
                if c and '${' not in c:
                    refs[table][c].add(where)
        elif k in ('limit', 'offset', 'or', 'and', 'not'):
            continue                       # PostgREST 예약어 (컬럼 아님)
        else:
            refs[table][k].add(where)


def top_keys(obj):
    """{ a: 1, b, ... } 의 최상위 키 (INSERT/PATCH 바디용)"""
    inner, keys, depth, buf, i = obj[1:-1], [], 0, '', 0
    while i < len(inner):
        ch = inner[i]
        if ch in '({[':
            depth += 1
        elif ch in ')}]':
            depth -= 1
        elif ch in '\'"`':
            qch = ch; i += 1
            while i < len(inner) and inner[i] != qch:
                if inner[i] == '\\':
                    i += 1
                i += 1
            i += 1
            continue
        if ch == ',' and depth == 0:
            keys.append(buf); buf = ''
        else:
            buf += ch
        i += 1
    keys.append(buf)
    return [n for n in (k.strip().split(':')[0].strip() for k in keys if k.strip())
            if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', n)]


def match_brace(s, i):
    d = 0
    while i < len(s):
        if s[i] == '{':
            d += 1
        elif s[i] == '}':
            d -= 1
            if d == 0:
                return i
        i += 1
    return -1


def scan(path):
    src = open(path, encoding='utf-8').read()
    fn = os.path.basename(path)
    hits = []
    # 1) sb(`table?...`) 헬퍼   2) fetch(`.../rest/v1/table?...`) 직접 호출
    for m in re.finditer(r"sb\(\s*[`'](?!http)([A-Za-z_][A-Za-z0-9_]*)(\?[^`']*)?[`']", src):
        hits.append((m.start(), m.group(1), m.group(2) or ''))
    for m in re.finditer(r"/rest/v1/([A-Za-z_][A-Za-z0-9_]*)(\?[^`'\"\s]*)?", src):
        hits.append((m.start(), m.group(1), m.group(2) or ''))
    for pos, table, qs in hits:
        where = f'{fn}:{src[:pos].count(chr(10)) + 1}'
        refs[table]
        if qs:
            add_query(table, qs.lstrip('?'), where)
        seg = src[pos: pos + 600]          # 같은 호출 안의 쓰기 바디
        bi = seg.find('JSON.stringify(')
        if bi >= 0:
            ob = seg.find('{', bi)
            if 0 <= ob < bi + 4:
                oe = match_brace(seg, ob)
                if oe > 0:
                    for k in top_keys(seg[ob:oe + 1]):
                        refs[table][k].add(where + '(body)')


def q(p):
    r = urllib.request.Request(B + p, headers={'apikey': K, 'Authorization': 'Bearer ' + K})
    try:
        with urllib.request.urlopen(r, timeout=25) as x:
            return x.status, x.read().decode()[:250]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:250]


def main():
    targets = sys.argv[1:] or [os.path.join(API, f) for f in sorted(os.listdir(API)) if f.endswith('.js')]
    for t in targets:
        scan(t)
    print(f'파일 {len(targets)}개 / 테이블 {len(refs)}개 / 컬럼참조 {sum(len(c) for c in refs.values())}개\n')

    missing, ok = [], 0
    for t in sorted(refs):
        st, body = q(f'{t}?select=zzz_probe_nope&limit=1')
        if '42P01' in body or 'PGRST205' in body or st == 404:
            missing.append((t, '*** 테이블 자체가 없음 ***', []))
            print(f'[테이블없음] {t}')
            continue
        for c in sorted(refs[t]):
            st, body = q(f'{t}?select={c}&limit=1')
            if st == 200 or '42501' in body:
                ok += 1
            elif '42703' in body:
                where = sorted(refs[t][c])
                missing.append((t, c, where))
                print(f'  X {t}.{c} 없음  <- {", ".join(where)}')
            else:
                print(f'  ? {t}.{c} {st} {body[:100]}')

    for t, rels in embeds.items():
        for rel, where in rels:
            st, body = q(f'{t}?select=id,{rel}(*)&limit=1')
            if st == 200 or '42501' in body:
                ok += 1
            else:
                missing.append((t, f'임베딩 {rel}', [where]))
                print(f'  X {t} -> {rel}(...) {st} {body[:120]}  <- {where}')

    print(f'\n=== 존재확인 {ok}건 / 없음 {len(missing)}건 ===')
    if dynamic:
        print('\n[동적 컬럼명 — 스크립트로 판정 불가, 눈으로 확인할 것]')
        for d in dynamic:
            print(f'  {d[0]}  {d[1]}  {d[2][:60]}')
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
