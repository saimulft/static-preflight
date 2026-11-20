/** Thrown for bad options, a missing folder or an unreadable input file, as opposed to problems found in a site. */
export class PreflightError extends Error {
  override name = 'PreflightError';
}
