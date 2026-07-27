/**
 * /sitemap.xml — 서버리스 자동 생성
 *
 * 정적 3개(랜딩·약관·개인정보)에 살아있는 공고(/job/:id)를 얹는다.
 * vercel.json 에서 /sitemap.xml → /api/sitemap 으로 리라이트되며, 이 리라이트가
 * 먹으려면 저장소 루트의 정적 sitemap.xml 파일이 없어야 한다(정적 파일이 우선).
 *
 * ⚠️ 주소를 /sitemap.xml 그대로 유지하는 게 중요하다 — 구글·네이버에 이미 이 주소로
 *    제출돼 있어서(2026-07-28), 주소를 바꾸면 양쪽에 재제출해야 한다.
 *
 * ⚠️ DB 조회가 실패해도 정적 3개는 반드시 내보낸다. 사이트맵이 통째로 비거나 5xx가
 *    나가면 검색엔진이 기존 색인 정보까지 의심하게 된다. 공고가 빠지는 건 다음 크롤에
 *    복구되지만, 사이트맵이 깨진 건 그렇지 않다.
 */

const SUPABASE_URL = 'https://onwvbmllpycgswfzywjv.supabase.co';
const SITE = 'https://baroalba.multimove.co.kr';

// app.js: in('status', ['open','urgent']) 와 반드시 같게 유지
const LIVE_STATUS = 'in.(open,urgent)';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const STATIC = [
  { loc: SITE + '/',             changefreq: 'weekly', priority: '1.0' },
  { loc: SITE + '/terms.html',   changefreq: 'yearly', priority: '0.3' },
  { loc: SITE + '/privacy.html', changefreq: 'yearly', priority: '0.3' },
];

export default async function handler(req, res) {
  const urls = [...STATIC];

  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/job_postings` +
      `?status=${LIVE_STATUS}&select=id,updated_at,created_at&order=created_at.desc&limit=5000`,
      { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } }
    );
    if (r.ok) {
      for (const j of await r.json()) {
        const ts = j.updated_at || j.created_at;
        urls.push({
          loc: SITE + '/job/' + j.id,
          lastmod: ts ? new Date(ts).toISOString().slice(0, 10) : null,
          changefreq: 'daily',
          priority: '0.7',
        });
      }
    }
  } catch (e) { /* 위 주석 참고 — 정적 3개만이라도 정상 응답으로 내보낸다 */ }

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
