import { matchesAny } from './glob.ts';
import { CHECK_NAMES } from './types.ts';
import type { CheckName, Problem } from './types.ts';

/** A page, as the checks refer to it. */
export interface PageRef {
  label: string;
  url: string;
}

/** Collects problems, applies per-check page exclusions and merges repeats. */
export interface Reporter {
  /** Records one problem on a page, or a site-wide one when `page` is `null`. */
  add(check: CheckName, page: PageRef | null, message: string): void;
  /** Records a problem that tends to repeat across pages (a broken nav link): reported once with a page count. */
  group(check: CheckName, page: PageRef, message: string): void;
  /** The problems so far, in check order. */
  finish(): Problem[];
}

/** Creates a reporter that drops problems on pages matching `exclude[check]`. */
export function createReporter(exclude: Partial<Record<CheckName, readonly RegExp[]>>): Reporter {
  const problems: Problem[] = [];
  const groups = new Map<string, { check: CheckName; message: string; pages: PageRef[] }>();
  const excluded = (check: CheckName, page: PageRef | null): boolean =>
    page !== null && matchesAny(exclude[check] ?? [], page.url);

  return {
    add(check, page, message) {
      if (!excluded(check, page)) problems.push({ check, page: page?.label ?? null, message });
    },
    group(check, page, message) {
      if (excluded(check, page)) return;
      const key = `${check}\0${message}`;
      const entry = groups.get(key) ?? { check, message, pages: [] };
      entry.pages.push(page);
      groups.set(key, entry);
    },
    finish() {
      const all = [...problems];
      for (const { check, message, pages } of groups.values()) {
        const first = pages[0]?.label ?? null;
        const suffix = pages.length > 1 ? ` (on ${pages.length} pages, e.g. ${first})` : '';
        all.push({ check, page: first, message: `${message}${suffix}` });
      }
      return all
        .map((problem, index) => ({ problem, index }))
        .sort(
          (a, b) => CHECK_NAMES.indexOf(a.problem.check) - CHECK_NAMES.indexOf(b.problem.check) || a.index - b.index,
        )
        .map(({ problem }) => problem);
    },
  };
}
