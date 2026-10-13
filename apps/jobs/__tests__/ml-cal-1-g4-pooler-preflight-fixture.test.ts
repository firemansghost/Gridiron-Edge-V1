/**
 * Fixture-only G4 pooler preflight runner tests (PF-P1–P3, PF-N1–N11 + extras).
 * No DB, credentials, providers, or operator retain root.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  copyPreflightPackageAway,
  createMockPreflightTxAdapter,
  ensureRLocalFsLayout,
  ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA,
  runG4FixturePreflight,
  sealPreflightPackage,
  sealPreflightPackageAsync,
  sha256HexBytes,
  validateG4PreflightPackage,
} from '../lib/ml-cal-1-g4-pooler-preflight-fixture';
import { stableStringify } from '../lib/ml-cal-1-lifecycle-binding';

function tempRoot(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `g4-preflight-${label}-`));
}

function clockAround(dbIso: string): () => Date {
  const dbMs = Date.parse(dbIso);
  let n = 0;
  return () => {
    // Call 0 → preflightStartTime (before db); call 1 → preflightEndTime (after db).
    const offsets = [-2000, 2000, 3000, 4000];
    const off = offsets[Math.min(n, offsets.length - 1)];
    n += 1;
    return new Date(dbMs + off);
  };
}

const DB_TS = '2026-10-13T18:00:05.000Z';

describe('ML-CAL-1 G4 pooler preflight fixture — positives', () => {
  it('PF-P1: mock RepeatableRead → SET RO → metadata → success seal under R-LOCAL-FS layout', async () => {
    const root = tempRoot('p1');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-ok-p1',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    expect(r.terminalSuccess).toBe(true);
    expect(r.liveAccepted).toBe(false);
    expect(r.approved).toBe(false);
    expect(r.fixtureProvenance).toBe(true);
    expect(r.packageDir).toBe(path.join(root, 'preflight', 'preflight-ok-p1'));
    expect(fs.existsSync(path.join(root, 'preflight'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'observations'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'staging'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'review-handoff'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'staging', 'preflight-ok-p1'))).toBe(
      false
    );
    const v = validateG4PreflightPackage(r.packageDir!);
    expect(v.ok).toBe(true);
    expect(v.dbTransactionTime).toBe(DB_TS);
  });

  it('PF-P2: manifest digests match re-hashed staged/published members (copy-away)', async () => {
    const root = tempRoot('p2');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-ok-p2',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    const away = path.join(root, 'review-handoff', 'copy-p2');
    const copy = copyPreflightPackageAway(r.packageDir!, away);
    expect(copy.ok).toBe(true);
    const v = validateG4PreflightPackage(away);
    expect(v.ok).toBe(true);
    expect(v.manifestSha256).toBe(r.packageManifestSha256);
    for (const [name, meta] of Object.entries(r.memberDigests!)) {
      if (name.startsWith('PACKAGE_MANIFEST')) continue;
      const bytes = fs.readFileSync(path.join(away, name));
      expect(bytes.length).toBe(meta.byteCount);
      expect(sha256HexBytes(bytes)).toBe(meta.sha256);
    }
  });

  it('PF-P3: atomic publish leaves staging empty of package dir; package present', async () => {
    const root = tempRoot('p3');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-ok-p3',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(r.packageDir!)).toBe(true);
    const stagingKids = fs.readdirSync(path.join(root, 'staging'));
    expect(stagingKids.every((k) => !k.includes('preflight-ok-p3'))).toBe(
      true
    );
  });
});

describe('ML-CAL-1 G4 pooler preflight fixture — negatives', () => {
  it('PF-N1: wrong isolation aborts; no success package', async () => {
    const root = tempRoot('n1');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-bad-iso',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        isolation: 'read committed',
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('isolation_not_repeatable_read');
    expect(r.terminalSuccess).toBe(false);
    expect(
      fs.existsSync(path.join(root, 'preflight', 'preflight-bad-iso'))
    ).toBe(false);
  });

  it('PF-N2: READ ONLY not on aborts', async () => {
    const root = tempRoot('n2');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-bad-ro',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        readOnly: 'off',
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('transaction_not_read_only');
  });

  it('PF-N3: missing/invalid transaction_timestamp aborts', async () => {
    const root = tempRoot('n3');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-bad-ts',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        malformedMetadata: true,
      }),
      now: () => new Date('2026-10-13T18:00:00.000Z'),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        'isolation_not_repeatable_read',
        'transaction_not_read_only',
        'db_transaction_time_invalid',
      ])
    );
  });

  it('PF-N4: dbTransactionTime outside host bounds aborts', async () => {
    const root = tempRoot('n4');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-oob',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: '2026-10-13T20:00:00.000Z', // after host window
      }),
      now: clockAround(DB_TS), // host around 18:00
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('db_transaction_time_out_of_bounds');
  });

  it('PF-N5: business SELECT is not available on preflight client', async () => {
    const root = tempRoot('n5');
    const adapter = {
      async withRepeatableReadTransaction(fn: (c: unknown) => Promise<unknown>) {
        const client = {
          async setTransactionReadOnly() {},
          async queryTransactionMetadata() {
            return {
              transactionIsolation: 'repeatable read',
              transactionReadOnly: 'on',
              transactionTimestamp: DB_TS,
            };
          },
          async selectTeamSeasonRatings() {
            throw new Error('business_select_forbidden');
          },
        };
        // Runner must not call select — if it did, this would throw.
        await fn(client);
        // Prove select exists but was unused by calling it ourselves for the assertion surface.
        await expect(client.selectTeamSeasonRatings()).rejects.toThrow(
          'business_select_forbidden'
        );
        return undefined;
      },
    };
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-no-select',
      retainRoot: root,
      txAdapter: adapter as never,
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
  });

  it('PF-N6: secretish string in members fail closed', async () => {
    const root = tempRoot('n6');
    ensureRLocalFsLayout(root);
    // Build payload without embedding a literal credential assignment in source.
    const envKey = ['DATABASE', 'URL'].join('_');
    const envVal = ['postgres', '://x:y@h/db'].join('');
    const sealed = sealPreflightPackage({
      retainRoot: root,
      preflightId: 'preflight-secret',
      sealedAt: DB_TS,
      members: {
        'preflight-run-metadata.json': Buffer.from(
          `${stableStringify({ [envKey]: envVal })}\n`,
          'utf8'
        ),
        'preflight-tx-evidence.json': Buffer.from('{}\n', 'utf8'),
        'design-correspondence.json': Buffer.from('{}\n', 'utf8'),
        'PROVENANCE.json': Buffer.from(
          `${stableStringify({ fixtureProvenance: true })}\n`,
          'utf8'
        ),
      },
    });
    expect(sealed.ok).toBe(false);
    if (sealed.ok) throw new Error('expected seal failure');
    expect(sealed.reasons.some((x) => x.includes('secretish'))).toBe(true);
  });

  it('PF-N7: overwrite existing preflightId rejected', async () => {
    const root = tempRoot('n7');
    const first = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-dup',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(first.ok).toBe(true);
    const second = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-dup',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(second.ok).toBe(false);
    expect(second.reasons).toContain('preflight_package_exists');
  });

  it('PF-N8: unsafe preflightId rejected before write', async () => {
    const root = tempRoot('n8');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: '../escape',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('unsafe_preflight_id');
    expect(fs.existsSync(path.join(root, 'preflight', '..'))).toBe(true); // parent exists
    // No package written under escaped path outside root
    const outside = path.join(root, '..', 'escape');
    // ensure we didn't create a package named escape beside root via traversal in retain tree
    expect(fs.existsSync(path.join(root, 'preflight', '..', 'escape'))).toBe(
      false
    );
    void outside;
  });

  it('PF-N9: usability gate fail refuses before TX', async () => {
    const root = tempRoot('n9');
    // Make staging a file so layout cannot create staging dir properly
    fs.writeFileSync(path.join(root, 'staging'), 'not-a-dir');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-unusableroot',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('retain_destination_unusable');
  });

  it('PF-N10: seal into observations tree rejected', () => {
    const root = tempRoot('n10');
    ensureRLocalFsLayout(root);
    const sealed = sealPreflightPackage({
      retainRoot: root,
      preflightId: 'preflight-wrong-tree',
      sealedAt: DB_TS,
      subtree: 'observations',
      members: {
        'preflight-run-metadata.json': Buffer.from('{}\n'),
        'preflight-tx-evidence.json': Buffer.from('{}\n'),
        'design-correspondence.json': Buffer.from('{}\n'),
        'PROVENANCE.json': Buffer.from(
          `${stableStringify({ fixtureProvenance: true })}\n`
        ),
      },
    });
    expect(sealed.ok).toBe(false);
    if (sealed.ok) throw new Error('expected seal failure');
    expect(sealed.reasons).toContain('wrong_subtree_observations');
    expect(
      fs.existsSync(path.join(root, 'observations', 'preflight-wrong-tree'))
    ).toBe(false);
  });

  it('PF-N11: handoff copy digest mismatch → handoff invalid', async () => {
    const root = tempRoot('n11');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-handoff',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    const away = path.join(root, 'review-handoff', 'bad-copy');
    const copy = copyPreflightPackageAway(r.packageDir!, away);
    expect(copy.ok).toBe(true);
    // Tamper handoff copy
    fs.appendFileSync(
      path.join(away, 'preflight-run-metadata.json'),
      ' '
    );
    const v = validateG4PreflightPackage(away);
    expect(v.ok).toBe(false);
    expect(v.reasons.some((x) => x.includes('digest_mismatch'))).toBe(true);
    // Original sealed package still validates
    expect(validateG4PreflightPackage(r.packageDir!).ok).toBe(true);
  });
});

describe('ML-CAL-1 G4 pooler preflight fixture — extras', () => {
  it('live mode refused by default', async () => {
    const root = tempRoot('live');
    const r = await runG4FixturePreflight({
      mode: 'live',
      preflightId: 'preflight-live',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('live_mode_refused');
  });

  it('concurrent publication of same ID: exactly one winner', async () => {
    const root = tempRoot('race');
    ensureRLocalFsLayout(root);
    const mkMembers = () => ({
      'preflight-run-metadata.json': Buffer.from(
        `${stableStringify({
          terminalSuccess: true,
          liveAccepted: false,
          businessDataWrites: 0,
          providerCalls: 0,
          transactionIsolation: 'repeatable read',
          transactionReadOnly: 'on',
          dbTransactionTime: DB_TS,
          preflightStartTime: '2026-10-13T18:00:00.000Z',
          preflightEndTime: '2026-10-13T18:00:10.000Z',
        })}\n`
      ),
      'preflight-tx-evidence.json': Buffer.from('{}\n'),
      'design-correspondence.json': Buffer.from(
        `${stableStringify({ designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256 })}\n`
      ),
      'PROVENANCE.json': Buffer.from(
        `${stableStringify({
          fixtureProvenance: true,
          liveAccepted: false,
          deployedPoolerProof: false,
        })}\n`
      ),
    });
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map(() =>
        sealPreflightPackageAsync({
          retainRoot: root,
          preflightId: 'preflight-race',
          sealedAt: DB_TS,
          members: mkMembers(),
        })
      )
    );
    const wins = results.filter((x) => x.ok);
    const losses = results.filter(
      (x): x is { ok: false; reasons: string[] } => !x.ok
    );
    expect(wins.length).toBe(1);
    expect(losses.length).toBe(4);
    expect(
      losses.every((l) => l.reasons.includes('preflight_package_exists'))
    ).toBe(true);
  });

  it('symlink/junction path escape: no writes outside test root', async () => {
    const root = tempRoot('symlink');
    ensureRLocalFsLayout(root);
    const outside = tempRoot('outside-target');
    const linkPath = path.join(root, 'preflight', 'escape-link');
    let linked = false;
    try {
      fs.symlinkSync(outside, linkPath, 'junction');
      linked = true;
    } catch {
      // Platform may block junctions — skip soft
      linked = false;
    }
    if (!linked) {
      // Still prove unsafe id / path escape refusal
      const r = await runG4FixturePreflight({
        mode: 'fixture',
        preflightId: 'preflight..evil',
        retainRoot: root,
        txAdapter: createMockPreflightTxAdapter({
          transactionTimestamp: DB_TS,
        }),
        now: clockAround(DB_TS),
      });
      expect(r.ok).toBe(false);
      expect(r.reasons).toContain('unsafe_preflight_id');
      return;
    }
    // Attempt to treat symlink as package destination by sealing id that resolves via link
    // Our seal uses mkdir under preflight/<id> — use id that is the link name
    const sealed = sealPreflightPackage({
      retainRoot: root,
      preflightId: 'escape-link',
      sealedAt: DB_TS,
      members: {
        'preflight-run-metadata.json': Buffer.from('{}\n'),
        'preflight-tx-evidence.json': Buffer.from('{}\n'),
        'design-correspondence.json': Buffer.from('{}\n'),
        'PROVENANCE.json': Buffer.from(
          `${stableStringify({ fixtureProvenance: true })}\n`
        ),
      },
    });
    // Must fail closed (exists as symlink or path escape / exists)
    expect(sealed.ok).toBe(false);
    // Outside target must remain empty of package members
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('adapter failure/timeout and malformed metadata fail closed', async () => {
    const root = tempRoot('adapter');
    const timeout = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-timeout',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        timeoutBeforeMetadata: true,
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(timeout.ok).toBe(false);
    expect(timeout.reasons.some((x) => x.includes('adapter_failed'))).toBe(
      true
    );

    const openFail = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-openfail',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        failOnTransactionOpen: true,
      }),
      now: clockAround(DB_TS),
    });
    expect(openFail.ok).toBe(false);
  });

  it('tampered sealed metadata with regenerated self-hashes still fails validation', async () => {
    const root = tempRoot('tamper');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-tamper',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    const pkg = r.packageDir!;
    const metaPath = path.join(pkg, 'preflight-run-metadata.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.liveAccepted = true;
    meta.deployedPoolerProof = true;
    const newBytes = Buffer.from(`${stableStringify(meta)}\n`, 'utf8');
    fs.writeFileSync(metaPath, newBytes);
    // Regenerate consistent self-hashes in manifest
    const manifestPath = path.join(pkg, 'PACKAGE_MANIFEST.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.memberDigests['preflight-run-metadata.json'] = {
      sha256: sha256HexBytes(newBytes),
      byteCount: newBytes.length,
    };
    manifest.liveAccepted = true;
    const manifestBytes = Buffer.from(`${stableStringify(manifest)}\n`, 'utf8');
    fs.writeFileSync(manifestPath, manifestBytes);
    fs.writeFileSync(
      path.join(pkg, 'PACKAGE_MANIFEST.sha256'),
      `${sha256HexBytes(manifestBytes)}\n`
    );
    const v = validateG4PreflightPackage(pkg);
    expect(v.ok).toBe(false);
    expect(
      v.reasons.some(
        (x) =>
          x.includes('live_accepted') ||
          x.includes('fixture_cannot_become_live')
      )
    ).toBe(true);
  });

  it('fixture evidence cannot become deployed/live acceptance', async () => {
    const root = tempRoot('fixture-live');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-fixture-live',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    expect(r.liveAccepted).toBe(false);
    const prov = JSON.parse(
      fs.readFileSync(path.join(r.packageDir!, 'PROVENANCE.json'), 'utf8')
    );
    expect(prov.deployedPoolerProof).toBe(false);
    expect(prov.fixtureProvenance).toBe(true);
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(r.packageDir!, 'PACKAGE_MANIFEST.json'),
        'utf8'
      )
    );
    expect(manifest.schemaVersion).toBe(ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA);
    expect(manifest.liveAccepted).toBe(false);
    expect(manifest.approved).toBe(false);
  });

  it('missing/invalid terminal success cannot qualify a package', async () => {
    const root = tempRoot('term');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-term',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    const pkg = r.packageDir!;
    const metaPath = path.join(pkg, 'preflight-run-metadata.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    delete meta.terminalSuccess;
    const newBytes = Buffer.from(`${stableStringify(meta)}\n`, 'utf8');
    fs.writeFileSync(metaPath, newBytes);
    const manifestPath = path.join(pkg, 'PACKAGE_MANIFEST.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.memberDigests['preflight-run-metadata.json'] = {
      sha256: sha256HexBytes(newBytes),
      byteCount: newBytes.length,
    };
    manifest.terminalSuccess = false;
    const manifestBytes = Buffer.from(`${stableStringify(manifest)}\n`, 'utf8');
    fs.writeFileSync(manifestPath, manifestBytes);
    fs.writeFileSync(
      path.join(pkg, 'PACKAGE_MANIFEST.sha256'),
      `${sha256HexBytes(manifestBytes)}\n`
    );
    const v = validateG4PreflightPackage(pkg);
    expect(v.ok).toBe(false);
    expect(
      v.reasons.some((x) => x.includes('terminal_success'))
    ).toBe(true);
  });

  it('failOnSetReadOnly aborts without success package', async () => {
    const root = tempRoot('setro');
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-setro',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        failOnSetReadOnly: true,
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(false);
    expect(
      fs.existsSync(path.join(root, 'preflight', 'preflight-setro'))
    ).toBe(false);
  });
});
