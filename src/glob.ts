/** Drops a trailing slash, except on the root path. */
export function trimSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compiles a URL path pattern. `*` matches any characters, including `/`; a trailing slash is ignored. */
export function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${trimSlash(pattern).split('*').map(escapeRegExp).join('.*')}$`);
}

/** True when the URL path matches any of the compiled patterns. */
export function matchesAny(globs: readonly RegExp[], urlPath: string): boolean {
  const path = trimSlash(urlPath);
  return globs.some((glob) => glob.test(path));
}
