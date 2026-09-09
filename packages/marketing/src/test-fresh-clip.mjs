// test-fresh-clip.mjs - kiem chon clip that moi (9/9). Chay: npm run test:clip
import { pickFreshClips, clipLabel, isZaloClip } from './video/fresh-clip.mjs';

const NOW = Date.parse('2026-09-09T10:00:00Z');
const day = (n) => new Date(NOW - n * 86400e3).toISOString();
const assets = [
  { id: 'a1', kind: 'video', source: 'zalo-auto', created_at: day(1), title: 'moi nhat' },
  { id: 'a2', kind: 'video', source: 'zalo-auto', created_at: day(5), title: 'moi 5 ngay' },
  { id: 'a3', kind: 'video', source: 'zalo-auto', created_at: day(20), title: 'cu 20 ngay' },
  { id: 'a4', kind: 'video', source: 'video-pipeline', created_at: day(0), title: 'video dung ra' },
  { id: 'a5', kind: 'image', source: 'zalo-auto', created_at: day(0), title: 'anh' },
  { id: 'a6', kind: 'video', source: 'zalo-backlog-tkkd', created_at: day(2), title: 'backlog' },
  { id: 'a7', kind: 'video', source: null, created_at: day(1), title: 'khong ro nguon' },
];
const cases = [];
const eq = (name, got, want) => cases.push({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });

eq('thu tu moi nhat truoc', pickFreshClips(assets, new Set(), NOW).map((a) => a.id), ['a1', 'a6', 'a2']);
eq('loai clip da dung', pickFreshClips(assets, new Set(['a1']), NOW).map((a) => a.id), ['a6', 'a2']);
eq('qua 14 ngay bi loai', pickFreshClips(assets, new Set(), NOW).some((a) => a.id === 'a3'), false);
eq('video-pipeline khong phai clip that', isZaloClip(assets[3]), false);
eq('anh khong phai clip', isZaloClip(assets[4]), false);
eq('nguon null khong phai clip', isZaloClip(assets[6]), false);
eq('nhan clip moi', clipLabel(assets[0], NOW), 'CLIP THẬT MỚI quay 08/09');
eq('nhan clip cu', clipLabel(assets[2], NOW), 'clip thật');
eq('nhan rong cho anh', clipLabel(assets[4], NOW), '');
eq('rong khi khong co asset', pickFreshClips(undefined, new Set(), NOW), []);

let fail = 0;
for (const c of cases) {
  if (!c.ok) fail += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.ok ? '' : ` | got=${JSON.stringify(c.got)} want=${JSON.stringify(c.want)}`}`);
}
console.log(`\n${cases.length - fail}/${cases.length} dat`);
process.exit(fail ? 1 : 0);
