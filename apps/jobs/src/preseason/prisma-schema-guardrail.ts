/**
 * Pure helpers for Prisma Schema Guardrails path classification.
 * Used by static tests — no git/network.
 */

export interface PrismaGuardrailClassification {
  schemaChanged: boolean;
  migrationChanged: boolean;
  /** false when schema changed without any prisma/migrations/* path */
  guardrailPasses: boolean;
}

export function classifyPrismaGuardrailChanges(
  changedFiles: string[]
): PrismaGuardrailClassification {
  const normalized = changedFiles
    .map((f) => f.trim().replace(/\\/g, '/'))
    .filter(Boolean);

  const schemaChanged = normalized.some((f) => f === 'prisma/schema.prisma');
  const migrationChanged = normalized.some((f) =>
    f.startsWith('prisma/migrations/')
  );

  return {
    schemaChanged,
    migrationChanged,
    guardrailPasses: !(schemaChanged && !migrationChanged),
  };
}
