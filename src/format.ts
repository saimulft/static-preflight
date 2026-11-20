import { CHECK_NAMES } from './types.ts';
import type { PreflightResult } from './types.ts';

/** The human-readable report: problems grouped by check, capped at `maxProblems` lines (0 for no cap). */
export function formatReport(result: PreflightResult, maxProblems: number): string {
  const counted = `${result.pages.length} ${result.pages.length === 1 ? 'page' : 'pages'}`;
  const legacy = result.checks.includes('legacy-urls') ? ` and ${result.legacyUrls} old URLs` : '';
  if (result.problems.length === 0) return `No problems found. Checked ${counted}${legacy}.\n`;

  const shown = maxProblems > 0 ? result.problems.slice(0, maxProblems) : result.problems;
  const lines: string[] = [];
  for (const check of CHECK_NAMES) {
    const inCheck = shown.filter((problem) => problem.check === check);
    if (inCheck.length === 0) continue;
    const total = result.problems.filter((problem) => problem.check === check).length;
    lines.push(`${check} (${total})`);
    for (const { page, message } of inCheck) lines.push(`  ${page ? `${page}: ` : ''}${message}`);
    lines.push('');
  }
  if (shown.length < result.problems.length) lines.push(`…and ${result.problems.length - shown.length} more.`, '');
  const count = result.problems.length;
  lines.push(`${count} ${count === 1 ? 'problem' : 'problems'} found. Checked ${counted}${legacy}.`);
  return `${lines.join('\n')}\n`;
}
