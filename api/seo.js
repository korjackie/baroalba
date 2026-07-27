/**
 * 검색엔진·공유용 서버 렌더링 엔드포인트
 *   /job/:id      → /api/seo?kind=job&id=:id     공고별 공개 페이지
 *   /sitemap.xml  → /api/seo?kind=sitemap        사이트맵 자동생성
 * (실제 주소 연결은 vercel.json 의 rewrites)
 *
 * 왜 서버 렌더링인가: 이 페이지의 존재 이유는 검색 색인과 공유 미리보기다.
 * 앱(바로알바.html)은 JS로 그리는 껍데기라 크롤러 시점엔 내용이 없고, 특히 네이버
 * 봇은 JS 실행을 기대할 수 없다. 그래서 HTML을 완성해서 보낸다.
 *
 * ⚠️ 두 기능을 굳이 한 파일에 넣은 이유 (2026-07-28)
 *    Vercel Hobby 플랜은 배포당 서버리스 함수 12개가 상한이고 api/ 가 꽉 차 있었다.
 *    job.js·sitemap.js 로 따로 만들었더니 14개가 되어 배포가 거부됐고("No more than
 *    12 Serverless Functions..."), 루트 middleware.js(Edge)로 우회하는 것도 이
 *    프로젝트에선 배포 에러가 났다. 결국 welcome-email + report-notify 를 api/email.js
 *    로 합쳐 슬롯 하나를 비우고, 이 둘도 한 파일에 담아 12개를 맞췄다.
 *    ⇒ api/ 에 새 파일을 추가하려면 반드시 기존 하나를 먼저 없애야 한다.
 *
 * ⚠️ 빌드 로그가 "Build Completed" 여도 성공이 아니다. 함수 상한은 그 다음 배포
 *    단계에서 걸린다. 배포 후 실제 URL을 curl 해서 확인할 것.
 */

const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';
const SITE = 'https://baroalba.multimove.co.kr';

// 앱이 "살아있는 공고"로 보는 기준과 반드시 같게 유지할 것
// (app.js: in('status', ['open','urgent']))
const LIVE_STATUS = ['open', 'urgent'];

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON-LD는 <script> 안에 들어가므로 </script> 조기종료만 막으면 된다
const jsonld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const WAGE_UNIT = { hourly: 'HOUR', daily: 'DAY', weekly: 'WEEK', monthly: 'MONTH' };
const WAGE_KO = { hourly: '시급', daily: '일급', weekly: '주급', monthly: '월급', other: '급여' };

const won = (n) => Number(n || 0).toLocaleString('ko-KR');

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // 근무 시각은 한국 기준으로 읽혀야 한다 (서버는 UTC)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

// ══════════════════════════════════════════════════════════════
//  공통 셸
// ══════════════════════════════════════════════════════════════
function page({ title, desc, canonical, robots, body, ld }) {
  const ogImage = SITE + '/icons/og-share-wide.png';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${esc(robots)}">
<meta name="theme-color" content="#C8102E">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="바로알바">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icons/icon-192.png">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--red:#C8102E;--ink:#16181d;--body:#454b57;--muted:#6b7280;--line:#e6e8ec;--soft:#f7f8fa}
  body{font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;color:var(--body);line-height:1.65;background:#fff;-webkit-font-smoothing:antialiased}
  a{color:inherit}
  .wrap{max-width:720px;margin:0 auto;padding:0 20px}
  header{border-bottom:1px solid var(--line)}
  .hbar{display:flex;align-items:center;justify-content:space-between;height:60px}
  .brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:18px;color:var(--ink);text-decoration:none;letter-spacing:-.02em}
  .brand img{width:28px;height:28px;border-radius:7px}
  .btn{display:inline-block;padding:10px 18px;border-radius:9px;font-weight:700;font-size:14.5px;text-decoration:none;border:1px solid transparent;white-space:nowrap}
  .btn-primary{background:var(--red);color:#fff}
  .btn-ghost{border-color:var(--line);color:var(--ink);background:#fff}
  .btn-lg{padding:15px 30px;font-size:16px;border-radius:11px;display:block;text-align:center}
  main{padding:34px 0 60px}
  .eyebrow{display:inline-block;font-size:12.5px;font-weight:700;color:var(--red);background:#fdeaed;padding:5px 12px;border-radius:999px;margin-bottom:14px}
  .closed{color:#6b7280;background:#eef0f3}
  h1{font-size:clamp(24px,4.4vw,33px);line-height:1.3;font-weight:800;color:var(--ink);letter-spacing:-.03em;margin-bottom:10px;word-break:keep-all}
  .biz{font-size:15.5px;color:var(--muted);margin-bottom:24px}
  .wage{font-size:27px;font-weight:800;color:var(--red);letter-spacing:-.02em;margin-bottom:26px}
  .wage small{font-size:15px;font-weight:700;color:var(--body);margin-right:7px}
  dl{border-top:1px solid var(--line)}
  .row{display:flex;gap:16px;padding:14px 2px;border-bottom:1px solid var(--line);font-size:15.5px}
  dt{flex:0 0 92px;color:var(--muted);font-weight:600}
  dd{flex:1;color:var(--ink);word-break:keep-all}
  .desc{margin:26px 0;padding:20px;background:var(--soft);border-radius:13px;font-size:15.5px;white-space:pre-wrap;word-break:keep-all}
  .cta{margin:30px 0 12px}
  .note{font-size:13.5px;color:var(--muted);text-align:center;word-break:keep-all}
  .chips{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:24px}
  .chip{font-size:13px;font-weight:600;color:var(--body);background:#fff;border:1px solid var(--line);padding:6px 12px;border-radius:999px}
  footer{padding:34px 0;font-size:13px;color:var(--muted);border-top:1px solid var(--line)}
  .flinks{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px}
  .flinks a{font-weight:600;color:var(--body);text-decoration:none}
</style>
${ld ? `<script type="application/ld+json">${ld}</script>` : ''}
</head>
<body>
<header><div class="wrap hbar">
  <a class="brand" href="/"><img src="/icons/icon-192.png" alt="" width="28" height="28">바로알바</a>
  <a class="btn btn-ghost" href="/바로알바.html?guest=1">내 주변 알바</a>
</div></header>
<main><div class="wrap">
${body}
</div></main>
<footer><div class="wrap">
  <div class="flinks">
    <a href="/">바로알바 소개</a><a href="/바로알바.html?guest=1">알바 찾기</a>
    <a href="/terms.html">이용약관</a><a href="/privacy.html">개인정보처리방침</a>
  </div>
  멀티무브 주식회사 · 사업자등록번호 265-87-03885 · contact@multimove.co.kr
</div></footer>
</body>
</html>`;
}

function sendHtml(res, body, status, cache) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  return res.status(status).send(body);
}

// ══════════════════════════════════════════════════════════════
//  /job/:id
// ══════════════════════════════════════════════════════════════
async function renderJob(req, res) {
  const id = String(req.query.id || '').trim();
  const canonical = SITE + '/job/' + encodeURIComponent(id);

  const notFound = (msg) => sendHtml(res, page({
    title: '공고를 찾을 수 없습니다 | 바로알바',
    desc: '요청하신 공고가 없거나 마감되어 삭제되었습니다.',
    canonical, robots: 'noindex, follow',
    body: `<div class="eyebrow closed">공고 없음</div>
      <h1>이 공고를 찾을 수 없습니다</h1>
      <p class="biz">${esc(msg)}</p>
      <div class="cta"><a class="btn btn-primary btn-lg" href="/바로알바.html?guest=1">내 주변 알바 보러 가기</a></div>`,
    ld: null,
  }), 404, 'public, max-age=0, s-maxage=60');

  // UUID가 아니면 DB를 때리지 않는다 (스캐너가 아무 문자열이나 붙여 들어온다)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return notFound('주소가 올바르지 않습니다.');
  }

  let job = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/job_postings?id=eq.${id}&select=*&limit=1`,
      { headers: sbHeaders() });
    if (!r.ok) throw new Error('db ' + r.status);
    job = (await r.json())[0] || null;
  } catch (e) {
    console.error('seo job fetch error:', e);
    return sendHtml(res, page({
      title: '일시적인 오류 | 바로알바', desc: '잠시 후 다시 시도해 주세요.',
      canonical, robots: 'noindex, follow',
      body: '<h1>잠시 후 다시 시도해 주세요</h1><p class="biz">공고 정보를 불러오지 못했습니다.</p>',
      ld: null,
    }), 503, 'no-store');
  }

  if (!job) return notFound('이미 마감되었거나 삭제된 공고입니다.');

  // 업체 정보 — 컬럼 구성이 확실치 않아 select=* 로 받고 있는 것만 골라 쓴다.
  // 없는 컬럼을 명시하면 PostgREST가 400을 내고 페이지 전체가 죽는다 (CLAUDE.md 13-9).
  // anon 키로는 businesses가 RLS에 막혀 임베딩 조인이 null이라 서비스 롤로 따로 조회한다.
  let biz = null;
  if (job.business_id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/businesses?id=eq.${job.business_id}&select=*&limit=1`,
        { headers: sbHeaders() });
      if (r.ok) biz = (await r.json())[0] || null;
    } catch (e) { /* 업체 정보가 없어도 페이지는 나가야 한다 */ }
  }

  const isLive = LIVE_STATUS.includes(job.status);
  const orgName = (job.biz_name || biz?.name || '').trim();
  const address = (job.address || biz?.address || biz?.road_address || '').trim();
  const descText = (job.description || '').trim();
  const wageType = job.wage_type || 'hourly';
  const wage = job.current_wage || job.base_wage || 0;
  const wageKo = WAGE_KO[wageType] || '급여';

  const titleTag = `${job.title}${orgName ? ' · ' + orgName : ''} ${wageKo} ${won(wage)}원 | 바로알바`;
  const metaDesc = descText
    ? descText.replace(/\s+/g, ' ').slice(0, 140)
    : `${address ? address + ' ' : ''}${job.title} 알바 모집. ${wageKo} ${won(wage)}원.${job.start_time ? ' 근무 ' + fmtDate(job.start_time) + '.' : ''} 바로알바에서 바로 지원하세요.`;

  // 마감 공고를 색인해두면 없는 일자리를 검색결과에 계속 내보내게 된다.
  // 구글 채용공고 정책도 만료 공고 제거를 요구하므로 noindex(링크는 따라가게 follow).
  const robots = isLive ? 'index, follow, max-image-preview:large' : 'noindex, follow';

  // ── JobPosting 스키마: 필수값이 하나라도 비면 아예 내보내지 않는다 ──
  // DB 실측(2026-07-28) description 10/25, address 14/25, biz_name 4/25 만 채워져 있어
  // 무조건 찍으면 검색엔진에 "필수 항목 누락" 경고만 쌓인다.
  let ld = null;
  const hasLocation = !!address || job.is_remote === true;
  if (isLive && job.title && descText && orgName && hasLocation && job.created_at) {
    const o = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.title,
      description: descText,
      datePosted: job.created_at,
      employmentType: job.work_type === 'spot' ? 'TEMPORARY' : 'PART_TIME',
      hiringOrganization: { '@type': 'Organization', name: orgName },
      identifier: { '@type': 'PropertyValue', name: '바로알바', value: id },
      directApply: true,
      url: canonical,
    };
    const validThrough = job.work_end_date || job.start_time;
    if (validThrough && !isNaN(new Date(validThrough).getTime())) {
      o.validThrough = new Date(validThrough).toISOString();
    }
    if (job.is_remote === true) {
      o.jobLocationType = 'TELECOMMUTE';
      o.applicantLocationRequirements = { '@type': 'Country', name: 'KR' };
    }
    if (address) {
      o.jobLocation = {
        '@type': 'Place',
        address: { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'KR' },
      };
    }
    if (wage > 0) {
      o.baseSalary = {
        '@type': 'MonetaryAmount', currency: 'KRW',
        value: { '@type': 'QuantitativeValue', value: wage, unitText: WAGE_UNIT[wageType] || 'HOUR' },
      };
    }
    if (job.needed_count > 0) o.totalJobOpenings = job.needed_count;
    ld = jsonld(o);
  }

  const rows = [];
  if (orgName) rows.push(['업체', orgName]);
  if (address) rows.push(['근무지', address]);
  if (job.start_time) rows.push(['근무 시작', fmtDate(job.start_time)]);
  if (job.duration_hours) rows.push(['근무 시간', `${job.duration_hours}시간`]);
  if (job.work_days) rows.push(['근무 요일', job.work_days]);
  if (job.category) rows.push(['업종', job.category]);
  if (job.needed_count) rows.push(['모집 인원', `${job.needed_count}명`]);

  const chips = [];
  if (job.same_day_payment) chips.push('당일 정산');
  if (job.meal_included) chips.push('식사 제공');
  if (job.holiday_pay) chips.push('주휴수당');
  if (job.beginner_ok) chips.push('초보 가능');
  if (job.is_remote) chips.push('재택 근무');
  if (job.nationality_requirement === 'any') chips.push('외국인 지원 가능');

  const body = `
  <div class="eyebrow${isLive ? '' : ' closed'}">${isLive ? (job.status === 'urgent' ? '급구' : '모집 중') : '마감된 공고'}</div>
  <h1>${esc(job.title)}</h1>
  ${orgName ? `<div class="biz">${esc(orgName)}</div>` : ''}
  <div class="wage"><small>${esc(wageKo)}</small>${won(wage)}원</div>
  ${chips.length ? `<div class="chips">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
  <dl>
    ${rows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
  </dl>
  ${descText ? `<div class="desc">${esc(descText)}</div>` : ''}
  <div class="cta">
    <a class="btn btn-primary btn-lg" href="/바로알바.html?job=${encodeURIComponent(id)}">
      ${isLive ? '앱에서 바로 지원하기' : '비슷한 알바 보러 가기'}
    </a>
  </div>
  <p class="note">${isLive
      ? '가입 없이 공고를 둘러볼 수 있고, 지원할 때만 로그인이 필요합니다.'
      : '이 공고는 마감되었습니다. 내 주변의 다른 공고를 확인해 보세요.'}</p>`;

  // 살아있는 공고는 시급이 서지로 바뀔 수 있어 짧게, 마감 공고는 길게 캐시한다
  return sendHtml(res, page({ title: titleTag, desc: metaDesc, canonical, robots, body, ld }), 200,
    isLive ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
      : 'public, max-age=0, s-maxage=3600');
}

// ══════════════════════════════════════════════════════════════
//  /sitemap.xml
// ══════════════════════════════════════════════════════════════
const STATIC_URLS = [
  { loc: SITE + '/', changefreq: 'weekly', priority: '1.0' },
  { loc: SITE + '/terms.html', changefreq: 'yearly', priority: '0.3' },
  { loc: SITE + '/privacy.html', changefreq: 'yearly', priority: '0.3' },
];

async function renderSitemap(req, res) {
  const urls = [...STATIC_URLS];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/job_postings` +
      `?status=in.(open,urgent)&select=id,updated_at,created_at&order=created_at.desc&limit=5000`,
      { headers: sbHeaders() }
    );
    if (r.ok) {
      for (const j of await r.json()) {
        const ts = j.updated_at || j.created_at;
        urls.push({
          loc: SITE + '/job/' + j.id,
          lastmod: ts ? new Date(ts).toISOString().slice(0, 10) : null,
          changefreq: 'daily', priority: '0.7',
        });
      }
    }
  } catch (e) {
    // 공고가 빠지는 건 다음 크롤에 복구되지만, 사이트맵이 5xx로 깨지면 검색엔진이
    // 기존 색인 정보까지 의심한다. 정적 3개만이라도 정상 응답으로 내보낸다.
    console.error('sitemap fetch error:', e);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `
    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}

// ══════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  const kind = req.query.kind;
  if (kind === 'job') return renderJob(req, res);
  if (kind === 'sitemap') return renderSitemap(req, res);
  return res.status(400).json({ error: 'unknown kind' });
};
