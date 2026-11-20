#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.ts';
import { PreflightError } from './errors.ts';
import { formatReport } from './format.ts';
import { preflight } from './preflight.ts';
import { CHECK_NAMES } from './types.ts';
import type { CheckName, PreflightConfig, PreflightOptions } from './types.ts';

const HELP = `Usage: static-preflight [dir] [options]

Checks a built static site before you deploy it. dir defaults to "out".

Options:
  --expect-noindex            every page must carry a noindex robots tag (a site hidden before launch)
  --forbid-noindex            no page may carry one, except 404 pages (catches noindex left on at launch)
  --legacy-urls <file>        old URLs that must resolve: a JSON array, or a text file with one URL per line
  --require-jsonld <T=/p/*>   pages matching the path pattern must carry JSON-LD of type T (repeatable)
  --skip <check,check>        turn checks off (repeatable)
  --ignore <pattern>          leave pages matching this URL path pattern out of every check (repeatable)
  --exclude <check=pattern>   leave pages matching the pattern out of one check (repeatable)
  --share-tags <tag,tag>      meta tags the share card needs (default: og:title,og:description,og:image,twitter:card)
  --trailing-slash <rule>     "forbid" or "require" a trailing slash on links to pages
  --redirects <file>          redirects file (default: _redirects inside dir)
  --site-url <url>            the site's public origin; absolute URLs on it are checked like internal ones
  --no-clean-urls             do not let /about resolve to about.html
  --max-problems <n>          print at most n problems (default: 80; 0 prints all)
  --config <file>             config file (default: static-preflight.config.json in the working directory)
  --json                      print the result as JSON
  -h, --help                  show this help
  -v, --version               show the version

Checks: ${CHECK_NAMES.join(', ')}

Exit codes: 0 no problems, 1 problems found, 2 usage error.
`;

class UsageError extends Error {}

function readVersion(): string {
  const file = fileURLToPath(new URL('../package.json', import.meta.url));
  return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
}

function list(values: string[] | undefined): string[] | undefined {
  return values
    ?.flatMap((value) => value.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function run(argv: string[]): number {
  let parsed: ReturnType<typeof parseCommandLine>;
  try {
    parsed = parseCommandLine(argv);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError(`Expected one folder, got ${positionals.length}: ${positionals.join(' ')}`);
  if (values['expect-noindex'] && values['forbid-noindex']) {
    throw new UsageError('--expect-noindex and --forbid-noindex cannot be used together.');
  }

  const config: PreflightConfig = loadConfig(process.cwd(), values.config) ?? {};
  // Flags win over the config file.
  const options: PreflightOptions = { ...config };
  if (values['expect-noindex']) options.noindex = 'expect';
  if (values['forbid-noindex']) options.noindex = 'forbid';
  if (values['legacy-urls'] !== undefined) options.legacyUrls = values['legacy-urls'];
  if (values['require-jsonld']) options.requireJsonLd = values['require-jsonld'];
  const skip = list(values.skip);
  if (skip) options.skip = skip as CheckName[];
  if (values.ignore) options.ignore = values.ignore;
  if (values.exclude) options.exclude = parseExcludes(values.exclude);
  const shareTags = list(values['share-tags'] ? [values['share-tags']] : undefined);
  if (shareTags) options.shareTags = shareTags;
  if (values['trailing-slash'] !== undefined) options.trailingSlash = values['trailing-slash'] as 'forbid' | 'require';
  if (values.redirects !== undefined) options.redirectsFile = values.redirects;
  if (values['site-url'] !== undefined) options.siteUrl = values['site-url'];
  if (values['no-clean-urls']) options.cleanUrls = false;
  let maxProblems = config.maxProblems ?? 80;
  if (values['max-problems'] !== undefined) {
    maxProblems = Number(values['max-problems']);
    if (!Number.isInteger(maxProblems) || maxProblems < 0)
      throw new UsageError('--max-problems must be a whole number, 0 or more.');
  }
  const dir = positionals[0] ?? config.dir ?? 'out';
  delete (options as PreflightConfig).dir;
  delete (options as PreflightConfig).maxProblems;

  const result = preflight(dir, options);
  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.pages.length === 0) {
    process.stdout.write(`No HTML pages found in ${dir} (${result.ignored.length} ignored). Did the build finish?\n`);
  } else {
    process.stdout.write(formatReport(result, maxProblems));
  }
  return result.problems.length > 0 || result.pages.length === 0 ? 1 : 0;
}

function parseExcludes(values: string[]): Partial<Record<CheckName, string[]>> {
  const exclude: Partial<Record<CheckName, string[]>> = {};
  for (const value of values) {
    const at = value.indexOf('=');
    const check = value.slice(0, Math.max(at, 0)) as CheckName;
    if (at < 1 || !CHECK_NAMES.includes(check)) {
      throw new UsageError(
        `--exclude expects check=pattern with a check from: ${CHECK_NAMES.join(', ')}. Got "${value}".`,
      );
    }
    (exclude[check] ??= []).push(value.slice(at + 1));
  }
  return exclude;
}

function parseCommandLine(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'expect-noindex': { type: 'boolean' },
      'forbid-noindex': { type: 'boolean' },
      'legacy-urls': { type: 'string' },
      'require-jsonld': { type: 'string', multiple: true },
      skip: { type: 'string', multiple: true },
      ignore: { type: 'string', multiple: true },
      exclude: { type: 'string', multiple: true },
      'share-tags': { type: 'string' },
      'trailing-slash': { type: 'string' },
      redirects: { type: 'string' },
      'site-url': { type: 'string' },
      'no-clean-urls': { type: 'boolean' },
      'max-problems': { type: 'string' },
      config: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError || error instanceof PreflightError) {
    process.stderr.write(`static-preflight: ${error.message}\n`);
    if (error instanceof UsageError) process.stderr.write('Run static-preflight --help for usage.\n');
    process.exitCode = 2;
  } else {
    throw error;
  }
}
