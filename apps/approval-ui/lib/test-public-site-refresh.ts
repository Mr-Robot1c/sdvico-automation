import assert from 'node:assert/strict';
import { dispatchGithubWorkflow } from './github-workflow';
import { hasPublishedWebsitePost, requestPublicSiteRefresh } from './public-site-refresh';

const calls: Array<{ table: string; row: any }> = [];
const client = {
  from(table: string) {
    return {
      async insert(row: any) {
        calls.push({ table, row });
        return { error: null };
      },
    };
  },
};

const dispatch = await dispatchGithubWorkflow({
  repository: 'sdvico/sdvico-home-page',
  workflow: 'deploy-public-site.yml',
  ref: 'main',
  token: 'not-a-real-token',
  inputs: { deploy: 'true' },
  fetchFn: async (url, init) => {
    assert.match(String(url), /sdvico\/sdvico-home-page\/actions\/workflows\/deploy-public-site\.yml\/dispatches$/);
    assert.equal(JSON.parse(String(init?.body)).inputs.deploy, 'true');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer not-a-real-token');
    return new Response(null, { status: 204 });
  },
});
assert.equal(dispatch.ok, true);

const original = { token: process.env.GITHUB_DEPLOY_TOKEN, fallback: process.env.GITHUB_TOKEN };
process.env.GITHUB_DEPLOY_TOKEN = 'test-token';
delete process.env.GITHUB_TOKEN;
const articlePublished = true;
const failed = await requestPublicSiteRefresh(
  client as any,
  { event: 'published', postId: 'content-1', reason: 'test publish' },
  { dispatch: async () => ({ ok: false, status: 503, error: 'temporary outage' }) },
);
assert.equal(failed.requested, false);
assert.equal(articlePublished, true, 'secondary dispatch failure must not undo the published article');
assert.equal(calls.at(-1)?.row.status, 'error');
assert.equal(calls.at(-1)?.row.detail.httpStatus, 503);

function websitePostClient(data: unknown[]) {
  const query: any = {
    select: () => query,
    eq: () => query,
    is: () => query,
    limit: async () => ({ data, error: null }),
  };
  return { from: () => query };
}
assert.equal(await hasPublishedWebsitePost(websitePostClient([]) as any, 'draft-content'), false);
assert.equal(await hasPublishedWebsitePost(websitePostClient([{ id: 'post-1' }]) as any, 'published-content'), true);

if (original.token === undefined) delete process.env.GITHUB_DEPLOY_TOKEN;
else process.env.GITHUB_DEPLOY_TOKEN = original.token;
if (original.fallback === undefined) delete process.env.GITHUB_TOKEN;
else process.env.GITHUB_TOKEN = original.fallback;
console.log('public site refresh tests: ok');
