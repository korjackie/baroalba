# 캘린더 자동등록(webcal 구독 피드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 알바생/참가자가 확정한 일정(알바 근무·바로모임·바로미팅·바로만남)을 하나의 webcal
구독 URL로 구글/애플/삼성 캘린더에 자동 반영한다.

**Architecture:** `api/admin.js`에 `?action=ics_feed`(공개, 서명 토큰 인증)와
`?action=get_calendar_token`(로그인 필요, 본인 토큰만 발급) 두 액션을 추가한다. 새 Vercel
함수 파일은 만들 수 없다(12개 슬롯 꽉 참). 프론트는 마이페이지에 새 서브패널을 하나 추가해
구독 URL을 보여준다.

**Tech Stack:** 순수 Node.js 서버리스 함수(프레임워크 없음) + Supabase REST(service role) +
바닐라 JS/HTML 프론트.

## Global Constraints

- 설계 문서: [`../specs/2026-08-14-calendar-sync-design.md`](../specs/2026-08-14-calendar-sync-design.md) — 이 플랜과 상충하면 설계 문서가 최종 근거.
- **이 저장소엔 자동화 테스트가 없다.** `CLAUDE.md` 13-9 원칙("검수는 코드가 아니라 살아있는
  DB에 대고 하라")에 따라, 이 플랜의 "테스트" 단계는 전부 **배포 후 라이브 REST에 curl로
  직접 검증**하는 방식이다 — 이 저장소에 없던 jest 등 테스트 프레임워크를 새로 들이지 않는다.
- **버전 락스텝(CLAUDE.md #3)**: `sw.js`의 `CACHE`, `assets/js/app.js`의 `_APP_V`,
  `바로알바.html`의 `app.js?v=` / `app_ui.js?v=` / `shared-lang.js?v=` / `style.css?v=`
  4곳 — 전부 같은 번호로 함께 올려야 한다. 이번 작업에서 `style.css`/`app_ui.js` 자체는
  안 건드리지만 쿼리 버전은 관행대로 같이 올린다.
- **새 API 파일 생성 금지**: Vercel Hobby 플랜 서버리스 함수 12개 상한(`CLAUDE.md` 2-2).
  반드시 `api/admin.js`에 기존 `?action=` 라우팅으로 얹는다.
- **DML은 JS/REST 직접, DDL 없음**: 이번 기능은 새 테이블/컬럼이 필요 없다(무상태 HMAC
  토큰). 단, `CALENDAR_FEED_SECRET` 환경변수는 코드로 설정할 수 없어 **대표님이 Vercel에
  직접 추가**해야 한다(Task 1의 사람 작업 항목).
- **8개 언어 번역 동기화(CLAUDE.md #8)**: `shared-lang.js`에 새 `data-i18n` 키를 추가하면
  8개 언어 전부 채운다.
- **배포**: `git push origin main`만(SCP 금지). 편집 후 즉시 배포하고 라이브에서 버전 숫자를
  직접 확인한다(CLAUDE.md #6, #2).

---

## File Structure

| 파일 | 역할 |
|---|---|
| `api/admin.js` (수정) | 헬퍼 함수(HMAC 토큰, iCalendar 이스케이프/폴딩) + `buildCalendarFeed()` + `ics_feed`/`get_calendar_token` 두 액션 추가 |
| `바로알바.html` (수정) | 마이페이지에 `mp-row`(캘린더 연동) + `mpsub-calendar` 패널 마크업 추가, 버전 쿼리 4곳 증가 |
| `assets/js/app.js` (수정) | `openMpSub`에 `calendar` 분기 추가 + `loadCalendarFeedUrl()` 신설, `_APP_V` 증가 |
| `shared-lang.js` (수정) | 새 i18n 키 7개 × 8개 언어 |
| `sw.js` (수정) | `CACHE` 버전 증가 |
| `docs/PROGRESS.md` (수정) | Phase 92로 작업 기록 |

---

## Task 1: 캘린더 피드 백엔드 (`api/admin.js`)

**Files:**
- Modify: `api/admin.js` (헬퍼 함수는 `module.exports` 직전에 추가, 액션 두 개는 관리자
  인증 게이트 코멘트 `// 관리자 인증 — app_admins 테이블 기준...` 바로 앞에 추가)

**Interfaces:**
- Produces: `GET /api/admin?action=get_calendar_token` (Bearer JWT 필요) →
  `{ok:true, https_url, webcal_url}`. `GET /api/admin?action=ics_feed&uid=&token=` (공개) →
  `text/calendar` 본문.
- Consumes: 기존 `sb(path, svcKey, opts)`, `getSubFromJWT(token)` 헬퍼(이미 파일 상단에
  정의돼 있음, 재사용만 함).

- [ ] **Step 1: 정규직(regular) 근무의 `start_time` 실제 포맷 확인 (라이브 DB 대조)**

RRULE을 만들려면 `start_time`의 **날짜 부분**이 신뢰할 수 있는 첫 근무일인지, 아니면
의미 없는 placeholder 날짜이고 **시간 부분**만 유효한지 확인해야 한다. 라이브에 curl로
직접 확인한다(service role 키는 로컬에 없으므로 anon 키로 공개 컬럼만 조회):

```bash
curl -s "https://onwvbmllpycgswfzywjv.supabase.co/rest/v1/job_postings?work_type=eq.regular&select=id,start_time,work_days,work_end_date&limit=3" \
  -H "apikey: <sw.js의 SB_ANON 값>" -H "Authorization: Bearer <sw.js의 SB_ANON 값>"
```

Expected: 3건 이하의 행. `start_time`의 요일이 `work_days`에 포함된 요일과 일치하면
날짜 부분이 유효한 것 — 그대로 DTSTART로 쓴다. 만약 요일이 안 맞으면(placeholder 날짜),
Step 3의 `dtStart` 계산을 "오늘부터 `work_days` 중 가장 가까운 요일"로 바꿔야 한다 —
이 경우 되돌아와서 Step 3 코드의 `dtStart` 라인만 아래로 교체:

```js
function nextByday(daysArr) {
  const map = { 'SU':0,'MO':1,'TU':2,'WE':3,'TH':4,'FR':5,'SA':6 };
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    if (daysArr.includes(Object.keys(map).find(k => map[k] === d.getDay()))) return d;
  }
  return today;
}
```

- [ ] **Step 2: 헬퍼 함수 + `buildCalendarFeed()` 추가**

`api/admin.js`에서 `module.exports = async function handler(req, res) {` 줄을 찾아 **바로
위에** 아래 블록을 통째로 삽입한다:

```js
// ── 캘린더 자동등록 — 알바/모임(바로미팅 포함)/바로만남 확정 일정을 하나의 iCalendar로 합침 ──
const ICS_DAY = { '월':'MO','화':'TU','수':'WE','목':'TH','금':'FR','토':'SA','일':'SU' };

function icsEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsFold(line) {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length) { out += '\r\n ' + rest.slice(0, 74); rest = rest.slice(74); }
  return out;
}

function icsDateUTC(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

async function buildCalendarFeed(uid, svcKey) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//baroalba//calendar-feed//KO', 'CALSCALE:GREGORIAN'];
  const now = new Date();
  const plus3mo = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

  // 1) 바로알바 — 확정 근무 (accepted)
  const workerRows = await sb(`workers?kakao_uid=eq.${uid}&select=id`, svcKey).then(r => r.json()).catch(() => []);
  const workerId = workerRows?.[0]?.id;
  if (workerId) {
    const apps = await sb(
      `applications?worker_id=eq.${workerId}&status=eq.accepted&select=id,job_postings(title,address,start_time,work_type,work_end_date,work_days,duration_hours)`,
      svcKey
    ).then(r => r.json()).catch(() => []);
    (apps || []).forEach(a => {
      const job = a.job_postings;
      if (!job?.start_time) return;
      const title = icsEscape(`[바로알바] ${job.title || ''}`);
      const loc = icsEscape(job.address || '');
      const uidLine = `app-${a.id}@baroalba.multimove.co.kr`;
      const dtStart = new Date(job.start_time);
      const dtEnd = new Date(dtStart.getTime() + (job.duration_hours || 4) * 3600 * 1000);
      if (job.work_type === 'regular' && job.work_days) {
        const byday = job.work_days.split(',').map(d => ICS_DAY[d.trim()]).filter(Boolean).join(',');
        if (!byday) return;
        const until = job.work_end_date ? new Date(job.work_end_date + 'T23:59:59') : plus3mo;
        lines.push('BEGIN:VEVENT', `UID:${uidLine}`, `DTSTAMP:${icsDateUTC(now)}`,
          `DTSTART:${icsDateUTC(dtStart)}`, `DTEND:${icsDateUTC(dtEnd)}`,
          icsFold(`RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${icsDateUTC(until)}`),
          icsFold(`SUMMARY:${title}`), icsFold(`LOCATION:${loc}`), 'END:VEVENT');
      } else {
        lines.push('BEGIN:VEVENT', `UID:${uidLine}`, `DTSTAMP:${icsDateUTC(now)}`,
          `DTSTART:${icsDateUTC(dtStart)}`, `DTEND:${icsDateUTC(dtEnd)}`,
          icsFold(`SUMMARY:${title}`), icsFold(`LOCATION:${loc}`), 'END:VEVENT');
      }
    });
  }

  // 2) 바로모임/바로미팅 — 승인된 참가 (approved)
  const gApps = await sb(
    `gathering_applications?applicant_id=eq.${uid}&status=eq.approved&select=id,gathering_id,gatherings(id,title,gathering_date,lat,lng,category)`,
    svcKey
  ).then(r => r.json()).catch(() => []);
  (gApps || []).forEach(a => {
    const g = a.gatherings;
    if (!g?.gathering_date) return;
    const dtStart = new Date(g.gathering_date);
    const dtEnd = new Date(dtStart.getTime() + 2 * 3600 * 1000);
    const prefix = g.category === 'baromeeting' ? '바로미팅' : '바로모임';
    const loc = (g.lat && g.lng) ? `${g.lat},${g.lng}` : '';
    lines.push('BEGIN:VEVENT', `UID:gathering-${a.id}@baroalba.multimove.co.kr`, `DTSTAMP:${icsDateUTC(now)}`,
      `DTSTART:${icsDateUTC(dtStart)}`, `DTEND:${icsDateUTC(dtEnd)}`,
      icsFold(`SUMMARY:${icsEscape(`[${prefix}] ${g.title || ''}`)}`),
      icsFold(`LOCATION:${icsEscape(loc)}`),
      icsFold(`DESCRIPTION:${icsEscape(`https://baroalba.multimove.co.kr/바로알바.html?moim=${g.id}`)}`),
      'END:VEVENT');
  });

  // 3) 바로만남 — 매칭 확정 (matched 또는 confirmed)
  const bApps = await sb(
    `barospot_applications?user_id=eq.${uid}&status=in.(matched,confirmed)&select=id,event_id`,
    svcKey
  ).then(r => r.json()).catch(() => []);
  const eventIds = [...new Set((bApps || []).map(a => a.event_id).filter(Boolean))];
  if (eventIds.length) {
    const events = await sb(`barospot_events?id=in.(${eventIds.join(',')})&select=id,event_date,restaurant_id`, svcKey).then(r => r.json()).catch(() => []);
    const restIds = [...new Set((events || []).map(e => e.restaurant_id).filter(Boolean))];
    const rests = restIds.length ? await sb(`barospot_restaurants?id=in.(${restIds.join(',')})&select=id,name`, svcKey).then(r => r.json()).catch(() => []) : [];
    const restById = {}; (rests || []).forEach(r => { restById[r.id] = r.name; });
    const eventById = {}; (events || []).forEach(e => { eventById[e.id] = e; });
    (bApps || []).forEach(a => {
      const ev = eventById[a.event_id];
      if (!ev?.event_date) return;
      const dtStart = new Date(ev.event_date);
      const dtEnd = new Date(dtStart.getTime() + 2 * 3600 * 1000);
      lines.push('BEGIN:VEVENT', `UID:barospot-${a.id}@baroalba.multimove.co.kr`, `DTSTAMP:${icsDateUTC(now)}`,
        `DTSTART:${icsDateUTC(dtStart)}`, `DTEND:${icsDateUTC(dtEnd)}`,
        icsFold(`SUMMARY:${icsEscape('[바로만남] 매칭 확정')}`),
        icsFold(`LOCATION:${icsEscape(restById[ev.restaurant_id] || '')}`), 'END:VEVENT');
    });
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

```

- [ ] **Step 3: 두 액션 추가**

`api/admin.js`에서 다음 주석이 있는 줄을 찾는다: `// 관리자 인증 — app_admins 테이블 기준
(하드코딩 불필요, Supabase에서 직접 관리)`. **바로 위에** 아래 블록을 삽입한다(기존
`workplace_verify_send`/`process_referral` 같은 early-bypass 블록들 바로 다음 위치):

```js
  // ── 캘린더 자동등록 피드용 토큰 발급 (관리자 아님, 로그인한 본인 uid만 반환) ──
  if (req.method === 'GET' && earlyAction === 'get_calendar_token') {
    const ctJwt = (req.headers.authorization || '').replace('Bearer ', '');
    const ctUid = getSubFromJWT(ctJwt);
    if (!ctUid) return res.status(401).json({ error: '로그인이 필요합니다' });
    const feedSecret = process.env.CALENDAR_FEED_SECRET;
    if (!feedSecret) return res.status(500).json({ error: 'CALENDAR_FEED_SECRET not set' });
    const ctToken = require('crypto').createHmac('sha256', feedSecret).update(ctUid).digest('hex').slice(0, 32);
    const ctHost = req.headers['x-forwarded-host'] || req.headers.host;
    const feedPath = `/api/admin?action=ics_feed&uid=${ctUid}&token=${ctToken}`;
    return res.status(200).json({ ok: true, https_url: `https://${ctHost}${feedPath}`, webcal_url: `webcal://${ctHost}${feedPath}` });
  }

  // ── 캘린더 구독 피드 (관리자 아님, 서명 토큰만으로 인증 - 캘린더 앱은 쿠키/세션 없이 이 URL을 주기적으로 GET함) ──
  if (req.method === 'GET' && earlyAction === 'ics_feed') {
    const feedUid = req.query.uid;
    const feedToken = req.query.token;
    const feedSecret = process.env.CALENDAR_FEED_SECRET;
    if (!feedUid || !feedToken || !feedSecret) return res.status(400).send('');
    const expected = require('crypto').createHmac('sha256', feedSecret).update(feedUid).digest('hex').slice(0, 32);
    if (feedToken.length !== expected.length || !require('crypto').timingSafeEqual(Buffer.from(feedToken), Buffer.from(expected))) {
      return res.status(401).send('');
    }
    const icsBody = await buildCalendarFeed(feedUid, svcKey);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(icsBody);
  }

```

- [ ] **Step 4: (사람 작업) Vercel에 `CALENDAR_FEED_SECRET` 환경변수 추가**

대표님이 직접 실행 — `CRON_SECRET` 추가했던 절차와 동일:

```bash
vercel env add CALENDAR_FEED_SECRET
```

무작위 값 아무거나(32자 이상 랜덤 문자열) 입력. **Production 환경에 추가할 것.** 이 값이
없으면 두 액션 모두 500을 반환한다 — Step 5 배포 자체는 이 값 없이도 되지만, 실제 동작
확인(Step 6)은 이 값이 설정된 뒤에만 가능하다.

- [ ] **Step 5: 커밋 + 배포**

```bash
cd "G:\내 드라이브\MultiMOVE\2. Projects\바로알바\prototype"
git add api/admin.js
git commit -m "feat: 캘린더 자동등록 webcal 구독 피드 API 추가 (알바/모임/바로만남)"
git push origin main
```

Vercel 자동 배포(약 30초) 후 다음 단계로.

- [ ] **Step 6: 라이브 curl 검증**

`CALENDAR_FEED_SECRET`이 설정된 뒤, 아래처럼 Node로 직접 토큰을 계산해서 실제 accepted
지원 건이 있는 워커의 uid로 요청해본다(uid는 `workers.kakao_uid` 값 중 하나, 관리자
화면이나 curl로 미리 확보):

```bash
node -e "console.log(require('crypto').createHmac('sha256', '<CALENDAR_FEED_SECRET 값>').update('<uid>').digest('hex').slice(0,32))"
curl -s "https://baroalba.multimove.co.kr/api/admin?action=ics_feed&uid=<uid>&token=<위에서 나온 값>"
```

Expected: `BEGIN:VCALENDAR`로 시작하고 `END:VCALENDAR`로 끝나는 텍스트. accepted 지원
건이 있으면 `[바로알바]`로 시작하는 `VEVENT`가 최소 하나 포함돼야 한다. 틀린 토큰으로
같은 요청을 하면 401(빈 본문)이 와야 한다.

---

## Task 2: 프론트엔드 UI

**Files:**
- Modify: `shared-lang.js`
- Modify: `바로알바.html`
- Modify: `assets/js/app.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: Task 1의 `GET /api/admin?action=get_calendar_token`(Bearer 필요) 응답 형태
  `{ok, https_url, webcal_url}`.
- Consumes: 기존 `db.auth.getSession()`, `showToast(msg)`, `t(key)`, `openMpSub(name)` /
  `closeMpSub(name)`(마크업만 `id="mpsub-calendar"`로 맞추면 그대로 동작, 코드 수정 불필요).

- [ ] **Step 1: `shared-lang.js`에 i18n 키 추가**

`TRANSLATIONS` 객체에서 `ko` 블록에 있는 기존 `row_income` 키 근처에 아래 7개 키를
**8개 언어(ko/en/zh/ja/vi/ru + 나머지 2개, 기존 언어 목록 그대로) 전부에** 추가한다.
한국어 값 기준(다른 언어는 기존 톤에 맞춰 번역):

```js
row_calendar_sync: '캘린더 연동',
mp_calendar_ttl: '내 일정 캘린더 연동',
mp_calendar_desc: '확정된 알바 근무·모임·바로만남 일정이 자동으로 캘린더에 추가돼요.',
mp_calendar_ios_hint: '아이폰/맥: 아래 버튼을 누르면 캘린더 앱이 바로 구독을 물어봐요.',
mp_calendar_android_hint: '안드로이드: 아래 링크를 복사한 뒤, PC 구글 캘린더에서 [다른 캘린더] → [URL로 추가]에 붙여넣으세요.',
mp_calendar_subscribe_btn: '캘린더에 구독하기',
toast_calendar_link_copied: '캘린더 링크를 복사했어요',
```

- [ ] **Step 2: `바로알바.html`에 mp-row + 패널 마크업 추가**

`row_wage_history`(급여 수령 확인) `mp-row` 블록 바로 다음에(1962-1965행 근처, `mp-rows`
div 안) 추가:

```html
<div class="mp-row" onclick="openMpSub('calendar')">
  <div class="mp-row-left"><span class="mp-row-icon">📅</span><span data-i18n="row_calendar_sync">캘린더 연동</span></div>
  <div class="mp-row-right"><span class="mp-row-arrow">›</span></div>
</div>
```

`mpsub-income` 패널(`</div>` 로 끝나는 지점, "팔로잉 업체" 패널 시작 전) 바로 다음에
새 패널을 추가:

```html
<div class="mpsub-panel" id="mpsub-calendar">
  <div class="mpsub-hdr">
    <button class="mpsub-back" onclick="closeMpSub('calendar')">‹</button>
    <div class="mpsub-ttl" data-i18n="mp_calendar_ttl">내 일정 캘린더 연동</div>
  </div>
  <div style="flex:1;overflow-y:auto;padding:16px">
    <div style="font-size:13px;color:var(--ink-600);line-height:1.6;margin-bottom:16px" data-i18n="mp_calendar_desc">확정된 알바 근무·모임·바로만남 일정이 자동으로 캘린더에 추가돼요.</div>
    <a id="calendar-webcal-link" href="#" style="display:block;text-align:center;padding:14px;background:var(--red);color:#fff;text-decoration:none;border-radius:var(--r-lg);font-size:14px;font-weight:700;margin-bottom:10px" data-i18n="mp_calendar_subscribe_btn">캘린더에 구독하기</a>
    <button onclick="copyCalendarFeedUrl()" style="width:100%;padding:14px;background:var(--surface-1);color:var(--ink-600);border:none;border-radius:var(--r-lg);font-size:14px;font-weight:500;cursor:pointer">🔗 링크 복사하기</button>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-400);line-height:1.6">
      <div style="margin-bottom:8px" data-i18n="mp_calendar_ios_hint">아이폰/맥: 위 버튼을 누르면 캘린더 앱이 바로 구독을 물어봐요.</div>
      <div data-i18n="mp_calendar_android_hint">안드로이드: 링크를 복사한 뒤, PC 구글 캘린더에서 [다른 캘린더] → [URL로 추가]에 붙여넣으세요.</div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: `assets/js/app.js`에 로직 추가**

`function openMpSub(name) {` 안의 분기 목록(`if (name === 'gatherings') loadMyGatheringActivity();`
줄 바로 다음)에 한 줄 추가:

```js
  if (name === 'calendar')      loadCalendarFeedUrl();
```

같은 파일에 `loadMyGatheringActivity` 함수 정의부 바로 앞(또는 뒤)에 새 함수 두 개를
추가한다:

```js
let _calendarFeedHttpsUrl = '';

async function loadCalendarFeedUrl() {
  const linkEl = document.getElementById('calendar-webcal-link');
  if (!currentUser || !linkEl) return;
  const { data: { session } } = await db.auth.getSession();
  if (!session?.access_token) return;
  try {
    const r = await fetch('/api/admin?action=get_calendar_token', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const result = await r.json();
    if (!result.ok) return;
    linkEl.href = result.webcal_url;
    _calendarFeedHttpsUrl = result.https_url;
  } catch (e) { console.error('[loadCalendarFeedUrl] 실패:', e.message); }
}

function copyCalendarFeedUrl() {
  if (!_calendarFeedHttpsUrl) { showToast(t('toast_request_failed_prefix') || '잠시 후 다시 시도해주세요'); return; }
  navigator.clipboard.writeText(_calendarFeedHttpsUrl).then(() => showToast(t('toast_calendar_link_copied')));
}
```

- [ ] **Step 4: 버전 락스텝 증가**

`assets/js/app.js`에서 `const _APP_V = '617';`를 읽어 현재 값을 확인하고(이미 617에서
더 올라가 있을 수 있음 — **반드시 실제 값을 먼저 확인**), 그 값에 +1 한 숫자를 아래 4곳에
**전부 동일하게** 적용한다(현재 617 기준이면 618):

- `assets/js/app.js`: `const _APP_V = '618';`
- `sw.js`: `const CACHE = 'baroalba-v618';` (정확한 변수명은 파일에서 직접 확인)
- `바로알바.html`의 스크립트/스타일 태그 4곳: `app.js?v=618`, `app_ui.js?v=618`,
  `shared-lang.js?v=618`, `style.css?v=618`

- [ ] **Step 5: 중복 ID 사전 점검**

새 id(`mpsub-calendar`, `calendar-webcal-link`)를 추가했으므로 커밋 전에 확인:

```bash
python -c "
import re
from collections import Counter
with open('바로알바.html', encoding='utf-8') as f:
    ids = re.findall(r'id=\"([^\"]+)\"', f.read())
dups = [k for k,v in Counter(ids).items() if v > 1]
print('중복 ID:', dups)
"
```

Expected: `중복 ID: []`

- [ ] **Step 6: 커밋 + 배포 + 라이브 버전 확인**

```bash
cd "G:\내 드라이브\MultiMOVE\2. Projects\바로알바\prototype"
git add shared-lang.js 바로알바.html assets/js/app.js sw.js
git commit -m "feat: 마이페이지에 캘린더 연동 화면 추가 (v618)"
git push origin main
```

배포 후:

```bash
curl -s "https://baroalba.multimove.co.kr/sw.js" | grep CACHE
```

Expected: `baroalba-v618`가 보여야 한다. 다르면 Phase 69 사례처럼 웹훅 미발동을 의심하고
`vercel --prod --yes`로 직접 배포.

---

## Task 3: 실기기 검증 + 문서 갱신

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: 실제 계정으로 구독 URL 발급 확인**

라이브 앱 → 마이페이지 → 캘린더 연동 진입 → "캘린더에 구독하기" 버튼의 `href`가
`webcal://baroalba.multimove.co.kr/api/admin?action=ics_feed&uid=...&token=...` 형태로
채워지는지 개발자도구로 확인. "링크 복사하기" 눌러서 클립보드에 `https://...` 형태로
복사되는지 확인.

- [ ] **Step 2: 아이폰 실기기에서 구독 확인**

accepted 지원 건이 있는 알바생 계정으로 로그인 → 캘린더 연동 화면에서 "캘린더에
구독하기" 탭 → iOS가 "캘린더 구독" 확인창을 띄우는지, 구독 후 캘린더 앱에 `[바로알바]`
이벤트가 뜨는지 확인.

- [ ] **Step 3: 취소 반영 확인**

구독해둔 상태에서 해당 근무를 취소 처리 → 캘린더 앱 설정에서 해당 캘린더를 수동
새로고침(또는 몇 시간 대기) → 이벤트가 사라지는지 확인.

- [ ] **Step 4: `docs/PROGRESS.md` 갱신**

`docs/PROGRESS.md` 0장 최상단(가장 최근 Phase가 있는 줄)에 Phase 92로 아래 내용을 추가:
버전 618, "캘린더 자동등록(webcal 구독 피드) — 알바/모임/바로만남 통합, `api/admin.js`에
`ics_feed`/`get_calendar_token` 액션 추가, `CALENDAR_FEED_SECRET` 환경변수 설정 필요".
기존 Phase 91 항목 형식(표/불릿)을 그대로 따라 작성한다.

```bash
git add docs/PROGRESS.md
git commit -m "docs: Phase 92 캘린더 자동등록 완료 기록"
git push origin main
```
