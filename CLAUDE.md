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
          ├── sw.js             (PWA 서비스워커, 현재 v270)
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
  versionCode 23, versionName '1.4.2'
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

sw.js (v270)
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

---

## 8. 현재 버그 / 미완료

| 항목 | 상태 | 처리 방법 |
|------|------|-----------|
| 공고 저장 오류 | 🔴 미결 | 저장 실패 시 alert 디버그 중, 근본 원인 조사 필요 |
| Android SHOW_FORCED 리빌드 | 🟡 대기 | versionCode 24로 빌드 필요 |
| 커뮤니티 글/댓글 수정·삭제 UI | 🟡 미구현 | 본인 콘텐츠 편집/삭제 버튼 추가 |
| 커뮤니티 댓글 익명 토글 | 🟡 미구현 | `is_anonymous: false` 하드코딩 → 체크박스 필요 |
| 단체채팅 키보드 여백 과다 | 🟡 조사중 | `#moim-chat-messages`의 `min-height:100%`가 짧은 대화에서 하단 여백을 만드는 것으로 추정 (2026-07-13), `justify-content:flex-end` 전환 검토 필요 |
| 지도 통합핀/필터/FAB 신기능 실기기 미확인 | 🟡 확인대기 | v436까지 배포완료, 대표님 실기기 재확인 필요 (버전버그 수정 이후 최초 확인) |

---

## 9. 개선 검토 사항

### 단기 (바로 가능)
| 항목 | 설명 |
|------|------|
| 커뮤니티 수정/삭제 | 본인 글·댓글 편집 UI |
| 공고 저장 오류 수정 | DB constraint 또는 validation 원인 추적 |
| 알바생 스킬 공고 필터 | skills[] 매칭 필터 추가 |

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
□ 수정한 함수의 { } 짝이 맞는가?
□ _APP_V 버전 숫자 올렸는가?
□ sw.js CACHE 버전 올렸는가?
□ sw.js?v= 쿼리도 맞게 올렸는가?
□ 새 기능의 JS 함수가 HTML에서 호출되는 함수와 이름이 일치하는가?
```

### 13-6. Android 리빌드 필요 여부

| 변경 종류 | 리빌드 필요? |
|-----------|-------------|
| HTML / JS / CSS 수정 | ❌ 불필요 (서버에서 로드) |
| sw.js 수정 | ❌ 불필요 |
| `MainActivity.java` 수정 | ✅ 필요 |
| `build.gradle` 수정 | ✅ 필요 |
| `AndroidManifest.xml` 수정 | ✅ 필요 |

**현재 대기 중인 리빌드**: `LOAD_NO_CACHE` + `clearCache(true)` Java 변경분
→ GitHub Actions → "Build Android TWA" → Run workflow 실행 필요 (1회만)
→ 이후 HTML 변경은 영구적으로 리빌드 불필요
