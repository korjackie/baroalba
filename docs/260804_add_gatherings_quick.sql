-- 번개모임(quick) 컬럼 추가 — 2026-08-04
--
-- 왜 필요한가
--   모임 개설 폼(submitMoimForm)의 payload 에 is_quick / quick_expires_at 이 항상 실린다.
--   그런데 gatherings 테이블에 두 컬럼이 없어서 **모든 바로모임 개설이 400 으로 실패**하고
--   있었다. 번개모임 토글을 켜든 끄든 상관없이 실패한다 — payload 에 키가 항상 들어가기
--   때문이다. 라이브 에러: "Could not find the 'is_quick' column of 'gatherings' in the
--   schema cache".
--
--   ⚠️ PostgREST 는 없는 컬럼을 **하나만** 알려준다. is_quick 만 추가하면 바로
--      quick_expires_at 으로 같은 에러가 난다. 그래서 둘을 한 번에 추가한다.
--      (2026-08-04 payload 전체 21개 컬럼을 라이브 REST 로 개별 대조해 이 2개만 없음을 확인)

ALTER TABLE gatherings ADD COLUMN IF NOT EXISTS is_quick BOOLEAN DEFAULT false;
ALTER TABLE gatherings ADD COLUMN IF NOT EXISTS quick_expires_at TIMESTAMPTZ;

-- 자동 마감 쿼리(autoCloseExpiredGatherings)가 status='open' + quick_expires_at < now()
-- 로 훑으므로 부분 인덱스를 둔다. 번개모임은 전체 모임 중 소수라 부분 인덱스가 적합하다.
CREATE INDEX IF NOT EXISTS idx_gatherings_quick_expires
  ON gatherings (quick_expires_at)
  WHERE quick_expires_at IS NOT NULL;

-- ── 실행 후 확인할 것 ────────────────────────────────────────────────
-- 1) 컬럼이 실제로 생겼는지 (anon 키로 확인 가능. 400/42703 이 안 나오면 성공)
--      GET /rest/v1/gatherings?select=is_quick,quick_expires_at&limit=1
--
-- 2) 앱에서 바로모임을 **번개 토글 끈 상태로** 하나 개설 → 저장되는지
--    (그동안 한 번도 성공한 적이 없다)
--
-- 3) 번개 토글을 켜고 30분으로 개설 → 목록에 ⚡뱃지가 뜨는지
--
-- 4) 자동 마감은 quick_expires_at 이 지난 뒤 **호스트 본인이 모임 패널을 열 때** 돈다
--    (autoCloseExpiredGatherings 는 host_id = 본인 조건이 있다). 즉 남의 만료된
--    번개모임은 호스트가 앱을 열기 전까지 목록에 남는다 — 기존 gathering_date 마감과
--    똑같은 한계이고 이번 변경으로 새로 생긴 문제가 아니다. 전역 마감이 필요해지면
--    api/cron 쪽에서 서비스 롤로 도는 잡을 따로 만들어야 한다.
