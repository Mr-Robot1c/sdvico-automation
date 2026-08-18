// generate-plan-directions.mjs - sinh HUONG DI CU THE tuan nay tu ca 2 nguon tri thuc.
// Doc mkt_knowledge_internal + mkt_knowledge_public 7 ngay qua, dua vao Claude API,
// sinh 5-7 chu de bai dang cu the (title + why + san pham lien quan).
// Cap nhat plan gan nhat: them plan.data.content_suggestions.
//
// Dung Claude API vi Gemini free tier het quota. Anthropic dung fetch truc tiep, khong SDK.
//
// Chay:
//   node apps/approval-ui/scripts/generate-plan-directions.mjs [plan_id]
//   (khong dua plan_id se cap nhat plan MOI NHAT)
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
  // LUON tim .env goc va merge (khong early return khi process.env da co SUPABASE),
  // vi may bien khac (ANTHROPIC_API_KEY, GEMINI_API_KEY) co the chua co san.
  let dir = dirname(fileURLToPath(import.meta.url));
  const root = parse(dir).root;
  while (true) {
    const p = join(dir, '.env');
    if (existsSync(p)) {
      const e = parseEnv(p);
      if ((e.SUPABASE_URL || '').includes('supabase.co')) {
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

if (!env.GEMINI_API_KEY) { console.error('Thieu GEMINI_API_KEY.'); process.exit(1); }

const planId = process.argv[2] || null;

// Doc plan can cap nhat
let plan;
if (planId) {
  const { data, error } = await client.from('mkt_plans').select('*').eq('id', planId).single();
  if (error) { console.error('Khong tim thay plan:', error.message); process.exit(1); }
  plan = data;
} else {
  const { data, error } = await client.from('mkt_plans').select('*').order('created_at', { ascending: false }).limit(1).single();
  if (error) { console.error('Khong doc duoc plan moi nhat:', error.message); process.exit(1); }
  plan = data;
}
console.log(`Cap nhat plan id: ${plan.id} (sinh luc ${plan.created_at})`);

// Doc tri thuc 7 ngay + muc tieu tuan (nguoi giao cho BOSS)
const since = new Date(Date.now() - 7 * 86400000).toISOString();
const [{ data: internal }, { data: publicSrc }, { data: goalRow }] = await Promise.all([
  client.from('mkt_knowledge_internal').select('title, summary, needs_gov_review').gte('created_at', since).order('created_at', { ascending: false }).limit(20),
  client.from('mkt_knowledge_public').select('source_title, summary, source_url, needs_gov_review').gte('created_at', since).order('created_at', { ascending: false }).limit(30),
  client.from('app_config').select('value').eq('key', 'mkt_weekly_goal').maybeSingle(),
]);
const goalText = String(goalRow?.value?.text || '').trim();
if (goalText) console.log(`Muc tieu tuan: ${goalText}`);

console.log(`Doc ${internal?.length || 0} noi bo, ${publicSrc?.length || 0} public`);
if (!internal?.length && !publicSrc?.length) {
  console.error('Chua co tri thuc nao, khong sinh huong di duoc.');
  process.exit(1);
}

// San pham SDVICO (dong bo voi products.mjs)
const PRODUCTS = [
  '1. Thiet bi giam sat hanh trinh S-Tracking (Viettel VMS)',
  '2. Thiet bi lien lac ve tinh Thuraya MarineStar MNB-01 (nghe goi)',
  '3. Dien thoai ve tinh XT-Pro',
  '4. May loc nuoc bien thanh nuoc ngot',
  '5. Thiet bi loc dau SF-50 (tiet kiem dau diesel)',
  '6. Dau nhot PVOIL Nano Graphene',
];

// Build prompt cho Claude
const knowledgeBlock = [
  '## Nguon noi bo (tu nhom Zalo Phong Kinh doanh):',
  ...(internal || []).map((k, i) => `${i + 1}. ${k.title}${k.needs_gov_review ? ' [can duyet QL]' : ''}\n   ${k.summary}`),
  '',
  '## Nguon public (tin nganh 7 ngay qua):',
  ...(publicSrc || []).map((k, i) => `${i + 1}. ${k.source_title}${k.needs_gov_review ? ' [can duyet QL]' : ''}\n   ${k.summary}\n   Nguon: ${k.source_url}`),
].join('\n');

const prompt = `Ban la chuyen gia marketing cho SDVICO, cong ty phan phoi thiet bi cho ngu dan va tau ca Viet Nam.

${goalText ? `MUC TIEU TUAN TU NGUOI QUAN LY (bam sat khi chon huong): ${goalText}\n` : ''}
Danh muc san pham cua cong ty:
${PRODUCTS.map((p) => '- ' + p).join('\n')}

Nguyen lieu tri thuc tuan nay:
${knowledgeBlock}

Nhiem vu: dua vao NHUNG GI DANG XAY RA (tri thuc trên), de xuat 5-7 huong bai dang cu the cho tuan toi tren Facebook/TikTok cua SDVICO. Moi huong phai:
- Bam vao mot nguon tri thuc that (noi ro dua vao muc noi bo so N hay public so N)
- Goi ten mot san pham cu the trong danh muc, khong noi chung chung
- Cho biet loai bai (checklist / hoi-dap / meo / chia se / tin nganh)
- Neu ro TAI SAO tuan nay dang la thoi diem tot cho chu de nay
- Neu tri thuc goc co co "can duyet QL" thi bai theo huong nay cung co "needs_gov_review: true"

Van phong: cau ngan, gan gui ba con ngu dan, KHONG dung gach dai, KHONG dung mui ten, so theo chuan Viet Nam.

Tra JSON dung dang, khong them chu ngoai JSON:
{
  "directions": [
    {
      "title": "Tieu de goi y (5-10 chu)",
      "why": "1-2 cau giai thich tai sao tuan nay nen dang chu de nay, dua vao tri thuc nao",
      "product": "Ten san pham chinh xac trong danh muc",
      "kind": "checklist|qa|tip|engage|glossary|news",
      "sources": ["noi bo #N", "public #N"],
      "needs_gov_review": false
    }
  ]
}
`;

// Thu nhieu model Gemini (fallback): moi model quota bucket rieng.
// KHONG dung google_search grounding vi grounding quota rat nho (500/ngay share bucket).
// Chi feed knowledge da co trong DB.
async function callGemini(prompt) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  let lastErr = '';
  for (const model of models) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', temperature: 0.5 }
      });
      console.log(`  Model ${model} tra OK.`);
      return res.text || '';
    } catch (e) {
      const m = e?.message || String(e);
      lastErr = `${model}: ${m.slice(0, 200)}`;
      console.warn(`  ${model} loi, thu model khac...`);
    }
  }
  throw new Error('Moi model Gemini deu loi. Cuoi cung: ' + lastErr);
}

console.log('\nGoi Gemini sinh huong di...');
const text = await callGemini(prompt);
console.log(`Gemini tra ${text.length} ky tu.`);

// Parse JSON
const m = text.match(/\{[\s\S]*\}/);
if (!m) { console.error('Khong parse duoc JSON tu Claude:', text.slice(0, 500)); process.exit(1); }
let parsed;
try { parsed = JSON.parse(m[0]); }
catch (e) { console.error('JSON parse loi:', e.message); process.exit(1); }
const directions = Array.isArray(parsed.directions) ? parsed.directions : [];
console.log(`Nhan ${directions.length} huong di.`);

// Cap nhat plan.data.content_suggestions
const newData = { ...plan.data, content_suggestions: directions };
const upd = await client.from('mkt_plans').update({ data: newData }).eq('id', plan.id);
if (upd.error) { console.error('Update plan loi:', upd.error.message); process.exit(1); }
console.log('✓ Da luu vao plan.data.content_suggestions\n');

console.log('== HUONG DI TUAN TOI ==\n');
for (const d of directions) {
  console.log(`◆ ${d.title}`);
  console.log(`  San pham: ${d.product}`);
  console.log(`  Loai bai: ${d.kind}${d.needs_gov_review ? ' [⚠️ can duyet QL]' : ''}`);
  console.log(`  Vi sao: ${d.why}`);
  console.log(`  Dua tren: ${(d.sources || []).join(', ')}\n`);
}

console.log(`Xem tren web: https://sdvico-mktit.vercel.app/ke-hoach`);
