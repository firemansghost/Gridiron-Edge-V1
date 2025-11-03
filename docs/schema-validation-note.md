# Schema Validation Note

## Issue Encountered

When modifying Prisma schema, **models must be defined before they are referenced in relations**.

### What Happened

**Commit 1 (Failed):**
- Added relations `teamSeasonTalent` and `teamClassCommits` to `Team` model
- Models `TeamSeasonTalent` and `TeamClassCommits` were not yet defined
- Prisma validation failed: `Type "TeamSeasonTalent" is neither a built-in type, nor refers to another model`

**Commit 2 (Succeeded):**
- Added model definitions for `TeamSeasonTalent` and `TeamClassCommits`
- Prisma validation passed

### Solution

When adding new models with relations:

1. **Define models first** (or use forward references if supported)
2. **Add relations after** model definitions

### Best Practice

When splitting commits for a schema change:
- Option A: Single commit with both models and relations
- Option B: If splitting, ensure models are defined before relations are added

### Workflow Trigger

The `prisma-migrate.yml` workflow automatically runs on pushes to `main` that modify `prisma/**` files, and runs:
- `prisma migrate status`
- `prisma migrate deploy`
- `prisma generate` (optional, but will fail if schema invalid)

This workflow caught the issue immediately, preventing invalid schema from being deployed.

