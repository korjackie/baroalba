# 바로알바 프로젝트 — Claude 영구 지침

## 절대 규칙 (매 작업마다 적용)

1. **두 앱 항상 동시 수정**: `바로알바.html`과 `owner.html`을 절대 따로 작업하지 않는다.
   - 한 앱에 기능/버그픽스/번역/UI 변경 시 다른 앱에도 즉시 동일 적용
   - 커뮤니티 기능은 `바로알바.html`에만 있음 (owner는 `?community=1` 파라미터로 접근) → 별도 적용 불필요

2. **배포**: 편집 후 반드시 `git push origin main` → Vercel 자동배포. SCP 금지.

3. **SW 캐시**: `바로알바.html` 또는 `shared-lang.js` 수정 시 `sw.js`의 `CACHE = 'baroalba-vN'` 버전 반드시 증가.

4. **Supabase DML**: JS 클라이언트(`db.from(...)`) 직접 사용. SQL 실행 사용자 위임 금지 (DDL만 예외).

---

## 프로젝트 구조

| 파일 | 역할 |
|------|------|
| `바로알바.html` | 알바생 메인 앱 (지도/스와이프/채팅/마이페이지/커뮤니티) |
| `owner.html` | 업주 대시보드 (공고/지원자/채팅/마이페이지) |
| `login.html` | 로그인 (manifest start_url, body background #FF4B4B) |
| `shared-lang.js` | **두 앱 공통 번역 시스템** — WORK_TYPE_LABELS, VEHICLE_LABELS, STRENGTH_LABELS, TRANSLATIONS(6개국어), t(), applyLang() |
| `sw.js` | PWA 서비스워커 (현재 캐시 v30) |
| `manifest.json` | PWA 설정 (background_color: #FF4B4B) |
| `config.js` | 앱 설정 (DEFAULT_LAT 성수역, RADIUS 10km) |

---

## 인프라

- **DB**: Supabase (onwvbmllpycgswfzywjv.supabase.co)
- **배포**: GitHub `korjackie/baroalba` → Vercel 자동배포 → `baroalba.multimove.co.kr`
- **지도**: 카카오맵 SDK
- **스토리지**: Supabase Storage (`avatars` 버킷: 프로필/포트폴리오, `biz-photos` 버킷: 업체사진)

---

## 역할 구분

- `currentUser.user_metadata.baroalba_role` → `'worker'` 또는 `'business'`
- **worker**: `workers` 테이블 (kakao_uid FK)
- **business**: `businesses` 테이블 (kakao_uid FK)
- 두 역할 모두 커뮤니티 글쓰기/댓글 가능 → `worker_id` OR `business_id` 분기 처리

```js
const role = currentUser?.user_metadata?.baroalba_role;
if (role === 'business') {
  const { data: b } = await db.from('businesses').select('id').eq('kakao_uid', currentUser.id).single();
  insertData.business_id = b.id;
} else {
  const { data: w } = await db.from('workers').select('id').eq('kakao_uid', currentUser.id).single();
  insertData.worker_id = w.id;
}
```

---

## 번역 시스템 (shared-lang.js)

- `applyLang()`: `[data-i18n]`, `[data-v]` (이동수단), `[data-s]` (강점), `[data-i18n-ph]` 속성 자동 처리
- 언어 저장: `saveAllProfileSettings()` → `location.reload()` (알바생), `saveOwnerSettings()` (업주)
- 지원 언어: ko / en / zh / ja / vi / ru

---

## 주요 DB 테이블

| 테이블 | 핵심 컬럼 |
|--------|-----------|
| workers | kakao_uid UUID, name, phone, age, birth_date, bio, experience, vehicles[], strengths[], languages[], photo_url |
| businesses | kakao_uid UUID, biz_name, phone, description, photo_url, lat, lng |
| worker_photos | worker_id FK, photo_url, is_main, sort_order |
| business_photos | business_id FK, photo_url, is_main, sort_order |
| job_postings | work_type, work_days, lat, lng, address, is_premium, view_count |
| applications | job_id FK, worker_id FK, status (pending/accepted/rejected/cancelled) |
| community_posts | worker_id FK nullable, business_id FK nullable, category, title, content, likes, comments_count |
| community_comments | worker_id FK nullable, business_id FK nullable, post_id FK, content |
| chats / messages | 채팅 시스템 |

### RLS 핵심 패턴
- workers/businesses: `kakao_uid = auth.uid()` (UUID 타입, ::text 캐스트 금지)
- community 글/댓글: `worker_id IS NOT NULL AND kakao_uid = auth.uid()` OR `business_id IS NOT NULL AND kakao_uid = auth.uid()`
- `increment_post_likes`, `refresh_comments_count`: SECURITY DEFINER RPC 함수 (RLS 우회)

---

## 마이페이지 저장 흐름

- **알바생**: `saveAllProfileSettings()` → 언어+프로필 동시 저장 → `location.reload()`
- **업주**: `saveOwnerSettings()` (owner.html)
- 두 앱 모두 최하단에 저장/취소 버튼 쌍 (개별 저장 버튼 금지)

---

## 사진 업로드

- **알바생 포트폴리오**: `worker_photos` 테이블, `avatars` 스토리지 버킷, Cropper.js 사용
- **업주 업체사진**: `business_photos` 테이블, `biz-photos` 스토리지 버킷, Cropper.js 사용
- 최대 5장, is_main 첫 장 자동 지정
- **중요**: worker_photos INSERT 전에 workers 레코드 존재 확인 (`if (!w) { showToast('프로필을 먼저 저장해주세요'); return; }`)

---

## 남은 작업 (2026-06-11 기준)

- [ ] community_posts/comments DB에 business_id 컬럼 추가 SQL 실행 (사용자 직접)
- [ ] cancel_deadline 컬럼 추가: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS cancel_deadline TIMESTAMPTZ;`
- [ ] TWA 플레이스토어 등록
- [ ] 토스페이먼츠 실결제 연동
