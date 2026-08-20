import { configSchema, Config } from './config.schema';

export type { Config };

const result = configSchema.safeParse(process.env);
if (!result.success) {
  console.error('Konfigurationsfehler:', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config: Config = result.data;
