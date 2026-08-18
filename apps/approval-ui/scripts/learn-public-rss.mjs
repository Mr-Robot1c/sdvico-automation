// learn-public-rss.mjs - hoc tri thuc public NGAY qua Google News RSS (bypass Gemini quota).
// Google News RSS mien phi, khong quota. Moi topic tra 5-10 bai co URL + tieu de + tom tat.
// Dung khi Gemini google_search rate limit 429.
//
// Chay:
//   node apps/approval-ui/scripts/learn-public-rss.mjs
//
// Sau khi chay xong, chay tiep run-knowledge-now.mjs de sinh Ke hoach moi co du 2 nguon.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, parse } from 'node:path';

function parseEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {}
  return out;
}
function loadRealEnv() {
  if ((process.env.SUPABASE_URL || '').includes('supabase.co') && process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env;
  let dir = dirname(fileURLToPath(import.meta.url));
  const root = parse(dir).root;
  while (true) {
    const p = join(dir, '.env');
    if (existsSync(p)) {
      const e = parseEnv(p);
      if ((e.SUPABASE_URL || '').includes('supabase.co') && e.SUPABASE_SERVICE_ROLE_KEY) {
        for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
        return process.env;
      }
    }
    if (dir === root) break;
    dir = dirname(dir);
  }
  return process.env;
}
const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const GOV_KEYWORDS = [
  'iuu', 'thẻ vàng', 'the vang', 'thẻ đỏ', 'the do',
  'cục thủy sản', 'cuc thuy san', 'cục kiểm ngư', 'cuc kiem ngu',
  'nghị định', 'nghi dinh', 'thông tư', 'thong tu',
  'quyết định', 'quyet dinh', 'luật thủy sản', 'luat thuy san',
  'giấy phép', 'giay phep', 'khai thác thủy sản', 'khai thac thuy san',
  'cấm biển', 'cam bien', 'vùng cấm', 'vung cam',
  'bộ nông nghiệp', 'bo nong nghiep', 'chính phủ', 'chinh phu',
];
function needsGovReview(text) {
  const t = String(text || '').toLowerCase();
  return GOV_KEYWORDS.some((k) => t.includes(k));
}

const TOPICS = [
  'ngành thủy sản Việt Nam',
  'tàu cá ngư dân Việt Nam',
  'thiết bị giám sát hành trình VMS tàu cá',
  'IUU thẻ vàng thủy sản',
  'giá dầu diesel tàu cá',
  'khai thác cá xa bờ',
];

// Google News RSS <description> chua CDATA bao <a href...>Title</a><font>Source</font>,
// va CHINH ky tu HTML lai encoded 2 lop: &lt;a&gt; hoac binh thuong <a>. Phai:
// 1) decode entities (kể cả numeric &#NNN;) LẶP LẠI toi khi khong doi
// 2) strip HTML tags
// 3) decode entities lan nua (vi de-strip co the lo entities sot)
// Neu bo qua se lot chuoi kieu href="..." target="_blank" vao DB -> hong UI.
function decodeEntities(s) {
  let prev = null; let cur = String(s || '');
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  while (prev !== cur) {
    prev = cur;
    cur = cur
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&([a-zA-Z]+);/g, (_, name) => named[name.toLowerCase()] ?? `&${name};`);
  }
  return cur;
}
function stripHtml(s) {
  let out = decodeEntities(String(s || ''));
  out = out.replace(/<[^>]+>/g, ' ');
  out = decodeEntities(out);
  return out.replace(/\s+/g, ' ').trim();
}

// Parse RSS XML thu cong (khong can dep). Trich <item>...<title>...<link>...<description>...<pubDate>...
function parseRss(xml) {
  const items = [];
  const itemBlocks = xml.split(/<item>/i).slice(1);
  for (const block of itemBlocks) {
    const end = block.indexOf('</item>');
    const body = end > 0 ? block.slice(0, end) : block;
    const t = (body.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const l = (body.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
    const d = (body.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '';
    const p = (body.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    // Bo CDATA neu co
    const clean = (s) => s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    items.push({
      title: stripHtml(clean(t)),
      link: clean(l).trim(),
      description: stripHtml(clean(d)),
      pubDate: clean(p).trim(),
    });
  }
  return items;
}

async function fetchGoogleNewsRss(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=vi&gl=VN&ceid=VN:vi`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (SDVICO knowledge bot)' },
  });
  if (!res.ok) throw new Error(`RSS ${res.status}`);
  const xml = await res.text();
  return parseRss(xml);
}

// Google News link la wrapper redirect https://news.google.com/rss/articles/...
// Do dai gan, khong phai URL that. Rut source that tu description (thuong co ten bao cuoi cau).
// Neu chua rut duoc, van dung link Google News (van hop le, click ra bai that).
function extractSource(desc) {
  const m = desc.match(/([A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ\s]+)\s*$/); // ten bao chi thuong o cuoi
  return m ? m[1].trim() : null;
}

console.log('Hoc tri thuc public qua Google News RSS...\n');

const allFindings = [];
for (const topic of TOPICS) {
  console.log(`Tim: "${topic}"...`);
  try {
    const items = await fetchGoogleNewsRss(topic);
    // Lay 3 bai moi nhat, loc bai co description khong rong
    const picked = items.filter((it) => it.title && it.link && it.description).slice(0, 3);
    console.log(`  → ${picked.length} bai`);
    for (const it of picked) {
      const source = extractSource(it.description);
      allFindings.push({
        source_url: it.link,
        source_title: it.title + (source ? ` (${source})` : ''),
        summary: it.description.slice(0, 800),
        needs_gov_review: needsGovReview(it.title + ' ' + it.description),
      });
    }
  } catch (e) {
    console.warn(`  loi: ${e.message}`);
  }
}

console.log(`\nTong: ${allFindings.length} bai. Dedupe theo URL...`);
const byUrl = new Map();
for (const f of allFindings) if (!byUrl.has(f.source_url)) byUrl.set(f.source_url, f);
const uniq = [...byUrl.values()];
console.log(`Sau dedupe: ${uniq.length} bai duy nhat`);

// Bo bai URL da co trong 30 ngay qua
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
const urls = uniq.map((f) => f.source_url);
const seen = new Set();
if (urls.length) {
  for (let i = 0; i < urls.length; i += 100) {
    const { data } = await client.from('mkt_knowledge_public').select('source_url').in('source_url', urls.slice(i, i + 100)).gte('created_at', thirtyDaysAgo);
    for (const r of data || []) seen.add(r.source_url);
  }
}

let inserted = 0;
for (const f of uniq) {
  if (seen.has(f.source_url)) continue;
  const ins = await client.from('mkt_knowledge_public').insert(f);
  if (ins.error) { console.warn(`  X ${f.source_url}: ${ins.error.message}`); continue; }
  inserted += 1;
  console.log(`  ✓ ${f.source_title}${f.needs_gov_review ? ' [⚠️]' : ''}`);
}

console.log(`\nXong: ${inserted} nguon public MOI luu vao mkt_knowledge_public.`);
console.log('Tiep theo: chay node apps/approval-ui/scripts/run-knowledge-now.mjs de sinh Ke hoach v2 co ca 2 nguon.');
