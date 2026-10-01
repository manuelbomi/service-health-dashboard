import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(
    'DATABASE_URL',
    'postgres://shd_user:shd_pass@localhost:55433/service_health'
  ),
  simulatorIntervalMs: Number(process.env.SIMULATOR_INTERVAL_MS ?? 1500),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
