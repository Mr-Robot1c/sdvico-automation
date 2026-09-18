// gsc-keo-so.mjs — Việc B (docs/plans/plan-seo-vong-kin-tu-khoa-18-09.md): kéo SỐ THẬT Google
// Search Console theo TỪNG TỪ KHÓA (dimensions query + page, 28 ngày gần nhất) vào bảng
// mkt_seo_queries, để trang /seo trả lời đúng câu sếp hỏi qua Thanh 18/9 "từ khóa nào bà con
// tìm nhiều hơn" bằng số Google thật, không đoán.
//
// Chạy: npm run gsc:keo (thủ công) hoặc cron Thứ 2 sau seo-audit (seo-weekly.yml).
// Dùng CHUNG cách xác thực + dò property với kiem-search-console.mjs (google-sa.mjs, danh sách
// site thử ['sc-domain:sdvico.vn', 'https://sdvico.vn/']). CHƯA có quyền (anh Thành chưa thêm
// tài khoản dịch vụ vào property) -> ghi run_log status 'skipped' lý do "cho quyen GSC", KHÔNG
// bao giờ ném lỗi đỏ — thiếu quyền là chuyện chờ người, không phải sự cố.
import { loadRealEnv } from './video/env.mjs';
import { googleAccessToken, loadServiceAccount } from './google-sa.mjs';
import { getServiceClient, logRun } from '@sdvico/core';

const SCOPE = ['https://www.googleapis.com/auth/webmasters.readonly'];
const CANDIDATE_SITES = ['sc-domain:sdvico.vn', 'https://sdvico.vn/'];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Bảng chưa được áp migration (orchestrator chưa chạy) -> coi là "chờ", không phải lỗi code.
function isMissingTable(message) {
  return /relation .*mkt_seo_queries.* does not exist/i.test(String(message || ''));
}

async function skip(client, detail) {
  await logRun(client, { task: 'mkt.gsc_pull', status: 'skipped', detail });
  console.log('Bỏ qua (không phải lỗi):', detail.reason, detail.msg || '');
}

async function main() {
  const env = loadRealEnv();
  const client = getServiceClient();

  const sa = loadServiceAccount(env);
  if (!sa) {
    await skip(client, { reason: 'cho quyen GSC', msg: 'Chưa đặt GOOGLE_SA_JSON' });
    return;
  }

  let token;
  try {
    token = await googleAccessToken(SCOPE, env);
  } catch (e) {
    await skip(client, { reason: 'cho quyen GSC', msg: 'Lấy token Google lỗi: ' + e.message });
    return;
  }
  const H = { Authorization: `Bearer ${token}` };

  // Search Console dữ liệu "final" trễ khoảng 2 ngày — khung 28 ngày kết thúc tại hôm kia,
  // giống querySearchAnalytics bên app (apps/approval-ui/lib/gsc.ts).
  const to = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  const from = new Date(to.getTime() - 27 * 24 * 3600 * 1000);
  const windowStart = isoDate(from);
  const windowEnd = isoDate(to);

  // Dò site được cấp quyền — GIỐNG kiem-search-console.mjs, không hardcode 1 dạng property.
  // Thử GSC_SITE_URL (nếu app đã chốt) trước, rồi tới 2 dạng ứng viên còn lại.
  const explicit = (env.GSC_SITE_URL || '').trim();
  const candidates = explicit ? [explicit, ...CANDIDATE_SITES.filter((s) => s !== explicit)] : CANDIDATE_SITES;
  let site = null;
  let rows = null;
  let lastErr = '';
  for (const s of candidates) {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(s)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ startDate: windowStart, endDate: windowEnd, dimensions: ['query', 'page'], rowLimit: 5000, dataState: 'final' }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      site = s;
      rows = j.rows || [];
      break;
    }
    lastErr = `${s}: ${r.status} ${String(j.error?.message || '').slice(0, 160)}`;
  }
  if (rows === null) {
    await skip(client, { reason: 'cho quyen GSC', msg: lastErr || 'Tài khoản dịch vụ chưa được thêm vào property nào' });
    return;
  }

  const mapped = rows.map((r) => ({
    query: String(r.keys?.[0] || ''),
    page: String(r.keys?.[1] || ''),
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    position: Number(r.position) || 0,
    window_start: windowStart,
    window_end: windowEnd,
  }));

  // Idempotent theo window_end: xoá đợt cũ CÙNG mốc kết thúc rồi chèn lại — chạy lại cùng
  // ngày (hoặc cron chạy bù) không dồn trùng dữ liệu.
  const { error: delErr } = await client.from('mkt_seo_queries').delete().eq('window_end', windowEnd);
  if (delErr) {
    if (isMissingTable(delErr.message)) {
      await skip(client, { reason: 'chua ap migration mkt_seo_queries', msg: delErr.message });
      return;
    }
    await logRun(client, { task: 'mkt.gsc_pull', status: 'error', detail: { error: delErr.message, step: 'delete' } });
    console.error('Xoá dữ liệu cũ lỗi:', delErr.message);
    process.exitCode = 1;
    return;
  }

  if (mapped.length) {
    const { error: insErr } = await client.from('mkt_seo_queries').insert(mapped);
    if (insErr) {
      if (isMissingTable(insErr.message)) {
        await skip(client, { reason: 'chua ap migration mkt_seo_queries', msg: insErr.message });
        return;
      }
      await logRun(client, { task: 'mkt.gsc_pull', status: 'error', detail: { error: insErr.message, step: 'insert' } });
      console.error('Ghi mkt_seo_queries lỗi:', insErr.message);
      process.exitCode = 1;
      return;
    }
  }

  await logRun(client, {
    task: 'mkt.gsc_pull',
    status: 'ok',
    detail: { rows: mapped.length, window_start: windowStart, window_end: windowEnd, site },
  });
  console.log(`Xong: ${mapped.length} dòng (query x page), khung ${windowStart} tới ${windowEnd}, site ${site}.`);
}

await main();
