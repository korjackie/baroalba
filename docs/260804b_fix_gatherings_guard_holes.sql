-- 🔴 260804_fix_gatherings_rls.sql 후속 패치 — 2026-08-04
--
-- 앞 SQL(모임 쓰기 권한 차단)은 anon 침입을 확실히 막았지만, 트리거가
-- **정상 경로 두 가지를 같이 막고 있다.** 앞 SQL 을 이미 실행했다면 이것도 실행해야 한다.
--
-- ── ① 🔴 관리자 화면의 모임/바로미팅 수정이 전부 막힌다 (회귀) ──────────
--   BEFORE UPDATE 트리거는 **service_role 에도 그대로 걸린다.**
--   RLS 는 service_role 이 우회하지만(BYPASSRLS), 트리거는 우회 대상이 아니다.
--   서버함수가 쓰는 service_role JWT 에는 sub 도 email 도 없으므로
--   트리거에서 uid = NULL, requester_email = NULL → "주최자도 관리자도 아님" 으로
--   판정돼 **카운터 외 모든 변경이 예외로 거부된다.**
--
--   실제로 막히는 곳 (api/admin.js, 전부 svcKey PATCH):
--     save_baromeeting      (1559) 바로미팅 이벤트 수정 — 제목·장소·정원
--     toggle_baromeeting    (1600) 바로미팅 마감/재오픈
--     complete_baromeeting  (1612) 바로미팅 완료 처리
--     update_moim           (1974) 관리자 모임 수정
--     close_moim            (1985) 관리자 강제마감/재오픈
--   ※ api/admin.js:222 은 baromeeting_*_cur 만 쓰므로 카운터 예외로 통과한다(무해).
--
-- ── ② 관리자 판정만 대소문자를 구분한다 (불일치) ────────────────────────
--   저장소의 다른 관리자 판정은 **전부 대소문자 무시**다:
--     is_app_admin()      lower(a.email) = lower(auth.jwt()->>'email')
--     admin.html:1088     .ilike('email', authEmail)
--     api/admin.js:845    email=ilike.<email>
--   그런데 앞 SQL 의 트리거만 `a.email = requester_email` 로 **정확히 일치**를 본다.
--   app_admins 삽입 경로(admin.html:3590 · app.js:17214)는 email 을 소문자로
--   바꾸지 않고 그대로 넣고, **예전 경로는 이메일 수기입력이었다.**
--   대문자가 섞인 행이 하나라도 있으면 그 관리자는
--   **✏️ 빠른수정 버튼은 보이는데 저장은 거부된다** — ②-F 와 똑같은 부류다.
--   → 판정을 새로 짜지 말고 이미 있는 is_app_admin() 을 그대로 쓴다(단일 기준).

CREATE OR REPLACE FUNCTION gatherings_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb := auth.jwt();
  uid uuid := nullif(claims ->> 'sub', '')::uuid;
BEGIN
  -- PostgREST 를 거치지 않은 접속(대시보드 SQL 편집기·마이그레이션·psql)은 통과.
  -- 여기까지 온 시점에 이미 DB 자격증명을 가진 사람이라 트리거로 막을 대상이 아니다.
  IF claims IS NULL THEN
    RETURN NEW;
  END IF;

  -- 서버함수(service_role)는 통과 — ① 참고.
  -- api/admin.js 는 자체적으로 app_admins 이메일 대조(845행)를 거친 뒤에만 여기 온다.
  IF nullif(claims ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 주최자는 전부 수정 가능
  IF uid IS NOT NULL AND uid = OLD.host_id THEN
    RETURN NEW;
  END IF;

  -- 앱 관리자도 전부 수정 가능 (관리자 화면의 제목 빠른수정)
  -- ② 참고 — 대소문자 처리를 여기서 다시 짜지 말 것. 기준은 is_app_admin() 하나뿐이다
  IF public.is_app_admin() THEN
    RETURN NEW;
  END IF;

  -- 그 외에는 참가 인원 카운터 3개 외에 어떤 값도 달라지면 안 된다
  IF (to_jsonb(NEW) - 'current_count' - 'baromeeting_male_cur' - 'baromeeting_female_cur')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'current_count' - 'baromeeting_male_cur' - 'baromeeting_female_cur')
  THEN
    RAISE EXCEPTION '모임 정보는 주최자만 수정할 수 있습니다';
  END IF;

  RETURN NEW;
END $$;

-- 트리거 자체는 앞 SQL 에서 이미 붙어 있다(함수 본문만 교체하면 즉시 반영).
-- 앞 SQL 을 아직 안 돌렸다면 아래 두 줄도 함께 실행할 것.
-- DROP TRIGGER IF EXISTS trg_gatherings_guard_update ON gatherings;
-- CREATE TRIGGER trg_gatherings_guard_update
--   BEFORE UPDATE ON gatherings FOR EACH ROW EXECUTE FUNCTION gatherings_guard_update();


-- ── 실행 후 확인 ───────────────────────────────────────────────────
-- 1) 🔴 침입 차단이 그대로인지 **다시** 볼 것 (이 패치가 뚫지 않았는지 확인)
--    anon 키로 남의 모임 제목을 **다른 값으로** PATCH → [] 여야 한다.
--    ⚠️ 빈 바디 {} 로 시험하지 말 것 — RLS 평가 전에 걸러져 무조건 [] 가 나온다.
--    ⚠️ 요청 뒤 반드시 재조회해서 값이 안 바뀐 것까지 볼 것.
--
-- 2) 관리자 화면 → 바로미팅 목록에서 이벤트 하나를 **마감/재오픈** (①이 고쳐졌는지)
--
-- 3) 관리자 화면 → 모임 목록에서 제목을 바꿔 저장 (①+②)
--
-- 4) 주최자 본인이 앱에서 자기 모임을 [수정]으로 저장
--
-- 5) 다른 계정으로 바로미팅 참가/취소 → 인원수가 오르내리는지 (카운터 예외)
