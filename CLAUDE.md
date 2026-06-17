# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 바로알바 — 완전 기술 문서 (2026-06-17 최신)

---

## 1. 절대 규칙 (매 대화 시작 시 자동 적용)

| # | 규칙 | 이유 |
|---|------|------|
| 1 | **owner.html은 redirect 파일 — 직접 편집 금지** | owner 기능은 바로알바.html의 panel-owner에 통합됨. owner.html 1줄 redirect 유지 |
| 2 | **shared-lang.js 수정 시 바로알바.html applyLang 대상 동기화 확인** | 번역키 추가/삭제 시 HTML data-i18n 불일치 발생 가능 |
| 3 | **배포: `git push origin main`만** | Vercel 자동배포. SCP 절대 금지 |
| 4 | **HTML/JS 수정 시 sw.js CACHE 버전 증가** | PWA 캐시 미갱신 방지 |
| 5 | **DML은 JS 클라이언트 직접** | `db.from(...)`으로 처리. SQL 실행 위임 금지 (DDL만 예외) |
| 6 | **버전 파일 생성 금지** | 소스파일은 항상 단일본. `바로알바_v2.html` 같은 파일 생성 불가 |
| 7 | **편집 후 즉시 배포** | 편집만 하고 완료 보고 금지 |

---

## 2. 시스템 구조

### 2-1. 인프라

```
사용자 → baroalba.multimove.co.kr (Vercel)
          ├── 바로알바.html     (알바생 + 업주 통합 앱)
          ├── owner.html        (redirect only → /바로알바.html?tab=postings)
          ├── admin.html        (관리자 전용 대시보드, ADMIN_EMAILS 화이트리스트)
          ├── login.html        (PWA 진입점, manifest start_url)
          ├── shared-lang.js    (번역 데이터 + applyLang() 엔진)
          ├── sw.js             (PWA 서비스워커, 현재 v87)
          ├── manifest.json     (PWA 설정)
          ├── config.js         (앱 설정값)
          └── api/send-push.js  (Vercel 서버리스, Web Push 발송)

GitHub: github.com/korjackie/baroalba (main 브랜치)
Supabase: onwvbmllpycgswfzywjv.supabase.co
  ├── PostgreSQL DB
  ├── Storage (avatars, biz-photos 버킷)
  └── Auth (카카오/네이버/구글 OAuth)
```

### 2-2. 파일별 역할

| 파일 | 역할 | 크기 기준 |
|------|------|-----------|
| `바로알바.html` | 알바생+업주 통합 앱 (지도/스와이프/지원/채팅/마이페이지/커뮤니티 + panel-owner) | ~400KB |
| `owner.html` | 1줄 redirect → `/바로알바.html?tab=postings` (편집 금지) | ~0.1KB |
| `admin.html` | 관리자 전용 대시보드 (ADMIN_EMAILS 화이트리스트, 신고관리/회원관리) | ~30KB |
| `login.html` | 로그인/회원가입 (카카오·네이버·구글·이메일) | ~24KB |
| `shared-lang.js` | 번역 데이터 + applyLang() 엔진 | ~15KB |
| `sw.js` | PWA 캐시 전략 (현재 v87) | ~3KB |
| `manifest.json` | PWA 메타 (background_color: #FF4B4B) | ~1KB |
| `config.js` | DEFAULT_LAT: 37.5445 (성수역), RADIUS: 10km | ~2KB |
| `terms.html` | 이용약관 + 개인정보처리방침 (탭 전환형) | - |
| `CLAUDE.md` | 이 파일. Claude 영구 지침 | - |

### 2-3. 역할(Role) 시스템

```js
currentUser.user_metadata.baroalba_role
  → 'worker'   : 알바생 → workers 테이블
  → 'business' : 업주   → businesses 테이블
```

**역할별 분기 표준 패턴 (커뮤니티, 사진 등 모든 곳에 적용):**
```js
const role = currentUser?.user_metadata?.baroalba_role;
if (role === 'business') {
  const { data: b } = await db.from('businesses').select('id').eq('kakao_uid', currentUser.id).single();
  if (!b) { showToast('업체 정보를 먼저 등록해주세요'); return; }
  insertData.business_id = b.id;
} else {
  const { data: w } = await db.from('workers').select('id').eq('kakao_uid', currentUser.id).single();
  if (!w) { showToast('프로필 등록 후 이용할 수 있어요'); return; }
  insertData.worker_id = w.id;
}
```

### 2-4. 업주 패널 구조 (panel-owner)

- **업주 진입**: `owner.html` 접속 → `/바로알바.html?tab=postings` redirect → `panel-owner` div 활성화
- **panel-owner**: `바로알바.html` 내 `<div id="panel-owner">` (position:fixed, z-index:500)
  - 내 공고 / 지원자 / 채팅(panel-owner-chats) / 지도(panel-owner-map) / 설정(panel-owner-settings)
- **커뮤니티**: 알바생·업주 모두 `바로알바.html` 내 커뮤니티 탭 사용. owner.html에 커뮤니티 코드 없음
- **관리자**: `ADMIN_EMAILS` 배열 화이트리스트 → admin-banner 표시 → `/admin.html` 이동

---

## 3. DB 테이블 전체 구조

### workers
```
id UUID PK, kakao_uid UUID UNIQUE, name TEXT, phone TEXT
age INT, birth_date TEXT, bio TEXT, experience TEXT
rating DECIMAL, review_count INT, skills TEXT[]
noshow_count INT, gender TEXT, region TEXT, email TEXT
photo_url TEXT, vehicles TEXT[], strengths TEXT[], languages TEXT[]
```

### businesses
```
id UUID PK, kakao_uid UUID UNIQUE, biz_name TEXT, name TEXT
phone TEXT, description TEXT, photo_url TEXT
address TEXT, lat FLOAT, lng FLOAT, rating DECIMAL
kindness_rating DECIMAL, review_count INT
```

### job_postings
```
id UUID PK, business_id UUID FK businesses
title TEXT, work_type TEXT (regular/short/spot/errand)
work_days TEXT[], work_start_date DATE, work_end_date DATE
start_time TEXT, end_time TEXT, hourly_wage INT
address TEXT (형식: "장소명\n도로명주소"), lat FLOAT, lng FLOAT
description TEXT, required_people INT, is_premium BOOLEAN
view_count INT, age_limit BOOLEAN, holiday_pay BOOLEAN
```

### applications
```
id UUID PK, job_id UUID FK job_postings, worker_id UUID FK workers
status TEXT CHECK (pending/accepted/rejected/cancelled)
cancel_deadline TIMESTAMPTZ  ← [미실행] DDL 필요
created_at TIMESTAMPTZ
```

### worker_photos
```
id UUID PK, worker_id UUID FK workers
photo_url TEXT NOT NULL, is_main BOOLEAN DEFAULT false
sort_order INT DEFAULT 0, created_at TIMESTAMPTZ
```
- 스토리지: `avatars` 버킷, 경로: `{kakao_uid}/portfolio_{timestamp}.jpg`

### business_photos
```
id UUID PK, business_id UUID FK businesses
photo_url TEXT NOT NULL, is_main BOOLEAN DEFAULT false
sort_order INT DEFAULT 0, created_at TIMESTAMPTZ
```
- 스토리지: `biz-photos` 버킷, 경로: `{kakao_uid}/biz_{timestamp}.jpg`

### community_posts
```
id UUID PK
worker_id UUID FK workers NULL     ← 알바생이 작성한 경우
business_id UUID FK businesses NULL ← 업주가 작성한 경우
category TEXT CHECK (review/info/free/owner/worker)
title TEXT, content TEXT, is_anonymous BOOLEAN DEFAULT false
likes INT DEFAULT 0, comments_count INT DEFAULT 0
is_deleted BOOLEAN DEFAULT false
created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

### community_comments
```
id UUID PK, post_id UUID FK community_posts
worker_id UUID FK workers NULL     ← 알바생 댓글
business_id UUID FK businesses NULL ← 업주 댓글
content TEXT, is_anonymous BOOLEAN DEFAULT false
created_at TIMESTAMPTZ
```

### chats / messages
```
chats: id, job_id FK, worker_id FK, business_id FK, last_message, unread_worker, unread_business
messages: id, chat_id FK, sender_role (worker/business), content, created_at
```

### reports
```
reporter_id UUID, target_id TEXT, target_type TEXT (worker/business/job)
reason TEXT, detail TEXT, status TEXT
```

### RPC 함수 (SECURITY DEFINER)
```sql
increment_post_likes(p_post_id UUID)   -- likes +1, RLS 우회
refresh_comments_count(p_post_id UUID) -- comments_count 재집계
```

### RLS 핵심 패턴
```
workers/businesses CRUD: kakao_uid = auth.uid()  (UUID 타입, ::text 캐스트 금지)
community 글/댓글:
  worker_id IS NOT NULL AND EXISTS(SELECT 1 FROM workers WHERE id=worker_id AND kakao_uid=auth.uid())
  OR
  business_id IS NOT NULL AND EXISTS(SELECT 1 FROM businesses WHERE id=business_id AND kakao_uid=auth.uid())
```

---

## 4. 번역 시스템 (shared-lang.js)

### 구조
```js
WORK_TYPE_LABELS   // 근무형태 (regular/short/spot/errand) × 6개국어
VEHICLE_LABELS     // 이동수단 8종 × 6개국어
STRENGTH_LABELS    // 강점 20종 × 6개국어
TRANSLATIONS       // UI 레이블 70+개 × 6개국어 (ko/en/zh/ja/vi/ru)

currentLang        // 현재 적용 언어
_pendingLang       // 저장 전 미리보기 언어
t(key)             // 현재 언어 번역
tWorkType(code)    // 근무형태 번역
selectLang(lang)   // 미리보기 (저장 X)
saveLang()         // 언어 저장 + applyLang()
applyLang()        // 전체 UI 번역 적용
```

### HTML 번역 속성
```html
data-i18n="key"      <!-- textContent 자동 번역 -->
data-i18n-ph="key"   <!-- placeholder 자동 번역 -->
data-v="bicycle"     <!-- 이동수단 칩 (VEHICLE_LABELS) -->
data-s="strong"      <!-- 강점 칩 (STRENGTH_LABELS) -->
data-wt="regular"    <!-- 근무형태 칩 (WORK_TYPE_LABELS) -->
```

### 언어 저장 흐름
- **알바생**: `saveAllProfileSettings()` → 언어+프로필 동시 저장 → `location.reload()`
- **업주**: `saveOwnerSettings()` (owner.html 자체 함수)

---

## 5. 사진 업로드 구조

### 알바생 포트폴리오 (worker_photos)
```
uploadWorkerPhoto(input)
  → workers 레코드 없으면 → showToast('프로필을 먼저 저장해주세요')
  → 최대 5장 체크
  → openCropModal() → Cropper.js
  → avatars 버킷 업로드
  → worker_photos INSERT { worker_id, photo_url, is_main, sort_order }
  → loadWorkerPhotos()
```

### 업주 업체사진 (business_photos)
```
addBizPhoto(input)
  → businesses 레코드 없으면 → showToast('업체 정보를 먼저 저장해주세요')
  → 최대 5장 체크
  → openCropModal() → Cropper.js
  → biz-photos 버킷 업로드
  → business_photos INSERT { business_id, photo_url, is_main, sort_order }
  → loadBizPhotos()
```

---

## 6. PWA 구조

```
manifest.json
  start_url: ./login.html
  background_color: #FF4B4B  ← 스플래시 흰화면 방지
  theme_color: #FF4B4B

login.html body { background: #FF4B4B }  ← HTML 레벨도 동일색 필수

sw.js (v87)
  SHELL: manifest.json, icons/*.{svg,png}
  전략:
    - HTML: 네트워크 우선
    - CSS/JS/이미지: 캐시 우선
    - Supabase/카카오/네이버: 네트워크 직접
```

---

## 7. Phase별 완료 현황

### Phase 1~12 ✅ 기본 플랫폼
- 회원가입/로그인 (카카오, 네이버, 구글, 이메일)
- 알바생/업주 역할 분리
- 공고 등록/수정/삭제 (업주)
- 지도 기반 공고 표시 (카카오맵)
- 스와이프 공고 탐색
- 지원/수락/거절 플로우
- 1:1 채팅 (업주↔알바생)
- 프로필 등록/수정 (알바생/업주)
- 리뷰/평점 시스템
- PWA 설치 지원

### Phase 13 ✅ 번개등급 시스템
- 알바생 등급: 번개 1~5개 (매너점수 기반)
- 노쇼 카운트 반영

### Phase 14 ✅ PWA 알림
- Web Push 알림 (새 지원, 수락/거절, 채팅)
- 알림 수신 설정 토글 (채팅/합격거절 각각)
- `api/send-push.js` Vercel 서버리스 함수

### Phase 15 ✅ 검색/필터
- 지역·업종 통합 검색
- 근무형태/시급/거리 필터
- 급구(urgent) 필터

### Phase 16 ✅ 공고 부가 기능
- 공고 조회수 카운트
- 북마크 기능
- 공고 복사 (업주)
- 서지 기능
- 공고 비교 기능

### Phase 17 ✅ 공유/지도
- 카카오 공유 SDK 연동
- 공고 URL 공유
- GPS 마커 표시

### Phase 18 ✅ 업주 플랜 UI
- Free / Standard / Premium 플랜 표시
- 프리미엄 공고 강조 표시

### Phase 19 ✅ 약관/신고/인증
- 이용약관 + 개인정보처리방침 (terms.html)
- 신고 기능 (reports 테이블)
- 연령 제한 공고 필터
- 인증 뱃지

### Phase 20 ✅ 프로필 사진 시스템 (2026-06-10~11)
- 알바생 프로필사진 Crop (Cropper.js)
- 알바생 포트폴리오 5장 (worker_photos 테이블)
- 업주 업체사진 5장 (business_photos 테이블)
- Crop 모달 공통화

### Phase 21 ⏸ 보류 — 운송/이사/대행 확장
- 바로이사 (소형이사/짐운반)
- 바로대행 (심부름 카테고리 고도화)
- 바로스태프 (팝업스토어 단기 스태프)

### Phase 22 ✅ 다국어 UI 번역 (2026-06-11)
- shared-lang.js 생성 (두 앱 공통 번역 엔진)
- VEHICLE_LABELS (이동수단 8종 × 6개국어)
- STRENGTH_LABELS (강점 20종 × 6개국어)
- TRANSLATIONS (UI 레이블 70+개 × 6개국어)
- HTML data-i18n 속성 전면 적용 (바로알바.html + owner.html)
- applyLang() data-v/data-s/data-i18n 루프 자동 처리

### Phase 23 ⏳ 진행예정 — 토스페이먼츠 실결제
- 프리미엄 플랜 실결제 연동
- 결제 내역 관리
- 환불 처리

### Phase 24 ✅ 커뮤니티 게시판 (2026-06-11)
- community_posts 테이블 + RLS
- community_comments 테이블 + RLS
- 게시판 카테고리: 전체/업체후기/정보공유/자유/업주전용/알바생전용
- 글쓰기 FAB, 댓글, 좋아요
- 알바생/업주 **통합** 글쓰기·댓글 (worker_id OR business_id)
- 좋아요 즉시 UI 반영 + RPC로 DB 갱신
- 댓글 등록 후 comments_count 즉시 갱신 + 댓글 목록 재로드
- SECURITY DEFINER RPC 함수 (RLS 우회)
- 업주 접근: `바로알바.html?community=1` 리다이렉트

### Phase 25 ✅ 지원취소 마감일 (구현 완료)
- work_type별 취소 마감: 정기 7일 전 / 단기 3일 전 / 스팟 2시간 전
- `calcCancelDeadline(workType, startTime)` 함수로 마감일 계산
- D-day 칩 표시: "취소가능 D-N" / "⏰ 취소가능 N시간 남음" / "취소마감 지남"
- 수락(accepted) 처리 시 자동으로 cancel_deadline 계산 후 저장
- **DDL 상태**: `cancel_deadline TIMESTAMPTZ` 컬럼 운영 중 (코드 읽기/쓰기 모두 동작)

### Phase 26 ⏳ 진행예정 — TWA 플레이스토어
- 법인 구글 개발자 계정 + DUNS 번호 필요
- TWA(Trusted Web Activity) 패키징
- 플레이스토어 등록

### Phase 27 ⏳ 진행예정 — B2B 기업 고객
- 기업 전용 대량 채용 기능
- 계약서 자동 생성
- 인보이스 발행

---

## 8. 현재 버그 / 미완료 작업

| 항목 | 상태 | 처리 방법 |
|------|------|-----------|
| 커뮤니티 댓글 삭제 UI 없음 | 🟡 기능 미구현 | 내 댓글에 × 버튼 추가, `community_comments` DELETE 쿼리 필요 |
| 커뮤니티 게시글 삭제/수정 UI 없음 | 🟡 기능 미구현 | 내 글에 수정/삭제 버튼 추가, `community_posts` UPDATE/DELETE 쿼리 필요 |
| 커뮤니티 댓글 익명 토글 없음 | 🟡 기능 미구현 | 현재 `is_anonymous: false` 하드코딩 → 체크박스 추가 필요 |

---

## 9. 추가 개선 검토 사항

### 9-1. 단기 (바로 작업 가능)
| 항목 | 설명 |
|------|------|
| 커뮤니티 게시글 수정/삭제 | 본인 글 수정/삭제 버튼 (Section 8 미완료 항목) |
| 커뮤니티 댓글 삭제 | 본인 댓글 × 버튼 (Section 8 미완료 항목) |
| 댓글 익명 토글 | 현재 `is_anonymous: false` 하드코딩 → 체크박스 추가 |
| 알바생 스킬 태그 공고 필터 | skills 배열로 매칭 필터링 |

### 9-2. 중기 (1~2주)
| 항목 | 설명 |
|------|------|
| 토스페이먼츠 연동 | 프리미엄 플랜 실결제 |
| 공고 자동 마감 | work_end_date 지나면 is_active=false |
| 채팅 이미지 전송 | 현재 텍스트만 가능 |
| 리뷰 답글 기능 | 업주가 리뷰에 답글 |
| 알림 히스토리 화면 | 받은 알림 목록 조회 |

### 9-3. 장기 (전략)
| 항목 | 설명 |
|------|------|
| 바로이사 서비스 | 소형이사/짐운반 카테고리 독립 서비스화 |
| 바로대행 서비스 | 심부름 카테고리 고도화 |
| TWA 플레이스토어 | 앱 마켓 등록 |
| B2B 기업 고객 | 대량 채용, 계약/인보이스 |
| AI 매칭 | 공고-알바생 자동 추천 |

---

## 10. 개발 워크플로우

### 작업 순서
```
1. 파일 읽기 (Read)
2. 바로알바.html 수정
3. owner.html 동일 내용 적용 (동시!)
4. shared-lang.js 번역 추가 (필요 시)
5. sw.js 캐시 버전 증가
6. git add [수정파일들]
7. git commit
8. git push origin main
9. Vercel 자동배포 확인
```

### DDL 작업 (사용자 직접 실행)
- Supabase Dashboard → SQL Editor
- 테이블 생성, 컬럼 추가, RPC 함수 생성만 여기서
- INSERT/UPDATE/DELETE는 JS 코드로

### 브랜치 전략
- `main` 단일 브랜치 운영 (feature 브랜치 없음)
- 직접 main 푸시

---

## 11. 주요 ID / 키

| 항목 | 값 |
|------|-----|
| 카카오맵 JS 키 | ffcea2fab508898c168f043100b4d550 |
| Supabase URL | onwvbmllpycgswfzywjv.supabase.co |
| 네이버 Client ID | 9DotifcIhyF4lq8bQLU9 (승인완료) |
| 도메인 | baroalba.multimove.co.kr |
| GitHub | github.com/korjackie/baroalba |

---

## 12. 자주 발생하는 에러 패턴

| 에러 | 원인 | 해결 |
|------|------|------|
| `policy "XXX" already exists` | SQL을 두 번 실행 | 무시해도 됨. 정책은 이미 존재 |
| `cannot change return type of existing function` | RPC 함수 반환타입 변경 | `DROP FUNCTION IF EXISTS 함수명(uuid);` 후 재생성 |
| `null reference` 크래시 | 삭제된 HTML 요소를 JS에서 참조 | JS에서 해당 getElementById 라인 제거 |
| 사진 업로드 무반응 | workers/businesses 레코드 없음 | 프로필 먼저 저장 안내 토스트 추가 |
| PWA 캐시 미갱신 | sw.js CACHE 버전 미증가 | CACHE = 'baroalba-vN+1' 증가 |
| UUID 타입 오류 | `kakao_uid::text` 캐스트 | ::text 제거, UUID 그대로 비교 |
