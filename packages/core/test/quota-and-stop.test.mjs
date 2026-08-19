// Test bất biến an toàn cho quota (hạn mức ngày) và emergency stop (dừng khẩn).
// Chạy: node --test packages/core/test/quota-and-stop.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incrementDailyCounter, getCounter } from '../src/quota.js';
import { isStopped, assertNotStopped } from '../src/emergency-stop.js';

// Fake supabase phù hợp cho quota (select + upsert vào daily_counters) và
// emergency-stop (select trên app_config).
function fakeClient({ counters = new Map(), configValue = null } = {}) {
  return {
    __counters: counters,
    from(table) {
      return {
        select() {
          const chain = { _filters: [] };
          const api = {
            eq(col, val) {
              chain._filters.push({ col, val });
              return api;
            },
            async maybeSingle() {
              if (table === 'app_config') {
                if (chain._filters.some((f) => f.col === 'key' && f.val === 'emergency_stop')) {
                  return { data: configValue === null ? null : { value: configValue }, error: null };
                }
                return { data: null, error: null };
              }
              if (table === 'daily_counters') {
                const k = chain._filters
                  .filter((f) => ['account', 'kind', 'day'].includes(f.col))
                  .sort((a, b) => a.col.localeCompare(b.col))
                  .map((f) => `${f.col}=${f.val}`)
                  .join('|');
                const c = counters.get(k);
                return { data: c ? { count: c } : null, error: null };
              }
              return { data: null, error: null };
            },
          };
          return api;
        },
        upsert(row) {
          if (table === 'daily_counters') {
            const k = ['account', 'kind', 'day']
              .sort()
              .map((c) => `${c}=${row[c]}`)
              .join('|');
            counters.set(k, row.count);
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

test('incrementDailyCounter chặn khi chạm trần', async () => {
  const client = fakeClient();
  const args = { account: 'test', kind: 'foo', day: '2026-08-19', limit: 3 };
  assert.deepEqual(await incrementDailyCounter(client, args), { count: 1, allowed: true });
  assert.deepEqual(await incrementDailyCounter(client, args), { count: 2, allowed: true });
  assert.deepEqual(await incrementDailyCounter(client, args), { count: 3, allowed: true });
  const blocked = await incrementDailyCounter(client, args);
  assert.equal(blocked.allowed, false, 'lượt thứ 4 phải bị chặn');
  assert.equal(blocked.count, 3, 'không tăng đếm khi bị chặn');
});

test('getCounter đọc đúng giá trị đã ghi', async () => {
  const client = fakeClient();
  const args = { account: 'a', kind: 'b', day: '2026-08-19' };
  assert.equal(await getCounter(client, args), 0, 'chưa có bản ghi thì 0');
  await incrementDailyCounter(client, { ...args, limit: 10 });
  await incrementDailyCounter(client, { ...args, limit: 10 });
  assert.equal(await getCounter(client, args), 2);
});

test('isStopped trả false khi cờ chưa bật hoặc không có bản ghi', async () => {
  const client = fakeClient({ configValue: null });
  assert.equal(await isStopped(client), false);
});

test('isStopped trả true khi value=true', async () => {
  const client = fakeClient({ configValue: true });
  assert.equal(await isStopped(client), true);
});

test('assertNotStopped ném lỗi khi dừng khẩn bật', async () => {
  const client = fakeClient({ configValue: true });
  await assert.rejects(() => assertNotStopped(client), /dừng khẩn/i);
});

test('assertNotStopped không ném khi tắt', async () => {
  const client = fakeClient({ configValue: false });
  await assert.doesNotReject(() => assertNotStopped(client));
});
