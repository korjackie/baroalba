# 바로알바 — 프로젝트 마스터 문서

> 최종 업데이트: 2026-06-29  
> 담당: 박근욱 (jackie@multimove.co.kr) — 멀티무브 주식회사

---

## 목차

1. [서비스 소개](#1-서비스-소개)
2. [기술 구조](#2-기술-구조)
3. [시스템 구조](#3-시스템-구조)
4. [개발 타임라인 (날짜별 작업이력)](#4-개발-타임라인)
5. [작업 방식 매뉴얼](#5-작업-방식-매뉴얼)
6. [현재 상태 및 미결 과제](#6-현재-상태-및-미결-과제)
7. [개선 계획 및 로드맵](#7-개선-계획-및-로드맵)

---

## 1. 서비스 소개

### 바로알바란?

**바로알바**는 멀티무브 주식회사가 개발한 **실시간 알바 매칭 플랫폼**이다.  
알바생과 업주를 지도 기반으로 연결하며, 기존 구인구직 플랫폼과 달리 **현재 위치 중심의 즉각 매칭**을 핵심 가치로 삼는다.

### 핵심 가치 제안

| 관점 | 가치 |
|------|------|
| 알바생 | 지금 내 주변에 일자리가 있는지 지도로 즉시 확인. 스와이프로 탐색, 한 번에 지원 |
| 업주 | 공고 등록 즉시 주변 알바생에게 노출. 실시간 지원자 관리, 1:1 채팅 |
| 공통 | 앱 설치 없이 PWA로 즉시 사용. Android 앱도 제공 |

### 서비스 URL

| 구분 | URL |
|------|-----|
| 메인 앱 | https://baroalba.multimove.co.kr |
| GitHub | https://github.com/korjackie/baroalba |
| Supabase | onwvbmllpycgswfzywjv.supabase.co |

### 주요 기능 목록

#### 알바생
- 지도에서 주변 공고 한눈에 파악 (카카오맵, GPS 기반)
- 스와이프 UI로 공고 탐색 (좌우 스와이프)
- 공고 상세 → 지원 메시지 입력 → 지원
- 지원 현황 관리 (지원/수락/거절/취소)
- 1:1 채팅 (업주와 직접 소통, 이미지 전송)
- AI 맞춤 추천 (열람/스와이프 이력 기반)
- 업주 팔로우 → 신규 공고 알림
- 스카우트 제안 수락/거절
- 커뮤니티 (후기/정보공유/자유게시판)
- 다국어 UI (한국어/영어/중국어/일본어/베트남어/러시아어)
- 프로필: 포트폴리오 5장, 스킬, 경력, 자격서류
- 급여계산기 (주휴수당 + 실수령액)
- 수입 달력 (월별 수입 정리)
- 북마크 (공고 저장)
- 출근 알림 (D-1 자동 알림)
- 비대면 알바 필터
- 언어 우대 뱃지 필터
- **레슨/과외/전문기술 매칭** (스포츠·음악·댄스·미술 레슨, 어학·수학·국어 과외, IT·뷰티·크리에이티브 전문기술 강사-수강생 매칭 전용 패널)

#### 업주
- 공고 등록/수정/삭제 (사진 3장, 상세 위치)
- 지원자 목록 관리 (수락/거절/스카우트)
- 1:1 채팅 (알바생과 직접 소통)
- 채팅방 즐겨찾기, 안읽음 필터
- 업체 프로필 (사진 5장, 위치, 소개)
- on-air 토글 (지금 구인 중 표시)
- 알바생 즐겨찾기 (자주 쓰는 알바생 관리)
- 재방문 인센티브 설정
- 업주 전용 커뮤니티 게시판
- 채팅 인라인 답장 (알림에서 바로 답장)

#### 공통
- Web Push 알림 (FCM + VAPID)
- PWA 설치 (홈 화면 추가)
- Android 앱 (Google Play)
- 신고 시스템
- 관리자 대시보드 (admin.html)

---

## 2. 기술 구조

### 2-1. 기술 스택

```
Frontend
├── 순수 HTML/CSS/JS (프레임워크 없음)
├── 카카오맵 SDK (지도)
├── Cropper.js (이미지 크롭)
└── Supabase JS v2 (DB 클라이언트)

Backend / 인프라
├── Vercel (호스팅 + 서버리스 함수)
│   └── api/send-push.js (Web Push 발송)
├── Supabase
│   ├── PostgreSQL (데이터베이스)
│   ├── Storage (이미지 파일)
│   ├── Auth (OAuth + 이메일)
│   └── Realtime (채팅 실시간 업데이트)
└── Firebase
    └── FCM (Android 푸시알림)

Android
├── WebView 기반 하이브리드 앱
├── Java (MainActivity.java, BaroAlbaWebView.java)
├── GitHub Actions (자동 빌드/서명)
├── Firebase Cloud Messaging
└── core-splashscreen 1.0.1 (Android 12+ 스플래시)

PWA
├── manifest.json (PWA 설정)
├── sw.js (서비스워커, 현재 v270)
└── VAPID (Web Push 인증)
```

### 2-2. Android 앱 구조

```
android/
├── app/
│   ├── build.gradle              versionCode 23 / versionName 1.4.2
│   ├── src/main/java/kr/co/multimove/baroalba/
│   │   ├── MainActivity.java     WebView 호스트, AndroidBridge, FCM
│   │   └── BaroAlbaWebView.java  키보드 scroll guard 커스텀 WebView
│   └── src/main/res/
│       ├── values/styles.xml     Theme.LauncherActivity (SplashScreen API)
│       ├── drawable/ic_splash_icon.xml  투명 벡터 (아이콘 플래시 제거)
│       └── values/colors.xml    colorPrimary = #C8102E
└── .github/workflows/build.yml  GitHub Actions 자동빌드
```

#### AndroidBridge (JS ↔ Native)

| 메서드 | 역할 |
|--------|------|
| `share(title, text, url)` | 네이티브 공유 다이얼로그 |
| `showKeyboard()` | SHOW_FORCED로 키보드 강제 유지 |
| `hideKeyboard()` | scrollKbGuard 해제 + 키보드 닫기 |
| `setScrollKbGuard(bool)` | 채팅 전송 중 스크롤 guard ON/OFF |
| `saveAuthToken(token)` | Supabase JWT → SharedPreferences |

#### CSS 변수 (Android → WebView 주입)

```javascript
--sat : status bar top (dp)
--sab : navigation bar bottom (dp)
_onNativeKbChange(dp) : 키보드 높이 변화 콜백
_onFCMToken(token)    : FCM 토큰 전달 콜백
```

#### 스플래시 구조

```
앱 실행
  → Theme.LauncherActivity (SplashScreen API, 즉시 dismiss)
  → WebView load: login.html
  → login.html 웹 스플래시 표시 (4초 최소 보장)
  → _afterSplash(fn) : 경과시간 계산 후 goToApp/showLoginScreen 호출
```

#### Android 빌드 버전 이력

| versionCode | versionName | 주요 변경 |
|-------------|-------------|-----------|
| 18 | 1.3.2 | FCM 타이밍 버그 수정 |
| 19 | 1.3.3 | 다중 파일 선택 |
| 20 | 1.3.4 | 19 중복 → 재발행 |
| 21 | 1.4.0 | 채팅 인라인 답장 |
| 22 | 1.4.1 | 스플래시 1차 수정 (불완전) |
| 23 | 1.4.2 | 투명 아이콘 + WebView #C8102E 배경 (완전 해결) |

### 2-3. 파일별 역할

| 파일 | 역할 | 크기 |
|------|------|------|
| `바로알바.html` | 알바생+업주 통합 앱 전체 | ~450KB |
| `login.html` | 로그인/회원가입 + 웹 스플래시 | ~28KB |
| `owner.html` | redirect only → `/바로알바.html?tab=postings` | ~0.1KB |
| `admin.html` | 관리자 대시보드 (신고/회원관리) | ~30KB |
| `shared-lang.js` | 번역 데이터 + applyLang() | ~18KB |
| `sw.js` | PWA 서비스워커 (현재 v270) | ~3KB |
| `manifest.json` | PWA 설정 (start_url: login.html) | ~1KB |
| `config.js` | DEFAULT_LAT/LNG, RADIUS 등 | ~2KB |
| `terms.html` | 이용약관 + 개인정보처리방침 | - |
| `api/send-push.js` | Vercel 서버리스, Web Push 발송 | ~2KB |

### 2-4. 마이페이지 서브패널 구조

```
panel-profile (마이페이지 전체화면)
├── 프로필 헤더 (아바타, 이름, 등급)
├── 통계 바 (지원건수 / 평점)
├── 섹션 rows (iOS Settings 스타일)
│   ├── 내 지원현황     → goToMyApplications() → openDashPanel('applications')
│   ├── 팔로잉 업체      → openMpSub('following')
│   ├── 기본정보         → openMpSub('basic')
│   ├── 포트폴리오       → openMpSub('portfolio')
│   ├── 스킬/경력        → openMpSub('skills')
│   ├── 자격서류         → openMpSub('docs')
│   ├── 알림설정         → openMpSub('noti')
│   └── 언어 설정        → openMpSub('lang')
│
└── mpsub-* 서브패널들 (transform:translateX, .show 클래스)
    ├── mpsub-income     수입 달력
    ├── mpsub-following  팔로잉 업체 목록
    ├── mpsub-basic      기본정보 편집
    ├── mpsub-portfolio  포트폴리오 사진
    ├── mpsub-skills     스킬/경력/학력/선호
    ├── mpsub-docs       자격서류 업로드
    ├── mpsub-noti       알림 설정
    └── mpsub-lang       언어 선택
```

### 2-5. 번역 시스템 (shared-lang.js)

```
6개국어: ko / en / zh / ja / vi / ru

WORK_TYPE_LABELS   근무형태 레이블
VEHICLE_LABELS     이동수단 8종
STRENGTH_LABELS    강점 20종
TRANSLATIONS       UI 전반 70+개

HTML 속성:
  data-i18n="key"      textContent 번역
  data-i18n-ph="key"   placeholder 번역
  data-v="bicycle"     이동수단 칩
  data-s="strong"      강점 칩
  data-wt="regular"    근무형태 칩
```

---

## 3. 시스템 구조

### 3-1. 인프라 구성도

```
사용자 (브라우저 / Android 앱)
  │
  ├─► Vercel CDN (baroalba.multimove.co.kr)
  │     ├── 정적 파일 서빙 (HTML/JS/CSS)
  │     └── api/send-push.js (서버리스 Push 발송)
  │
  ├─► Supabase
  │     ├── PostgreSQL (데이터 저장)
  │     ├── Auth (OAuth: 카카오/네이버/구글 + 이메일)
  │     ├── Storage (avatars, biz-photos 버킷)
  │     └── Realtime (채팅 실시간 구독)
  │
  ├─► Firebase
  │     └── FCM (Android 푸시알림)
  │
  ├─► 카카오맵 SDK (지도 렌더링)
  └─► GitHub Actions (Android APK 자동 빌드/서명)
```

### 3-2. 역할(Role) 분기 시스템

```javascript
currentUser.user_metadata.baroalba_role
  'worker'   → workers 테이블, 알바생 UI
  'business' → businesses 테이블, 업주 UI (panel-owner)
```

### 3-3. DB 테이블 구조

#### workers
```
id UUID PK | kakao_uid UUID UNIQUE | name TEXT | phone TEXT
age INT | birth_date TEXT | bio TEXT | experience TEXT
rating DECIMAL | review_count INT | skills TEXT[]
noshow_count INT | gender TEXT | region TEXT | email TEXT
photo_url TEXT | vehicles TEXT[] | strengths TEXT[] | languages TEXT[]
```

#### businesses
```
id UUID PK | kakao_uid UUID UNIQUE | biz_name TEXT | name TEXT
phone TEXT | description TEXT | photo_url TEXT
address TEXT | lat FLOAT | lng FLOAT | rating DECIMAL
kindness_rating DECIMAL | review_count INT
```

#### job_postings
```
id UUID PK | business_id UUID FK
title TEXT | work_type TEXT (regular/short/spot/errand)
work_days TEXT[] | work_start_date DATE | work_end_date DATE
start_time TEXT | end_time TEXT | hourly_wage INT
address TEXT | lat FLOAT | lng FLOAT | description TEXT
required_people INT | is_premium BOOLEAN | is_active BOOLEAN
view_count INT | age_limit BOOLEAN | holiday_pay BOOLEAN
is_remote BOOLEAN (비대면)
```

#### applications
```
id UUID PK | job_id UUID FK | worker_id UUID FK
status TEXT (pending/accepted/rejected/cancelled)
cancel_deadline TIMESTAMPTZ | message TEXT
created_at TIMESTAMPTZ
```

#### chats / messages
```
chats: id | job_id FK | worker_id FK | business_id FK
       last_message | unread_worker | unread_business
messages: id | chat_id FK | sender_role (worker/business)
          content | image_url | created_at
```

#### worker_photos / business_photos
```
id UUID PK | [worker/business]_id UUID FK
photo_url TEXT | is_main BOOLEAN | sort_order INT
```

#### community_posts / community_comments
```
posts: id | worker_id NULL | business_id NULL
       category | title | content | is_anonymous
       likes | comments_count | is_deleted
comments: id | post_id FK | worker_id NULL | business_id NULL
          content | is_anonymous
```

#### reports
```
reporter_id | target_id | target_type (worker/business/job)
reason | detail | status
```

### 3-4. RLS (Row Level Security)

```sql
-- workers/businesses CRUD
kakao_uid = auth.uid()   -- UUID 직접 비교 (::text 캐스트 금지)

-- community 글/댓글
worker_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM workers WHERE id=worker_id AND kakao_uid=auth.uid()
) OR business_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM businesses WHERE id=business_id AND kakao_uid=auth.uid()
)
```

### 3-5. 배포 파이프라인

```
코드 수정
  → git push origin main
  → Vercel 자동 빌드 + 배포 (약 30초)
  → baroalba.multimove.co.kr 즉시 반영

Android 빌드
  → build.gradle 버전 업
  → git push
  → GitHub Actions 자동 트리거
  → APK 서명 + 아티팩트 저장
  → Play Console 수동 업로드
```

---

## 4. 개발 타임라인

### Phase 0 — 프로젝트 초기화 (2026-05-31)

- Vercel 프로젝트 생성 및 도메인 연결
- OG 메타태그 설정, 푸터 추가
- GitHub 저장소 초기화

---

### Phase 1~12 — 기본 플랫폼 구축 (2026-06-01)

하루 만에 53개 커밋으로 MVP 완성.

| 영역 | 구현 내용 |
|------|-----------|
| 인증 | 카카오/네이버/구글 OAuth + 이메일 회원가입, 역할 선택 |
| 지도 | 카카오맵 SDK 연동, GPS 위치 기반 공고 표시 |
| 공고 | 업주 공고 등록/수정/삭제, 날짜/시간 피커, 5분 단위 |
| 탐색 | 스와이프 UI, 리스트 뷰 전환 |
| 지원 | 알바생 지원/취소, 업주 수락/거절 |
| 채팅 | 1:1 채팅 (Supabase Realtime) |
| 프로필 | 알바생/업주 프로필 등록, 성별/지역/경력 |
| 평점 | 리뷰/별점 시스템 |
| PWA | manifest.json, sw.js, 설치 배너 |

---

### Phase 13~16 — 기능 확장 1차 (2026-06-02~04)

| 날짜 | 작업 |
|------|------|
| 06-02 | 공고 조회수, 북마크, 급구 필터 |
| 06-03 | 신고 시스템, 관리자 화이트리스트 |
| 06-04 | **바로심부름** 근무형태 추가 (심부름 카테고리) |
| 06-04 | 위치 입력 3탭 구조 (지도클릭/GPS/주소직접입력) |
| 06-04 | Web Push 알림 구현 (`api/send-push.js`) |
| 06-04 | 카카오 공유 SDK 연동 |
| 06-04 | 업주 nav '설정'→'마이페이지' 리네임 |

---

### Phase 17~19 — 플랫폼 안정화 (2026-06-08~10)

| 날짜 | 작업 |
|------|------|
| 06-08 | 50개 커밋 — UI 정리, 다수 버그 수정 |
| 06-09 | 18개 커밋 — 카카오 공유 이미지, 딥링크 개선 |
| 06-10 | 미성년자 보호 (`age_limit`), 인증 뱃지 (`is_verified`) |
| 06-10 | 카카오 공유 SDK 완전 연동 |
| 06-10 | 업주 채팅 에러 핸들링 강화 |

---

### Phase 20~24 — 다국어 + 커뮤니티 (2026-06-11~12)

| 날짜 | 작업 |
|------|------|
| 06-11 | **shared-lang.js 분리** — 6개국어 번역 엔진 독립 파일화 |
| 06-11 | 업주 앱 전면 다국어 번역 완성 |
| 06-11 | 프로필 사진 Crop 편집 + 포트폴리오 5장 |
| 06-11 | **커뮤니티 게시판** 구현 (글쓰기/댓글/좋아요) |
| 06-11 | 지원 취소 마감기한 시스템 (`cancel_deadline`) |
| 06-11 | CLAUDE.md 최초 작성 |
| 06-12 | 지도 마커 리디자인 (공고유형 뱃지 + D-day 표시) |
| 06-12 | 업주 지도 드래그어블 바텀시트 |
| 06-12 | 자기소개 / 업체소개 글자수 카운터 |
| 06-12 | 알바생 댓글 알림 추가 |

---

### Phase 25~30 — Supabase 전환 + 고급기능 (2026-06-15~19)

| 날짜 | 작업 |
|------|------|
| 06-15 | 8개 커밋 — Storage 버킷 정책, 사진 업로드 개선 |
| 06-16 | 25개 커밋 — 프로필 시스템 대규모 리팩터 |
| 06-17 | DB 복구 작업, 중복 레코드 버그 수정 |
| 06-18 | 89개 커밋 (최다) |
| | Supabase Storage 자격서류 업로드 |
| | on-air 토글 (지금 구인 중 표시) |
| | 재방문율 뱃지 |
| | 즐겨찾기 알바생 Supabase 동기화 |
| | 채팅 목록 DB 조회 전환 |
| | OTP 8자리 수정 (Supabase 설정 맞춤) |
| | 구글 OAuth Samsung 브라우저 버그 수정 |
| 06-19 | 42개 커밋 — 다수 UX 버그 수정 |

---

### Phase 31~36 — AI 추천 + 채팅 고도화 (2026-06-20~22)

| 날짜 | 작업 |
|------|------|
| 06-20 | **AI 맞춤 추천** — 열람/스와이프 이력 기반 추천 카드 |
| 06-20 | 공고 사진 업로드 (최대 3장) + Crop + 드래그 순서 변경 |
| 06-20 | 공고 상세 위치 미니맵 |
| 06-20 | 이미지 전체화면 뷰어 (탭투뷰) |
| 06-20 | **급여계산기** — 주휴수당 + 실수령액 자동 계산 |
| 06-20 | 업주 평점/리뷰 입력 (근무완료 후) |
| 06-20 | 지원 메시지 입력 (지원 전 한마디) |
| 06-20 | 맞춤 공고 알림 구독 (선호 조건 저장) |
| 06-21 | 알림 허용 배너 (사용자 제스처 기반 권한 요청) |
| 06-21 | 새 지원자 FCM Push 업주 전송 |
| 06-21 | **채팅 전체화면 전환** — 키보드 올라올 때 레이아웃 자동 조정 |
| 06-21 | viewport `interactive-widget=resizes-content` 적용 |
| 06-22 | **FCM 푸시알림 완성** + VAPID 새 키 적용 |
| 06-22 | **채팅 이미지 전송** 구현 |
| 06-22 | 채팅 UI 스냅챗 스타일 (탭필터/아바타/즐겨찾기) |
| 06-22 | 업주 팔로우/언팔로우 + 팔로워 새 공고 알림 |
| 06-22 | **스카우트 제안** — 업주가 알바생에게 직접 제안 |
| 06-22 | **수입 달력** — 월별 수입 정리 |
| 06-22 | 아이콘 전면 개선 |
| 06-22 | 비속어 필터 (공백/특수문자 우회 차단) |
| 06-22 | 미소 앱 벤치마킹 6개 기능 구현 |
| 06-22 | 재방문 인센티브 폼 UI |

---

### Phase 37~40 — 키보드/사진 안정화 (2026-06-23~25)

| 날짜 | 작업 |
|------|------|
| 06-23 | 사진 업로드 saveWorkerProfile 분리 (독립 처리) |
| 06-23 | `_getWorkerId` 캐시 통합 |
| 06-24 | **언어 우대 배지** + 내 언어 우대 공고 필터 |
| 06-24 | 키보드 bottom:auto + window.resize fallback |
| 06-24 | 포트폴리오 다중 선택 |
| 06-24 | Supabase v2 `.single().catch` → try/catch 전환 |
| 06-25 | Android v19 다중 파일 선택 (`EXTRA_ALLOW_MULTIPLE`) |
| 06-25 | Android v20 versionCode 재발행 (19 중복 오류) |
| 06-25 | 키보드 `_onNativeKbChange` 네이티브 IME 높이 사용 |
| 06-25 | AI 추천 카드 클릭 버그 수정 |

---

### Phase 41~44 — 벤치마킹 + 비대면 (2026-06-26~27)

| 날짜 | 작업 |
|------|------|
| 06-26 | 언어별 레슨 패널 i18n 완성 |
| 06-26 | 알바생 지도 언어 필터 |
| 06-27 | 해주세요 앱 벤치마킹 5개 항목 구현 |
| | (자기소개 UX, 금지행위 동의, 약관강화, 사진TIP, 숫자신뢰) |
| 06-27 | **비대면 알바** 기능 구현 (`is_remote` 필드) |
| 06-27 | 비대면 필터 + 지도 마커 비대면 뱃지 |
| 06-27 | **채팅 딥링크** — 알림 탭에서 채팅방 직접 이동 |
| 06-27 | **채팅 인라인 답장** — 알림에서 바로 답장 |
| 06-27 | Android versionCode 21 (1.4.0) 빌드 |

---

### Phase 45~50 — 마이페이지 전면 개편 + Android 완성 (2026-06-28)

| 작업 | 세부 내용 |
|------|-----------|
| **마이페이지 전면 리디자인** | 단일 스크롤 → iOS Settings 스타일 row 네비게이션 |
| | 8개 서브패널 (기본정보/포트폴리오/스킬/자격서류/알림/언어/팔로잉/수입) |
| | `openMpSub(name)` / `closeMpSub(name)` transform 전환 |
| **스플래시 화면 통합** | login.html에 스플래시 통합 (타이핑 애니메이션) |
| | `_afterSplash(fn)` 헬퍼 — 4초 최소 보장 |
| | 스플래시 텍스트 가시성 개선 (font-weight 700, opacity 0.8) |
| **Android 스플래시 완전 해결** | versionCode 22: core-splashscreen 즉시 dismiss |
| | versionCode 23: `ic_splash_icon.xml` 투명 벡터 (아이콘 플래시 제거) |
| | WebView `setBackgroundColor(#C8102E)` (흰색 플래시 제거) |
| **지원현황 패널 버그 수정** | `goToMyApplications()` → `openDashPanel('applications')` 직접 호출 |
| | `my-applications-list` `flex:1;overflow-y:auto` 추가 (스크롤 끝까지) |
| **SW 버전 동기화** | sw.js v270 |

---

### 현재 (2026-06-29)

- **Android 최신**: versionCode 23 / 1.4.2 (Google Play 업로드 상태)
- **웹 최신**: sw.js v270
- **Vercel 배포**: https://baroalba.multimove.co.kr

---

## 5. 작업 방식 매뉴얼

### 5-1. 배포 원칙

```
웹 수정
  1. 바로알바.html (또는 해당 파일) 편집
  2. sw.js CACHE 버전 증가: 'baroalba-vN' → 'baroalba-v(N+1)'
  3. git add [수정된 파일들]
  4. git commit -m "feat/fix: 내용"
  5. git push origin main
  → Vercel 자동배포 (약 30초)

Android 수정
  1. build.gradle versionCode +1, versionName 업
  2. MainActivity.java / BaroAlbaWebView.java 수정
  3. git push origin main
  → GitHub Actions 자동 빌드 → APK 다운로드
  → Play Console 수동 업로드
```

**절대 규칙:**
- `owner.html` 편집 금지 — 1줄 redirect 파일
- 버전 파일 생성 금지 (`바로알바_v2.html` 불가)
- 편집 후 즉시 배포 (편집만 하고 보고 금지)
- DML은 JS 클라이언트 직접 처리 (`db.from(...)`)
- DDL만 Supabase SQL Editor에서 실행

### 5-2. 코드 편집 원칙

```
같은 기능 → 소스 그대로 복붙 + 변수명만 교체 (재해석 구현 금지)
대용량 블록 삭제 → Python 스크립트 사용 (Edit 도구 한계 우회)
CSS ↔ JS 혼재 금지 — CSS는 <style>, JS는 <script>에서만
비BMP 이모지 주의 — JS 문자열 내 4바이트 이모지 처리 확인
```

### 5-3. ID 중복 방지 규칙

마이페이지 리디자인 시 발생한 14개 중복 ID 경험에서 도출:

- 서브패널 추가 시 기존 HTML 요소 ID와 충돌 여부 선확인
- `document.getElementById`는 첫 번째 발견 요소만 반환 → 중복 ID는 무조건 버그
- 숨겨진 compat div에 동일 ID 존재 여부 Python 스크립트로 확인 가능:
  ```python
  import re
  from collections import Counter
  with open('바로알바.html', encoding='utf-8') as f:
      ids = re.findall(r'id="([^"]+)"', f.read())
  dups = [k for k,v in Counter(ids).items() if v > 1]
  print(dups)
  ```

### 5-4. Android 빌드 체크리스트

빌드 전 확인 사항:
```
□ build.gradle versionCode가 Play Console 최신보다 높은지 확인
□ MainActivity.java 수정 내용 push 완료 여부
□ GitHub Actions가 최신 커밋으로 트리거됐는지 확인
□ APK 다운로드 후 설치 테스트
□ Play Console 업로드 시 "이미 사용된 버전코드" 오류 없는지
```

### 5-5. 국적 드롭다운 확정 순서

변경 불가 — 절대 기본값으로 되돌리지 말 것:
```
한국 / 중앙아시아 / 베트남 / 러시아 / 중국 / 일본 / 미국 / 기타
```

### 5-6. 에러 패턴 대응

| 에러 | 원인 | 해결 |
|------|------|------|
| `policy already exists` | SQL 중복 실행 | 무시 (정책 이미 존재) |
| `cannot change return type` | RPC 반환타입 변경 | `DROP FUNCTION IF EXISTS 함수명(uuid)` 후 재생성 |
| PWA 캐시 미갱신 | sw.js 버전 미증가 | `CACHE = 'baroalba-v(N+1)'` |
| UUID 타입 오류 | `kakao_uid::text` 캐스트 | ::text 제거, UUID 그대로 |
| versionCode 중복 | Play Console 기존 버전 | build.gradle +2 이상 증가 |
| 중복 ID 버그 | 서브패널 추가 시 충돌 | Python 스크립트로 사전 확인 |

---

## 6. 현재 상태 및 미결 과제

### 6-1. 확인된 버그 / 미결 항목

| 항목 | 상태 | 처리 방법 |
|------|------|-----------|
| 공고 저장 오류 | 🔴 미결 | 저장 실패 시 alert으로 에러 표시 중, 근본 원인 불명확 |
| Android 키보드 SHOW_FORCED | 🟡 리빌드 필요 | 현재 코드는 준비됨, versionCode 24로 빌드 필요 |
| 커뮤니티 글/댓글 수정·삭제 UI | 🟡 기능 미구현 | 본인 글에 수정/삭제 버튼 추가 필요 |
| 커뮤니티 댓글 익명 토글 | 🟡 기능 미구현 | `is_anonymous: false` 하드코딩 상태 |
| `cancel_deadline` DDL | ✅ 완료 | 컬럼 운영 중 |
| businesses.plan 미영속화 | 🔴 미결 (P0) | `_currentPlan`이 결제 직후에만 세팅되고 새로고침/재로그인 시 항상 'free'로 리셋됨. 로그인/앱 진입 시 businesses.plan을 조회해 초기화하는 로직 필요 |
| 스와이프 지원 연령게이트 UX | ✅ 완료 (2026-07-08) | flyCard가 applySwipeJob 결과 대기 없이 성공 토스트를 띄우던 버그 수정 |
| 스와이프 '다시 보기' 중복노출 | ✅ 완료 (2026-07-08) | 버튼이 swipeIdx만 리셋하고 swipeJobs를 재구성 안 하던 버그 → initSwipe() 호출로 수정 |
| 지원취소 후 재지원 불가 | ✅ 완료 (2026-07-08) | cancelled 상태를 '이미 지원'으로 오인 + DB 유니크 충돌로 막히던 것 수정 (재지원 시 기존 행 update로 부활) |
| MOIM_PLAN_LIMITS 키 오타 | ✅ 완료 (2026-07-08) | `standard`→`basic`. 베이직 결제자가 월 10개가 아닌 1개로 제한되던 버그 |
| 바로모임 PRO/BASIC 뱃지 랜덤 배정 | ✅ 완료 (2026-07-08) | Math.random() → 실제 host의 businesses.plan 조회로 수정 |
| admin 공고 강제마감 → 신고카드 미갱신 | ✅ 완료 (2026-07-08) | 신고관리 탭에서 강제마감 클릭 시 해당 report도 함께 '조치완료' 처리하도록 수정 |

### 6-2. Play Console 현황

- 현재 업로드: versionCode 23 / 1.4.2
- 검토 중 또는 배포 완료 상태 확인 필요

---

## 7. 개선 계획 및 로드맵

### 7-1. 단기 과제 (즉시 처리 가능)

| 우선순위 | 항목 | 내용 |
|----------|------|------|
| P1 | 공고 저장 오류 근본 수정 | 저장 실패 원인 추적 — validation 검사 또는 DB constraint 확인 |
| P1 | 커뮤니티 글/댓글 수정·삭제 | 본인 콘텐츠에 편집 버튼 UI 추가 |
| P2 | Android versionCode 24 빌드 | SHOW_FORCED 키보드 정식 반영 |
| P2 | 알바생 스킬 태그 공고 필터 | workers.skills[] 와 job_postings 매칭 필터 |
| P3 | 댓글 익명 토글 | is_anonymous 체크박스 추가 |

### 7-2. 중기 과제 (1~2주)

| 항목 | 내용 | 근거 |
|------|------|------|
| 결제 연동 | 토스페이먼츠 프리미엄 플랜 실결제 | 수익화 모델 필요 |
| 공고 자동 마감 | work_end_date 경과 시 is_active=false (Supabase Edge Function) | 만료 공고 노출 방지 |
| 리뷰 답글 | 업주가 리뷰에 답변 | 업주 신뢰도 향상 |
| 알림 히스토리 | 받은 알림 목록 조회 화면 | 사용자 요구 높음 |
| 수입 통계 강화 | 월별/주별 통계, 업종별 시급 비교 | 수입 달력 확장 |
| 매칭 알고리즘 개선 | AI 추천 정확도 — 클릭률/지원률 피드백 루프 | 리텐션 향상 |

### 7-3. 장기 과제 (전략적)

| 항목 | 내용 | 우선순위 |
|------|------|----------|
| iOS 앱 | 현재 Android only → iOS WebView 래퍼 | 사용자 풀 확대 |
| B2B 기업 고객 | 대량 채용, 계약서 자동 생성, 인보이스 | 수익 다각화 |
| 에스크로 결제 | 알바비 플랫폼 보관 → 근무 확인 후 지급 | 신뢰도 핵심 |
| 알바생 신용점수 | 노쇼/취소/완주 이력 기반 매너점수 고도화 | 플랫폼 품질 관리 |
| 바로이사 서비스 | 소형이사/짐운반 독립 카테고리화 | 사업 확장 |
| 바로대행 | 심부름 고도화 (해주세요 경쟁) | 심부름 시장 공략 |
| 실시간 위치 공유 | 근무 중 위치 확인 (업주용) | 프리미엄 기능 |
| 구독 모델 | 업주 Standard/Premium 실결제 | 주요 수익원 |

### 7-4. 기술 부채

| 항목 | 현재 상태 | 개선 방향 |
|------|-----------|-----------|
| 단일 HTML 파일 | ✅ 1차 완료 (2026-07-08): assets/css/style.css, assets/js/app.js, assets/js/app_ui.js로 분리 | app.js가 여전히 911KB 단일 파일 — 아래 항목 참고 |
| app.js 도메인별 재분리 (제안, 미착수) | app.js 911KB에 공고/모임/결제/채팅 로직이 전부 혼재 | 번들러 없이 `<script src>` 유지 전제로, 공고(jobs), 모임(gatherings), 결제(payment), 채팅(chat) 단위로 추가 분리 제안. 우선순위는 낮음(P2) — 실익 대비 리스크 검토 후 별도 논의 필요 |
| SW 버전 수동 관리 | sw.js 버전 매번 수동 증가 | 빌드 스크립트 자동화 |
| 테스트 없음 | 수동 검수 의존 | 핵심 함수 단위 테스트 도입 |
| owner.html redirect | 잠정 구조 | 장기적으로 역할 완전 통합 |

---

## 부록 — 주요 설정값

| 항목 | 값 |
|------|-----|
| 카카오맵 JS 키 | ffcea2fab508898c168f043100b4d550 |
| Supabase URL | onwvbmllpycgswfzywjv.supabase.co |
| 네이버 Client ID | 9DotifcIhyF4lq8bQLU9 |
| 도메인 | baroalba.multimove.co.kr |
| GitHub | github.com/korjackie/baroalba |
| 기본 위치 | 37.5445, 127.0556 (성수역) |
| 기본 반경 | 10km |
| Android packageId | kr.co.multimove.baroalba |
| 브랜드 컬러 | #C8102E (바로알바 레드) |
