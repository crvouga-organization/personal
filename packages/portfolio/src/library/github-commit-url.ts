const GITHUB_COMMIT_URL =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/commit\/([0-9a-f]{7,40})(?:#.*)?$/;

/**
 * The REST API URL that answers 200 only when a github.com commit link's
 * commit exists in its repository, or `undefined` for any other URL.
 */
export const githubCommitApiUrl = (url: string): string | undefined => {
  const match = GITHUB_COMMIT_URL.exec(url);
  if (!match) return undefined;
  const [, owner, repo, sha] = match;
  return `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
};
