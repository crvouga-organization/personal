import { describe, expect, test } from 'bun:test';
import { stripTags } from './strip-tags';

describe('stripTags', () => {
  test('removes every tag', () => {
    expect(stripTags('<p>a <a href="x">b</a></p>')).toBe('a b');
  });

  test('never leaves a tag assembled from the pieces of a removed one', () => {
    expect(stripTags('<<b>script>alert(1)<</b>/script>')).not.toContain('<');
  });

  test('keeps the tags the caller allows', () => {
    const keep = (tag: string) => /^<\/?em>$/.test(tag);
    expect(stripTags('<p><em>a</em> b</p>', keep)).toBe('<em>a</em> b');
  });
});
