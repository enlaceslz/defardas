/** Demo authentication is only available without a configured persistent database. */
export function isLocalDemoEnvironment(): boolean {
  const environment = process.env.NODE_ENV;
  return !process.env.DATABASE_URL &&
    (environment === undefined || environment === 'development' || environment === 'test');
}
