# 바로알바 변경 이력 — 2026-06-30 (B)

## 개요
nav 라벨 버그(홈/지도 표시 오류) 근본 원인 발견 및 수정, 온보딩 전면 개편,
7개국어 완성, 스와이프↔지도 UX 개선.

---

## v300 — 2026-06-30

### 🐛 버그 수정: 홈/지도 nav 라벨 (7시간 추적 끝)
**파일:** `shared-lang.js`
**원인:** `applyLang()` 내 `navKeys` 배열이 구 구조(`nav_map`, `nav_swipe`)를 참조
```js
// 수정 전 (버그)
const navKeys = ['nav_map','nav_swipe','nav_applications','nav_chats','nav_profile'];
// 수정 후 (정상)
const navKeys = ['nav_home','nav_map','nav_applications','nav_chats','nav_profile'];
```
**추가:** 모든 7개 언어 번역 객체에 `nav_home` 키 신규 추가
- ko: '홈', en: 'Home', zh: '首页', ja: 'ホーム'
- vi: 'Trang chủ', mn: 'Нүүр', ru: 'Главная'

**왜 캐시가 아니었나:**  
`applyLang()`은 매 페이지 로드마다 JS 코드로 실행되며 HTML 텍스트를 덮어씀.  
캐시 여부와 무관하게 항상 재현되는 코드 버그였음.

---

### ✨ 신규: 구사 가능 언어 몽골어 추가
**파일:** `바로알바.html`
**변경 위치:**
- `lang-ability-chips` → `🇲🇳 몽골어` 버튼 추가
- `LANG_LABELS` → `mn: '🇲🇳 몽골어'` 추가
- `_LANG_FLAG` / `_LANG_NAME` (5590, 10666) → `mn` 항목 추가
- `MAP` in worker card template (17250) → `mn` 추가

6개국어 → **7개국어** 완성 (ko/en/zh/ja/vi/ru/mn)

---

### ✨ 온보딩 전면 개편
**파일:** `바로알바.html` (lines ~1981, ~11929)

**텍스트 중앙 정렬:**
```html
<!-- 수정 전 -->
<div style="flex:1;display:flex;flex-direction:column;padding:28px 28px 0;">
<!-- 수정 후 -->
<div style="flex:1;display:flex;flex-direction:column;padding:28px 28px 0;text-align:center;align-items:center">
```

**슬라이드 3 일러스트:** KR/UZ/CN/VN(4개) → KR/EN/CN/JA/VN/MN/RU(7개) 글로브 SVG

**전체 슬라이드 문구 개편:**
| 슬라이드 | 수정 전 | 수정 후 |
|---------|---------|---------|
| 1 당일정산 | 오늘 일하고, 오늘 바로 받는다 | 일한 당일, 통장에 바로 꽂힌다 |
| 2 지도 | 내 주변 일자리를 지도로 찾는다 | 지금 내 주변 일자리가 보인다 |
| 3 외국인 | 외국인도 알바 걱정 없다 | 7개 언어로 누구나 바로 취업 |
| 4 모임 | 알바 친구와 바로모임 만들기 | 같이 일할 사람 바로 모아라 |
| 5 업주 | 업주라면 공고 등록이 간편해요 | 공고 올리면 지원자가 알아서 온다 |

---

## v301 — 2026-06-30

### ✨ 신규: 스와이프 화면 지도 뒤로가기 버튼
**파일:** `바로알바.html`
**문제:** 지도 → "스와이프로 보기" 진입 후 지도로 돌아갈 방법 없음

**수정 내용:**
- 스와이프 화면 헤더에 `id="swipe-back-btn"` (`← 지도`) 버튼 추가
- `openNearbySwipe()`: 진입 시 버튼 표시 (`display:flex`)
- `closeSwipeBackToMap()` 신규 함수: 버튼 숨김 + `setNav(navItem[1], 'map')` 호출
- 일반 nav 스와이프 진입 시엔 버튼 미표시 (기존 동일)

---

## Android (이전 세션 누락 기록)

### versionCode 24 / versionName 1.5.0
**파일:** `android/app/build.gradle`

### 상태바 아이콘 색상 수정
**파일:** `android/app/src/main/res/values/styles.xml`
- `windowLightStatusBar`: `true` → `false` (빨간 배경에 흰색 아이콘)

### ChatReplyReceiver 스키마 수정
**파일:** `android/app/src/main/java/.../ChatReplyReceiver.java`
- `application_id`/`sender_id` → `chat_id`/`sender_role:'worker'`
- messages 테이블 실제 컬럼명과 일치

---

## CLAUDE.md 업데이트 (이전 세션)
- Rule 9: Android 리빌드 시 versionCode 반드시 +1
- Section 13: 디버깅 원칙 (캐시 vs 코드 버그 구분표, 진단 순서)

---

*작성: 2026-06-30*
