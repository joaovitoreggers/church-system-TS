import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  RUNTIME_DATABASE_URL: z.string().min(1, 'RUNTIME_DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatória'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET precisa ter pelo menos 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET precisa ter pelo menos 16 caracteres'),
  // Object storage (Sprint 2) — qualquer S3-compatible (MinIO em dev/EasyPanel,
  // S3 de verdade se um dia precisar). Nunca disco local — ver
  // media/object-storage.service.ts.
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT é obrigatória'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY é obrigatória'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY é obrigatória'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET é obrigatória'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true), // MinIO precisa disso; S3 real não
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Variáveis de ambiente inválidas:\n${parsed.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}
