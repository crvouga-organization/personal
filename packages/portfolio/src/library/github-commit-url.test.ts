import { describe, expect, test } from 'bun:test';
import { githubCommitApiUrl } from './github-commit-url';

describe('githubCommitApiUrl', () => {
  test('maps a commit link, dropping its diff fragment', () => {
    expect(
      githubCommitApiUrl(
        'https://github.com/crvouga/personal/commit/6522c40fc5610ad93215c68d320ecc331d7ebfd6#diff-b803fcb7L402'
      )
    ).toBe(
      'https://api.github.com/repos/crvouga/personal/commits/6522c40fc5610ad93215c68d320ecc331d7ebfd6'
    );
  });

  test('leaves every other URL to the page check', () => {
    expect(
      githubCommitApiUrl('https://github.com/crvouga/personal/pull/101')
    ).toBeUndefined();
    expect(
      githubCommitApiUrl('https://github.com/crvouga/personal')
    ).toBeUndefined();
    expect(
      githubCommitApiUrl('https://example.com/a/b/commit/acc261f4')
    ).toBeUndefined();
  });
});
