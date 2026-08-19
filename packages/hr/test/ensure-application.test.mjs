// Test ensureApplication — logic tái ứng tuyển: CV mới đến cho candidate đã bị từ chối
// phải tạo application MỚI (stage='new') thay vì reuse app rejected cũ.
// Chạy: node --test packages/hr/test/ensure-application.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureApplication } from '../src/intake/candidates.js';

// Fake supabase đủ dùng cho ensureApplication:
//   client.from('hr_applications').select(cols).eq('candidate_id', id) → array
//   client.from('hr_applications').insert({...}).select('id').single() → { data: {id: X} }
function fakeClient(existingApps = []) {
  const store = [...existingApps];
  let nextId = 100;
  return {
    __store: store,
    from(table) {
      if (table !== 'hr_applications') throw new Error('unexpected table: ' + table);
      return {
        select(cols) {
          const chain = { _filters: [] };
          const api = {
            eq(col, val) {
              chain._filters.push({ col, val });
              return api;
            },
            // resolve as thenable
            then(resolve) {
              const matches = store.filter((r) => chain._filters.every((f) => r[f.col] === f.val));
              resolve({ data: matches, error: null });
            },
          };
          return api;
        },
        insert(row) {
          const inserted = { id: String(nextId++), hired_at: null, ...row };
          store.push(inserted);
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
      };
    },
  };
}

test('candidate chưa có app → tạo mới stage=new', async () => {
  const client = fakeClient();
  const r = await ensureApplication(client, 'cand-1', { jobId: 'j-1' });
  assert.equal(r.isNew, true);
  assert.equal(client.__store.length, 1);
  assert.equal(client.__store[0].stage, 'new');
  assert.equal(client.__store[0].job_id, 'j-1');
});

test('candidate đã có app stage=new → reuse, không tạo trùng', async () => {
  const client = fakeClient([
    { id: 'a-1', candidate_id: 'cand-1', stage: 'new', hired_at: null },
  ]);
  const r = await ensureApplication(client, 'cand-1', { jobId: 'j-2' });
  assert.equal(r.isNew, false);
  assert.equal(r.applicationId, 'a-1');
  assert.equal(client.__store.length, 1, 'không tạo thêm app');
});

test('candidate đã có app stage=review → reuse', async () => {
  const client = fakeClient([
    { id: 'a-1', candidate_id: 'cand-1', stage: 'review', hired_at: null },
  ]);
  const r = await ensureApplication(client, 'cand-1');
  assert.equal(r.applicationId, 'a-1');
  assert.equal(r.isNew, false);
});

test('candidate đã có app stage=rejected → TẠO APP MỚI (tái ứng tuyển)', async () => {
  const client = fakeClient([
    { id: 'a-old', candidate_id: 'cand-1', stage: 'rejected', hired_at: null },
  ]);
  const r = await ensureApplication(client, 'cand-1', { jobId: 'j-new' });
  assert.equal(r.isNew, true, 'phải tạo mới vì app cũ đã rejected');
  assert.notEqual(r.applicationId, 'a-old', 'không dùng lại app rejected');
  assert.equal(client.__store.length, 2, 'giữ app cũ + thêm app mới');
  const newApp = client.__store.find((a) => a.id === r.applicationId);
  assert.equal(newApp.stage, 'new');
  assert.equal(newApp.job_id, 'j-new');
});

test('candidate có app stage=offer đã HIRED → TẠO APP MỚI (đã nhận việc rồi, ứng tuyển lại là mới)', async () => {
  const client = fakeClient([
    { id: 'a-hired', candidate_id: 'cand-1', stage: 'offer', hired_at: '2026-01-15T00:00:00Z' },
  ]);
  const r = await ensureApplication(client, 'cand-1');
  assert.equal(r.isNew, true);
  assert.notEqual(r.applicationId, 'a-hired');
});

test('candidate có app stage=offer NHƯNG chưa hired → reuse (đang đợi ứng viên nhận việc)', async () => {
  const client = fakeClient([
    { id: 'a-offer', candidate_id: 'cand-1', stage: 'offer', hired_at: null },
  ]);
  const r = await ensureApplication(client, 'cand-1');
  assert.equal(r.applicationId, 'a-offer', 'chưa nhận việc = đang treo, reuse');
});

test('candidate có nhiều app: 1 rejected + 1 active → reuse active', async () => {
  const client = fakeClient([
    { id: 'a-old', candidate_id: 'cand-1', stage: 'rejected', hired_at: null },
    { id: 'a-live', candidate_id: 'cand-1', stage: 'review', hired_at: null },
  ]);
  const r = await ensureApplication(client, 'cand-1');
  assert.equal(r.applicationId, 'a-live');
  assert.equal(r.isNew, false);
});
