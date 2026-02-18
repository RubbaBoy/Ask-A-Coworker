import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  PORT: z.coerce.number().default(3978),
  MICROSOFT_APP_ID: z.string().min(1, 'MICROSOFT_APP_ID is required'),
  MICROSOFT_APP_PASSWORD: z.string().min(1, 'MICROSOFT_APP_PASSWORD is required'),
  MICROSOFT_APP_TENANT_ID: z.string().min(1, 'MICROSOFT_APP_TENANT_ID is required'),
  MICROSOFT_APP_TYPE: z.string().default('SingleTenant'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  MCP_AUTH_REQUIRED: z.coerce.boolean().default(true),
  DEFAULT_TIMEOUT_MINUTES: z.coerce.number().default(5),
  MAX_TIMEOUT_MINUTES: z.coerce.number().default(60)
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
