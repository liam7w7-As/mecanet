/** A short server-only description for hosts that display just the log message. */
export function errorDiagnostic(error: unknown): string {
  if (!(error instanceof Error)) return 'Error no identificado';
  const firstLine = (value: string): string => value.split(/[\r\n]/, 1)[0].slice(0, 400).replace(/\p{Cc}/gu, ' ');
  const database = 'parent' in error && typeof error.parent === 'object' && error.parent !== null
    ? error.parent : null;
  const databaseCode = database && 'code' in database && typeof database.code === 'string'
    && /^[A-Z0-9_]{1,64}$/.test(database.code) ? `/${database.code}` : '';
  return `${firstLine(error.name || 'Error')}${databaseCode}: ${firstLine(error.message)}`;
}
