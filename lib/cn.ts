/** Tiny class-name joiner — avoids shipping a dependency for `clsx`. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p) out += (out ? ' ' : '') + p;
  }
  return out;
}
