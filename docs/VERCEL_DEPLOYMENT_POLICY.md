# Vercel Deployment Hygiene Policy

**Status:** Proposed source-of-truth policy  
**Created:** 2026-09-04  
**Initial target:** Gridiron Edge, then reuse/adapt for other Vercel-hosted GrayGhost Labs projects

## 1. Why this policy exists

A Vercel audit on 2026-09-04 found that the development workflow was creating far more deployments than the applications actually required.

Approximate seven-day deployment counts from the audit:

| Project | Deployments |
|---|---:|
| Gridiron Edge | 113 |
| Ghost Allocator | 63 |
| GhostGauge / btc-risk-dashboard-v3 | 14 |
| Ace Suppressor | 13 |
| Trend100 | 5 |

Gridiron Edge and Ghost Allocator accounted for roughly 82% of the observed deployment volume.

The problem was not normal application size. The primary problem was **deployment amplification**:

- feature branch commit -> Preview deployment
- audit repair -> another Preview deployment
- documentation repair -> another Preview deployment
- closeout/status documentation -> another Preview deployment
- PR merge -> Production deployment
- repeat

Many documentation-only or operator-record changes were causing a complete Next.js/Vercel build even though no runtime behavior changed.

This policy exists to preserve the existing review/audit discipline **without making Vercel rebuild the application for changes that cannot affect the deployed application**.

---

## 2. Core principle

> **Deploy runtime changes. Do not deploy bookkeeping.**

A commit or PR may be important to the repository without being relevant to the deployed web application.

Vercel deployment decisions must therefore be based on **changed paths and runtime relevance**, not on whether a commit is important, whether it was merged to `main`, or whether its message contains a special phrase.

---

## 3. Safety rule: fail open to BUILD

The deployment filter must always be conservative.

If the filter cannot prove that **every changed file** is non-runtime, the result must be:

**BUILD**

This means:

- unknown path -> BUILD
- missing comparison SHA -> BUILD
- Git/diff error -> BUILD
- ambiguous classification -> BUILD
- change to the deployment-filter script itself -> BUILD
- change to Vercel/Next/package/runtime configuration -> BUILD

It is acceptable to perform an unnecessary build.

It is **not** acceptable to skip a build that should have happened.

---

## 4. Initial safe-skip scope

The first rollout should be intentionally narrow.

For Gridiron Edge, a Vercel build may be skipped only when **all changed files** are in the approved non-runtime set:

- `docs/**`
- `README.md`
- `SEASON_STATUS.md`
- `WORKFLOW_DISABLE_REPORT.md`
- `.cursor/rules/**`

Everything else builds by default.

### Important

Do **not** initially skip these categories merely because they look like research or data:

- `research/**`
- `data/**`
- `artifacts/**`
- `*.json`
- `*.csv`
- `*.yaml` / `*.yml`
- `prisma/**`
- `.github/workflows/**`
- scripts
- generated files

Some of those files may feed runtime behavior, production jobs, build-time logic, or future workflows. They may be added to the safe-skip set later only after a repo-specific dependency audit proves they are not consumed by the deployed application.

---

## 5. Changes that always require a build

The following are runtime-relevant or must be treated as runtime-relevant unless proven otherwise:

- `apps/**`
- `app/**`
- `pages/**`
- `src/**`
- `components/**`
- runtime `lib/**`
- API routes
- middleware
- public/static assets used by the application
- `package.json`
- lockfiles
- `next.config.*`
- `vercel.json`
- environment-variable wiring
- Prisma schema or migrations
- database-facing runtime code
- build scripts
- deployment scripts
- the Vercel ignored-build script itself
- any file imported, loaded, read, copied, or bundled by the deployed application

This list is illustrative, not exhaustive.

Unknown means BUILD.

---

## 6. Commit messages are not deployment controls

Do not use commit-message text as the primary Vercel deployment decision.

In particular:

- `[skip ci]` may affect GitHub Actions or other CI behavior.
- It must **not** be assumed to stop Vercel Git deployments.
- `docs:`, `chore:`, `research:`, or similar prefixes do not prove that a change is non-runtime.
- A commit-message-only filter is prohibited.

The changed files are the authority.

---

## 7. Approved implementation pattern

Use Vercel's **Ignored Build Step** with a repository-owned script.

Recommended command in Vercel Project Settings -> Git -> Ignored Build Step:

```bash
bash scripts/vercel-ignore-build.sh
```

The script contract is:

- exit `0` -> Vercel skips the build
- exit `1` -> Vercel proceeds with the build

The repository script must:

1. Compare the deploying commit against Vercel's previous deployed SHA.
2. Enumerate every changed file.
3. Skip only when every changed file is in the explicit safe-skip allowlist.
4. Build on any uncertainty or error.
5. Print a short reason explaining BUILD vs SKIP.

Do not invert this behavior.

---

## 8. Rollout sequence

### Stage 1 — Gridiron Edge

1. Add this policy.
2. Add `.cursor/rules/vercel-deployment-hygiene.mdc`.
3. Add `scripts/vercel-ignore-build.sh`.
4. Review the three files in a normal PR.
5. Merge normally. The implementation change itself should receive a normal build.
6. Configure Vercel's Ignored Build Step to:
   `bash scripts/vercel-ignore-build.sh`
7. Run two controlled tests:
   - docs-only change -> Vercel must show **Skipped / Ignored Build Step**
   - trivial runtime/code change -> Vercel must perform a normal build
8. Do not broaden the allowlist until both behaviors are verified.

### Stage 2 — Ghost Allocator

Reuse the same pattern, but create a repo-specific safe-skip allowlist after checking which documentation/research files are runtime-consumed.

### Stage 3 — GhostGauge

Apply the same changed-path rule.

Do not rely on `[skip ci]` to suppress Vercel. Automated artifact/research commits should be classified by path and dependency truth.

### Stage 4 — Trend100 / Ace Suppressor

Audit repeated deployment triggers and automation behavior before copying a broader skip policy.

---

## 9. PR / agent operating rule

For every PR that touches a Vercel-hosted project, the implementation agent should be able to state one of these:

- **Vercel expected: BUILD** — runtime or unclassified files changed.
- **Vercel expected: SKIP** — every changed file is within the approved non-runtime allowlist.

If the answer is unclear:

**BUILD**

This classification is informational. It must never be used to bypass tests, review, migration guards, or production safety gates.

---

## 10. Things this policy does NOT change

This policy does not authorize:

- disabling Preview deployments globally
- disabling Production deployments
- changing the production branch
- bypassing PR review
- weakening CI
- changing database migration policy
- changing production writer controls
- changing model/research contracts
- deleting deployment history
- changing Vercel retention settings
- promoting previews manually
- using commit messages to suppress deployment
- broadening the safe-skip set without review

The objective is narrower:

> Preserve the engineering workflow while preventing clearly non-runtime changes from producing redundant Vercel builds.

---

## 11. Future expansion rule

A new path may be added to the safe-skip allowlist only when all of the following are true:

1. The path is not imported by runtime code.
2. The path is not read at build time.
3. The path is not copied into the deployed artifact.
4. The path does not affect database/schema state.
5. The path does not affect environment/deployment configuration.
6. The path does not control a production workflow whose change should be validated by a site build.
7. A code/runtime change still demonstrably triggers a normal Vercel build after the allowlist change.

Document the reason when expanding the allowlist.

---

## 12. Success criteria

The deployment-hygiene repair is successful when:

- documentation-only PR iterations stop creating full Vercel builds
- runtime PR iterations continue receiving Preview deployments
- runtime merges to `main` continue receiving Production deployments
- the filter fails safely to BUILD on uncertainty
- no runtime deployment is skipped because of a commit-message convention
- Vercel deployment volume materially falls without changing the development/review process

The target is **not zero deployments**.

The target is **one deployment for every change that actually needs one**.
