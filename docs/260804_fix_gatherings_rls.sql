-- 🔴 모임(gatherings) 쓰기 권한 잠그기 — 2026-08-04
--
-- 무엇이 문제였나
--   **로그인조차 하지 않은 공개 anon 키로 남의 모임을 수정할 수 있었다.**
--   2026-08-04 실측: 남의 모임 title 을 PATCH → HTTP 200 + 수정된 행 반환.
--   anon 키는 클라이언트 JS(config.js)에 그대로 들어있어 누구나 볼 수 있으므로,
--   "초대받은 사람"이 아니라 **인터넷의 누구든** 모임 제목·장소·참가비·정원을
--   바꾸거나 status 를 closed 로 만들 수 있는 상태였다.
--
--   앱 화면은 주최자에게만 [수정] 버튼을 보여주고 제목 옆 ✏️는 관리자에게만 보인다.
--   **UI 만 막혀 있었고 DB 는 열려 있었다.** 같은 부류를 또 만들지 않으려면
--   "버튼을 숨겼다"가 아니라 "DB 가 거절한다"로 확인할 것.
--
-- ⚠️ 그냥 "주최자만 UPDATE" 로 잠그면 바로미팅이 깨진다
--   참가/취소할 때 **참가자 본인**이 인원 카운터를 직접 올리고 내린다:
--     assets/js/app.js  _finalizeBaromeetJoin()  → baromeeting_male_cur / _female_cur +1
--     assets/js/app.js  (참가 취소)              → 같은 컬럼 -1
--   그래서 "주최자는 전부, 그 외에는 인원 카운터만" 이어야 한다.
--   RLS 정책은 컬럼 단위 비교(NEW vs OLD)를 할 수 없으므로 BEFORE UPDATE 트리거로 막는다.

-- ── 1. RLS 켜기 ────────────────────────────────────────────────────
ALTER TABLE gatherings ENABLE ROW LEVEL SECURITY;

-- 기존 정책 이름을 알 수 없으므로(대시보드에서 만들어진 것 포함) 전부 걷어내고 다시 세운다
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'gatherings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.gatherings', p.policyname);
  END LOOP;
END $$;

-- ── 2. 정책 ────────────────────────────────────────────────────────
-- 조회: 누구나(비로그인 포함). 홈·지도의 모임 목록이 게스트에게도 보여야 한다
CREATE POLICY gatherings_select_all ON gatherings
  FOR SELECT USING (true);

-- 생성: 로그인한 사용자가 본인을 주최자로 해서만
CREATE POLICY gatherings_insert_own ON gatherings
  FOR INSERT TO authenticated
  WITH CHECK (host_id = (auth.jwt() ->> 'sub')::uuid);

-- 수정: 로그인한 사용자만. 어디까지 바꿀 수 있는지는 아래 트리거가 판단한다
--       (비로그인 anon 은 여기서 완전히 차단된다 — 이번 사고의 핵심)
CREATE POLICY gatherings_update_authed ON gatherings
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- 삭제: 주최자만
CREATE POLICY gatherings_delete_own ON gatherings
  FOR DELETE TO authenticated
  USING (host_id = (auth.jwt() ->> 'sub')::uuid);

-- ── 3. 컬럼 단위 가드 (주최자 외에는 인원 카운터만) ────────────────
-- to_jsonb 에서 카운터 컬럼만 빼고 통째로 비교한다.
-- 컬럼을 일일이 나열하지 않으므로 **나중에 컬럼이 추가돼도 자동으로 보호된다**
-- (is_quick / quick_expires_at 처럼 컬럼은 계속 늘어난다).
CREATE OR REPLACE FUNCTION gatherings_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := nullif(auth.jwt() ->> 'sub', '')::uuid;
  requester_email text := auth.jwt() ->> 'email';
BEGIN
  -- 주최자는 전부 수정 가능
  IF uid IS NOT NULL AND uid = OLD.host_id THEN
    RETURN NEW;
  END IF;

  -- 앱 관리자도 전부 수정 가능 (관리자 화면의 제목 빠른수정)
  IF requester_email IS NOT NULL
     AND EXISTS (SELECT 1 FROM app_admins a WHERE a.email = requester_email) THEN
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

DROP TRIGGER IF EXISTS trg_gatherings_guard_update ON gatherings;
CREATE TRIGGER trg_gatherings_guard_update
  BEFORE UPDATE ON gatherings
  FOR EACH ROW EXECUTE FUNCTION gatherings_guard_update();

-- ── 실행 후 확인 (셋 다 해볼 것) ───────────────────────────────────
-- 1) 비로그인 차단 — anon 키로 남의 모임 제목 PATCH 가 막히는지.
--    실행 전에는 HTTP 200 + 행이 돌아왔다. 이제 [] 또는 401 이어야 한다.
--      curl -X PATCH ".../rest/v1/gatherings?id=eq.<모임id>" \
--           -H "apikey: <anon>" -H "Authorization: Bearer <anon>" \
--           -H "Content-Type: application/json" -H "Prefer: return=representation" \
--           -d '{"title":"침입테스트"}'
--    ⚠️ 빈 바디 {} 로 시험하지 말 것 — "바꿀 컬럼 없음"으로 RLS 평가 전에 걸러져
--       무조건 [] 가 나온다. 안전해 보이지만 아무것도 검사하지 않은 것이다.
--
-- 2) 주최자 정상 동작 — 본인 모임을 앱에서 [수정]으로 제목·장소 바꿔 저장되는지
--
-- 3) 바로미팅 참가 정상 동작 — 다른 계정으로 바로미팅에 참가/취소했을 때
--    인원수가 실제로 오르내리는지. 이게 막히면 트리거의 카운터 예외가 안 먹은 것이다.
