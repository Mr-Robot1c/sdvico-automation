import { dispatchGithubWorkflow } from './github-workflow';

type PublicSiteEvent = 'published' | 'updated' | 'unpublished' | 'restored' | 'deleted';
type Client = {
  from: (table: string) => any;
};

export type PublicSiteRefreshResult = {
  requested: boolean;
  skipped?: boolean;
  error?: string;
};

export async function hasPublishedWebsitePost(client: Client, contentId: string): Promise<boolean> {
  const { data, error } = await client
    .from('mkt_posts')
    .select('id')
    .eq('content_id', contentId)
    .eq('channel', 'website')
    .eq('status', 'published')
    .is('deleted_at', null)
    .limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

async function writeRefreshLog(
  client: Client,
  status: 'ok' | 'error' | 'skipped',
  detail: Record<string, unknown>,
) {
  try {
    await client.from('run_log').insert({
      task: 'mkt.public_site_refresh',
      actor: 'server',
      status,
      detail,
    });
  } catch {
    // Deployment notification is secondary to the completed content mutation.
  }
}

// Best-effort secondary operation. A dispatch failure is observable but never rolls back
// the already completed publish, rewrite, restore or delete in Supabase.
export async function requestPublicSiteRefresh(
  client: Client,
  input: { event: PublicSiteEvent; postId?: string | null; reason: string },
  dependencies: { dispatch?: typeof dispatchGithubWorkflow } = {},
): Promise<PublicSiteRefreshResult> {
  const owner = (process.env.PUBLIC_SITE_GITHUB_OWNER || 'sdvico').trim();
  const repo = (process.env.PUBLIC_SITE_GITHUB_REPO || 'sdvico-home-page').trim();
  const workflow = (process.env.PUBLIC_SITE_DEPLOY_WORKFLOW || 'deploy-public-site.yml').trim();
  const ref = (process.env.PUBLIC_SITE_DEPLOY_REF || 'main').trim();
  const token = (process.env.GITHUB_DEPLOY_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  const meta = { event: input.event, postId: input.postId || null, reason: input.reason };

  if (!owner || !repo || !workflow || !ref || !token) {
    const error = 'missing public-site GitHub dispatch configuration';
    await writeRefreshLog(client, 'skipped', { ...meta, error });
    return { requested: false, skipped: true, error };
  }

  const result = await (dependencies.dispatch || dispatchGithubWorkflow)({
    repository: `${owner}/${repo}`,
    workflow,
    ref,
    token,
    inputs: {
      deploy: 'true',
      event: input.event,
      post_id: input.postId || '',
      reason: input.reason.slice(0, 200),
    },
  });
  await writeRefreshLog(client, result.ok ? 'ok' : 'error', {
    ...meta,
    repository: `${owner}/${repo}`,
    workflow,
    ref,
    httpStatus: result.status,
    error: result.error || null,
  });
  return result.ok
    ? { requested: true }
    : { requested: false, error: result.error || 'GitHub dispatch failed' };
}
