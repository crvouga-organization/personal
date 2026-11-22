const TAG = /<[^>]*>/g;

/**
 * Removes HTML tags, repeating until none are left so a removal can never join
 * the pieces of a new tag (`<scr<b>ipt>`). `keep` returns true for a tag that
 * stays in the output.
 */
export const stripTags = (
  html: string,
  keep: (tag: string) => boolean = () => false
): string => {
  let previous: string;
  let current = html;
  do {
    previous = current;
    current = previous.replace(TAG, (tag) => (keep(tag) ? tag : ''));
  } while (current !== previous);
  return current;
};
