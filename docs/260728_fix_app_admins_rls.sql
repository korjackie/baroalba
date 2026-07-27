-- ════════════════════════════════════════════════════════════════════
--  긴급 보안 수정 — app_admins 테이블 RLS
--  작성 2026-07-28 · Supabase 대시보드 → SQL Editor 에 붙여넣고 실행
-- ════════════════════════════════════════════════════════════════════
--
-- 무엇이 문제였나
-- ─────────────────────────────────────────────────────────────────────
-- app_admins 에만 RLS가 없어서, 공개된 anon 키만으로 다음이 전부 가능했다.
-- (2026-07-28 실제 확인 — 다른 테이블은 정상 차단됨)
--
--   SELECT → 200. 관리자 이메일 4건이 그대로 조회됨
--   INSERT → RLS를 통과해 unique 제약(23505)까지 도달. 즉 **아무 이메일이나
--            관리자로 등록 가능**했다
--   DELETE → 204. 즉 **기존 관리자를 지우는 것도 가능**했다
--
-- admin.html 의 관문이 "로그인 세션 + app_admins 에 내 이메일이 있는가" 뿐이라,
-- 아무나 가입 → 자기 이메일을 app_admins 에 INSERT → /admin.html 진입이
-- 성립했다. 관리자 화면 자체도 공개 URL이라 주소만 알면 열린다.
--
-- 어떻게 고치나
-- ─────────────────────────────────────────────────────────────────────
-- 이 테이블은 클라이언트가 직접 읽을 이유가 없다. 필요한 건 "내가 관리자인가"
-- 라는 boolean 하나뿐이므로, 테이블 접근은 전부 막고 SECURITY DEFINER 함수로
-- 그 한 가지만 물어보게 바꾼다. 관리자 명단 자체가 노출되지 않는 게 핵심
-- (명단이 보이면 피싱·크리덴셜 스터핑의 표적이 정확히 특정된다).


-- ── 1. 테이블 잠그기 ────────────────────────────────────────────────
alter table public.app_admins enable row level security;

-- RLS를 켜고 정책을 하나도 만들지 않으면 anon/authenticated 는 전부 차단된다.
-- (service_role 은 RLS를 우회하므로 서버·관리 작업엔 영향 없음)
-- PostgREST 노출 자체를 끊기 위해 테이블 권한도 회수한다.
revoke all on table public.app_admins from anon, authenticated;

-- 혹시 과거에 만들어 둔 허용 정책이 남아 있으면 같이 제거할 것.
-- 아래로 현재 정책을 확인한 뒤, 나오는 게 있으면 drop policy 로 지운다.
--   select policyname, cmd, roles from pg_policies
--    where schemaname='public' and tablename='app_admins';


-- ── 2. "내가 관리자인가"만 답하는 함수 ──────────────────────────────
-- security definer = 함수 소유자 권한으로 실행되므로, 호출자가 테이블에
-- 접근 권한이 없어도 내부 조회가 된다. search_path 고정은 필수
-- (안 하면 검색 경로를 바꿔치기해 함수 내부를 가로채는 공격이 가능하다).
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.app_admins a
     where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 로그인한 사용자만 호출 가능. anon 에는 주지 않는다
-- (비로그인 상태에서 물어볼 이유가 없고, 열어두면 이메일 대입 탐색이 가능해진다).
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;


-- ── 3. 적용 후 검증 ────────────────────────────────────────────────
-- 아래를 터미널에서 실행해 401/403 이 나오면 성공.
-- (ANON_KEY 는 config.js 에 있는 공개 키)
--
--   curl -s -o /dev/null -w "%{http_code}\n" \
--     "https://onwvbmllpycgswfzywjv.supabase.co/rest/v1/app_admins?select=*" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
--
-- 그 다음 실제 관리자 계정으로 /admin.html 에 들어가 정상 진입되는지 확인.
-- admin.html 은 함수가 있으면 rpc('is_app_admin')를 쓰고, 없으면 예전처럼
-- 테이블을 읽는 폴백으로 동작하므로 이 SQL 실행 전후 모두 깨지지 않는다.


-- ── 4. 남은 과제(이 파일 범위 밖) ──────────────────────────────────
-- · admin.html 이 여전히 공개 URL이다. 관문을 통과 못 해도 화면 구조와
--   테이블·컬럼명은 소스에서 그대로 읽힌다. 근본 대책은 관리자 화면을
--   별도 배포로 분리하거나 Vercel 인증을 앞에 두는 것.
-- · 관리자 화면이 실제로 수행하는 쓰기 작업들이 각 테이블 RLS로도
--   막히는지 별도 점검 필요. "관리자 UI에서만 호출한다"는 건 방어가 아니다.
