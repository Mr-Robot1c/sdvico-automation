// Pure helpers for Search Console URL matching and aggregation.
// Kept free of env/DB access so the sync path can be regression-tested with plain Node.

export function gscDateRange(now = new Date(), days = 28, lagDays = 2) {
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const to = new Date(vnNow.getTime() - lagDays * 24 * 60 * 60 * 1000);
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function normalizeGscPageUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { path = url.pathname; }
    path = path.normalize('NFC').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    // Public blog slugs are lowercase. Host + path deliberately ignores protocol, query and hash.
    return `${host}${path.toLowerCase()}`;
  } catch {
    return '';
  }
}

export function aggregateGscPageRows(rows) {
  const byPage = new Map();
  for (const row of rows || []) {
    const key = normalizeGscPageUrl(row?.page);
    if (!key) continue;
    const clicks = Number(row?.clicks) || 0;
    const impressions = Number(row?.impressions) || 0;
    const position = Number(row?.position) || 0;
    const cur = byPage.get(key) || {
      page: String(row?.page || ''),
      normalizedPage: key,
      clicks: 0,
      impressions: 0,
      positionWeight: 0,
    };
    cur.clicks += clicks;
    cur.impressions += impressions;
    cur.positionWeight += position * impressions;
    byPage.set(key, cur);
  }
  return [...byPage.values()].map((row) => ({
    page: row.page,
    normalizedPage: row.normalizedPage,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions ? row.clicks / row.impressions : 0,
    position: row.impressions ? row.positionWeight / row.impressions : 0,
  }));
}

export async function fetchAllGscRows(fetchPage, rowLimit = 1000, maxPages = 100) {
  const rows = [];
  let pagesFetched = 0;
  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchPage(page * rowLimit, rowLimit);
    pagesFetched += 1;
    rows.push(...batch);
    if (batch.length < rowLimit) return { rows, pagesFetched };
  }
  throw new Error(`Search Console vượt giới hạn an toàn ${rowLimit * maxPages} dòng`);
}

