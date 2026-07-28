-- 나이 무관(시니어 환영) 필터 — 2026-07-29
-- job_postings에 boolean 컬럼 추가. 기존 age_limit(만 18세 이상만 지원 가능,
-- 미성년자 보호용)과는 반대 방향 조건이라 별도 컬럼으로 관리한다.

ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS senior_welcome BOOLEAN DEFAULT false;

-- ⚠️ 실행 후 확인할 것: nearby_jobs() RPC가 SELECT * 기반이면 별도 조치 없이
--    이 컬럼이 자동으로 홈 지도 피드까지 실려온다(다른 boolean 플래그들과 동일 구조).
--    만약 RPC 정의가 명시적 컬럼 목록을 반환하는 형태라면 그 목록에도
--    senior_welcome을 추가해야 한다 — Supabase SQL Editor에서 nearby_jobs 함수
--    정의를 열어 확인. 배포 후 시니어 환영으로 표시한 공고 1건을 홈 화면에서
--    실제로 열어 뱃지(👴 나이 무관·시니어 환영)가 뜨는지로 최종 검증할 것.
