# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 바로알바 — Claude 개발 지침서 (2026-06-29 최신)

---

## 1. 절대 규칙

| # | 규칙 | 이유 |
|---|------|------|
| 1 | **owner.html 편집 금지** | redirect 전용 파일. 업주 기능은 바로알바.html의 panel-owner에 있음 |
| 2 | **배포: `git push origin main`만** | Vercel 자동배포. SCP 절대 금지 |
| 3 | **HTML/JS 수정 시 sw.js CACHE 버전 증가** | PWA 캐시 미갱신 방지 |
| 4 | **DML은 JS 클라이언트 직접** | `db.from(...)`으로 처리. SQL 실행 위임 금지 (DDL만 예외) |
| 5 | **버전 파일 생성 금지** | 소스파일은 단일본. `바로알바_v2.html` 불가 |
| 6 | **편집 후 즉시 배포** | 편집만 하고 완료 보고 금지 |
| 7 | **같은 기능은 소스 복붙 + 변수명만 교체** | 재해석 구현 절대 금지 |
| 8 | **shared-lang.js 수정 시 data-i18n 동기화 확인** | 번역키 불일치 방지 |
| 9 | **Android 리빌드 시 versionCode 반드시 +1** | Play Console은 같거나 낮은 versionCode APK 업로드 거부. 예외 없음 |
| 10 | **버전체크/캐시초기화 로직은 app.js의 `_APP_V` 하나로만 판단** | 다른 파일(HTML head 등)에 별도 버전 상수를 만들지 말 것. `localStorage.getItem('_baroV') !== _APP_V`로 통일. 2026-07-13 이 규칙을 어겨서 캐시가 몇 주째 안 지워지는 버그가 있었음 |

---

## 2. 시스템 구조

### 2-1. 인프라

```
사용자 → baroalba.multimove.co.kr (Vercel)
          ├── 바로알바.html     (알바생 + 업주 통합 앱 ~450KB)
          ├── owner.html        (redirect only → /바로알바.html?tab=postings)
          ├── admin.html        (관리자 전용, ADMIN_EMAILS 화이트리스트)
          ├── login.html        (PWA 진입점 + 웹 스플래시)
          ├── shared-lang.js    (번역 데이터 + applyLang())
          ├── sw.js             (PWA 서비스워커, 현재 v528, 배포마다 갱신 - 정확한 값은 sw.js 직접 확인)
          ├── manifest.json     (PWA 설정, start_url: ./login.html)
          └── api/send-push.js  (Vercel 서버리스, Web Push 발송)

GitHub: github.com/korjackie/baroalba (main 브랜치)
Supabase: onwvbmllpycgswfzywjv.supabase.co
  ├── PostgreSQL DB
  ├── Storage (avatars, biz-photos 버킷)
  ├── Auth (카카오/네이버/구글 OAuth + 이메일)
  └── Realtime (채팅 구독)
Firebase: FCM (Android 푸시알림)
```

### 2-2. 역할(Role) 시스템

```javascript
currentUser.user_metadata.baroalba_role
  → 'worker'   : 알바생 → workers 테이블
  → 'business' : 업주   → businesses 테이블 + panel-owner 활성화
```

역할별 분기 표준 패턴:
```javascript
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

### 2-3. 마이페이지 서브패널 구조

```
panel-profile (position:fixed, z-index:300)
├── 프로필 헤더 + 통계 바 (지원건수 / 평점)
├── mp-row 섹션 (iOS Settings 스타일)
│   └── 각 row onclick → openMpSub('name') or goToMyApplications()
└── mpsub-* 서브패널 (transform:translateX(100%), .show 클래스로 전환)
    ├── mpsub-income     수입 달력
    ├── mpsub-following  팔로잉 업체 목록
    ├── mpsub-basic      기본정보 편집
    ├── mpsub-portfolio  포트폴리오 사진 (최대 5장)
    ├── mpsub-skills     스킬/경력/학력/선호/이동수단
    ├── mpsub-docs       자격서류 업로드
    ├── mpsub-noti       알림 설정 (채팅/상태/댓글/맞춤)
    └── mpsub-lang       언어 선택 (6개국어)

// 서브패널 제어
function openMpSub(name) {
  document.getElementById('mpsub-' + name)?.classList.add('show');
  if (name === 'income') loadWorkerIncome();
}
function closeMpSub(name) {
  document.getElementById('mpsub-' + name)?.classList.remove('show');
}
```

### 2-4. 스플래시 구조 (login.html)

```javascript
// 4초 최소 보장 헬퍼
function _afterSplash(fn) {
  const elapsed = Date.now() - _splashShowTime;
  const remain = Math.max(0, 4000 - elapsed);
  setTimeout(fn, remain);
}

// 모든 앱 진입 분기에서 반드시 _afterSplash() 래핑
onAuthStateChange → _afterSplash(goToApp)
no-session fallback → _afterSplash(showLoginScreen)
```

### 2-5. Android 구조

```
android/app/build.gradle
  versionCode 29, versionName '1.5.4' (2026-07-16 기준, 13-6 참고)
  implementation 'androidx.core:core-splashscreen:1.0.1'
  implementation platform('com.google.firebase:firebase-bom:33.1.0')

Android 스플래시 해결 구조:
  1. ic_splash_icon.xml → 투명 벡터 (OS 강제 아이콘 렌더링 제거)
  2. Theme.LauncherActivity → SplashScreen API 즉시 dismiss
  3. webView.setBackgroundColor(Color.parseColor("#C8102E")) → 흰색 플래시 방지

AndroidBridge (JS ↔ Native):
  share(title, text, url)        네이티브 공유
  showKeyboard()                 SHOW_FORCED 강제 유지
  hideKeyboard()                 guard 해제 + 키보드 닫기
  setScrollKbGuard(bool)         채팅 전송 중 스크롤 guard
  saveAuthToken(token)           JWT → SharedPreferences

CSS 변수 주입 (Android → WebView):
  --sat : status bar top (dp)
  --sab : navigation bar bottom (dp)
  _onNativeKbChange(dp) : 키보드 높이 콜백
  _onFCMToken(token)    : FCM 토큰 전달 콜백
```

---

## 3. DB 테이블 구조

### workers
```
id UUID PK | kakao_uid UUID UNIQUE | name TEXT | phone TEXT
age INT | birth_date TEXT | bio TEXT | experience TEXT
rating DECIMAL | review_count INT | skills TEXT[]
noshow_count INT | gender TEXT | region TEXT | email TEXT
photo_url TEXT | vehicles TEXT[] | strengths TEXT[] | languages TEXT[]
```

### businesses
```
id UUID PK | kakao_uid UUID UNIQUE | biz_name TEXT | name TEXT
phone TEXT | description TEXT | photo_url TEXT
address TEXT | lat FLOAT | lng FLOAT | rating DECIMAL
kindness_rating DECIMAL | review_count INT
```

### job_postings
```
id UUID PK | business_id UUID FK businesses
title TEXT | work_type TEXT (regular/short/spot/errand)
work_days TEXT[] | work_start_date DATE | work_end_date DATE
start_time TEXT | end_time TEXT | hourly_wage INT
address TEXT | lat FLOAT | lng FLOAT | description TEXT
required_people INT | is_premium BOOLEAN | is_active BOOLEAN
view_count INT | age_limit BOOLEAN | holiday_pay BOOLEAN
is_remote BOOLEAN (비대면)
```

### applications
```
id UUID PK | job_id UUID FK | worker_id UUID FK
status TEXT CHECK (pending/accepted/rejected/cancelled)
cancel_deadline TIMESTAMPTZ | message TEXT
created_at TIMESTAMPTZ
```

### worker_photos / business_photos
```
id UUID PK | [worker/business]_id UUID FK
photo_url TEXT | is_main BOOLEAN DEFAULT false | sort_order INT DEFAULT 0
Storage 경로:
  avatars/{kakao_uid}/portfolio_{timestamp}.jpg
  biz-photos/{kakao_uid}/biz_{timestamp}.jpg
```

### chats / messages
```
chats: id | job_id FK | worker_id FK | business_id FK
       last_message | unread_worker | unread_business
messages: id | chat_id FK | sender_role (worker/business)
          content | image_url | created_at
```

### community_posts / community_comments
```
posts: id | worker_id UUID NULL | business_id UUID NULL
       category TEXT (review/info/free/owner/worker)
       title TEXT | content TEXT | is_anonymous BOOLEAN
       likes INT | comments_count INT | is_deleted BOOLEAN
comments: id | post_id FK | worker_id NULL | business_id NULL
          content TEXT | is_anonymous BOOLEAN
```

### reports
```
reporter_id UUID | target_id TEXT | target_type (worker/business/job)
reason TEXT | detail TEXT | status TEXT
```

### RPC 함수 (SECURITY DEFINER)
```sql
increment_post_likes(p_post_id UUID)
refresh_comments_count(p_post_id UUID)
```

### RLS 핵심 패턴
```
workers/businesses: kakao_uid = auth.uid()  (UUID 타입, ::text 캐스트 금지)
community 글/댓글:
  worker_id IS NOT NULL AND EXISTS(SELECT 1 FROM workers WHERE id=worker_id AND kakao_uid=auth.uid())
  OR business_id IS NOT NULL AND EXISTS(SELECT 1 FROM businesses WHERE id=business_id AND kakao_uid=auth.uid())
```

---

## 4. 번역 시스템 (shared-lang.js)

```javascript
WORK_TYPE_LABELS   // 근무형태 (regular/short/spot/errand) × 6개국어
VEHICLE_LABELS     // 이동수단 8종 × 6개국어
STRENGTH_LABELS    // 강점 20종 × 6개국어
TRANSLATIONS       // UI 레이블 70+개 × 6개국어 (ko/en/zh/ja/vi/ru)

t(key)             // 현재 언어 번역
selectLang(lang)   // 미리보기 (저장 X)
saveLang()         // 저장 + applyLang()
applyLang()        // 전체 UI 번역 적용
```

```html
data-i18n="key"      <!-- textContent 자동 번역 -->
data-i18n-ph="key"   <!-- placeholder 자동 번역 -->
data-v="bicycle"     <!-- 이동수단 칩 -->
data-s="strong"      <!-- 강점 칩 -->
data-wt="regular"    <!-- 근무형태 칩 -->
```

국적 드롭다운 확정 순서 (절대 변경 금지):
`한국 / 중앙아시아 / 베트남 / 러시아 / 중국 / 일본 / 미국 / 기타`

---

## 5. 사진 업로드 구조

### 알바생 포트폴리오
```
uploadWorkerPhoto(input)
  → workers 레코드 없으면 → 프로필 먼저 저장 안내
  → 최대 5장 체크
  → openCropModal() → Cropper.js
  → avatars 버킷 업로드
  → worker_photos INSERT { worker_id, photo_url, is_main, sort_order }
```

### 업주 업체사진
```
addBizPhoto(input)
  → businesses 레코드 없으면 → 업체 정보 먼저 등록 안내
  → 최대 5장 체크
  → openCropModal() → Cropper.js
  → biz-photos 버킷 업로드
  → business_photos INSERT { business_id, photo_url, is_main, sort_order }
```

---

## 6. PWA 구조

```
manifest.json
  start_url: ./login.html
  background_color: #FF4B4B
  theme_color: #FF4B4B

sw.js (배포마다 버전 바뀜 - _APP_V와 동일 번호로 lockstep, 하드코딩된 특정 버전 문서화하지 않음)
  SHELL: manifest.json, icons/*.{svg,png}
  전략:
    - HTML: 네트워크 우선
    - CSS/JS/이미지: 캐시 우선
    - Supabase/카카오/네이버: 네트워크 직접
```

---

## 7. Phase별 완료 현황

### Phase 1~12 ✅ 기본 플랫폼 (2026-06-01)
- 인증 (카카오/네이버/구글/이메일), 역할 분리
- 카카오맵, GPS, 스와이프 탐색
- 공고 등록/수정/삭제, 지원/수락/거절
- 1:1 채팅, 프로필, 리뷰/평점, PWA

### Phase 13~16 ✅ 기능 확장 (2026-06-02~04)
- 바로심부름 근무형태, 북마크, 조회수
- Web Push 알림 (`api/send-push.js`)
- 카카오 공유 SDK
- 위치 입력 3탭 구조

### Phase 17~19 ✅ 안정화 (2026-06-08~10)
- 미성년자 보호 (`age_limit`), 인증 뱃지
- 딥링크 쿼리 개선, 다수 버그 수정

### Phase 20~24 ✅ 다국어 + 커뮤니티 (2026-06-11~12)
- **shared-lang.js** 6개국어 번역 엔진
- 프로필 사진 Crop + 포트폴리오 5장
- **커뮤니티 게시판** (글쓰기/댓글/좋아요/RPC)
- 지원 취소 마감기한 (`cancel_deadline`)
- 지도 마커 리디자인 (공고유형 + D-day)

### Phase 25~30 ✅ Supabase 전환 (2026-06-15~19)
- Storage 자격서류 업로드
- on-air 토글, 재방문율 뱃지
- 즐겨찾기 알바생 Supabase 동기화
- OTP 8자리, 구글 OAuth Samsung 브라우저 버그 수정

### Phase 31~36 ✅ AI 추천 + 채팅 고도화 (2026-06-20~22)
- **AI 맞춤 추천** (열람/스와이프 이력 기반)
- 공고 사진 3장 + Crop, 상세 미니맵
- **급여계산기** (주휴수당 + 실수령액)
- **FCM 푸시알림** 완성 + VAPID
- **채팅 이미지 전송**, 전체화면 채팅
- **스카우트 제안**, **수입 달력**
- 업주 팔로우 + 새 공고 팔로워 알림
- 비속어 필터, 공고 날짜 과거 선택 차단
- 채팅 UI 스냅챗 스타일 (탭/아바타/즐겨찾기)
- 미소 앱 벤치마킹 6개 구현

### Phase 41 ✅ 레슨/과외/전문기술 매칭 패널 (2026-06-26)
- `panel-lesson` 독립 전체화면 패널
- 레슨 탭: 스포츠·음악·댄스·미술
- 과외 탭: 어학·수학/과학·국어/인문
- 전문기술 탭: 현장·시설·크리에이티브·IT·뷰티·언어
- `panel-lesson-manage`: 강사 등록/관리 패널
- 필터바에 레슨/과외/전문기술 드롭다운 칩 통합
- 6개국어 i18n 완성 (lesson_tab_lesson, lesson_tab_tutoring, lesson_tab_technical)

### Phase 37~40 ✅ UX 안정화 (2026-06-23~25)
- **언어 우대 배지** + 내 언어 필터
- 키보드 처리 네이티브 IME 기반으로 완전 개선
- Android EXTRA_ALLOW_MULTIPLE (다중 파일 선택)
- Supabase v2 `.single().catch` → try/catch 전환

### Phase 41~44 ✅ 벤치마킹 + 비대면 (2026-06-26~27)
- **비대면 알바** 기능 (`is_remote`, 필터, 뱃지)
- **채팅 딥링크** + **인라인 답장**
- 해주세요 앱 벤치마킹 5개 항목

### Phase 45~50 ✅ 마이페이지 전면 개편 (2026-06-28)
- row 네비게이션 + **8개 서브패널** 구조
- 스플래시 통합 (login.html 타이핑 애니메이션)
- `_afterSplash(fn)` — 4초 최소 보장
- Android 스플래시 완전 해결 (투명 아이콘 + WebView 배경색)
- 지원현황 패널 진입 버그 + 스크롤 수정

### Phase 23 ⏳ 결제 연동
- 토스페이먼츠 프리미엄 플랜 실결제

### Phase 26 ⏳ iOS 앱
- WebView 래퍼 앱, App Store 등록

### Phase 51~55 ✅ 바로미팅 승인단계 + 앱 구조 개편(FAB/지도/필터) + 치명적 버전버그 수정 (2026-07-12~13)

**바로미팅 승인 단계 신규 구현**
- 신청 시 `status='pending'`으로 저장, 관리자 승인/거절 필요 (기존엔 즉시확정)
- 관리자페이지에 승인/거절 버튼 + 카운트 재계산(`recomputeBaromeetCounts`, 수동 +1/-1 대신
  매번 실제 승인건수로 덮어써 데이터 드리프트 원천 차단)
- 관리자 바로미팅 탭 재구성: 목록만 먼저 보이고 "+새로 개설" → 바로미팅/바로스팟 선택 →
  개설폼은 `detail-overlay` 슬라이드업 시트로 분리 (sticky 푸터 스크롤 컷오프 버그 구조적 해결)

**앱 구조 개편 (플랜: `~/.claude/plans/lovely-sparking-plum.md` 참고)**
- 가운데 FAB를 조회용 대시보드에서 "바로+" 등록 액션시트로 전환
  (바로모임 개설/공고 등록/레슨·과외 등록/모임·만남 개설요청 4옵션)
- 지도에 전체/알바/모임/만남 4단 통합 핀 모드 추가, 바로미팅 좌표는 관리자 저장 시
  카카오 지오코더로 자동 확보
- 지도 필터를 "필터설정" 버튼 뒤로 정리 + 바로만남 연령대/참가비 필터, 바로모임 카테고리
  필터(챌린지 포함 5종), 지역 빠른이동(2단계: 서울/경기/광역시개별/지방)
- 바로미팅 단체채팅: 뒤로가기≠나가기로 분리, 명시적 "나가기"만 참가취소 확인,
  채팅목록 스와이프 나가기도 모임/만남에 활성화

**치명적 버그 2건 발견/수정 (근본원인, 13-1 참고)**
- `index.html`이 v1.4.1 시점 앱 전체를 얼려둔 사본이었고 자체 버전가드가 한 번만 리다이렉트
- `바로알바.html` head의 `V='421'` 하드코딩이 app.js `_APP_V`와 동기화 안 돼 캐시 초기화가
  세션 내내 전혀 실행되지 않음 → localStorage 기반 단일 버전판정으로 통합, head 중복 로직 제거

### Phase 56 ✅ 바로만남 전체 점검 + 바로스팟 안전/기능 확장 (2026-07-15, v496~v499)

**전체 점검 (바로만남/바로모임/바로알바 공통 패턴 감사)**
- track-overlay(z-index:8700)가 채팅 패널(barospot-chat 520, moim-chat 530)보다 위라
  트래킹 시트에서 채팅으로 들어가면 화면이 가려지던 버그 - 양쪽 다 수정
- `panel-barospot-chat`이 전역 뒤로가기 핸들러/`setNav` 정리 목록에 아예 없던 문제 추가
- 위치공유 "출발했어요/도착했어요" 버튼 - 수동 클릭 시 확인 없이 조용히 멈추기만 해서
  의미없이 토글되던 문제를 도착확인 다이얼로그 + 도착 후 버튼 잠금으로 개선
- 키보드가 입력창을 가리는 처리(`_onNativeKbChange`)에 `panel-barospot-chat` 누락 추가
- `swipe-screen` 헤더에 상태표시줄 안전영역(`--sat-safe`) 처리 누락 추가
- 레슨/과외 등록·상세 모달의 핸들바가 시각적으로만 있고 드래그 바인딩이 없던 문제 수정

**바로스팟 채팅 실사용 버그 3건 (실제 사용 중 발견)**
- 메시지 전송이 realtime 에코에만 의존해 본인 화면에도 안 나타나던 문제 → 낙관적 렌더로 수정
- `loadMyChatList`에 `chat_rooms`/`chat_messages` 조회가 아예 없어 바로스팟 채팅방이
  채팅 목록에 안 보이던 문제 → 목록/안읽음뱃지/클릭 라우팅 추가

**바로스팟 안전/기능 확장**
- 1:1 채팅에 신고하기 버튼 추가 (기존 reports 테이블/모달 재사용)
- recruiting_male 단계 남성 신청 건수를 여성에게 노출
- 확정 후 일정 24시간 전까지 자발적 취소 시 결제수단대로 전액환불 (상대방 확정건도 연동 취소)
- 서비스별(바로미팅/바로스팟/바로모임) 알림 개별 토글 - 서버(`notifyUser`)에서 실제 차단
- 만남 후 상호평가(별점+태그) - `barospot_reviews` 테이블, 호감표시와 무관하게 독립 동작

**필요 DDL (대표님 Supabase 대시보드에서 직접 실행 필요, 2026-07-15 대화 중 전달)**
- `workers.notify_baromeeting/notify_barospot/notify_moim` BOOLEAN DEFAULT true
- `barospot_applications.paid_method/paid_amount/cancelled_at`
- `barospot_reviews` 신규 테이블 (RLS 포함)
- ✅ 2026-07-16 대표님이 Supabase에서 직접 실행 완료

---

### Phase 57 ✅ 실사용 피드백 대응 + 프로필 시스템 개편 + 관리자페이지 정비 (2026-07-15~16, v500~v506)

**채팅 체감속도·UI 통일 (v500~v501)**
- 바로스팟 채팅 열 때 프로필조회 API까지 끝난 뒤에야 패널을 보여줘서 다른 채팅보다
  느리게 느껴지던 문제 - 인가 확인만 끝나면 패널부터 보여주고 나머지는 병렬 처리
- 채팅목록 바로미팅/바로스팟 로즈톤이 진하다는 피드백으로 톤다운(#ffe4e8→#fff3f4)
- 홈 화면 게시판/신뢰랭크 배너를 바로모임·바로만남과 같은 크기로 통일(두꺼워 보이던 문제)
- 커뮤니티 게시글 좋아요 버튼과 수정/삭제 버튼이 서로 다른 줄에 있던 것을 한 줄로 배치
- 바로미팅/바로스팟 신청 전 프로필(사진·나이·직업군·체형) 완성 여부를 체크해서 비어있으면
  안내 다이얼로그로 바로 이동시키는 게이트 신설 (`_checkBarospotEligibility`,
  `_datingProfileGap`, `_promptCompleteDatingProfile`)

**채팅목록 로딩 무한대기 버그 (v502~v503)**
- `loadMyChatList`에 에러 처리가 전혀 없어서, 알바채팅/모임채팅/바로스팟채팅 중 하나만
  실패해도 전체 목록이 스피너에서 영원히 멈춰있던 구조적 버그 - 3개 섹션을 독립 함수로
  분리해 병렬 실행 + 섹션별 에러 격리로 재구성 (속도도 함께 개선)
- 커뮤니티 댓글 입력창(comm-post-sheet), 업주 평점 모달, 신고 모달에 키보드 가림 처리
  누락 발견/추가

**관리자페이지(admin.html) 정비**
- 바로스팟 개설·관리 화면이 개설폼+목록+신청관리가 한 페이지에 이어붙어 있어서 혼란을
  준 것을, 바로미팅 관리 화면과 동일한 패턴(목록+"새로 개설" 슬라이드업 시트+카드클릭
  상세)으로 재구축. 목록 카드는 "눌러서 배정정보 보기" 대신 "신청 현황 · 여성 N · 남성 M"
  으로 실제 수치 표시
- **키보드 가림 디버깅 삽질**: admin.html의 바로스팟 개설 메모 등에서 키보드가 입력창을
  가리는 문제를 처음엔 `visualViewport`/`resize` 이벤트로 여러 번 새로 짜서 고치려
  했으나 계속 재발 - 진짜 원인은 `admin.html`도 `baroalba.multimove.co.kr` 도메인이라
  AAB 앱 WebView 안에서 그대로 로드되어(`MainActivity.java`가 이 도메인을 외부로 안
  보내고 내부 로드) 네이티브가 이미 `window._onNativeKbChange(dp)`로 정확한 키보드
  높이를 계속 보내주고 있었는데 `admin.html`엔 이 함수 자체가 정의돼 있지 않아 값을
  계속 버리고 있었던 것. app.js와 동일한 패턴으로 이식해서 근본 해결 (교훈은 13-7 참고)

**대표사진/포트폴리오 혼선 해결**
- "포트폴리오"(최대 5장)와 앱 전체 아바타로 쓰이는 "대표사진"(`workers.photo_url`)이
  서로 다른 슬롯이라, 포트폴리오만 올리고 대표사진은 안 올려서 프로필 완성 게이트가
  계속 막히는 실사용자 신고 발생 - 저장 시 대표사진이 비어있으면 포트폴리오 첫 장으로
  자동 백필
- 프로필 완성 안내가 곧바로 "기본정보" 서브패널을 열어서, 사진 업로드(`uploadAvatar`)가
  있는 프로필 헤더 아바타를 그 화면이 통째로 가려버려 사진 올릴 방법 자체가 안 보이던
  결정적 버그 - 메인 마이페이지 화면에 머물러 아바타와 기본정보 진입이 둘 다 보이게 수정

**바로만남 공개 프로필 정식화면 승격**
- 마이페이지 기본정보에 "바로만남 공개 프로필" 배너 추가 - 계정 프로필과 완전히
  별개인 화면이라는 걸 몰라서 못 찾던 유저들 피드백 반영
- 바텀시트(`openDatingProfileSheet`)를 정식 서브패널(`mpsub-mannam-profile`)로 승격,
  바로만남 탭 "내 프로필" 버튼도 동일 화면으로 통합
- 공개 사진을 대표사진 재사용 또는 바로만남 전용 사진(`dating_photo_url`) 중 선택 가능
- 키(`height_cm`), MBTI(4쌍 토글) 항목 추가, 블라인드 미리보기/매칭공개 화면 전부 반영

**필요 DDL (2026-07-16 대화 중 전달, 대표님 실행 완료)**
- `workers.height_cm INT`, `workers.mbti TEXT`, `workers.dating_photo_url TEXT`

**미해결/재확인 필요**
- ✅ 해결 (v527, 2026-07-16, Phase 58 참고) - `.mpsub-panel`이 `.full-panel`과 달리
  `inset:0`으로 상태표시줄 뒤부터 시작하던 구조적 불일치가 원인이었음

---

### Phase 58 ✅ 전수감사 + 상태표시줄 근본원인 + 백버튼/DOM 부재/키보드 일괄 수정 (2026-07-16, v527~v528)

**상태표시줄 가림 근본 원인 (v527)** — 네 번째 시도 만에 특정
- `.full-panel`(마이페이지 등)은 `top:var(--sat-safe)`로 패널 자체가 상태표시줄 아래서
  시작하는데, `.mpsub-panel`(프로필편집 등 서브화면)만 `inset:0`으로 화면 맨 위부터
  꽉 채우고 헤더 padding으로만 보정하던 구조적 불일치가 진짜 원인. `.mpsub-panel`도
  `top:var(--sat-safe)`로 통일 + `_enforceMpsubSafeArea()`가 `--sat` 실측 후 인라인
  style로 재차 강제 적용
- **교훈**: CSS 변수 해석 결과를 못 믿게 된 상황에서도, 같은 세션 안에서 이미 읽은
  `.full-panel`의 정답 패턴을 스스로 연결짓지 못하고 세 번을 헤맸다. "안 된다"는
  신고를 받으면 그 화면만 보지 말고 **같은 성격의 다른 화면과 CSS 구조를 diff로
  비교**할 것 (13-1 원칙의 연장)

**전수감사로 발견한 3개 버그 클래스 일괄 수정 (v528)**
- **DOM 자체가 없던 기능**: `openOwnerReport()`/`openBizCropModal()`이 참조하는
  `owner-report-modal`/`biz-crop-modal`이 실제 `바로알바.html`에 존재하지 않고
  (미배포 목업 폴더 "바로만남 테스트/*.html"에만 있었음) `uploadOwnerAvatar()`에서
  실제로 호출되고 있어, **업주가 업체 프로필/업체사진을 올리려 하면 크롭 화면 자체가
  안 뜨고 조용히 실패**하고 있었음(신고하기 버튼도 동일). 알바생용 `crop-modal`/
  `report-modal`과 동일 구조로 복붙해 추가
- **백버튼 미등록 (12개 모달)**: `apply-msg-modal`, `biz-rating-modal`, `report-modal`,
  `owner-report-modal`, `community-post-overlay`, `crop-modal`, `biz-crop-modal`,
  `guest-login-modal`, `wage-calc-modal`, `qr-modal`, `onboarding-overlay`,
  `lesson-register-modal`이 `WATCH_IDS`/popstate 캐스케이드 어디에도 없어 하드웨어
  뒤로가기 시 앱이 그대로 종료되던 문제(`.mpsub-panel`과 동일 버그 클래스) - 전부 등록.
  `panel-barospot-chat`도 개별 `pushState` 대신 `WATCH_IDS`로 일원화(방어적 통일)
- **프로필편집 키보드 가림**: `.mpsub-panel`은 네이티브 `adjustResize`로 창은 줄어들어도
  포커스된 입력창까지 자동으로 안 딸려와, 자기소개처럼 스크롤 아래쪽 필드는 여전히
  키보드에 가려짐(2026-07-16 실사용 피드백) - `_onNativeKbChange`에서 포커스 요소를
  `scrollIntoView`로 명시 처리, `.mpsub-panel` 공유 클래스라 전체 서브폼에 일괄 적용

**정정 (2026-07-16 같은 날 재조사)**: 처음엔 `wage-transfer-modal`/`contract-modal`도
`banned-agree-overlay`/`photo-tip-overlay`와 같은 "완전히 죽은 코드"로 잘못 보고했음 —
원인은 `app.js`만 grep하고 `assets/js/app_ui.js`(별도 스크립트 파일)를 안 봤기 때문.
실제로는:
- `wage-transfer-modal`/`showContractModal`은 **`app_ui.js`에 이미 완전히 구현·연결돼
  있었음** (STAFF 관리 패널의 "송금하기" 버튼, 최종합격 500ms 후 자동 표시). 다만
  `showContractModal`이 존재하지 않는 컬럼 `job_postings.hourly_wage`를 참조해 계약서
  임금란이 항상 "협의"로만 나오던 버그가 있어 `current_wage`로 수정(v529)
- `banned-agree-overlay`/`photo-tip-overlay`는 `app_ui.js`에 `checkBannedAgree()`/
  `showPhotoTip()` 함수 자체는 있었지만 **부르는 곳이 정말 없어서** 진짜 죽어있었음.
  `checkBannedAgree()`는 `applyJob()`에서 `work_type==='errand'`일 때 지원 전에
  호출하도록, `showPhotoTip()`은 프로필 사진 빈 슬롯 클릭 시 호출하도록 연결(v529).
  동의 여부는 계정별이 아니라 기기별 `localStorage`로 추적됨 - 계정 단위/서버 감사
  기록이 필요하면 DDL로 컬럼 추가 후 별도 요청할 것
- **`app_ui.js`가 5개 버전 lockstep(`_APP_V`)에 아예 빠져있었음** — 캐시 버스팅 쿼리가
  없어 PWA 캐시에 구버전이 고착될 수 있는, 13-5 교훈3과 동일한 유형의 잠재 버그.
  `?v=` 쿼리 추가하고 이후 lockstep에 포함시킴(v529)
- `qrcode.min.js?v=463`, `jsqr.min.js?v=463`도 여전히 lockstep 밖 — 당장 위험은 아니지만
  나중에 이 라이브러리를 갱신하며 쿼리를 안 올리면 같은 유형의 드리프트가 재발할 수 있음
- 이 문서의 "3. DB 테이블 구조" 중 `job_postings` 컬럼 목록이 실제 payload/쿼리와 크게
  어긋나 있어(`hourly_wage`→`current_wage` 등) 문서가 오래된 상태로 보임 — Supabase
  대시보드에서 실제 컬럼 확인 후 갱신 필요
- **교훈**: 이 프로젝트는 HTML+CSS+JS가 `바로알바.html`/`app.js`/`app_ui.js`/`style.css`
  4개 파일에 나뉘어 있다. 특정 기능이 "죽었다/없다"고 결론 내리기 전에 **4개 파일
  전부**를 grep했는지 반드시 확인할 것 (13-1 원칙의 연장 — 결론 내리기 전 관련 파일을
  다 읽었는지 체크)

**디자인 토큰 정리 (v529)**
- `--red`(기존)가 있는데도 리터럴 `#C8102E`가 42곳에서 따로 쓰이고 있던 것 발견,
  `--purple`(#7C3AED)/`--blue`(#3B82F6)/`--green`(#16a34a) 신규 추가 후 총 96곳을
  변수 참조로 통일. 값 자체는 그대로라 시각적 변화 없음(안전한 리팩터링)
- spacing 스케일/gray 팔레트는 아직 미정리 — 기존 회색 계열(#888/#999/#aaa 등)은
  서로 다른 값이라 통합하면 실제로 화면이 달라지므로, 육안 확인 없이 손대지 않음.
  다음에 여유 있을 때 화면별로 확인하며 점진적으로 정리 권장

**GA4 분석 이벤트 트래킹 (v529)**
- `app.js`에 `_track(eventName, params)` 헬퍼 추가 (`window.gtag` 없으면 조용히 무시)
- 이벤트 3종 연결: `profile_complete`(성별 게이트 통과), `job_apply`(지원 완료),
  `hire_accepted`(최종합격)
- `바로알바.html` head에 gtag.js 로더 추가했으나 **측정 ID는 플레이스홀더
  `G-XXXXXXXXXX`** — analytics.google.com에서 GA4 속성 만들고 받은 실제 ID로
  head의 두 곳만 바꿔치기하면 추가 배포 없이 바로 수집 시작

**문서 4종세트 + 작업이력 갱신 (2026.07.16)**
- `docs/` 폴더의 기존 관행(`{YYMMDD}_new-features.html`/`_service-intro.html`/
  `_tech-intro.html`/`_timeline.html` 4종 + `_changelog.md`)을 그대로 따라 최신
  스냅샷 `260716_*` 세트 작성. 직전 세트는 `260713_*`(07.13 06:11 작성) — 그 사이
  118개 커밋(바로스팟 1:1 매칭 전면 재설계, 마이페이지 대개편, 상태표시줄 근본해결,
  전수감사 등)을 반영
- 앞으로도 큰 작업 구간이 끝나면 이 5개 파일 세트를 같은 명명 규칙으로 갱신할 것.
  CSS/구조는 직전 세트에서 그대로 복붙(house rule 7), 내용만 교체

---

### Phase 59 ✅ 스키마 드리프트 전수 대조(코드↔실제DB) + 조용히 죽어있던 기능 9건 일괄 수정 (2026-07-21, v547)

**검수 방법(이게 핵심)**: 지금까지의 "전면검수"는 대부분 **코드만 grep**하거나(죽은 코드/DOM 부재/백버튼), DB 대조를 하더라도 **대표님이 콘솔에서 400을 본 테이블만 반응적으로** 확인했다. 이번엔 처음으로 **코드가 `.from()`으로 참조하는 45개 테이블 × 모든 select/eq/order/insert 컬럼을 anon key로 실제 DB에 전수 쿼리해 대조**했다. `const { data } = await ...`로 에러를 삼키는 패턴 때문에 400이 나도 크래시 없이 "조용히 빈 화면"만 남아, 코드를 아무리 읽어도 안 잡히던 버그들이었다. **교훈: 스키마 드리프트는 코드 리뷰로 못 잡는다. 살아있는 DB에 쿼리해서 대조하는 게 유일한 검출법.** (검수 스크립트: 각 테이블 `?select=컬럼&limit=1` → 400이면 컬럼 없음, 임베딩은 `?select=*,관계(...)` → PGRST200이면 관계 없음)

**근본원인 1 — `businesses.region` 컬럼 없음 (v540에서 `biz_type`만 지우고 같은 select의 region은 남김)**
- 업체 프로필 상세(`_showDetailBizProfile`, `.single()`이라 400시 전체 실패 → "업체 정보를 불러올 수 없어요" 고정), 팔로잉 업체 목록, 채팅 상대(업주) 정보 임베딩, 업주 프로필 최신화 4곳 select에서 `region` 제거

**근본원인 2 — `gathering_applications`에 `created_at` 없음(실제 `applied_at`) + `profiles` 테이블 자체가 없음**
- `loadMoimApplicants`가 select+order를 없는 `created_at`으로 해서 400 → **모임 주최자가 신청자를 아예 못 보던** 문제. `applied_at`으로 교체 + 신청자 프로필을 없는 `profiles` 대신 `workers`(`kakao_uid`로 조회)로 변경

**근본원인 3 — 레슨 문의: 없는 `profiles!seeker_kakao_uid` 임베딩(PostgREST 400) + `lesson_inquiries` 스키마 불일치**
- 강사 "받은 문의" 목록/문의 채팅이 임베딩 400으로 **항상 비어있고 안 열리던** 것 → 임베딩 제거 후 `workers` 별도 조회로 문의자 이름 복구
- `lesson_profiles`를 없는 `worker_kakao_uid`로 조회하던 곳(마이페이지 레슨 카운트) → 실제 `worker_id`로 수정
- ⚠️ 수락/거절(`decideLessonInquiry`)은 `lesson_inquiries`에 `status`/`decided_at` 컬럼이 없어 여전히 실패 — **DDL 필요(아래)**. 코드는 컬럼 추가 즉시 동작하도록 준비돼 있고, 목록은 status 없어도 'pending' 기본값으로 정상 렌더

**근본원인 4 — 커뮤니티 댓글 알림 푸시가 옛 API 형식**
- `push_subscriptions`의 없는 개별 컬럼(`endpoint/p256dh/auth/fcm_token`, 실제는 `subscription` JSON 하나)을 조회 + `/api/send-push`에 옛 `{subscription, fcmToken}` 형식 전송(현재 API는 `{user_id, title, body, url}`만 받아 서버가 `fcm_tokens` 조회) → 이중으로 틀려 댓글 알림이 안 감. 다른 정상 호출부와 동일하게 `{user_id, ...}`로 통일

**검증**: 9건 전부 수정 전 400 → 수정 후 200을 라이브 쿼리로 확인, `node --check` 문법 통과, 버전 락스텝 546→547.

**필요 DDL (대표님 Supabase SQL Editor에서 실행 — 레슨 문의 수락/거절 활성화용)**
```sql
ALTER TABLE lesson_inquiries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE lesson_inquiries ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
-- (선택) 문의 메시지/제안금액도 저장하려면:
ALTER TABLE lesson_inquiries ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE lesson_inquiries ADD COLUMN IF NOT EXISTS proposed_price INT;
```

**남은 권장 작업**: 이번엔 `.from()` 참조 테이블만 훑었다. `.rpc()` 호출·`api/*.js` 서버함수의 SQL·admin.js/mannam-owner.js 등 다른 스크립트도 같은 방식으로 전수 대조하면 추가 드리프트를 더 잡을 수 있음.

**Phase 59-B ✅ 서버함수(api/*.js) + RPC 전수 대조 2차 (같은 날 이어서)** — 위 "남은 권장 작업"을 바로 수행

- **RPC 3종**(`nearby_jobs`/`increment_post_likes`/`delete_user_account`) 전부 존재 확인.
- **결제/포인트/알림 서버함수**(toss-confirm/toss-points/role-notify/send-push/surge-check)의 payments·subscriptions·point_accounts·point_transactions·notifications·fcm_tokens 쓰기 컬럼 **전부 정상**.
- **🔴 `toss-confirm.js`가 결제 후 없는 `businesses.plan`을 PATCH(400)** — 이게 문서에 오래 있던 P0("plan이 새로고침/재로그인하면 free로 리셋")의 **진짜 근본원인**이었다. 구독은 `subscriptions` 테이블에 정상 저장되지만 클라이언트는 `businesses.plan`을 읽어서 항상 free로 보였던 것. **DDL 필요(아래)** — 컬럼만 추가하면 이미 작성된 PATCH가 동작.
- **admin.js 스키마 드리프트 3건 수정(v-불필요, 서버파일이라 캐시무관)**:
  1. 오늘 지원건수 카운트가 `applications.created_at`(실제 `applied_at`)로 400
  2. 회원상세 지원이력이 `applications.review`/`reviewed_at`(실제 `employer_review`/`employer_reviewed_at`) - PostgREST 별칭(`review:employer_review`)으로 응답키 유지한 채 수정
  3. **모임 주최자 이름이 admin에서 항상 공란**: `gatherings.host_id`는 `currentUser.id`(=kakao_uid)인데 workers는 `id`로, businesses는 없는 `owner_id`로 조회하고 있었음(workers는 조용히 빈결과, businesses는 400) → 둘 다 `kakao_uid`로 통일. **이건 스키마 드리프트가 아니라 "잘못된 키로 조인"하는 의미 버그라, 컬럼 존재검사만으론 workers쪽은 안 잡히고 host_id 저장값을 코드에서 역추적해야 발견됨** (schema audit의 한계 - 값 의미까지 봐야 하는 유형)
- **coupon.js 쿠폰 지급 4건 수정** — URL쿼리 밖(바디·속성)이라 스크립트가 못 잡아 코드를 직접 읽어 발견:
  1. `coupons(ticket_count)`/`.ticket_count`(실제 `pass_qty`) → 지급 티켓수가 undefined
  2. `used_count` PATCH(실제 `uses_count`) → 400, 사용카운터 안 올라감
  3. `max_uses_per_user` 컬럼 없음 → `>= undefined`가 항상 false라 **1인당 재사용 제한이 전혀 안 걸려 쿠폰 무한사용 가능** → `|| 1` 기본값으로 방어
- **교훈**: URL 쿼리 컬럼은 스크립트로 전수 대조되지만, **INSERT/PATCH 바디 키와 `obj.컬럼` 속성 접근은 코드를 눈으로 읽어야** 잡힌다(coupon.js 사례). 서버함수 검수 시 body의 `JSON.stringify({...})` 키와 응답 객체 `.속성` 접근도 스키마와 대조할 것.

**필요 DDL 2건 (✅ 2026-07-21 대표님 실행 완료)**
```sql
-- 1) 업체 플랜 영속화 (P0 근본해결) - toss-confirm.js의 PATCH가 이걸 기다림
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
-- 기존 결제자 백필 (subscriptions.business_id=text, businesses.kakao_uid=uuid 라 캐스팅 필수)
UPDATE businesses b SET plan = s.plan
  FROM subscriptions s
  WHERE s.business_id = b.kakao_uid::text AND s.status = 'active';
-- 2) 직장인증 토큰 (admin.js 244/251/272의 workplace 인증 플로우가 이 컬럼을 씀)
ALTER TABLE workers ADD COLUMN IF NOT EXISTS workplace_verify_token TEXT;
```
⚠️ 이 프로젝트의 반복 함정: `subscriptions.business_id`처럼 kakao_uid를 **text로 저장한 컬럼**과
`businesses.kakao_uid`(uuid)를 조인할 때는 `::text` 캐스팅 필수(`follows` 테이블 때와 동일 - 12절/13절 참고).

---

### Phase 60 ✅ 공개 랜딩페이지 + SEO 기본기 (2026-07-27, v582)

**`/`가 로그인 폼이었다** — vercel.json이 `/` → `login.html`로 리라이트하고 있어, 검색엔진이
보는 첫 화면에 서비스 설명이 한 글자도 없었다. index.html을 실제 랜딩으로 채우고 그 리라이트를 제거.

- **기존 진입 경로 보존**(index.html 상단 스크립트): ①쿼리스트링 있으면 앱으로(인쇄된 QR·과거
  공유링크의 `?job=`/OAuth) ②localStorage에 supabase 세션 있으면 앱으로(`/`를 북마크한 기존 이용자).
  판정 실패 시 그냥 랜딩이 보일 뿐이라 안전. OAuth 콜백은 `/app.html`로 돌아오므로 이 변경과 무관.
  앱 내부 이동은 전부 `/login.html` 명시라 `/`에 의존하는 코드가 없음을 grep으로 확인 후 제거.
- **🔴 랜딩이 내건 약속이 실제로는 막혀 있던 문제**: CTA가 전부 `/바로알바.html`로 가는데,
  부팅 분기(app.js ~691)는 **세션 / `baroalba_guest` 플래그 / `?job=` 셋 다 없으면 `goToLogin()`으로
  튕긴다.** 랜딩에서 온 신규 방문자가 정확히 그 조건이라 "가입 없이 둘러볼 수 있습니다"가
  거짓이 되고 전환 경로가 통째로 로그인 벽에 막힌 상태였음. 게스트 분기에 `?guest=1`을 추가하고
  로그인화면 `enterAsGuest()`와 **동일하게** 플래그를 남겨 새로고침에도 유지되게 함.
  `?job=` 딥링크는 종전대로 일회성(플래그 미저장) 유지 — 기존 동작을 바꾸지 않기 위해 분리.
- **SEO**: title/description/canonical/OG/twitter + JSON-LD 4종(Organization·WebSite·
  WebApplication·FAQPage). FAQ는 **화면 본문과 스키마 답변 텍스트가 일치해야** 리치결과에서
  경고가 안 나므로 스크립트로 5문항 대조. robots.txt(admin·api·docs·backup·시안 차단) + sitemap.xml.
- **캐시 헤더**: HTML은 no-store 유지(락스텝 버전 갱신 즉시 반영이 이 앱의 전제),
  `/assets` 1일 · `/icons` 1년 immutable · `/` CDN 10분.
- **교훈**: 랜딩·마케팅 페이지를 붙일 때는 **CTA가 실제로 열리는지**를 앱 부팅 분기까지 따라가
  확인할 것. 링크가 200을 주는 것과 사용자가 그 화면을 볼 수 있는 것은 다르다.
- **앱 셸·로그인 noindex 후속**(cd91ec1): `/`가 색인 대상이 되면서 랜딩이 링크하는
  `바로알바.html`·`login.html`도 같이 크롤링된다. 둘 다 크롤러 시점엔 내용 없는 껍데기라
  색인되면 검색결과에서 랜딩과 경쟁하며 빈 페이지가 뜬다. → `noindex, follow` meta.
  **robots.txt로 막지 않은 이유**: 크롤링을 막으면 noindex 태그 자체를 못 읽어 URL만 색인된
  상태가 남는다(제외하려면 오히려 읽히게 둬야 함). login.html은 카톡 공유 미리보기(OG)를
  살려야 해서도 크롤링 허용이 맞다. 라이브에서 두 파일 모두 meta 반영 확인 완료.

**남은 작업**: 공고별 URL(`/job/:id`)이 생기면 sitemap.xml을 서버리스 자동생성으로 교체하고
JobPosting 스키마를 붙일 것. 현재 sitemap은 정적 3개(`/`, terms, privacy)뿐이라
색인될 실질 콘텐츠가 랜딩 한 장이다. `manifest.json`에 UTF-8 BOM이 있음(기존 상태, 동작엔 문제없음).

---

## 8. 현재 버그 / 미완료

| 항목 | 상태 | 처리 방법 |
|------|------|-----------|
| 스키마 드리프트 9건(businesses.region 4곳/모임 신청자목록/레슨 문의·채팅·카운트/댓글푸시) | ✅ 해결 (v547, 2026-07-21) | Phase 59 참고 - 코드↔실제DB 전수 대조로 발견, 전부 400→200 검증. 이전 "전면검수"가 코드만 봐서 못 잡던 유형 |
| 서버함수 드리프트 7건(admin 지원카운트/회원상세리뷰/모임주최자명, coupon 지급수·카운터·1인제한) | ✅ 해결 (api 배포, 2026-07-21) | Phase 59-B 참고 - admin.js·coupon.js 수정, node --check 통과 |
| businesses.plan 미영속화 = 결제 후 plan이 free로 리셋 (오래된 P0) | ✅ 해결 (DDL, 2026-07-21 대표님 실행) | Phase 59-B: 컬럼추가+subscriptions 백필 완료(첫 시도는 `s.business_id(text)=b.kakao_uid(uuid)` 타입불일치로 실패 → `b.kakao_uid::text` 캐스팅으로 성공). anon key로 businesses.plan 200 확인 |
| workers.workplace_verify_token 부재로 직장인증 토큰플로우 400 | ✅ 해결 (DDL, 2026-07-21 대표님 실행) | 컬럼추가 완료, 200 확인 |
| 레슨 문의 수락/거절(`decideLessonInquiry`) | ✅ 해결 (DDL, 2026-07-21 대표님 실행) | `lesson_inquiries.status`/`decided_at` 추가 완료, anon key로 200 확인. 선택 컬럼 message/proposed_price는 미추가지만 조건부 표시라 무해 |
| 공고 저장 오류 | 🟢 스키마 대조 완료, 불일치 없음 (2026-07-18 재점검) | Supabase anon key로 `job_postings` 실제 컬럼을 직접 조회(`GET /rest/v1/job_postings?limit=1`)해 `submitPosting()`의 payload 필드 전부와 1:1 대조함 - 불일치 없음. `submitPosting()` 코드 자체도 10초 타임아웃/에러메시지 표시/버튼 복구가 이미 잘 돼있어 추가 조치 없음. 그래도 재현되면 `showAlert`가 띄우는 실제 서버 에러 메시지부터 확인할 것(원인이 payload 스키마는 아닌 것으로 확인됨) |
| 홈 화면 400 에러 다수 (콘솔에서 발견) | ✅ 해결 (v540, 2026-07-18) | `businesses.biz_type` 컬럼이 코드 9곳에서 참조되는데 실제 DB엔 존재하지 않아(anon key로 직접 확인, `column businesses.biz_type does not exist`) 업체 랭킹/프로필상세(`.single()`이라 전체 실패)/즐겨찾기 업체/채팅 상대방 정보 등 6개 쿼리가 매번 400으로 실패하고 있었음. select()에서 biz_type 제거(표시 코드는 이미 빈값 fallback 있어 그대로 둠) |
| 채팅목록 로딩 느림 | 🟡 대폭 개선(9538ms→3092ms), 잔여 병목 특정됨 (v537~v541, 2026-07-17~19) | `_loadJobChatsIntoList` 내부 순차 대기 체인 병렬화(v537) + 바로스팟 방별 프로필 조회를 배치 API 1건으로 통합(v538) + 메시지 쿼리 LIMIT 없어서 "대화 개수"가 아니라 "누적 메시지/이력 총량"에 비례해 느려지던 것 발견해 컬럼 축소+LIMIT 적용(v539, v541 - 지원내역/공고 조회까지 확장). 세부 타이밍 계측(v541)으로 재확인한 결과 **잔여 병목은 바로스팟 프로필배치 API(`/api/admin?action=get_barospot_revealed_profiles_batch`) 단독으로 ~2.3초** - Vercel 서버리스 콜드스타트로 추정, DB 쿼리 자체는 이미 빠름. 바로스팟 채팅방이 있는 계정에서만 발생. 다음 단계: 함수 워밍 또는 클라이언트 캐싱 검토 |
| businesses.biz_type 컬럼 부재로 400 (업체랭킹/프로필상세/즐겨찾기/채팅상대정보 등 6곳) | ✅ 해결 (v540, 2026-07-18) | select에서 제거, 표시 코드는 이미 빈값 fallback 있음 |
| applications.updated_at 컬럼 부재로 워커 알림조회 400 | ✅ 해결 (v541, 2026-07-19) | applied_at으로 대체 |
| `_fetchOwnerNotifications` 죽은 쿼리(결과 미사용, businesses 미임베딩 필터로 항상 400) | ✅ 해결 (v541, 2026-07-19) | 삭제 |
| businesses.plan 컬럼 부재로 모임(바로모임) 목록 전체가 안 뜨는 문제 | ✅ 해결 (v542, 2026-07-19) | PRO/BASIC 뱃지 조회가 바깥 try와 묶여있어 실패시 이미 성공한 목록까지 비워지던 것 - 별도 try로 격리 |
| 지원자 프로필(`_wp-overlay`)/전자계약서(`contract-modal`) 뒤로가기 안 됨 | ✅ 해결 (v544, 2026-07-19) | Phase 58 전수감사(WATCH_IDS/popstate 캐스케이드)에서 누락됐던 동일 버그 클래스. `_wp-overlay`는 동적 생성/제거 방식이라 WATCH_IDS로 못 잡아 popstate 캐스케이드에 직접 등록 |
| 전자계약서/지원서 PDF 다운로드 안 됨(인쇄→다운로드 전환 직후) | ✅ 해결 (v545 + Android versionCode 31, 2026-07-19) | 브라우저는 인쇄 대신 파일 다운로드로 전환(html2pdf.js)하면 되지만, 안드로이드 WebView는 JS의 blob 다운로드를 받아줄 장치가 원래 없음(`MainActivity.java`에 다운로드 핸들러 자체가 없었음) - `AndroidBridge.saveBase64File()` 신설해 PDF를 base64로 네이티브에 직접 전달, MediaStore(API29+)/앱 전용 폴더(API<29)에 저장. Android 리빌드+Play Console 업로드까지 완료 |
| job_postings.updated_at 컬럼 부재로 번개알바 자동인상(`checkSurgeIntervals`, 60초마다 폴링) 400 | ✅ 해결 (DDL, 2026-07-19 대표님 실행) | `ALTER TABLE job_postings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();` 실행 완료, anon key로 컬럼 존재 확인함 |
| `follows`(업체 팔로우) 테이블 자체가 없음 - 팔로우/알림구독 기능 전체 비활성 | ✅ 해결 (DDL, 2026-07-19 대표님 실행) | 테이블 생성 + RLS 정책 2개(`worker_manage_own_follows`, `business_view_own_followers`) 적용 완료. 정책 작성 중 `kakao_uid`(uuid)와 `auth.jwt()->>'sub'`(text) 타입 불일치로 첫 시도는 실패 → `(auth.jwt()->>'sub')::uuid` 캐스팅으로 해결, anon key로 테이블 접근 확인함 |
| Android SHOW_FORCED 리빌드 | ✅ 해결 (v29, 2026-07-16) | 13-6 참고 - versionCode 29까지 빌드+Play Console 배포 완료, 대기 중인 리빌드 없음 |
| 커뮤니티 글/댓글 수정·삭제 UI, 댓글 익명 토글 | ✅ 이미 구현돼있었음 (2026-07-16 재확인) | `openEditCommPost()`/`deleteCommPost()`/`deleteCommComment()`/`comm-comment-anon` 체크박스 전부 존재·정상 동작. 이 표만 오래전부터 미구현으로 잘못 남아있었음 |
| `banned-agree-overlay`/`photo-tip-overlay` 트리거 누락, `showContractModal` 필드명 버그, `app_ui.js` 버전 lockstep 누락 | ✅ 해결 (v529, 2026-07-16) | Phase 58 참고 - `wage-transfer-modal`/`contract-modal`은 애초에 죽은 코드가 아니었음(app_ui.js 미확인으로 인한 오판, 정정 기록 참고) |
| 바로스팟 채팅 진입 불가 | ✅ 해결 (v496, 2026-07-15) | track-overlay(z-index:8700)가 panel-barospot-chat(520)/panel-moim-chat(530)보다 위라 채팅 패널이 가려짐 - openBarospotChatRoom/openBaromeetChat에서 closeTrackingSheet() 선호출로 수정. panel-barospot-chat이 전역 뒤로가기 핸들러에도 없어 추가 |
| 위치공유 "도착했어요" 버튼 의미없는 토글 | ✅ 해결 (v496, 2026-07-15) | 수동 클릭 시 확인 없이 조용히 멈추기만 해서 계속 눌러도 아무 일도 안 일어나는 것처럼 보임 - 도착 확인 다이얼로그 + 도착 확정 후 버튼 잠금으로 수정 |
| 바로스팟 채팅 키보드 가림 | ✅ 해결 (v496, 2026-07-15) | 다른 채팅 패널(wchat/chat/moim-chat)은 `_onNativeKbChange`에 등록돼 있었는데 이 패널만 빠져서 키보드가 입력창을 가림 - 등록 추가 |
| swipe-screen 상태표시줄 가림 | ✅ 해결 (v496, 2026-07-15) | 다른 전체화면 패널은 다 `--sat-safe` 처리돼 있었는데 이 화면 헤더만 빠짐 |
| 레슨/과외 등록·상세 모달 핸들바 드래그 안 됨 | ✅ 해결 (v496, 2026-07-15) | `.modal-handle` 두 곳(lesson-register-modal/lesson-detail-modal)이 시각적 핸들만 있고 드래그 바인딩이 전혀 없었음 - bindSheetDragClose 연결 |
| 단체채팅 키보드 여백 과다 | ✅ 해결됨 (문서만 미갱신) | `#moim-chat-messages`에 이미 `justify-content:flex-end`가 적용돼 있어 짧은 대화도 하단에 붙음 - 2026-07-13 시점 이후 누군가 수정했으나 이 표만 갱신이 안 돼있었음 |

### 8-1. i18n 스윕 4차 (2026-07-27, v575 완료 — 전체 스코프 종료)

v571~573(업주 화면·공고등록 폼)까지 끝난 뒤 다음 타겟이었던 **홈 화면 공고 카드 렌더링**(`renderDateSlider`/`renderDistrictFilter`/`getJobCycleLabel`/`renderList`/`showMockBanner`)을 v574로 완료. 이어서 처음엔 5차 이후로 미뤘던 3건(마커 카테고리/타입 축약, 만원 표기, 외국인 언어필터 패널)도 같은 세션에서 마저 완료해 v575로 배포함. 재사용 키 다수 + 신규 키 약 45개(8개국어) 적용, `node --check` 통과, `_APP_V`/`sw.js`/HTML 4개 `?v=` 전부 575로 동기화.

**v574 (홈 화면 공고 카드)**: `getJobCycleLabel`의 요일 약자는 하드코딩 대신 기존 `DAY_LABELS[currentLang]`를 재사용(새 테이블 안 만듦). 나머지는 신규 키(`today_label`/`cycle_regular_*`/`applied_badge_label`/`job_total_wage_fmt`/`return_bonus_badge_fmt`/`lang_name_ko~mn`/`surge_badge_label`/`team_recruit_*`/`almost_full_badge`/`errand_duration_*`/`home_empty_*`/`guest_post_job_*`/`job_load_fail_label`/외국인환영·한국어필수·초보OK·경력자·식사제공 배지 5종) 전부 적용.

**v575 (남은 3건 완료)**:
- `renderMarkers`의 `CAT_SHORT`(마커 카테고리 짧은이름, 23종)와 타입 한글자(정/단/스/심)를 `shared-lang.js`의 `MARKER_CAT_SHORT`/`MARKER_TYPE_CHAR` 신규 사전(WORK_TYPE_LABELS/VEHICLE_LABELS와 동일 패턴)으로 분리 — `tCategory()`(대분류)와 달리 심부름 세부종목 구분을 유지해야 해서 별도 사전 유지, 그룹핑으로 정보손실 안 나게 함.
- 만원 축약 표기: **한국어는 "1.2만원" 유지, 나머지 7개 언어는 "12k" 통일**(대표님 확정, 2026-07-27) — `_shortWage(amount)` 헬퍼로 분리해 `renderMarkers`/`renderUrgentFeed`에서 공용. surge-badge가 이미 쓰던 `↑5k` 표기와 통일. `/건`·`/시간` 단위도 `per_job_suffix`/`per_hour_suffix`로 마저 번역.
- `applyForeignerLangFilter`/`showForeignerLangPanel`/`showForeignerInHome`: `uz`(중앙아시아)/`np`(네팔어) 포함해 `lang_name_np`/`lang_name_uz` 신규 키 추가, `foreigner_welcome_jobs_fmt`/`korean_capable_jobs_fmt`/`lang_pref_jobs_fmt`로 라벨+건수 통합 번역.

이로써 CLAUDE.md에 남아있던 i18n 스윕 관련 기지정 작업은 전부 종료. 향후 새 미번역 항목 발견 시 5차로 새로 스코핑할 것.

**체크리스트 재확인**: 편집 후 `_APP_V` / `sw.js` CACHE / 바로알바.html의 4개 `?v=` 쿼리(app.js/shared-lang.js/style.css/app_ui.js) 전부 동일 번호로 올리고 커밋할 것 (13-5 참고).

### 8-2. i18n 스윕 5차 — 토스트/알림 메시지 전수 번역 (2026-07-27, v576 완료)

"언어작업 다 끝났어?" 질문에 `grep -oE "showToast\('[가-힣][^']*'\)" assets/js/app.js | wc -l`로 실측했더니 하드코딩된 한국어 토스트가 155개(고유 127개) 남아있는 게 발견됨. 이어서 콤마 인자(지속시간)·문자열 연결(`+ error.message`)·템플릿 리터럴(`${var}`) 형태로 숨어있던 것까지 전수 조사해 총 4개 배치로 완료:

- **1배치**: `showToast('한국어')` 단순 리터럴 155건(고유 127개) — `tools/i18n/addkeys.py`로 `keys.json` 일괄 삽입 후 Python으로 `showToast('X')` → `showToast(t('key'))` 전수 치환
- **2배치**: `'접두사: ' + error.message` 연결형 + `'문구', 5000)` 지속시간형 48건(신규 31키) — 따옴표로 감싼 부분 문자열만 치환(`'저장 실패: '` → `t('toast_save_failed_prefix')`), `+ error.message` 등 동적 부분은 그대로 둠
- **3배치**: 템플릿 리터럴 안 `${var}` 보간 19건 + `showAlert` 1건(신규 17키, `_fmt` 접미) — `showToast(t('key').replace('{n}', val))` 형태로 전환
- **총 158개 신규 키 × 8개국어**, `node --check` 통과, 버전 576 동기화

**작업 중 겪은 실수와 교훈**: `addkeys.py`용 JSON에 여러줄 문구(`\n` 포함, 예: `toast_premium_pro_only`)를 담을 때 JSON 이스케이프(`\n`→실제 개행)와 JS 이스케이프(파일에 텍스트로 `\n` 두 글자가 남아야 함)를 혼동해서 `shared-lang.js`에 진짜 개행문자가 그대로 들어가 SyntaxError가 남. **JSON 소스에 `\\n`(백슬래시 두 개)로 적어야 JS 파일엔 `\n`(백슬래시+n 두 글자)로 남는다** — 다음에 이 도구 쓸 때 반드시 기억할 것. 잘못 삽입된 채로 한 번 실행했다가 `git checkout -- shared-lang.js`로 되돌리고 재실행함(당시 아직 커밋 전이라 안전하게 복구 가능했음).

**의도적으로 남겨둔 것**: `assets/js/app.js` 15887번째 줄 근처 스카우트 기능의 데이터 요약 문자열(`${biz_name} · ${title} · ${wage}원/${단위}`)에서 단위(건/시간)는 기존 키로 번역했지만 "원" 한 글자는 그대로 둠 — 복합 데이터 문자열이라 구조 전체를 바꾸지 않는 한 그 한 글자만 번역해도 실익이 적어 스킵. 이 외에 `showToast`/`showAlert` 기준으로는 전수 완료.

---

## 9. 개선 검토 사항

### 단기 (바로 가능)
| 항목 | 설명 |
|------|------|
| 공고 저장 오류 수정 | DB constraint 또는 validation 원인 추적 - 재현 시 `showAlert` 실제 에러 메시지부터 확보 |

- ~~커뮤니티 수정/삭제~~ ✅ 이미 구현돼있었음 (섹션 8 참고)
- ~~알바생 스킬 공고 필터~~ ✅ 완료 (v531, 2026-07-16) - 홈 필터패널에 "내 스킬 맞춤" 토글 추가, `workers.skills[]`와 공고 `category`가 겹치는 것만 표시, 업주 계정엔 숨김

### 중기 (1~2주)
| 항목 | 설명 |
|------|------|
| 결제 연동 | 토스페이먼츠 프리미엄 플랜 |
| 공고 자동 마감 | Supabase Edge Function |
| 알림 히스토리 | 받은 알림 목록 화면 |
| 리뷰 답글 | 업주 답변 기능 |

### 장기 (전략)
| 항목 | 설명 |
|------|------|
| iOS 앱 | WebView 래퍼 App Store 등록 |
| 에스크로 결제 | 알바비 플랫폼 보관 후 지급 |
| B2B 기업 고객 | 대량 채용, 계약서, 인보이스 |
| 바로이사/바로대행 | 서비스 확장 |

---

## 10. 개발 워크플로우

### 작업 순서
```
1. 파일 읽기 (Read)
2. 바로알바.html 수정
3. shared-lang.js 번역 추가 (필요 시)
4. sw.js CACHE 버전 +1
5. git add [수정파일들]
6. git commit
7. git push origin main  → Vercel 자동배포
```

### DDL 작업 (사용자 직접 실행)
- Supabase Dashboard → SQL Editor
- 테이블 생성/컬럼 추가/RPC 함수만 여기서
- INSERT/UPDATE/DELETE는 JS 코드로

### 브랜치 전략
- `main` 단일 브랜치 직접 푸시

### 중복 ID 사전 점검 (서브패널 추가 시 필수)
```python
import re
from collections import Counter
with open('바로알바.html', encoding='utf-8') as f:
    ids = re.findall(r'id="([^"]+)"', f.read())
dups = [k for k,v in Counter(ids).items() if v > 1]
print('중복 ID:', dups)
```

---

## 11. 주요 ID / 키

| 항목 | 값 |
|------|-----|
| 카카오맵 JS 키 | ffcea2fab508898c168f043100b4d550 |
| Supabase URL | onwvbmllpycgswfzywjv.supabase.co |
| 네이버 Client ID | 9DotifcIhyF4lq8bQLU9 |
| 도메인 | baroalba.multimove.co.kr |
| GitHub | github.com/korjackie/baroalba |
| 기본 위치 | 37.5445, 127.0556 (성수역) |
| 기본 반경 | 10km |

---

## 12. 자주 발생하는 에러 패턴

| 에러 | 원인 | 해결 |
|------|------|------|
| `policy already exists` | SQL 중복 실행 | 무시 (이미 존재) |
| `cannot change return type` | RPC 반환타입 변경 | `DROP FUNCTION IF EXISTS 함수명(uuid)` 후 재생성 |
| PWA 캐시 미갱신 | sw.js 버전 미증가 | `CACHE = 'baroalba-v(N+1)'` |
| UUID 타입 오류 | `kakao_uid::text` 캐스트 | ::text 제거, UUID 그대로 |
| versionCode 중복 | Play Console 기존 버전 사용됨 | build.gradle +2 이상 |
| 중복 ID 버그 | 서브패널 추가 시 기존 ID 충돌 | 위 Python 스크립트로 사전 확인 |
| 채팅 흰색 화면 | WebView 배경색 미설정 | `setBackgroundColor(Color.parseColor("#C8102E"))` |

---

## 13. 문제 대응 원칙 (2026-06-30 추가 — 반드시 지킬 것)

### 13-1. "안 된다"고 하면: 코드부터 읽어라

```
❌ 틀린 순서: 서버 확인 → CDN 의심 → 캐시 의심 → ... → 코드 확인
✅ 맞는 순서: 관련 코드 읽기 → 로직 버그 확인 → 그래도 안 되면 외부 원인
```

**교훈 (2026-06-30)**: nav 라벨 문제를 7시간 동안 CDN/캐시 탓으로 돌렸으나
실제 원인은 한 줄짜리 조건 버그: `if (_savedV && ...)` → `null &&`이 항상 false.
서버 curl 확인 전에 버전체크 코드를 먼저 읽었으면 5분 안에 해결 가능했다.

**교훈 2 (2026-07-12/13, 같은 실수 재발)**: 대표님이 "FAB 라벨/채팅 전체화면/참석자목록이
안 바뀐다"고 반복 보고했을 때, curl로 서버 응답만 여러 번 확인하고 "서버는 맞으니
클라이언트 캐시 문제"라고 결론짓는 데 상당한 시간을 썼다. 실제로는 **버전체크 로직 자체에
진짜 버그가 두 개**나 있었다:
1. `index.html`이 실은 v1.4.1 시점 앱 전체(4200줄)를 얼려둔 사본이었고, 자체 버전가드가
   "딱 한 번"만 리다이렉트한 뒤 localStorage에 값이 저장되면 다시는 리다이렉트하지 않는 구조.
2. `바로알바.html` `<head>` 인라인 스크립트에 `V='421'`로 하드코딩된 **별도의** 버전 상수가
   있었는데, `app.js`의 `_APP_V`(그날 422→435까지 계속 올라감)와 전혀 동기화되지 않아서,
   app.js의 캐시삭제 블록이 요구하는 "`?_v=` 파라미터가 `_APP_V`와 일치"라는 조건이
   이번 세션 내내 단 한 번도 참이 된 적이 없었다 — 즉 **버전을 몇 번을 올려도 캐시가
   전혀 지워지지 않는 상태**였다.

**핵심 교훈**: "사용자가 변경사항이 안 보인다"고 반복 보고하면, curl로 서버 확인을
반복하기 전에 **`grep -rn "_v=\|_baroV\|location.replace.*html" 전체 프로젝트`로
버전체크/리다이렉트 로직이 몇 군데에 중복 존재하는지부터 확인하라.** 이 프로젝트는
과거에도, 이번에도 "버전 상수가 여러 곳에 중복되어 서로 어긋나는" 같은 유형의 버그가
반복됐다. 캐시 문제로 결론 내리기 전에 이 패턴부터 배제할 것.

### 13-2. 중괄호 블록 수정 시 반드시 확인

```javascript
// 수정 전: 열고 닫는 { } 개수 세기
// if 하나 추가 = 닫는 } 하나 추가 필수

// ❌ 이렇게 하면 SyntaxError → 페이지 전체 먹통
if (empEl) {
  if (emp && emp.length) {
    empEl.innerHTML = ...;
  }            // if(emp&&len) 닫힘
// ← if(empEl) 닫는 } 빠짐!
} catch(e) {}  // try 닫힌 척하지만 구조 깨짐
```

**규칙**: 블록 추가/변경 후 배포 전, 해당 함수의 `{` 수와 `}` 수가 같은지 육안 확인.

### 13-3. 캐시 문제 vs 코드 버그 구분법

| 증상 | 캐시 문제 | 코드 버그 |
|------|-----------|-----------|
| 새 변경만 안 보임 | ✅ 가능 | 가능 |
| 일부 변경은 보이고 일부는 안 보임 | ✅ 유력 | 가능 |
| 페이지 아예 안 로드 | ❌ 아님 | ✅ SyntaxError |
| 특정 기능만 오작동 | ❌ 아님 | ✅ 로직 버그 |
| curl로 서버는 맞는데 브라우저는 다름 | ✅ 유력 | — |

**페이지 전체 먹통 = SyntaxError부터 의심. 절대 캐시 탓이 아님.**

### 13-4. 캐시 문제 진단 순서 (외부 원인이 확실할 때만)

```
0. (2026-07-13 추가, 가장 먼저) 버전체크 로직 중복 여부부터 확인
   grep -rn "_v=\|_baroV\|location.replace.*\.html\|var V=" *.html assets/js/*.js
   → 결과가 2곳 이상이면 그 값들이 서로 일치하는지 반드시 대조. 하나라도 하드코딩되어
     _APP_V와 따로 논다면 그게 원인이다. curl보다 이걸 먼저 하라.

1. curl로 서버 응답 확인
   curl -s "https://baroalba.multimove.co.kr/%EB%B0%94%EB%A1%9C%EC%95%8C%EB%B0%94.html" | grep "nav-label"

2. 서버가 맞는데 브라우저가 다르면:
   → 사용자에게 Ctrl+Shift+R (하드 리로드) 요청
   → 그래도 안 되면: 시크릿 모드로 열어보게 해서 캐시/코드 문제를 확실히 분리
   → 시크릿 모드 주소창에 예상 못한 버전 파라미터(예: ?_v=421)가 스쳐 지나가면
     그 자체가 "리다이렉트 로직에 하드코딩된 값이 있다"는 증거이니 0번으로 돌아갈 것
   → 그래도 재현되면: Chrome 설정 → 캐시 삭제

3. 코드에서 버전체크 로직 확인:
   - _savedV 조건이 null 케이스를 포함하는지
   - location.reload(true) 실행 경로가 맞는지
   - (2026-07-13) 버전 상수가 정말 app.js의 _APP_V 단 하나뿐인지
```

### 13-5. 배포 전 체크리스트

```
□ (2026-07-17 추가, 코드 작성 전 가장 먼저) 이 버그, 앱 안에 이미 비슷하게
  해결된 화면이 있는가? grep으로 확인했는가? 있으면 새로 설계하지 말고 그
  코드를 그대로 복붙(13-8 참고 - 이 항목을 건너뛰어서 같은 세션에 같은
  유형의 버그를 두 번 재설계로 실패한 전례가 있음)
□ 수정한 함수의 { } 짝이 맞는가?
□ _APP_V 버전 숫자 올렸는가?
□ sw.js CACHE 버전 올렸는가?
□ sw.js?v= 쿼리도 맞게 올렸는가?
□ (2026-07-13 추가, 제일 중요) 바로알바.html의 <script src="./assets/js/app.js?v=">,
  <script src="./shared-lang.js?v=">, <link href="./assets/css/style.css?v=">,
  <script src="./assets/js/app_ui.js?v="> (2026-07-16부터 lockstep 편입) 쿼리도
  전부 같은 번호로 올렸는가?
□ 새 기능의 JS 함수가 HTML에서 호출되는 함수와 이름이 일치하는가?
□ (2026-07-16 추가) "이 기능 죽어있다/없다"고 결론 내리기 전에 app.js뿐 아니라
  app_ui.js도 grep했는가? (Phase 58 정정 기록 참고)
```

**교훈 3 (2026-07-13, 진짜 최종 원인)**: 앞의 두 버전드리프트 버그(index.html 냉동사본,
head V='421' 하드코딩)를 다 고쳤는데도 FAB 라벨이 계속 안 바뀐다는 신고가 이어졌다.
알고 보니 `<script src="./assets/js/app.js">`, `<script src="./shared-lang.js">`,
`<link href="./assets/css/style.css">` 세 태그에 **쿼리 버전이 아예 없었다.** sw.js는
문서(html)는 항상 network-first(no-store)로 가져오지만, JS/CSS 같은 일반 리소스는
**cache-first**로 서빙한다(fetch handler 참고). 즉 새 HTML은 매번 fresh하게 받아와도,
그 안의 `<script src="app.js">`(쿼리 없음)는 예전에 캐시된 그대로 서빙되고,
그 예전 app.js 안의 캐시-초기화 로직 자체가 구버전이라 새 서비스워커 등록도 못 하는
**자기 자신을 가둔 순환 고착** 상태였다. 캐시를 아무리 지워도, 그 지우는 코드 자체가
캐시된 옛날 코드라 실행이 안 되는 구조. 이제 이 세 태그에도 `_APP_V`와 같은 번호로
`?v=` 쿼리를 붙여서, 배포할 때마다 완전히 다른 URL이 되어 캐시가 원천적으로 안 걸리게 함.
**이 세 줄에 버전 쿼리가 있는지는 앞으로 "왜 배포가 반영 안 되냐"는 보고를 받을 때마다
가장 먼저 확인할 것.**

### 13-6. Android 리빌드 필요 여부

| 변경 종류 | 리빌드 필요? |
|-----------|-------------|
| HTML / JS / CSS 수정 | ❌ 불필요 (서버에서 로드) |
| sw.js 수정 | ❌ 불필요 |
| `MainActivity.java` 수정 | ✅ 필요 |
| `build.gradle` 수정 | ✅ 필요 |
| `AndroidManifest.xml` 수정 | ✅ 필요 |

**현재 대기 중인 리빌드**: ✅ 없음.
- versionCode 30(1.5.5) - 카카오 로그인 세션 유지 안 되던 문제(제3자 쿠키 미허용)
  수정, 커밋 `d5f7393`(2026-07-17) - 빌드+Play Console 업로드 완료(2026-07-19)
- versionCode 31(1.5.6) - PDF 다운로드 안 되던 문제(WebView가 blob 다운로드를
  못 받아줘서 `AndroidBridge.saveBase64File()` 신설) 수정, 커밋 `7289461`(2026-07-19) -
  GitHub Actions 빌드 성공 확인(커밋 `7289461` 기준) + Play Console 업로드까지
  완료(2026-07-19, 대표님 확인). 실사용자에게 반영됨.

**2026-07-18 재확인 (대표님 "그때 리빌드했었는데 또 해야되냐" 질문에 대한 답)**:
GitHub Actions API(`gh` 인증 없이도 조회 가능, 이 repo는 public)로 실행 이력 직접
확인함 — 가장 최근 "Build Android TWA" 실행은 2026-07-15, 커밋 `51caa44`(versionCode
28→29, **상태표시줄 콜백 경합 방어** 수정)였고, 그 뒤에 커밋된 `d5f7393`(카카오 쿠키
수정, versionCode 30)에 대한 빌드는 **한 번도 실행된 적 없음**. 즉 대표님이 기억하는
"그때 리빌드"는 상태표시줄 건이고, 카카오 로그인 건은 아직 빌드조차 안 됨 — 이번엔
진짜 필요. `build.gradle`엔 이미 versionCode 30/1.5.5로 반영돼 있어 코드는 준비된
상태, GitHub Actions 실행 + Play Console 업로드만 남음.
→ 확인 방법(재발 방지용): `curl -s "https://api.github.com/repos/korjackie/baroalba/actions/runs?per_page=5" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(r['name'],r['created_at'],r['head_sha'][:8]) for r in d['workflow_runs']]"`
  로 최근 빌드가 어느 커밋 기준인지 먼저 확인하고, `android/` 관련 최신 커밋이 그
  이후인지 `git log <빌드커밋>..HEAD -- android/`로 대조할 것 — "리빌드했었는데"라는
  기억에만 의존하지 말고 매번 이렇게 교차 확인.
→ 새 `android/` 변경이 쌓이면: `git log <마지막빌드커밋>..HEAD -- android/`로 확인 →
  `build.gradle`의 `versionCode` +1 → GitHub Actions "Build Android TWA" 실행 →
  아티팩트를 Play Console에 수동 업로드(워크플로가 자동 배포하진 않음)

### 13-7. "키보드가 입력창을 가린다" 보고를 받으면 절대 visualViewport부터 짜지 말 것 (2026-07-16)

**이 프로젝트의 모든 페이지(바로알바.html뿐 아니라 admin.html 포함)는 도메인이
`baroalba.multimove.co.kr`이면 AAB 앱의 WebView 안에서 그대로 로드된다**
(`MainActivity.java`의 `shouldOverrideUrlLoading`이 이 도메인을 `return false` 처리 →
외부 브라우저로 안 나가고 같은 WebView가 그대로 로드, `AndroidBridge`도 그대로 살아있음).

즉 **이 도메인의 어떤 페이지든 네이티브가 이미 정확한 키보드 높이를 실시간으로
보내주고 있다**(`MainActivity.java`의 `applyKbHeight()` → 매번
`"if(window._onNativeKbChange)window._onNativeKbChange(dp)"`를 evaluateJavascript로
호출). 이 함수가 존재하면 실행하고, 없으면 조용히 아무 일도 안 일어난다.

**교훈 (2026-07-16, admin.html 바로스팟 개설 메모 키보드 가림)**: 이 문제를 여러 차례
"고쳤다"고 보고했는데 계속 재발했다. 원인은 `admin.html`에 `window._onNativeKbChange`가
아예 정의돼 있지 않아서 — 네이티브는 계속 정확한 dp 값을 보내고 있었는데 받는 쪽이
없어서 매번 버려지고 있었다. 그런데도 `visualViewport.resize`/`window.scrollBy`/
`scrollIntoView` 같은 **브라우저 API로 키보드 높이를 추측하는 방식을 세 번이나
새로 짜서** 시간을 허비했다. `_onNativeKbChange(dp)`는 이미 `CLAUDE.md` 2-5 Android
구조 섹션에 명시돼 있었는데 그걸 먼저 안 찾아본 게 근본 실수.

**앞으로 이 프로젝트의 어떤 화면에서든** "키보드가 입력창/버튼을 가린다"는 보고를
받으면:
1. 먼저 그 페이지에 `window._onNativeKbChange`가 정의돼 있는지 `grep`으로 확인
   (`grep -n "_onNativeKbChange" 그페이지.html`).
2. 없으면 그게 100% 원인이다 — app.js의 구현을 그대로 복붙해서 그 페이지의
   패널 구조(`.detail-overlay`/`.detail-panel`, `wchat-overlay` 스타일 등 무엇이든)에
   맞게 `overlay.style.paddingBottom` + `panel.style.maxHeight` + 포커스된
   입력창 `scrollTop` 보정만 이식하면 된다. **`visualViewport`나 `resize` 이벤트로
   새로 짜지 말 것** — 이미 훨씬 신뢰도 높은 신호가 매번 오고 있다.
3. `_onNativeKbChange`가 이미 있는데도 특정 패널만 안 먹히면, 십중팔구 그 패널의
   id/class가 함수 안의 `querySelectorAll` 대상에 등록이 안 된 것뿐이다
   (barospot-chat 패널 누락 사례, 13-5 체크리스트와 같은 종류의 "등록 누락" 패턴).

**추가 실패 기록 (2026-07-16~17, 이 규칙을 써놓고도 또 어김)**: `.mpsub-panel`(프로필
편집 등) 키보드 가림 신고에 이 13-7 원칙("복붙, 재설계 금지")을 안 지키고 또 세 번
재설계했다 — 1차 `scrollIntoView`만, 2차 안쪽 스크롤 div에 `paddingBottom`(스크롤
"범위"만 늘어나고 패널의 실제 보이는 높이는 그대로라 무효), 3차에야 대표님이 "채팅에서
하는 거 보고 그대로 해"라고 직접 지적한 뒤에야 `wchat-overlay`와 정확히 같은 방식
(overlay 자체에 paddingBottom → flex 레이아웃이 실제로 짧아짐)으로 맞춤. **`.mpsub-panel`
계열 키보드 가림은 이제 이 패턴으로 완성됐으니, 앞으로 또 이 유형 신고가 오면 재설계하지
말고 `_scrollMpsubFocusIntoView`/`_mpsubKbShrunkPanel` 코드를 그대로 참고할 것.**

### 13-8. "규칙을 적어놔도 어기면 무슨 소용이냐" (2026-07-17, 대표님 지적)

같은 세션 안에서 완전히 같은 유형의 실패가 두 번 반복됐다:

| 버그 | 이미 있던 정답 | 실제로 한 짓 | 정답 찾기까지 |
|------|---------------|------------|--------------|
| 상태표시줄 가림 | `.full-panel`의 `top:var(--sat-safe)` (같은 세션에 이미 읽었음) | CSS 미세조정을 세 번 새로 시도 | 4번째 시도, 대표님이 "이 페이지 설계 너가 한 건데 왜 스스로 못 찾냐"고 지적 |
| 키보드 가림 | `wchat-overlay`의 overlay 자체 paddingBottom (같은 세션에 이미 여러 번 읽었음) | scrollIntoView, 안쪽 div padding을 순서대로 새로 시도 | 3번째 시도, 대표님이 "채팅에서 하는 거 보고 그대로 해"라고 지적 |

**공통점**: 둘 다 정답이 되는 코드를 이미 같은 세션 안에서 직접 읽었다. 못 찾은 게
아니라 "연결을 안 지었다" — 새 신고가 들어오면 그 화면만 들여다보고 그 화면 안에서
해결하려 했지, "이 앱 다른 어딘가에 이미 똑같은 문제를 푼 코드가 있는가"라는 질문
자체를 던지지 않았다. **1번 절대 규칙("같은 기능은 소스 복붙, 재해석 구현 절대 금지")과
13-7이 이미 문서에 있었는데도 어겼다** — 문서에 적혀있다는 사실 자체는 아무것도
보장하지 않는다는 뜻이다.

**그래서 이번엔 문장을 하나 더 추가하는 대신, 13-5 배포 전 체크리스트 맨 앞에 강제
항목으로 박아넣었다** — 그 체크리스트는 매 배포마다 실제로 훑는 목록이라, "원칙을
안다"와 "그 원칙을 실행하는 절차 안에 물리적으로 들어있다"는 다르다는 판단에서다.
**앞으로 UI/동작 버그를 고칠 때는 코드를 쓰기 전에 반드시:**
```
grep -n "<이 버그와 관련된 키워드(예: overlay, kbChange, paddingBottom, sat-safe)>" assets/js/app.js
```
**를 먼저 돌려서, 이미 비슷한 문제를 해결한 화면이 있는지부터 확인할 것. 있으면 그
코드 구조를 그대로 복붙하고 셀렉터/id만 바꾼다. 없을 때만 새로 설계한다.**

### 13-9. ⭐️ 검수는 "코드"가 아니라 "살아있는 DB"에 대고 하라 — 모델보다 검증 습관 (2026-07-21, v547)

> **이 프로젝트에서 가장 중요한 원칙 중 하나. 매 검수/버그수정 때 반드시 상기할 것.**

Phase 59에서 코드↔실제DB 전수 대조로 **조용히 죽어있던 기능 9건**을 새로 잡았다. 그
직전까지 "수차례 전면검수 했고 이상없다"고 보고돼 있었는데도 못 잡혔던 이유, 그리고
왜 이번엔 잡혔는지에 대한 결론:

**이 전수 대조 자체는 특정 모델만 할 수 있는 게 아니다.** `curl`로 Supabase REST에
쿼리 날리고 파이썬으로 코드의 컬럼 참조와 대조하는 건 능력 한계의 문제가 전혀 아니다.
Sonnet도 기술적으로 똑같이 할 수 있다. **진짜 차이는 "코드만 읽지 말고, 살아있는
DB에 참조하는 45개 테이블 × 모든 컬럼을 전부 쿼리해서 대조하자"고 스스로 결정한
방법론 하나였다.**

핵심 인지 연결(이걸 안 시키면 코드를 아무리 잘 읽어도 안 잡힌다):
```
"조용히 빈 화면 / 목록이 안 뜸 / 값이 공란"
   → const { data } = await 로 에러를 삼키는 패턴 의심
   → 스키마 드리프트(없는 컬럼/테이블/관계 참조) 의심
   → 코드 리뷰로는 절대 확정 못 함
   → 실제 DB에 쿼리해서 확인 (이게 유일한 검출법)
```

**왜 이전 "전면검수"가 다 통과됐나**: 그 감사들은 대부분 **코드만 grep**했거나(죽은
코드/DOM 부재/백버튼 누락 — 이런 건 코드 안에 답이 있으니 잡힘), DB를 봤어도 **대표님이
콘솔에서 400을 목격한 테이블만 반응적으로** 확인했다. "이 컬럼이 실제 DB에 있나"는
코드 텍스트 어디에도 안 적혀 있으므로, 코드를 100번 읽어도 안 나온다. 그래서
"코드 기준으론 이상없음"이 "DB 기준으론 9개 버그"와 공존할 수 있었던 것이다.

**결론 — 모델이 아니라 검증 습관의 문제였다.** Opus가 시키지 않아도 exhaustive
검증을 끝까지 하는 경향이 있는 건 사실이지만, 그건 "Sonnet은 못 한다"는 뜻이 아니다.
어떤 모델로 작업하든, **DB를 건드리는 기능을 검수/수정할 때는 코드 읽기로 끝내지 말고
아래를 습관처럼 돌려라:**

```bash
# 코드가 참조하는 테이블 전부 뽑기
grep -roE "\.from\(['\"][a-z_]+['\"]" assets/js/*.js | grep -oE "['\"][a-z_]+['\"]" | tr -d "\"'" | sort -u
# 각 테이블 실제 컬럼 확인 (anon key, 값 노출 없이 존재만 확인)
KEY=<sw.js의 SB_ANON>; B=https://onwvbmllpycgswfzywjv.supabase.co/rest/v1
curl -s "$B/<table>?select=<col>&limit=1" -H "apikey:$KEY" -H "Authorization:Bearer $KEY"
#  → 200이면 컬럼 있음, 400이면 없음(= 그 쿼리 전체가 조용히 실패 중)
#  → 임베딩은 "?select=*,관계(...)"로 테스트, PGRST200 에러면 관계 없음
```
(Phase 59에 쓴 전수 대조 스크립트는 `.from()` 참조 + select/eq/order/insert 컬럼을
자동 추출해 일괄 대조한다. 재사용 권장. 아직 `api/*.js` 서버 SQL·`.rpc()`·admin.html은
전수 대조 안 했으니 다음 차례.)

**한 줄 요약: "안 된다/안 보인다" 보고를 받으면, 코드를 읽기 전에 그 화면이 건드리는
테이블·컬럼이 실제 DB에 있는지부터 쿼리로 확인하라. 스키마 드리프트는 코드로 못 잡는다.**
