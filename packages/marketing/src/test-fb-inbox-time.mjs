// test-fb-inbox-time.mjs — kiểm mốc lọc tin hộp thư Facebook (Thanh 9/9/2026: chỉ lấy tin từ tháng 7).
// Chạy: npm run test:inbox. Không cần mạng.
import { parseSuiteTime, isBeforeSince, INBOX_SINCE_MS } from './fb-inbox-time.mjs';

// Mốc đọc giả định: thứ Ba 8/9/2026 16:19 giờ VN (lượt Chrome 8/9 thật).
const REF = Date.parse('2026-09-08T16:19:38+07:00');
const vn = (ms) => (ms === null ? null : new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 16));
const cases = [];
const eq = (name, got, want) => cases.push({ name, ok: got === want, got, want });

eq('ISO +07', vn(parseSuiteTime('2026-09-07T14:03:00+07:00', REF)), '2026-09-07 14:03');
eq('ISO +0000 kiểu Graph API', vn(parseSuiteTime('2026-08-25T15:51:50+0000', REF)), '2026-08-25 22:51');
eq('yyyy-mm-dd hh:mm giờ VN', vn(parseSuiteTime('2026-09-07 14:03', REF)), '2026-09-07 14:03');
eq('yyyy-mm-dd', vn(parseSuiteTime('2026-06-30', REF)), '2026-06-30 00:00');
eq('23 Aug 2026, 21:48', vn(parseSuiteTime('23 Aug 2026, 21:48', REF)), '2026-08-23 21:48');
eq('25 August (cùng năm)', vn(parseSuiteTime('25 August', REF)), '2026-08-25 00:00');
eq('26 April (cùng năm)', vn(parseSuiteTime('26 April', REF)), '2026-04-26 00:00');
eq('21 June', vn(parseSuiteTime('21 June', REF)), '2026-06-21 00:00');
eq('25 Aug viết tắt', vn(parseSuiteTime('25 Aug', REF)), '2026-08-25 00:00');
eq('Sept viết tắt 4 chữ', vn(parseSuiteTime('3 Sept', REF)), '2026-09-03 00:00');
eq('ngày tương lai không năm -> năm trước', vn(parseSuiteTime('25 December', REF)), '2025-12-25 00:00');
eq('15:45 = hôm nay', vn(parseSuiteTime('15:45', REF)), '2026-09-08 15:45');
eq('Today', vn(parseSuiteTime('Today', REF)), '2026-09-08 00:00');
eq('Yesterday 09:10', vn(parseSuiteTime('Yesterday 09:10', REF)), '2026-09-07 09:10');
eq('Wednesday (đọc thứ Ba -> thứ Tư tuần trước)', vn(parseSuiteTime('Wednesday', REF)), '2026-09-02 00:00');
eq('Wed 15:45', vn(parseSuiteTime('Wed 15:45', REF)), '2026-09-02 15:45');
eq('Monday, 08:00 (hôm qua)', vn(parseSuiteTime('Monday, 08:00', REF)), '2026-09-07 08:00');
eq('Tuesday = 7 ngày trước (hôm nay ghi giờ)', vn(parseSuiteTime('Tuesday', REF)), '2026-09-01 00:00');
eq('chuỗi lạ -> null', parseSuiteTime('Seen by Thanh', REF), null);
eq('rỗng -> null', parseSuiteTime('', REF), null);

eq('mốc mặc định 1/7/2026 giờ VN', vn(INBOX_SINCE_MS), '2026-07-01 00:00');
eq('26 April trước mốc', isBeforeSince('26 April', REF), true);
eq('21 June trước mốc', isBeforeSince('21 June', REF), true);
eq('30/6 23:59 trước mốc', isBeforeSince('2026-06-30 23:59', REF), true);
eq('1/7 00:00 không trước mốc', isBeforeSince('2026-07-01 00:00', REF), false);
eq('25 August giữ', isBeforeSince('25 August', REF), false);
eq('Wednesday giữ', isBeforeSince('Wednesday', REF), false);
eq('không đọc được -> giữ', isBeforeSince('???', REF), false);

const fail = cases.filter((c) => !c.ok);
for (const c of cases) console.log(`${c.ok ? 'OK ' : 'SAI'} ${c.name}${c.ok ? '' : ` | got=${JSON.stringify(c.got)} want=${JSON.stringify(c.want)}`}`);
console.log(`\n${cases.length - fail.length}/${cases.length} dat`);
process.exitCode = fail.length ? 1 : 0;
