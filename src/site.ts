import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { PreflightError } from './errors.ts';
import { parseRedirects, servesRequests } from './redirects.ts';
import type { RedirectRule } from './redirects.ts';
import { pageUrl } from './urls.ts';

/** One HTML file of the build. */
export interface PageFile {
  /** Path inside the folder, posix style: `about/index.html`. */
  file: string;
  /** How it is shown in reports: `/about/index.html`. */
  label: string;
  /** The URL path it is served at: `/about/`. */
  url: string;
}

/** An index of a built folder, with the lookups the checks share. */
export interface Site {
  pages: PageFile[];
  redirects: RedirectRule[];
  /** True when a file exists at this URL path, or a folder with an index page, or (clean URLs) a `.html` page. */
  built(urlPath: string): boolean;
  /** True when a redirects-file rule answers this URL path. */
  redirected(urlPath: string): boolean;
  /** True when a file exists at exactly this inside-the-folder path (case-sensitive, like most hosts). */
  hasFile(file: string): boolean;
  /** The text of a file inside the folder. */
  read(file: string): string;
}

export interface SiteOptions {
  cleanUrls: boolean;
  redirectsFile: string | false | undefined;
}

function indexFolder(root: string): Set<string> {
  const files = new Set<string>();
  const seen = new Set<string>();
  const walk = (abs: string, rel: string): void => {
    const real = realpathSync(abs);
    if (seen.has(real)) return;
    seen.add(real);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = path.join(abs, entry.name);
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const target = statSync(childAbs);
          isDir = target.isDirectory();
          isFile = target.isFile();
        } catch {
          continue;
        }
      }
      if (isDir) walk(childAbs, childRel);
      else if (isFile) files.add(childRel);
    }
  };
  walk(root, '');
  return files;
}

/** Indexes the folder once: every file, every page, and the redirect rules. */
export function readSite(root: string, options: SiteOptions): Site {
  const files = indexFolder(root);
  const read = (file: string): string => {
    const text = readFileSync(path.join(root, file), 'utf8');
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  };

  let redirectsText = '';
  if (typeof options.redirectsFile === 'string') {
    try {
      redirectsText = readFileSync(path.resolve(options.redirectsFile), 'utf8');
    } catch {
      throw new PreflightError(`Cannot read the redirects file: ${options.redirectsFile}`);
    }
  } else if (options.redirectsFile === undefined && files.has('_redirects')) {
    redirectsText = read('_redirects');
  }
  const redirects = parseRedirects(redirectsText);
  const serving = redirects.filter(servesRequests);

  const pages = [...files]
    .filter((file) => /\.html?$/i.test(file))
    .sort()
    .map((file) => ({ file, label: `/${file}`, url: pageUrl(file) }));

  const built = (urlPath: string): boolean => {
    const rel = urlPath.replace(/^\/+/, '');
    if (!rel) return files.has('index.html');
    if (rel.endsWith('/')) {
      const dir = rel.slice(0, -1);
      return files.has(`${dir}/index.html`) || (options.cleanUrls && files.has(`${dir}.html`));
    }
    return files.has(rel) || files.has(`${rel}/index.html`) || (options.cleanUrls && files.has(`${rel}.html`));
  };
  const redirected = (urlPath: string): boolean => serving.some((rule) => rule.pattern.test(urlPath));

  return { pages, redirects, built, redirected, hasFile: (file) => files.has(file), read };
}
