type FetchLike = typeof fetch;

export type WorkflowDispatchInput = {
  repository: string;
  workflow: string;
  ref: string;
  token: string;
  inputs?: Record<string, string>;
  fetchFn?: FetchLike;
};

export type WorkflowDispatchResult = {
  ok: boolean;
  status: number;
  error?: string;
};

// Shared server-side GitHub workflow dispatcher. Callers pass only workflow metadata;
// the token stays in the server environment and is never included in logs or results.
export async function dispatchGithubWorkflow({
  repository,
  workflow,
  ref,
  token,
  inputs = {},
  fetchFn = fetch,
}: WorkflowDispatchInput): Promise<WorkflowDispatchResult> {
  if (!repository || !workflow || !ref || !token) {
    return { ok: false, status: 0, error: 'missing GitHub workflow configuration' };
  }

  const url = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref, inputs }),
    });
    if (response.status === 204) return { ok: true, status: response.status };
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      error: `GitHub API ${response.status}: ${body.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
