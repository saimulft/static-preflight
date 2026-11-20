import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PreflightError } from './errors.ts';
import { CHECK_NAMES } from './types.ts';
import type { PreflightConfig } from './types.ts';

/** The config file name the CLI looks for in the working directory. */
export const CONFIG_FILE = 'static-preflight.config.json';

const KEYS = [
  'dir',
  'maxProblems',
  'skip',
  'noindex',
  'legacyUrls',
  'requireJsonLd',
  'shareTags',
  'trailingSlash',
  'redirectsFile',
  'siteUrl',
  'cleanUrls',
  'ignore',
  'exclude',
] as const;

type Rule = (value: unknown) => boolean;
const isString: Rule = (value) => typeof value === 'string';
const isStrings: Rule = (value) => Array.isArray(value) && value.every(isString);
const isRules: Rule = (value) =>
  Array.isArray(value) &&
  value.every(
    (rule) =>
      isString(rule) ||
      (typeof rule === 'object' &&
        rule !== null &&
        isString((rule as Record<string, unknown>).type) &&
        isString((rule as Record<string, unknown>).pattern)),
  );
const isExclude: Rule = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every(isStrings);

const SHAPES: Record<(typeof KEYS)[number], [Rule, string]> = {
  dir: [isString, 'a string'],
  maxProblems: [(v) => typeof v === 'number' && Number.isInteger(v) && v >= 0, 'a whole number, 0 or more'],
  skip: [isStrings, 'an array of check names'],
  noindex: [(v) => v === 'expect' || v === 'forbid', '"expect" or "forbid"'],
  legacyUrls: [(v) => isString(v) || isStrings(v), 'a file path or an array of URLs'],
  requireJsonLd: [isRules, 'an array of "Type=/pattern" strings or { type, pattern } objects'],
  shareTags: [isStrings, 'an array of strings'],
  trailingSlash: [(v) => v === 'forbid' || v === 'require', '"forbid" or "require"'],
  redirectsFile: [(v) => isString(v) || v === false, 'a file path or false'],
  siteUrl: [isString, 'a URL string'],
  cleanUrls: [(v) => typeof v === 'boolean', 'true or false'],
  ignore: [isStrings, 'an array of page URL patterns'],
  exclude: [isExclude, 'an object mapping check names to arrays of page URL patterns'],
};

/**
 * Reads `static-preflight.config.json` from `cwd` (or the file named by `file`) and validates its shape.
 * Returns `undefined` when there is no default config file. Throws {@link PreflightError} when the file
 * (given or default) is unreadable, is not JSON, has an unknown key or a value of the wrong type.
 *
 * @example
 * const config = loadConfig(process.cwd());
 * const result = preflight(config?.dir ?? 'out', config);
 */
export function loadConfig(cwd: string = process.cwd(), file?: string): PreflightConfig | undefined {
  const target = path.resolve(cwd, file ?? CONFIG_FILE);
  let text: string;
  try {
    text = readFileSync(target, 'utf8');
  } catch (error) {
    if (!file && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new PreflightError(`Cannot read the config file: ${target}`);
  }

  const name = file ?? CONFIG_FILE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PreflightError(`${name} is not valid JSON.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PreflightError(`${name} must contain a JSON object.`);
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (key === '$schema') continue;
    const shape = SHAPES[key as (typeof KEYS)[number]];
    if (!shape) throw new PreflightError(`${name}: unknown option "${key}". Options: ${KEYS.join(', ')}.`);
    if (!shape[0](value)) throw new PreflightError(`${name}: "${key}" must be ${shape[1]}.`);
  }
  const checks = [...CHECK_NAMES] as string[];
  const bad = ((parsed as { skip?: string[] }).skip ?? []).filter((check) => !checks.includes(check));
  if (bad.length)
    throw new PreflightError(`${name}: unknown check in "skip": ${bad.join(', ')}. Checks: ${checks.join(', ')}.`);
  return parsed as PreflightConfig;
}
