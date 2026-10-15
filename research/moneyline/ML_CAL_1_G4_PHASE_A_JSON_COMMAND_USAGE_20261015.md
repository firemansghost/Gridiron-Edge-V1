# ML-CAL-1 G4 Phase A — JSON Command Usage (Setup Capture + Anchored Evaluate)

Date: 2026-10-15 (America/Chicago)  
Source head (accepted #256): `2cb61034d78d1875b46fd60575819145d1aa9388`  
Entrypoint: `apps/jobs/run-ml-cal-1-g4-phase-a-json-command.ts`  
Helper: `apps/jobs/lib/ml-cal-1-g4-phase-a-json-command.ts`  
Kind: `ml-cal-1-g4-phase-a-json-command-v1`

Accepted Phase A library/CLI bytes are unchanged. This surface calls exported functions only.

## Modes (mutually exclusive)

| `--command=` | Behavior |
| --- | --- |
| `setup` | Mutating setup (accepted library) + complete JSON result capture |
| `evaluate` | Read-only anchored evaluation — **never** calls setup |

Rejects unknown, duplicate, and conflicting flags before either operation. Malformed/disabled setup: **no** clock/FS activity and **no** capture reservation.

## Output channels

Require at least one:

- `--json-stdout=true` — emit exactly one UTF-8 JSON object to stdout
- `--json-capture-file=<abs>` — exclusive create (`wx`) **before** setup/evaluate; write through reserved descriptor; readback verify

When both are requested: identical bytes; **capture primary** (write capture first, then stdout). Exit 0 only if every requested channel succeeds **and** the operation succeeds. Diagnostics on stderr. No legacy usage text mixed into JSON.

Capture file rules:

- Absolute path; parent must already exist (no parent mkdir)
- Outside the entire bound operator **USER** root for setup (not merely outside `ml-cal-1\g4`)
- For evaluate: **both** receipt and final-evidence paths must exist before any capture reservation (missing inputs refuse with structured diagnostics and zero capture creation, even if the capture path points inside an existing G4 tree). Existing paths are then resolved to **physical** identities; symlink/junction components are rejected; physical g4 / parent roots are protected (blocks directory-symlink alias bypasses)
- Reject symlink/junction ancestors on capture; fail closed on unresolved identity
- Never truncate/overwrite an existing file
- Stdout delivery loops until every UTF-8 byte is written; partial/zero-progress writes are failures
- Diagnostic fallback is exception-safe and does **not** retry a throwing stdout writer
- Node `lstat`/`realpath` only — **W5–W9 UNPROVEN**

## A. Setup with JSON capture (temp example — executable locally)

```powershell
# TEMP-ONLY EXAMPLE — disposable roots under the process temp directory.
# NOT an operator-root run. Operator mode remains NOT EXECUTED without separate authority.

$wt = 'C:\Users\Bobby\gridiron-edge-v1\Gridiron-Edge-V1-ml-cal-1-g4-phase-a-retention-setup'
Set-Location -LiteralPath $wt

$userRoot = Join-Path $env:TEMP ("g4-phase-a-json-demo-" + [guid]::NewGuid().ToString('N'))
$capDir = Join-Path $env:TEMP ("g4-phase-a-json-cap-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $userRoot | Out-Null
New-Item -ItemType Directory -Path $capDir | Out-Null
$capture = Join-Path $capDir 'setup-result.json'

node .\node_modules\tsx\dist\cli.mjs `
  .\apps\jobs\run-ml-cal-1-g4-phase-a-json-command.ts `
  --command=setup `
  --enabled=true `
  --confirm-setup=true `
  --mode=temp `
  --destination="$userRoot" `
  --expected-destination="$userRoot" `
  --probe-id='phasea-json-demo-probe' `
  --handoff-id='phasea-json-demo-handoff' `
  --json-capture-file="$capture"
```

Exit **0** only when operation succeeds (`operationOk`) and every requested output channel is verified. In-memory result may set `ok=true` / `outputOk=true` after verification.

**Durable JSON always keeps `ok=false` and `outputOk=false`** (F3). Use `operationOk` / `setupSucceeded` in the file plus process exit 0 for command success. Surviving failure payloads must not independently claim completed command success.

If setup succeeds but capture fails: `setupSucceeded=true` / `operationOk=true`, command `ok=false`, exit nonzero; **no automatic retry**; sealed receipt is not invalidated by this command. Structured diagnostics always reach the entrypoint (F4).

## B. Read-only anchored evaluate

Caller must supply **both** expected SHA-256 digests **and** positive integer byte counts. Digests are never discovered from colocated files.

```powershell
# After a temp setup, using values from the setup JSON / independently retained anchors.
# Replace digests/counts/paths with caller-retained values.

node .\node_modules\tsx\dist\cli.mjs `
  .\apps\jobs\run-ml-cal-1-g4-phase-a-json-command.ts `
  --command=evaluate `
  --receipt-path='<abs PHASE_A_SETUP_RECEIPT-….json>' `
  --final-evidence-path='<abs ….final-evidence.json>' `
  --expected-receipt-sha256='<64 hex>' `
  --expected-receipt-byte-count='<positive int>' `
  --expected-final-evidence-sha256='<64 hex>' `
  --expected-final-evidence-byte-count='<positive int>' `
  --json-stdout=true
```

Exit **0** only when internal consistency, `terminalSuccess`, `externallyAnchored`, both byte-count checks, stable reread, and output succeed.

Anchored evaluation does **not** grant research approval or Windows destination certification. Independence of caller-supplied pins is the caller's responsibility.

## Operator example — NOT EXECUTED / SUBJECT TO SEPARATE AUTHORITY

```powershell
# NOT EXECUTED — SUBJECT TO SEPARATE AUTHORITY
# Destination remains PROPOSED/UNVERIFIED. W4 and W5–W9 outstanding (not implemented/waived here).

node .\node_modules\tsx\dist\cli.mjs `
  .\apps\jobs\run-ml-cal-1-g4-phase-a-json-command.ts `
  --command=setup `
  --enabled=true `
  --confirm-setup=true `
  --mode=operator `
  --destination='C:\Users\Bobby\GridironResearchEvidence' `
  --expected-destination='C:\Users\Bobby\GridironResearchEvidence' `
  --probe-id='phasea-setupprobe-YYYYMMDDx' `
  --handoff-id='phasea-handoff-YYYYMMDDx' `
  --json-capture-file='C:\Users\Bobby\AppData\Local\Temp\phase-a-setup-capture.json'
```

Capture path must remain **outside** `C:\Users\Bobby\GridironResearchEvidence` (entire USER root).

## Outstanding (unchanged by this task)

| Gate | Status |
| --- | --- |
| W4 pre-mutation ID conflict | Outstanding — not implemented; mid/post no-overwrite only in #256 |
| W5–W9 physical/volume/cloud/ACL | Outstanding — not implemented; not waived |
| Operator root | `C:\Users\Bobby\GridironResearchEvidence` **PROPOSED/UNVERIFIED** |
| Runner retainRoot | would be `...\ml-cal-1\g4` |
| Live research | **BLOCKED** |
| W6 chronology | **UNRESOLVED** |

## Sample envelopes (illustrative)

Success setup (truncated):

```json
{
  "kind": "ml-cal-1-g4-phase-a-json-command-v1",
  "command": "setup",
  "ok": true,
  "setupSucceeded": true,
  "outputOk": true,
  "setupInvoked": true,
  "setup": {
    "ok": true,
    "setupReceiptSha256": "…",
    "setupReceiptByteCount": 1234,
    "finalEvidenceSha256": "…",
    "finalEvidenceByteCount": 567,
    "liveAccepted": false,
    "approved": false,
    "deployedPoolerProof": false
  }
}
```

Capture failure after successful setup (truncated):

```json
{
  "kind": "ml-cal-1-g4-phase-a-json-command-v1",
  "command": "setup",
  "ok": false,
  "setupSucceeded": true,
  "outputOk": false,
  "reasons": ["inject_failure_after_setup_before_capture_write"]
}
```
