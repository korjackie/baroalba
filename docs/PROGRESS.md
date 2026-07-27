# 바로알바 — 작업 현황 (PROGRESS)

> **새 세션은 이 문서를 먼저 끝까지 읽으세요.** 맥락을 이어가기 위한 살아있는 작업 로그입니다.
> 의미 있는 작업을 끝낼 때마다 **요청 없이도** 이 문서를 갱신할 것.
> 개발 규칙·시스템 구조는 [`../CLAUDE.md`](../CLAUDE.md), 옛 이력은 [`WORK_LOG.md`](WORK_LOG.md)
> 최종 갱신: **2026-07-28** (sw.js v585 / Phase 64 — 코드 변경 없음, 문서 재편)

---

## 1. 현재 버그 / 미완료

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

---

## 2. 다음에 볼 것

> 2026-07-28: 여기 있던 두 벌의 로드맵(원래 목록 + `PROJECT.md` 이관분)을 하나로 합치고,
> 이미 끝난 항목을 지웠습니다. 우선순위는 **근거가 있는 것부터**입니다.

### 단기 — 실측으로 문제가 확인된 것

| 항목 | 근거 | 해야 할 일 |
|------|------|-----------|
| **공고 자동 마감** | Phase 62에서 실측: `expires_at` 이 **0/25**. 만료 시각이 아예 없어서 **근무일이 5일 지난 공고가 아직 `urgent` 로 살아있음.** 구글 채용공고 정책도 만료 공고 제거를 요구 | `work_end_date` 경과 시 `is_active=false`. 기존 `api/surge-check.js` 가 이미 cron-job.org 로 도는 크론이므로 **거기 붙이면 서버리스 함수를 안 늘려도 됨** (Hobby 12개 상한이 꽉 참) |
| 공고 저장 오류 | 재현 시 `showAlert` 의 실제 에러 메시지 확보부터 | validation / DB constraint 원인 추적 |
| 공고 채움률 | `description` 10/25, `address` 14/25, `biz_name` 4/25 | Phase 63에서 입력 검증을 넣었으므로 **신규 공고부터 개선되는지 재측정**. 기존 25건은 그대로임 |

### 중기 (1~2주)

| 항목 | 내용 |
|------|------|
| 결제 연동 | 토스페이먼츠 프리미엄 플랜 실결제 |
| 랜딩 언어별 색인 | 현재 랜딩은 **클라이언트 전환**이라 언어별 URL이 없어 색인은 한국어 1장 기준. 언어별 색인을 노리면 서버렌더링이 필요한데, **공고량이 붙은 뒤가 맞음**(지금은 색인시킬 실질 콘텐츠가 랜딩 1장) |
| 알림 히스토리 | 받은 알림 목록 조회 화면 |
| 리뷰 답글 | 업주가 리뷰에 답변 |
| 수입 통계 강화 | 월별/주별, 업종별 시급 비교 |
| 매칭 알고리즘 개선 | 클릭률/지원률 피드백 루프 |
| 댓글 익명 토글 | `is_anonymous` 체크박스 |

### 장기 (전략)

| 항목 | 내용 |
|------|------|
| iOS 앱 | Android only → iOS WebView 래퍼 |
| 에스크로 결제 | 알바비 플랫폼 보관 → 근무 확인 후 지급 |
| 구독 모델 | 업주 Standard/Premium 실결제 |
| B2B 기업 고객 | 대량 채용, 계약서 자동 생성, 인보이스 |
| 알바생 신용점수 | 노쇼/취소/완주 이력 기반 매너점수 |
| 실시간 위치 공유 | 근무 중 위치 확인 (업주용) |
| 바로이사 / 바로대행 | 서비스 확장 |

### 기술 부채

| 항목 | 현재 상태 | 개선 방향 |
|------|-----------|-----------|
| **서버리스 함수 12개 상한** | Vercel Hobby 상한이 12개인데 **정확히 12개** | 새 API를 만들려면 **먼저 기존 하나를 합쳐야 함**. 옛 주소는 `vercel.json` 리라이트로 살리면 호출부 수정 불필요 |
| app.js 단일 파일 | 1.2MB 에 공고/모임/결제/채팅 로직 혼재 (2026-07-08 에 css/js 분리는 1차 완료) | 번들러 없이 `<script src>` 유지 전제로 도메인별 재분리 제안. 우선순위 낮음(P2) — 실익 대비 리스크 검토 필요 |
| SW 버전 수동 관리 | 배포마다 4곳을 손으로 맞춤(sw.js CACHE / `_APP_V` / 스크립트 `?v=`) | 빌드 스크립트 자동화 |
| 테스트 없음 | 수동 검수 의존 | 핵심 함수 단위 테스트 |
| owner.html redirect | 잠정 구조 | 장기적으로 역할 완전 통합 |

---

## 3. 최근 작업 이력 (Phase 58~)

Phase 1~57 은 [`WORK_LOG.md`](WORK_LOG.md) 로 옮겼습니다.
**새 Phase 는 이 아래에 이어서 씁니다.** 분량이 부담스러워지면 오래된 것부터
`WORK_LOG.md` 로 내리세요.

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

### Phase 61 ✅ 바로브랜딩 세팅 대조 → 바로알바에 빠진 것 채우기 (2026-07-28, v583~584)

같은 회사의 다른 서비스(바로브랜딩)와 SEO/계측 세팅을 나란히 놓고 대조해 격차를 메움.
**대조는 "무엇이 없는가"를 찾는 데 코드 리뷰보다 효율적이었다** — 아래 3건 모두
바로알바만 보고 있었으면 없다는 사실 자체를 인지하기 어려웠던 것들.

- **🔴 랜딩에 GA4가 없었다** — 앱(바로알바.html)엔 `G-5SB5VVP5ZB`가 붙어 있는데
  Phase 60에서 만든 랜딩엔 없었음. SEO를 해놓고 정작 유입 측정 수단이 새 관문에만
  빠져 있던 상태. 앱과 **같은** 측정 ID를 쓴다(속성을 나누면 "랜딩→앱 전환"을 한
  리포트에서 못 보는데 랜딩의 존재 이유가 그 전환임).
  **스니펫은 리다이렉트 스크립트보다 반드시 뒤에 둘 것** — 앞에 두면 앱으로 튕겨나가는
  기존 이용자까지 랜딩 방문자로 잡혀 신규 유입이 부풀려진다.
- **🔴 OG 이미지가 앱 아이콘을 늘린 정사각형이었다**(1005x1004, 715KB) —
  `summary_large_image`로 선언해놓고 정사각형이라 카톡·페북에서 잘리고, 공유해도
  서비스가 뭔지 전달이 안 됐음. 랜딩 히어로와 같은 문구/색/줄바꿈으로 1200x630
  재제작(38KB). **파일명을 새로 판 이유**: 같은 이름에 덮어쓰면 카톡·페북이 캐시해둔
  옛 이미지를 한동안 계속 내보낸다. 생성 스크립트는 `tools/make-og.py`(Pillow).
  루트의 `make-og.js`는 canvas 미설치로 실행된 적 없는 死코드 — 쓰지 말 것.
- **SW 프리캐시에서 og 이미지 제거** — `SHELL`에 들어 있어 전 사용자가 설치 때 715KB를
  받고 있었음. OG는 카톡·페북 **서버**가 가져가는 파일이라 브라우저엔 안 쓰인다.
- **네이버 서치어드바이저 등록** — 구글은 도메인 속성(`sc-domain:multimove.co.kr`)이라
  서브도메인이 자동 포함되지만 **네이버는 사이트 단위**라 바로브랜딩 등록이 적용되지
  않아 바로알바가 통째로 빠져 있었음. meta 방식으로 소유확인 완료(26.07.28 등록).
  ⚠️ `index.html`의 `naver-site-verification` 메타를 지우면 소유확인이 풀린다.

**🔴 지원 언어를 6개로 축소해 홍보하고 있었다** — 앱 `_LANGS`는 8개인데 랜딩은 6개로
쓰고 몽골어·네팔어를 빠뜨림(하필 한국 외국인 노동자 비중이 큰 둘). 7곳 정정.

**🔴🔴 그리고 8개 언어가 사실상 도달 불가능했다** (이번 세션 최대 발견)
```js
let currentLang = localStorage.getItem('baroalba_lang') || 'ko';   // 감지 코드가 없었음
```
저장된 선택이 없으면 무조건 한국어. `navigator.language`를 보는 코드가 저장소
어디에도 없었다. **네팔 노동자가 앱을 처음 열면 한국어가 뜨고, 자기 언어를 보려면
읽지도 못하는 한국어 화면에서 언어 버튼을 먼저 찾아내야 했다.** v571~v577 여러 세션에
걸쳐 8개 언어를 1922키씩 빠짐없이 번역해두고도 그 언어 사용자에게 자동으로는
닿지 않던 상태. → 저장값이 없을 때만 브라우저 언어를 따르게 함(사용자 선택이 항상 우선,
감지값은 저장하지 않음 — 저장하면 나중에 휴대폰 언어를 바꿔도 최초 1회 값에 묶인다).

⚠️ **네팔어 코드 불일치(이번에 두 번 밟은 함정)**: 표준(ISO 639-1)은 `ne`인데 앱 내부
키는 `np`(원래 국가코드). 브라우저는 `ne`로 보내므로 매핑 없이 두면 **네팔 휴대폰만
조용히 한국어로 떨어진다.** 랜딩 JSON-LD의 `inLanguage`에도 `np`가 아니라 `ne`를 써야
한다. 내부키를 표준코드로 착각하지 말 것.

**후속(2026-07-28, 커밋 `5e67cd5`)**: 랜딩에 **바로모임·바로만남 소개 섹션** 추가(언어 섹션과
FAQ 사이). 랜딩이 구인구직만 설명해 앱 홈 ④⑤에 실제로 있는 두 서비스가 검색·공유 유입에서
존재 자체가 안 보이던 상태였음. ⚠️ 문구를 사내 소개문서에서 베끼지 말 것 — `docs/*_service-intro.html`
에는 모임이 "8개 카테고리"로 적혀 있으나 **실제 개설폼은 스포츠·취미·친목·챌린지(+기타) 5개**다.
바로만남은 이용권 기반(유료)이라 위 FAQ의 "무료" 답변과 충돌하지 않게 명시했다. CTA는 Phase 60
교훈대로 `openMoimPanel`/홈 ④⑤에 게스트 차단이 없음을 확인한 뒤 `?guest=1`로 연결.
sw.js는 안 올렸다 — index.html은 SHELL에 없고 문서는 network-first(no-store)라 즉시 반영된다.

**남은 작업**: ①랜딩(`/`)이 아직 한국어 전용 — 앱은 모국어로 뜨는데 그 앞 소개 페이지는
한국어뿐이라 외국인은 한국어 랜딩을 거쳐야 함 ~~②공고별 URL(`/job/:id`)~~ → ✅ Phase 62.
~~③네이버 사이트맵 제출~~ → ✅ 완료(2026-07-28, 대표님 제출).

---

### Phase 62 ✅ 공고별 URL(/job/:id) 서버렌더링 + 사이트맵 자동생성 (2026-07-28)

Phase 60에서부터 이월돼 온 건. 최종 커밋 `69b3de8`(+`ff7393e`, 사이트맵 전환 커밋).

**🔴 먼저 DB부터 봤어야 했던 것**: 지난 세션이 이걸 "1순위"로 꼽은 근거는 코드 판단이었는데,
실제로 조회해보니 **살아있는 공고(`status in ('open','urgent')`)가 전체 25건 중 1건뿐**이었다.
채움률도 `description` 10/25, `address` 14/25, `biz_name` 4/25, `expires_at` 0/25.
즉 이 작업으로 당장 늘어나는 색인 페이지는 1장이고, **SEO 효과는 코드가 아니라 공고량이
붙어야 나온다.** 13-9 원칙("코드 말고 DB를 조회해서 확인")이 SEO 판단에도 그대로 적용된다.
→ 그래도 만든 이유: 공고 공유 링크의 OG가 지금 당장 생기고, 공고량이 붙는 순간 자동으로 작동한다.

- **`api/seo.js`** — `/job/:id` 서버렌더링 + `/sitemap.xml` 자동생성(둘 다 vercel.json 리라이트).
  앱은 JS로 그리는 껍데기라 크롤러 시점엔 내용이 없고 네이버 봇은 JS 실행을 기대할 수 없어서
  HTML을 완성해 보낸다. `businesses`는 anon 키로 RLS에 막혀 임베딩 조인이 null이라 업체명은
  서비스 롤 키로 따로 조회한다(컬럼 구성이 불확실해 `select=*` 로 받고 있는 것만 골라 씀).
- **JobPosting 스키마는 필수값이 다 있을 때만 출력** — 위 채움률 때문. 무조건 찍으면
  "필수 항목 누락" 경고만 쌓인다. **마감 공고는 `noindex, follow`** — 없는 일자리를
  검색결과에 남기지 않기 위함이고 구글 채용공고 정책도 만료 공고 제거를 요구한다.

**🔴🔴 Vercel Hobby: 배포당 서버리스 함수 12개 상한 (이번에 두 번 밟음)**
```
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```
`api/` 는 이미 정확히 12개로 꽉 차 있었다. `job.js`+`sitemap.js` 를 더해 14개가 되자 배포 거부.
⇒ **`api/` 에 새 파일을 추가하려면 반드시 기존 하나를 먼저 없애야 한다.**
해결: `welcome-email` + `report-notify`(둘 다 Resend 메일 한 통 보내는 같은 계열)를
`api/email.js` 로 합쳐 슬롯을 비우고, 새 기능 둘도 `api/seo.js` 한 파일에 담아 12개를 맞췄다.
⚠️ **호출하는 쪽 코드는 한 줄도 안 바꿨다** — vercel.json 리라이트가 옛 주소를 그대로 살린다
(`/api/welcome-email`→`?kind=welcome`, `/api/report-notify`→`?kind=report`). 함수를 합칠 때
이 방식을 쓰면 클라이언트를 안 건드려도 된다.

⚠️ **빌드 로그가 "Build Completed" 여도 성공이 아니다.** 함수 상한은 그 다음 배포 단계에서
걸린다. 로그 끝만 보고 성공으로 판단하지 말고 **배포 후 실제 URL을 curl 해서 확인할 것.**

⚠️ **`vercel.json` 에는 주석용 키를 넣을 수 없다** (JSON이라 `//` 도 불가):
```
The vercel.json schema validation failed with the following message:
should NOT have additional property `_comment`
```
이것 때문에 헛다리를 짚었다. 함수 상한을 우회하려고 루트 `middleware.js`(Edge Function은
12개에 안 들어감)를 시도했다가 배포가 실패해서 "이 프로젝트는 미들웨어를 지원하지 않는다"고
잘못 결론냈는데, 진짜 원인은 그때 vercel.json 에 같이 넣은 `_comment` 키였다.
**미들웨어 자체는 아직 미검증** — "안 된다"고 단정하지 말 것(함수 상한 우회가 또 필요해지면 후보).

**작업 순서로 안전했던 것**: 정적 `sitemap.xml` 을 마지막에 지웠다. 정적 파일이 리라이트보다
우선하므로, 그 파일이 있는 동안은 무슨 일이 있어도 구글·네이버에 제출한 사이트맵(3개)이 그대로
나갔다. `/job/:id` 가 라이브에서 동작하는 걸 확인한 뒤에야 지워 동적으로 전환했다.
주소를 `/sitemap.xml` 그대로 유지해서 **재제출이 필요 없다.**

**라이브 검증 완료**: 살아있는 공고 200 + JobPosting JSON-LD(필수 5항목 충족) / 마감 공고
`noindex` + 스키마 없음 / UUID 아닌 id·없는 UUID 404 / 사이트맵에 공고 URL 포함 /
합친 이메일 엔드포인트 2개가 옛 주소로 원래 응답 그대로(`email required`, `reason required`, GET 405).

**남은 작업**: ~~①랜딩 다국어화 ②공고 등록 폼 필수화~~ → ✅ 둘 다 Phase 63.

---

### Phase 63 ✅ 랜딩 8개 언어 + 공고 주소가 비던 경로 2곳 수정 (2026-07-28, v585)

커밋 `8903769`(랜딩 i18n) / `4c03ea0`(공고 폼, v585).

**랜딩 다국어화 — 페이지 내 언어 선택기**
- 본문 83개 키를 8개 언어로. 헤더 최상단에 지구본 아이콘 + `<select>`.
  Phase 61의 최대 발견이 "한국어를 못 읽는 사람이 한국어 화면에서 언어 버튼부터 찾아야 했다"는
  것이라, 랜딩에서는 그 컨트롤을 가장 먼저 보이는 자리에 둔다.
- 초기 언어: `?lang=` > 저장된 선택(`baroalba_lang`) > 브라우저 언어.
  감지 함수는 `shared-lang.js` 의 `_detectLang()` 을 그대로 복붙(규칙 7).
- **저장 키를 앱과 같은 `baroalba_lang` 으로 통일** — 랜딩에서 고른 언어가 앱까지 이어진다.
  ⚠️ 저장할 때만 앱 내부 키로 변환한다(네팔어 ISO `ne` ↔ 앱 `np`). Phase 61에서 두 번 밟은
  함정이라 `toApp`/`toPage` 변환을 지우지 말 것.
- 사용자가 직접 고른 값만 저장하고 감지값은 저장하지 않는다(앱과 동일 원칙).
- 🔴 **상단 리다이렉트에 `?lang=` 예외를 넣어야 했다.** 기존 코드는 쿼리스트링이 있으면
  무조건 앱으로 튕겨서 `/?lang=en` 공유링크가 랜딩을 못 보여주고 통째로 앱으로 빠졌다 —
  다국어화의 목적 자체가 사라지는 버그. lang 만 있으면 랜딩, 다른 파라미터가 섞이면
  lang 을 뺀 나머지로 예전처럼 앱에 넘긴다.
- 🔴 **언어 전환 시 FAQ JSON-LD 도 같이 다시 쓴다.** Phase 60 기록대로 화면 본문과 스키마
  답변 텍스트가 일치해야 리치결과 경고가 안 나는데, 본문만 번역되면 그 규칙이 깨진다.

**🔴🔴 공고 주소가 비어 있던 진짜 원인은 업주가 아니라 코드였다**

Phase 62에서 "`address` 14/25, `description` 10/25 라 채움률이 낮다 → 입력을 필수화하자"고
정리했는데, 원인을 따라가 보니 **두 경로가 주소를 지우거나 안 넣고 있었다**:

| 경로 | 무슨 일이 있었나 |
|------|-----------------|
| 공고 복사 | 좌표(lat/lng)는 복사해오면서 `f-address` 만 `''` 로 비웠다 → 복사로 올린 공고는 전부 `address=null`. 바로 아래 `showMiniMap` 이 이미 `p.address` 를 쓰고 있어 원래 의도도 주소를 들고 오는 쪽이었다 |
| `searchKakaoFallback` | 찾은 주소를 `location-result`(화면)에만 표시하고 `f-address` 에는 안 넣었다. 다른 위치선택 경로는 전부 `f-address` 를 채우는데 여기만 빠짐 |

**교훈**: "데이터가 비어 있다 → 사용자가 안 채운다 → 입력을 강제하자"로 바로 가지 말 것.
저장까지의 경로를 따라가 보면 코드가 지우고 있는 경우가 있다. 13-9("코드 말고 DB를 보라")의
짝이 되는 규칙 — **DB가 비어 있으면 그 값을 쓰는 코드 경로를 전부 훑어라.**

그 위에 검증 추가: 상세 설명 15자 이상 필수(라벨에 `*`), 근무지 주소 필수(비대면 제외).

⚠️ **번역 키를 추가할 때는 같은 이름이 이미 있는지 먼저 grep 할 것.** 처음에
`ownr_enter_address_notice` 로 넣었는데 그 키는 이미 있었다(주소 **검색창**이 비었을 때 쓰는
메시지, `app.js` 의 장소검색). 8개 언어에 중복 키가 생겼고 **JS 객체는 뒤 값이 이기므로 새로
넣은 값이 조용히 무시될 뻔했다.** → `ownr_enter_job_address_notice` 로 분리.

락스텝 v584→v585(`_APP_V` / `sw.js` CACHE / `바로알바.html` 의 `?v=` 4곳). 라이브 확인 완료.

**남은 작업**: ①`expires_at` 이 0/25 — 공고 만료 시각이 없어 JobPosting `validThrough` 를
`work_end_date || start_time` 으로 유추하고 있다. 지난 근무일인데 `urgent` 로 남아 있는 공고가
실제로 있어(그 1건이 그렇다) 마감 처리 자동화가 필요하다. ②랜딩은 클라이언트 전환이라
언어별 URL이 없다 — 색인은 한국어 1장 기준이다. 언어별 색인까지 노리면 `/en/` 같은 서버렌더링
경로가 필요한데, 지금은 공고량이 먼저다.

---

---

### Phase 64 ✅ 문서 3개로 통합 (2026-07-28, 코드 변경 없음)

이력 문서가 `CLAUDE.md` / `PROJECT.md` / 구글드라이브 `PROGRESS.md` /
`docs/*_changelog.md` 4개 / `backup/` 로 흩어져 서로 다른 시점에서 멈춰 있었다.
같은 사실을 다르게 말하는 상태라 **어느 게 최신인지 매번 다시 판단**해야 했다.

**실제 피해가 있었다.** `PROJECT.md` 의 「현재 버그」 목록이 07-08 에서 멈춘 채
이미 고친 버그(스와이프 중복노출, `MOIM_PLAN_LIMITS` 오타)를 계속 미결로 보여주고
있었고, DB 스키마 표엔 테이블 5개가 빠져 있었다. 앞선 세션에서 소개문서의
"모임 8개 카테고리"를 그대로 베꼈으면 랜딩에 틀린 홍보가 나갈 뻔한 일도 있었다.

**문제의 크기**: `CLAUDE.md` 는 매 세션 자동으로 읽히는 유일한 파일인데
55,684자(약 47,300 토큰)였고 **그중 61%가 Phase 이력** — 거의 안 보는 과거 기록에
매 세션 비용을 치르고 있었다.

**재편** — 문서마다 답하는 질문을 하나씩만 갖게 함:

| 문서 | 답하는 질문 | 로드 |
|------|-------------|------|
| `CLAUDE.md` | "어떻게 작업해야 하나" — 규칙 + 시스템구조 | 자동, 매 세션 |
| `docs/PROGRESS.md` | "지금 어디까지 왔고 다음은" | 작업 시작 전 |
| `docs/WORK_LOG.md` | "왜 이렇게 돼 있나" — 과거 경위 | 필요할 때만 |

- `CLAUDE.md` 7·8·9장 → Phase 58~63·현재버그는 PROGRESS.md, Phase 1~57 은 WORK_LOG.md
- `docs/*_changelog.md` 4개 → WORK_LOG.md 2부로 병합 후 삭제
- `PROJECT.md` 삭제. 고유 내용만 이관 — 파일별 역할표·RLS·배포 파이프라인은
  `CLAUDE.md`, 로드맵은 이 문서 2장
- 인프라 다이어그램의 옛 사실 정정: 랜딩 누락, `sw.js v528` 고정값, api 1개→12개,
  6개국어→8개 언어
- **규칙 4(증가 억제)** 신설 — 규칙·함정을 추가할 때 지울 것이 없는지 먼저 보게 함.
  이 규칙이 없어서 47,000 토큰까지 불어난 것이므로, 없으면 같은 일이 반복된다.

**결과**: 자동로드 55,684자 → 25,233자 (약 47,300 → 21,400 토큰, **55% 감소**).
바로브랜딩(`C:/dev/barobranding-saas`)도 같은 3개 구조로 맞췄다.

커밋: `ad492d5` `2fffd1d` `a9459b0` `1f1c3d9`
