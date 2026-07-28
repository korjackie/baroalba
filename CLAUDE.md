# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 바로알바 — Claude 개발 지침서

---

## 0. 이 프로젝트 / 문서 지도

**바로알바** — 지도 기반 실시간 알바 매칭 (멀티무브 주식회사).
업주가 손님 몰릴 때 시급을 올려 즉시 구인하고, 알바생은 지도에서 주변 일자리를 찾아
바로 출근한다. 프레임워크 없는 순수 HTML/JS + Supabase + Vercel, Android는 WebView 래퍼.

### 문서는 3개뿐이다

| 문서 | 답하는 질문 | 언제 읽나 |
|------|-------------|-----------|
| **`CLAUDE.md`** (이 파일) | "어떻게 작업해야 하나?" — 규칙 + 시스템 구조 | **자동, 매 세션** |
| **`docs/PROGRESS.md`** | "지금 어디까지 왔고 다음은?" — 현재 버그·다음 할 일·최근 이력 | 작업 시작 전 |
| **`docs/WORK_LOG.md`** | "이게 왜 이렇게 돼 있나?" — 과거 경위 | 필요할 때만 |

**규칙 4가지**

1. 이 파일은 **자동으로 매번 읽히므로** 이력·완료보고를 여기 쓰지 않는다. 얇게 유지할 것.
2. 작업을 끝내면 **요청받지 않아도** `docs/PROGRESS.md` 를 갱신한다.
3. **새 문서 파일을 만들지 않는다.** (`PROJECT.md`, 날짜별 `*_changelog.md` 는 2026-07-28에
   전부 위 3개로 합쳤다. 파일이 늘면 어느 게 최신인지 매번 다시 판단해야 한다.)
4. **규칙·함정을 추가할 때는 하나 지울 것이 없는지 먼저 본다.** 여기는 *지금도 밟을 수
   있는 함정*만 남기는 자리다. 원인이 제거됐거나(코드가 바뀌어 더 못 밟는다) 한 번 겪고
   끝난 일은 `docs/WORK_LOG.md` 로 내리고 여기선 지운다. 이 파일은 매 세션 값을 치르므로
   항목이 늘기만 하면 결국 전체가 안 읽히게 된다 — 2026-07-28 이전이 정확히 그 상태였다
   (47,000 토큰, 그중 61%가 과거 이력).

저장소 밖 구글드라이브 `2. Projects/바로알바/` 의 `PROGRESS.md`·`milestone_*.md` 와
`prototype/backup/` 은 06월에 멈춘 **보존용**이다. 사실 확인에 쓰지 말 것.

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
          ├── index.html       (공개 랜딩페이지 / — SEO + 8개 언어)
          ├── 바로알바.html     (알바생 + 업주 통합 앱)
          ├── owner.html        (redirect only → /바로알바.html?tab=postings)
          ├── admin.html        (관리자 전용, ADMIN_EMAILS 화이트리스트)
          ├── login.html        (PWA 진입점 + 웹 스플래시)
          ├── shared-lang.js    (번역 데이터 8개 언어 + applyLang())
          ├── sw.js             (PWA 서비스워커, 배포마다 갱신 - 정확한 값은 sw.js 직접 확인)
          ├── manifest.json     (PWA 설정, start_url: ./login.html)
          └── api/*.js          (Vercel 서버리스 12개 — 2-2 파일별 역할 참고. Hobby 플랜 상한이 12라 꽉 찼음)

GitHub: github.com/korjackie/baroalba (main 브랜치)
Supabase: onwvbmllpycgswfzywjv.supabase.co
  ├── PostgreSQL DB
  ├── Storage (avatars, biz-photos 버킷)
  ├── Auth (카카오/네이버/구글 OAuth + 이메일)
  └── Realtime (채팅 구독)
Firebase: FCM (Android 푸시알림)
```

### 2-2. 파일별 역할

*(2026-07-28 갱신. 버전·크기는 그때그때 바뀌므로 정확한 값은 파일을 직접 볼 것)*

| 파일 | 역할 | 크기 |
|------|------|------|
| `index.html` | **공개 랜딩페이지**(`/`) + SEO + 8개 언어 전환 | ~60KB |
| `바로알바.html` | 알바생+업주 통합 앱 전체 | ~440KB |
| `login.html` | 로그인/회원가입 + 웹 스플래시 | ~73KB |
| `owner.html` | redirect only → `/바로알바.html?tab=postings` | ~0.1KB |
| `admin.html` | 관리자 대시보드 (신고/회원관리) | ~225KB |
| `assets/js/app.js` | 앱 로직 본체 (`_APP_V` 가 여기 있다) | ~1.2MB |
| `assets/js/app_ui.js` | UI 보조 로직 (app.js와 락스텝) | ~56KB |
| `shared-lang.js` | 번역 데이터 8개 언어 × 1922키 + `applyLang()` | ~1MB |
| `sw.js` | PWA 서비스워커 (배포마다 CACHE 버전 갱신) | ~7KB |
| `manifest.json` | PWA 설정 (start_url: login.html) | ~1KB |
| `config.js` | DEFAULT_LAT/LNG, RADIUS 등 | ~2KB |
| `terms.html` / `privacy.html` | 이용약관 / 개인정보처리방침 | - |
| `robots.txt` | 크롤러 차단 규칙 (admin·api·docs·시안) | ~1KB |

**`api/` 서버리스 함수 (12개 — 상한이 12개라 꽉 찬 상태)**

| 파일 | 역할 |
|------|------|
| `api/seo.js` | `/job/:id` 서버렌더링 + `/sitemap.xml` 자동생성 |
| `api/email.js` | Resend 메일 발송 (`?kind=welcome` / `?kind=report`) |
| `api/send-push.js` | Web Push 발송 |
| `api/admin.js` | 관리자 액션 라우터 (`?action=`) |
| `api/coupon.js` · `api/toss-confirm.js` · `api/toss-points.js` | 쿠폰 / 결제 |
| `api/naver-auth.js` · `api/naver-search.js` | 네이버 로그인 / 장소검색 |
| `api/role-notify.js` · `api/mannam-owner.js` | 역할변경 알림 / 바로만남 장소 |
| `api/surge-check.js` | 시급 자동인상 크론 (cron-job.org가 호출) |

⚠️ **Vercel Hobby 플랜은 배포당 서버리스 함수 12개가 상한**이고 지금 정확히 12개다.
새 파일을 추가하면 배포가 거부되므로, **먼저 기존 하나를 없애야 한다**(자세한 경위는
`api/seo.js` 상단 주석과 CLAUDE.md Phase 62). 옛 주소를 살리는 리라이트를 쓰면 함수를
합쳐도 호출하는 쪽 코드는 바꾸지 않아도 된다.

### 2-3. 역할(Role) 시스템

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
    └── mpsub-lang       언어 선택 (8개 언어)

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

### RLS (Row Level Security) (Row Level Security)

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

## 7. 작업 이력 · 현재 버그 → 별도 문서

이력은 매 세션 자동으로 읽힐 필요가 없어서 밖으로 뺐다(예전엔 이 파일의 61%가 이력이었다).

| 찾는 것 | 볼 문서 |
|---------|---------|
| 지금 어디까지 왔나 / 남은 버그 / 다음 할 일 | **[`docs/PROGRESS.md`](docs/PROGRESS.md)** ← 작업 시작 전 읽을 것 |
| 이 코드가 왜 이렇게 돼 있나 (과거 경위) | [`docs/WORK_LOG.md`](docs/WORK_LOG.md) |

작업을 끝내면 **요청받지 않아도** `docs/PROGRESS.md` 를 갱신한다.

## 8. 개발 워크플로우

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

### 배포 파이프라인

```
코드 수정
  → 버전 4곳을 같은 숫자로 올린다 (락스텝 — 하나라도 빠지면 캐시가 안 지워진다)
      1. sw.js         const CACHE  = 'baroalba-vNNN'
      2. assets/js/app.js  const _APP_V = 'NNN'
      3. 바로알바.html   app.js?v=NNN / app_ui.js?v=NNN / shared-lang.js?v=NNN
      (현재 588 — 정확한 값은 위 파일들을 직접 볼 것)
  → git push origin main
  → Vercel 자동 빌드 + 배포 (보통 약 30초)
  → baroalba.multimove.co.kr 즉시 반영
  → 라이브에서 실제로 NNN이 나오는지 확인하고 나서 완료 보고
  ⚠️ 자동 배포가 안 걸릴 때가 있다(Phase 69, 2026-07-28 - push 후 5분 넘게 라이브가
     이전 버전에 머묾, GitHub→Vercel 웹훅 미발동 추정). push만 믿지 말고 라이브 버전을
     실제로 확인할 것 - 안 바뀌면 `vercel --prod --yes` 로 직접 배포

Android 빌드
  → build.gradle 버전 업
  → git push
  → GitHub Actions 자동 트리거
  → APK 서명 + 아티팩트 저장
  → Play Console 수동 업로드
```

---

### ID 중복 방지 규칙

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

### 국적 드롭다운 확정 순서

변경 불가 — 절대 기본값으로 되돌리지 말 것:
```
한국 / 중앙아시아 / 베트남 / 러시아 / 중국 / 일본 / 미국 / 기타
```

## 9. 주요 ID / 키

| 항목 | 값 |
|------|-----|
| 카카오맵 JS 키 | ffcea2fab508898c168f043100b4d550 |
| 토스 클라이언트 키 | `test_ck_24xLea5zVA660wge91nyrQAMYNwW` — **아직 테스트 키다.** 결제가 되는 것처럼 보여도 실제 입금은 없음. 라이브 전환은 `docs/PROGRESS.md` 단기 항목 참고 |
| Supabase URL | onwvbmllpycgswfzywjv.supabase.co |
| 네이버 Client ID | 9DotifcIhyF4lq8bQLU9 |
| 도메인 | baroalba.multimove.co.kr |
| GitHub | github.com/korjackie/baroalba |
| 기본 위치 | 37.5445, 127.0556 (성수역) |
| 기본 반경 | 10km |

**도메인을 추가하면 카카오 콘솔에도 등록해야 지도가 뜬다.** 카카오맵 JS SDK는
[내 애플리케이션] → [앱 설정] → [플랫폼] → 웹 사이트 도메인에 등록된 출처에서만 동작한다.
새 도메인(예: `바로알바.kr`)을 붙이거나 프리뷰 URL에서 테스트할 때 **지도만 안 나오면
코드가 아니라 여기부터 볼 것.** 무료 한도는 지도·키워드검색 각 월 30만 건이라 현재 규모에선
문제되지 않는다.

---

## 10. 자주 발생하는 에러 패턴

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

## 11. 문제 대응 원칙 (2026-06-30 추가 — 반드시 지킬 것)

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
