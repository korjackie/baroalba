# 바로알바 캘린더 자동등록 — 설계 (2026-08-14)

> 목표: 알바생/참가자가 확정한 일정(알바 근무·바로모임·바로만남)이 구글/애플/삼성 캘린더에
> 자동으로 반영되게 한다. 방식은 iCalendar(.ics) webcal 구독 피드 — OAuth 없이 세 캘린더
> 앱 모두에서 동작하는 유일한 범용 방식이라 이걸로 정했다(직접 write API는 구글만 되고
> 애플·삼성은 서드파티 웹앱용 공개 API가 없음).
>
> 진행 상태는 [`../../PROGRESS.md`](../../PROGRESS.md)에 Phase로 기록한다.
> 이 문서는 착수 전 설계이며, 구현 중 판단이 바뀌면 여기가 아니라 PROGRESS.md에 남긴다.

---

## 1. 범위 (v1)

- **대상**: 알바생/참가자 측만. 업주(사장님)가 자기 공고에 확정된 근무자들을 보는 캘린더는
  범위 밖(다음 단계 후보).
- **포함 도메인 3종**: 바로알바(구인공고 지원), 바로모임(일반 gatherings), 바로만남(매칭형,
  gatherings 중 `category='baromeeting'` 진입 + `barospot_applications` 매칭).
- **노출 정보 수준**: 제목 + 시간 + 장소만. 상대방 개인정보(전화번호 등), 채팅 링크는 넣지
  않는다 — 캘린더 앱은 원래 공유 목적이 아니라 유출 표면이 넓어지기 때문.
- **착수 배경**: [[project_revenue_plan_2026h2]]가 이번 분기 바로알바를 "연결만" 역할로
  묶어뒀지만, 대표님이 이 기능은 지금 3종 전부 착수하기로 직접 결정함(2026-08-14). 이
  결정으로 해당 메모의 스코프 원칙에 예외가 하나 생겼다는 것을 기록해둔다.

## 2. 아키텍처 — 단일 webcal 구독 URL

사용자당 URL 하나가 3개 도메인을 합쳐서 하나의 iCalendar(VCALENDAR) 피드로 응답한다.

```
webcal://baroalba.multimove.co.kr/api/admin.js?action=ics_feed&uid=<auth_uid>&token=<서명>
```

**새 API 파일을 만들 수 없다** — Vercel Hobby 플랜 서버리스 함수 12개 슬롯이 이미 꽉
찼다(`CLAUDE.md` 2-2). `api/admin.js`가 이미 `?action=` 라우팅을 쓰고 있으므로(852행부터)
여기에 `ics_feed` 액션을 하나 추가한다. 이 액션만 기존 admin.js의 `ADMIN_EMAILS`
인증 분기를 건너뛰어야 한다(캘린더 앱은 로그인 쿠키 없이 URL만으로 폴링하기 때문) — 진입점
최상단에서 `action==='ics_feed'`일 때 별도 토큰 검증 경로로 분기하고 반환한다.

## 3. 인증 — 서명 토큰(무상태, DB 컬럼 없음)

```
token = HMAC-SHA256(auth_uid, CALENDAR_FEED_SECRET).hex().slice(0, 32)
```

- `CALENDAR_FEED_SECRET`은 Vercel 환경변수로 새로 추가(대표님 실행 필요, `CRON_SECRET`
  추가할 때와 같은 절차).
- 장점: 새 DB 컬럼/DDL 없이 배포 가능, 대표님의 SQL 실행 없이 코드만으로 끝난다.
- 단점: 토큰이 유출되면 개별 무효화가 안 되고 비밀키 전체를 바꿔야 한다(전 사용자 링크가
  같이 재발급됨). 노출 정보가 제목/시간/장소뿐이라 v1에서는 감수하기로 함. 나중에 "내
  캘린더 링크 재발급" 요구가 생기면 `workers.calendar_token` 컬럼을 추가하는 걸 업그레이드
  경로로 남겨둔다.

## 4. 3개 도메인 → VEVENT 매핑

| 도메인 | 조건 | 제목 | DTSTART~DTEND | LOCATION |
|---|---|---|---|---|
| 바로알바 | `applications.status='accepted'` AND `worker_id = workers.id(uid로 조회)` | `[바로알바] {job_postings.title}` | `work_type='regular'`: RRULE(FREQ=WEEKLY;BYDAY=work_days;UNTIL=work_end_date, 없으면 +3개월 상한). `spot/errand`: `start_time` ~ `start_time + duration_hours` 단발 | `job_postings.address` |
| 바로모임/미팅 | `gathering_applications.status='approved'` AND `applicant_id = uid` | `[바로모임] {gatherings.title}` | `gathering_date` ~ `gathering_date + 2h`(기본값, 종료시각 컬럼 없음) | LOCATION은 `lat,lng` 좌표(`gatherings`에 주소 텍스트 컬럼이 없어 이게 유일한 위치 정보) — DESCRIPTION에 앱 상세페이지 딥링크(`https://baroalba.multimove.co.kr/바로알바.html?moim={gathering_id}`)를 추가해 좌표만으로 부족한 정보를 보완 |
| 바로만남 | `barospot_applications.status IN ('matched','confirmed')` AND `user_id = uid` | `[바로만남] 매칭 확정` | `barospot_events.event_date` ~ `+2h`(기본값) | `barospot_restaurants.name` |

- 세 도메인의 참가자 식별 컬럼이 서로 다르다는 걸 서버 코드에서 반드시 구분할 것 —
  `applications.worker_id`는 `workers.id`(먼저 `workers.kakao_uid=uid`로 조회 필요),
  `gathering_applications.applicant_id`/`barospot_applications.user_id`는 `uid` 직접.
- 각 VEVENT는 안정적인 UID(`app-{application_id}@baroalba.multimove.co.kr` 형태)를 써서,
  캘린더 앱이 주기적으로 다시 받아갈 때 같은 이벤트를 갱신하지 새로 만들지 않게 한다.
- 바로만남을 `matched`와 `confirmed` 둘 다 포함하는 이유: 실제 스키마 조사 결과
  `event_id`(날짜·장소 확정)가 `matched` 시점에 이미 붙는다(2026-08-14 조사). "매칭
  성사 시점부터 캘린더에 뜨면 좋겠다"는 의도를 그대로 살리려면 `matched`부터 포함해야
  하고, 그 뒤 단계인 `confirmed`도 같은 확정 상태이므로 함께 포함한다. `pending`(매칭 전)·
  `done`(이미 지남)·`cancelled`는 제외.

## 5. 취소 처리

취소된 건(근무 취소·모임 불참·매칭 취소)은 **피드에서 완전히 제거**한다(대표님 결정,
2026-08-14) — `STATUS:CANCELLED` 속성 대신 그냥 쿼리 조건에서 빠지게 한다. 구독 캘린더
앱이 다음 폴링(보통 몇 시간 주기) 때 사라진 이벤트를 알아서 지운다. 즉시 반영은 아니지만
구현이 훨씬 간단하고, 캘린더 앱마다 `STATUS:CANCELLED` 렌더링이 제각각인 문제를 피한다.

## 6. UI

마이페이지 `mpsub-income` 옆에 새 서브패널 `mpsub-calendar` 추가:

- 안내 문구 + 구독 URL
- **아이폰/맥**: `webcal://` 링크를 탭하면 캘린더 앱이 구독 다이얼로그를 바로 띄운다(OS
  기본 동작).
- **안드로이드/삼성**: 모바일 구글 캘린더 앱 자체엔 "URL로 구독" 기능이 없다(구글 공식
  제약). URL 복사 버튼 + "PC에서 구글 캘린더 설정 → 다른 캘린더 → URL로 추가"로 안내.
  삼성캘린더는 보통 구글 계정 동기화가 켜져 있으면 구글 캘린더에 추가된 일정이 자동으로
  따라온다.
- `shared-lang.js`에 8개 언어 번역키 추가(`data-i18n` 규칙 준수).

## 7. 에러/엣지 케이스

- 세 도메인 조회 중 하나가 실패해도 나머지는 정상 응답에 포함한다(부분 실패 허용 — 하나
  막혔다고 전체 피드가 깨지는 것보다 낫다).
- 확정 일정이 하나도 없으면 빈 `VCALENDAR`를 반환한다(구독 자체는 되고 이벤트만 없는
  정상 상태).
- `work_type='regular'`인데 `work_end_date`가 비어있으면 RRULE에 `UNTIL` 없이 무기한
  반복이 되므로, 이 경우 상한을 오늘부터 +3개월로 둔다.
- `token`이 안 맞거나 `uid`가 없으면 401(캘린더 앱은 이후 폴링을 계속 재시도하니 5xx로
  응답하지 않도록 주의).

## 8. 테스트 방법

- 라이브 REST에 `curl`로 직접 요청해 VCALENDAR 텍스트 검증(로그인 세션 없이 토큰만으로).
- 실제 iOS 캘린더/안드로이드 구글 캘린더(PC 웹)에 구독시켜 이벤트가 뜨는지, 알바 승인 후
  피드에 새로 잡히는지, 취소 후 몇 시간 뒤 사라지는지 육안 확인.
- `13-9` 원칙에 따라 코드 리뷰로 끝내지 않고 실제 살아있는 DB(현재 라이브에 존재하는
  accepted 지원 건·approved 모임 신청 건)에 대고 응답을 확인한다.
