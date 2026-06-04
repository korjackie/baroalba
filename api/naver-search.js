// Vercel 서버리스 함수 — 네이버 지역 검색 API 프록시 (CORS 우회)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver API credentials not configured' });
  }

  try {
    const start = Math.max(1, parseInt(req.query.start) || 1);
    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&start=${start}&sort=comment`;
    const response = await fetch(url, {
      headers: {
        'X-Naver-Client-Id':     clientId,
        'X-Naver-Client-Secret': clientSecret,
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();

    // mapx/mapy (WGS84 * 1e7) → lat/lng 변환
    const items = (data.items || []).map(item => ({
      title:       item.title.replace(/<[^>]+>/g, ''),
      address:     item.address,
      roadAddress: item.roadAddress,
      telephone:   item.telephone,
      category:    item.category,
      link:        item.link,
      lat:         item.mapy / 10000000,
      lng:         item.mapx / 10000000,
    }));

    res.json({ items, total: data.total || 0, start });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
