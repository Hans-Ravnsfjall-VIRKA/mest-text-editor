// Thin wrapper around the GitHub REST API. Edits live in one JSON file on a
// separate branch, so saving text never triggers a rebuild of the site.

import { fromBase64Utf8, toBase64Utf8 } from '../model/syncModel';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface RemoteFile {
  text: string;
  sha: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const API = 'https://api.github.com';

async function request(config: GitHubConfig, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}/repos/${config.owner}/${config.repo}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

async function fail(res: Response, what: string): Promise<never> {
  let detail = '';
  try {
    detail = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    // ignore
  }
  throw new GitHubError(`${what} failed (${res.status}) ${detail}`.trim(), res.status);
}

export async function getFile(config: GitHubConfig, path: string): Promise<RemoteFile | null> {
  const res = await request(config, `/contents/${path}?ref=${encodeURIComponent(config.branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) await fail(res, 'Loading edits');
  const data = (await res.json()) as { content: string; sha: string };
  return { text: fromBase64Utf8(data.content), sha: data.sha };
}

/** Create the edits branch from the default branch when it does not exist yet. */
export async function ensureBranch(config: GitHubConfig): Promise<void> {
  const existing = await request(config, `/git/ref/heads/${encodeURIComponent(config.branch)}`);
  if (existing.ok) return;
  if (existing.status !== 404) await fail(existing, 'Checking branch');
  const repoRes = await request(config, '');
  if (!repoRes.ok) await fail(repoRes, 'Reading repository');
  const defaultBranch = ((await repoRes.json()) as { default_branch: string }).default_branch;
  const headRes = await request(config, `/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
  if (!headRes.ok) await fail(headRes, 'Reading default branch');
  const sha = ((await headRes.json()) as { object: { sha: string } }).object.sha;
  const created = await request(config, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha }),
  });
  if (!created.ok && created.status !== 422) await fail(created, 'Creating branch');
}

/** Write the file. Throws GitHubError with status 409 when someone else saved in between. */
export async function putFile(
  config: GitHubConfig,
  path: string,
  text: string,
  sha: string | null,
  message: string,
): Promise<string> {
  const res = await request(config, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      branch: config.branch,
      content: toBase64Utf8(text),
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 409 || res.status === 422) throw new GitHubError('Edits changed on GitHub', 409);
  if (!res.ok) await fail(res, 'Saving edits');
  return ((await res.json()) as { content: { sha: string } }).content.sha;
}
