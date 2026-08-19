// Test bất biến an toàn cho cổng duyệt (approval_queue).
// Điều cấm 1 (máy soạn, người bấm) + điều cấm 2 (máy không tự loại).
// Chạy: node --test packages/core/test/approval.test.mjs
//
// Dùng fake supabase client (mock) để test logic mà không đụng DB thật.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushApproval, decideApproval } from '../src/approval.js';

// Fake client bắt chước supabase-js đủ dùng cho pushApproval + decideApproval.
function fakeClient() {
  const rows = new Map(); // id -> row
  let nextId = 1;

  return {
    __rows: rows,
    from(table) {
      return {
        insert(row) {
          const inserted = { id: String(nextId++), table, ...row };
          rows.set(inserted.id, inserted);
          return {
            select() {
              return {
                async single() {
                  return { data: { id: inserted.id }, error: null };
                },
              };
            },
          };
        },
        update(patch) {
          const chain = { _filters: [], _patch: patch };
          const api = {
            eq(col, val) {
              chain._filters.push({ col, val });
              return api;
            },
            select() {
              // decideApproval calls .select('id') and reads data.length; return array.
              const matches = [...rows.values()].filter((r) =>
                r.table === table && chain._filters.every((f) => r[f.col] === f.val)
              );
              for (const m of matches) Object.assign(m, chain._patch);
              return Promise.resolve({ data: matches.map((m) => ({ id: m.id })), error: null });
            },
          };
          return api;
        },
      };
    },
  };
}

test('pushApproval luôn đặt status=pending (điều cấm 1)', async () => {
  const client = fakeClient();
  const id = await pushApproval(client, {
    kind: 'hr_email',
    title: 'Test',
    payload: {},
  });
  const row = client.__rows.get(id);
  assert.equal(row.status, 'pending', 'pushApproval phải mặc định pending');
});

test('pushApproval KHÔNG cho phép caller ghi đè status', async () => {
  const client = fakeClient();
  // Cho dù truyền status='approved' vào, hàm phải ghi 'pending'.
  const id = await pushApproval(client, {
    kind: 'hr_email',
    title: 'Malicious',
    payload: {},
    status: 'approved', // caller cố ghi đè
  });
  const row = client.__rows.get(id);
  assert.equal(row.status, 'pending', 'không thể bypass gate bằng cách truyền status');
});

test('decideApproval CHỈ đổi được mục còn pending (chống ghi đè quyết định cũ)', async () => {
  const client = fakeClient();
  const id = await pushApproval(client, { kind: 'hr_email', title: 'X', payload: {} });

  // Lượt 1: duyệt.
  const decidedId = await decideApproval(client, id, 'approved', { decidedBy: 'user@a.com' });
  assert.equal(decidedId, id);
  assert.equal(client.__rows.get(id).status, 'approved');

  // Lượt 2: cố đổi thành 'rejected' — decideApproval ném lỗi vì không còn dòng pending.
  await assert.rejects(
    () => decideApproval(client, id, 'rejected', { decidedBy: 'user@b.com' }),
    /đã được quyết/i,
    'không được lật quyết định cũ'
  );
  assert.equal(client.__rows.get(id).status, 'approved', 'row vẫn approved sau khi cố lật');
});

test('decideApproval từ chối decision không hợp lệ', async () => {
  const client = fakeClient();
  await assert.rejects(
    () => decideApproval(client, 'x', 'sabotage'),
    /approved hoặc rejected/i,
    'chỉ chấp nhận approved/rejected'
  );
});
