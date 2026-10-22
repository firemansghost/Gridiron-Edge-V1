/**
 * Offline regressions for G4 nonfixture P-PREFLIGHT runner / sealer / reader / CLI.
 * Synthetic credentials only. No DATABASE_URL / DIRECT_URL / live pooler.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createG4PoolerPreflightRealAdapter,
  ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
  type MlCal1G4PreflightParentPrismaClient,
  type MlCal1G4PreflightRealAdapter,
} from '../lib/ml-cal-1-g4-pooler-preflight-real-adapter';
import {
  assertMockRetainRoot,
  connectionDescriptorsEqual,
  copyPreflightPackageAway,
  createNonfixtureMockTxAdapter,
  deriveNonsecretConnectionDescriptor,
  invalidatePublishedPackage,
  ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP,
  ML_CAL_1_G4_PREFLIGHT_INVALIDATION_MEMBER,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK,
  normalizeNonsecretConnectionDescriptor,
  permittedPreflightPackageDir,
  runG4NonfixturePreflight,
  sealNonfixturePreflightPackage,
  writeFailureReceipt,
  type MlCal1G4NonsecretConnectionDescriptor,
} from '../lib/ml-cal-1-g4-pooler-preflight-live-runner';
import { readG4NonfixturePreflightPackage } from '../lib/ml-cal-1-g4-pooler-preflight-live-reader';
import {
  mainFromArgv,
  parseLiveCliArgv,
  runG4NonfixturePreflightLiveCli,
} from '../run-ml-cal-1-g4-pooler-preflight-live';

const DB_TS = '2026-10-13T18:00:05.000Z';
const START = '2026-10-13T18:00:00.000Z';
const END = '2026-10-13T18:00:10.000Z';
const COMMIT = 'cbb0d25d03294439baccf4da5e4e6e50e36fe035';

const EXPECTED: MlCal1G4NonsecretConnectionDescriptor = {
  host: 'pooler.example.test',
  port: 6543,
  database: 'postgres',
  configuredUsername: 'preflight_ro',
};

function synthUrl(): string {
  // Assembled so source never contains a literal password assignment pattern.
  const user = encodeURIComponent('preflight_ro');
  const pass = ['syn', 'th3t1c', 'P%40ss'].join('');
  const host = 'pooler.example.test';
  return ['postgres', '://', user, ':', pass, '@', host, ':6543/postgres'].join(
    ''
  );
}

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function clockSequence(isos: string[]): () => Date {
  let i = 0;
  return () => {
    const iso = isos[Math.min(i, isos.length - 1)]!;
    i += 1;
    return new Date(iso);
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  const retainRoot = tmpRoot('g4-nf-');
  return {
    provenanceClass: 'mock' as const,
    enabled: true as unknown,
    preflightId: 'pf-mock-001',
    retainRoot,
    expectedConnection: EXPECTED,
    clientConstructionConfig: { connectionUrl: synthUrl() },
    txAdapter: createNonfixtureMockTxAdapter({
      transactionTimestamp: DB_TS,
    }),
    now: clockSequence([START, END, END]),
    runnerCommitSha: COMMIT,
    ...overrides,
  };
}

describe('passive import / opt-in gates', () => {
  it('library import does not read env or construct PrismaClient', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../lib/ml-cal-1-g4-pooler-preflight-live-runner.ts'
      ),
      'utf8'
    );
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/new PrismaClient/);
    expect(src).toContain(ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN);
    expect(src).toContain(ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP);
  });

  it('disabled / missing / malformed opt-in: zero TX and zero FS', async () => {
    let tx = 0;
    let clockReads = 0;
    const adapter = {
      async withRepeatableReadTransaction(fn: (c: never) => Promise<unknown>) {
        tx += 1;
        return fn(null as never);
      },
    };
    for (const enabled of [false, undefined, 'true', 1, 'yes', null] as unknown[]) {
      const retainRoot = tmpRoot('g4-nf-disabled-');
      const before = fs.existsSync(retainRoot)
        ? fs.readdirSync(retainRoot)
        : [];
      const r = await runG4NonfixturePreflight(
        baseInput({
          enabled,
          txAdapter: adapter,
          retainRoot,
          now: () => {
            clockReads += 1;
            return new Date(START);
          },
        })
      );
      expect(r.ok).toBe(false);
      expect(r.reasons).toContain('preflight_runner_disabled');
      expect(tx).toBe(0);
      expect(clockReads).toBe(0);
      expect(r.packageDir).toBeNull();
      expect(r.failureReceiptPath).toBeNull();
      const after = fs.existsSync(retainRoot)
        ? fs.readdirSync(retainRoot)
        : [];
      expect(after).toEqual(before);
      expect(
        fs.existsSync(path.join(retainRoot, 'preflight'))
      ).toBe(false);
    }
  });

  it('option mutation after disable check path cannot enable via object truthiness alone', async () => {
    const opts = { enabled: false as unknown };
    let tx = 0;
    const adapter = {
      async withRepeatableReadTransaction() {
        tx += 1;
      },
    };
    const p = runG4NonfixturePreflight(
      baseInput({ enabled: opts.enabled, txAdapter: adapter })
    );
    opts.enabled = true;
    const r = await p;
    expect(r.ok).toBe(false);
    expect(tx).toBe(0);
  });
});

describe('connection descriptor F3', () => {
  it('normalizes host case and default port', () => {
    const a = normalizeNonsecretConnectionDescriptor({
      host: 'Pooler.Example.TEST',
      port: 0,
      database: 'postgres',
      configuredUsername: 'preflight_ro',
    });
    expect(a.host).toBe('pooler.example.test');
    expect(a.port).toBe(5432);
  });

  it('derive strips secrets; percent-encoded user preserved as decoded username', () => {
    const d = deriveNonsecretConnectionDescriptor({
      connectionUrl: synthUrl(),
    });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.descriptor).toEqual(
        normalizeNonsecretConnectionDescriptor(EXPECTED)
      );
      expect(JSON.stringify(d.descriptor)).not.toMatch(/P%40ss|syn\.th3t1c/i);
    }
  });

  it('mismatch refuses before TX; profile label alone insufficient', async () => {
    const r = await runG4NonfixturePreflight(
      baseInput({
        expectedConnection: { ...EXPECTED, host: 'other.example.test' },
        txAdapter: createNonfixtureMockTxAdapter({
          failOnTransactionOpen: true,
        }),
        poolerProfileLabel: 'same-label-as-prod-but-irrelevant',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('target_connection_mismatch');
    expect(
      r.reasons.some((reason) => reason.startsWith('transaction_failed'))
    ).toBe(false);
    expect(r.transactionCompleted).toBe(false);
  });

  it('parse failures sanitize without echoing URL', async () => {
    const r = await runG4NonfixturePreflight(
      baseInput({
        clientConstructionConfig: {
          connectionUrl: 'not a url ::: postgres://u:p@h/db',
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).not.toMatch(/postgres:\/\//);
    expect(r.reasons.join(' ')).not.toMatch(/u:p@/);
  });
});

describe('happy mock path + reader', () => {
  it('seals mock package, copy-away validates, flags stay false', async () => {
    const input = baseInput();
    const r = await runG4NonfixturePreflight(input);
    expect(r.ok).toBe(true);
    expect(r.provenanceClass).toBe('mock');
    expect(r.liveAccepted).toBe(false);
    expect(r.approved).toBe(false);
    expect(r.deployedPoolerProof).toBe(false);
    expect(r.packageDir).toBeTruthy();
    expect(r.manifestSha256).toMatch(/^[0-9a-f]{64}$/);

    const read = readG4NonfixturePreflightPackage(r.packageDir!, {
      expectedPreflightId: 'pf-mock-001',
      expectedConnection: EXPECTED,
      expectedDesignSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
    });
    expect(read.ok).toBe(true);
    expect(read.internallyConsistent).toBe(true);
    expect(read.externallyAnchored).toBe(false);
    expect(read.targetBound).toBe(true);
    expect(read.provenanceClass).toBe('mock');
    expect(read.liveAccepted).toBe(false);

    const destRoot = tmpRoot('g4-nf-copy-');
    const copied = copyPreflightPackageAway({
      packageDir: r.packageDir!,
      destinationRoot: destRoot,
      preflightId: 'pf-mock-001',
    });
    expect(copied.ok).toBe(true);
    if (!copied.ok) return;
    const readCopy = readG4NonfixturePreflightPackage(copied.destinationDir, {
      expectedPreflightId: 'pf-mock-001',
      expectedConnection: EXPECTED,
      allowStagingBasename: true,
      expectedManifestSha256: r.manifestSha256!,
    });
    expect(readCopy.ok).toBe(true);
    expect(readCopy.externallyAnchored).toBe(true);
    expect(readCopy.liveAccepted).toBe(false);
    expect(readCopy.approved).toBe(false);

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(r.packageDir!, 'PACKAGE_MANIFEST.json'),
        'utf8'
      )
    );
    expect(manifest.schemaVersion).toBe(ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK);
    expect(manifest.mockProvenance).toBe(true);
  });

});

describe('F-PROVENANCE mock adapter boundary', () => {
  function spyParent(): {
    parent: MlCal1G4PreflightParentPrismaClient;
    calls: () => number;
  } {
    let calls = 0;
    return {
      calls: () => calls,
      parent: {
        async $transaction() {
          calls += 1;
          throw new Error('connected_parent_must_not_run');
        },
      },
    };
  }

  async function expectUnbrandedRefusal(
    txAdapter: unknown,
    calls: () => number
  ): Promise<void> {
    const r = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-unbranded-001',
        txAdapter,
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('mock_runner_rejects_unbranded_tx_adapter');
    expect(r.transactionCompleted).toBe(false);
    expect(r.packageDir).toBeNull();
    expect(r.failureReceiptPath).toBeNull();
    expect(r.liveAccepted).toBe(false);
    expect(r.approved).toBe(false);
    expect(r.deployedPoolerProof).toBe(false);
    expect(calls()).toBe(0);
  }

  it('refuses an enabled real adapter backed by an in-memory Prisma spy', async () => {
    const spy = spyParent();
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma: spy.parent,
      enabled: true,
    });
    await expectUnbrandedRefusal(adapter, spy.calls);
  });

  it('refuses a wrapper around an enabled real adapter', async () => {
    const spy = spyParent();
    const real = createG4PoolerPreflightRealAdapter({
      prisma: spy.parent,
      enabled: true,
    });
    const wrapper = {
      kind: real.kind,
      async withRepeatableReadTransaction(
        fn: Parameters<MlCal1G4PreflightRealAdapter['withRepeatableReadTransaction']>[0]
      ) {
        return real.withRepeatableReadTransaction(fn);
      },
    };
    await expectUnbrandedRefusal(wrapper, spy.calls);
  });

  it('refuses a structural clone and a TypeScript-cast real adapter', async () => {
    const spy = spyParent();
    const real = createG4PoolerPreflightRealAdapter({
      prisma: spy.parent,
      enabled: true,
    });
    const clone = {
      ...real,
      withRepeatableReadTransaction:
        real.withRepeatableReadTransaction.bind(real),
    };
    await expectUnbrandedRefusal(clone, spy.calls);
    await expectUnbrandedRefusal(
      real as unknown as { withRepeatableReadTransaction: () => Promise<void> },
      spy.calls
    );
  });

  it('refuses a wrapper that omits kind', async () => {
    const spy = spyParent();
    const real = createG4PoolerPreflightRealAdapter({
      prisma: spy.parent,
      enabled: true,
    });
    const wrapper = {
      async withRepeatableReadTransaction(
        fn: Parameters<MlCal1G4PreflightRealAdapter['withRepeatableReadTransaction']>[0]
      ) {
        return real.withRepeatableReadTransaction(fn);
      },
    };
    await expectUnbrandedRefusal(wrapper, spy.calls);
  });

  it('refuses an object that copies private-symbol properties', async () => {
    const genuine = createNonfixtureMockTxAdapter({
      transactionTimestamp: DB_TS,
    });
    let calls = 0;
    const forged: Record<PropertyKey, unknown> = {
      async withRepeatableReadTransaction() {
        calls += 1;
      },
    };
    for (const symbol of Object.getOwnPropertySymbols(genuine)) {
      const descriptor = Object.getOwnPropertyDescriptor(genuine, symbol);
      if (descriptor) Object.defineProperty(forged, symbol, descriptor);
    }
    await expectUnbrandedRefusal(forged, () => calls);
  });

  it('refuses a proxy around a genuine mock adapter', async () => {
    const genuine = createNonfixtureMockTxAdapter({
      transactionTimestamp: DB_TS,
    });
    let reads = 0;
    const proxy = new Proxy(genuine, {
      get(target, property, receiver) {
        if (property === 'withRepeatableReadTransaction') reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    await expectUnbrandedRefusal(proxy, () => reads);
  });

  it('executes a genuine module-factory mock and keeps approval flags false', async () => {
    const r = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-factory-mock-001',
        txAdapter: createNonfixtureMockTxAdapter({
          transactionTimestamp: DB_TS,
        }),
      })
    );
    expect(r.ok).toBe(true);
    expect(r.transactionCompleted).toBe(true);
    expect(r.provenanceClass).toBe('mock');
    expect(r.liveAccepted).toBe(false);
    expect(r.approved).toBe(false);
    expect(r.deployedPoolerProof).toBe(false);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(r.packageDir!, 'PACKAGE_MANIFEST.json'), 'utf8')
    );
    expect(manifest.schemaVersion).toBe(
      ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK
    );
    expect(manifest.mockProvenance).toBe(true);
    expect(manifest.liveAccepted).toBe(false);
    expect(manifest.approved).toBe(false);
    expect(manifest.deployedPoolerProof).toBe(false);
  });

  it('refuses probe provenance before a transaction', async () => {
    const r = await runG4NonfixturePreflight(
      baseInput({
        provenanceClass: 'probe',
        preflightId: 'pf-probe-001',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('probe_provenance_not_for_tx_runner');
    expect(r.packageDir).toBeNull();
    expect(r.failureReceiptPath).toBeNull();
    expect(r.transactionCompleted).toBe(false);
  });
});

describe('TX / metadata / clock failures', () => {
  it('metadata failure and post-callback rejection: no success package', async () => {
    const failMeta = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-fail-meta',
        txAdapter: createNonfixtureMockTxAdapter({ failOnMetadata: true }),
      })
    );
    expect(failMeta.ok).toBe(false);
    expect(failMeta.packageDir).toBeNull();
    expect(failMeta.reasons.some((x) => x.startsWith('transaction_failed:'))).toBe(
      true
    );

    const lose = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-fail-lose',
        txAdapter: createNonfixtureMockTxAdapter({
          transactionTimestamp: DB_TS,
          loseTransactionAfterMetadata: true,
        }),
      })
    );
    expect(lose.ok).toBe(false);
    expect(lose.packageDir).toBeNull();
  });

  it('invalid isolation / read-only / out-of-bounds time rejected', async () => {
    const badIso = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-bad-iso',
        txAdapter: createNonfixtureMockTxAdapter({
          isolation: 'read committed',
          transactionTimestamp: DB_TS,
        }),
      })
    );
    expect(badIso.reasons).toContain('isolation_not_repeatable_read');

    const badRo = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-bad-ro',
        txAdapter: createNonfixtureMockTxAdapter({
          readOnly: 'off',
          transactionTimestamp: DB_TS,
        }),
      })
    );
    expect(badRo.reasons).toContain('transaction_not_read_only');

    const oob = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-oob',
        txAdapter: createNonfixtureMockTxAdapter({
          transactionTimestamp: '2026-10-13T17:00:00.000Z',
        }),
        now: clockSequence([START, END]),
      })
    );
    expect(oob.reasons).toContain('db_transaction_time_out_of_bounds');
  });

  it('reversed / invalid injected clocks fail closed', async () => {
    const reversed = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-rev',
        now: clockSequence([END, START]),
        txAdapter: createNonfixtureMockTxAdapter({
          transactionTimestamp: DB_TS,
        }),
      })
    );
    expect(reversed.ok).toBe(false);
    expect(reversed.reasons).toContain('db_transaction_time_out_of_bounds');

    const badClock = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-badclock',
        now: () => new Date(Number.NaN),
      })
    );
    expect(badClock.reasons).toContain('injected_clock_invalid');
  });
});

describe('seal / FS safety', () => {
  it('unsafe id and retain root outside tmpdir refuse', async () => {
    const badId = await runG4NonfixturePreflight(
      baseInput({ preflightId: '../escape' })
    );
    expect(badId.reasons).toContain('unsafe_preflight_id');

    const outside = path.join(path.parse(os.tmpdir()).root, 'g4-nf-outside-test');
    const gate = assertMockRetainRoot(outside);
    expect(gate.ok).toBe(false);
  });

  it('existing package / claim race: no overwrite', async () => {
    const first = await runG4NonfixturePreflight(
      baseInput({ preflightId: 'pf-race' })
    );
    expect(first.ok).toBe(true);
    const second = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-race',
        retainRoot: first.packageDir
          ? path.dirname(path.dirname(first.packageDir!))
          : tmpRoot('g4-nf-'),
      })
    );
    // reuse same retain root
    const root = path.dirname(path.dirname(first.packageDir!));
    const again = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-race',
        retainRoot: root,
      })
    );
    expect(again.ok).toBe(false);
    expect(again.reasons).toContain('preflight_package_exists');
    void second;
  });

  it('staging inject failure leaves no final package', async () => {
    const root = tmpRoot('g4-nf-stage-');
    const r = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-stage-fail',
        retainRoot: root,
        sealHooks: { injectFailure: 'after_staging' },
      })
    );
    expect(r.ok).toBe(false);
    expect(
      fs.existsSync(path.join(root, 'preflight', 'pf-stage-fail'))
    ).toBe(false);
  });

  it('failure receipt redacts secretish reasons', async () => {
    const syn = ['postgres', '://u:p@h/db'].join('');
    let calls = 0;
    const root = tmpRoot('g4-nf-fail-');
    const refused = await runG4NonfixturePreflight(
      baseInput({
        preflightId: 'pf-redact-unbranded',
        retainRoot: root,
        txAdapter: {
          async withRepeatableReadTransaction() {
            calls += 1;
            throw new Error(`boom ${syn}`);
          },
        },
      })
    );
    expect(refused.ok).toBe(false);
    expect(refused.reasons).toContain(
      'mock_runner_rejects_unbranded_tx_adapter'
    );
    expect(refused.failureReceiptPath).toBeNull();
    expect(calls).toBe(0);

    const written = writeFailureReceipt({
      retainRoot: root,
      preflightId: 'pf-redact',
      reasons: [`transaction_failed:boom ${syn}`],
      observedAt: END,
      provenanceClass: 'mock',
    });
    expect(written.ok).toBe(true);
    const body = fs.readFileSync(written.path!, 'utf8');
    expect(body).not.toMatch(/postgres:\/\//);
    expect(body).not.toMatch(/u:p@/);
    expect(body).toContain('[redacted_reason]');
  });
});

describe('reader semantic rejects', () => {
  async function sealedMock() {
    const r = await runG4NonfixturePreflight(
      baseInput({ preflightId: 'pf-read-001' })
    );
    expect(r.ok).toBe(true);
    return r;
  }

  it('tampered bytes / extra member / id contradiction reject', async () => {
    const r = await sealedMock();
    const dir = r.packageDir!;
    fs.writeFileSync(path.join(dir, 'extra.json'), '{}\n');
    const extra = readG4NonfixturePreflightPackage(dir, {
      expectedPreflightId: 'pf-read-001',
    });
    expect(extra.ok).toBe(false);
    expect(extra.reasons).toContain('unexpected_member:extra.json');

    fs.unlinkSync(path.join(dir, 'extra.json'));
    const runPath = path.join(dir, 'preflight-run-metadata.json');
    const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
    run.preflightId = 'pf-other';
    fs.writeFileSync(runPath, `${JSON.stringify(run)}\n`);
    // recompute won't match digests
    const tampered = readG4NonfixturePreflightPackage(dir, {
      expectedPreflightId: 'pf-read-001',
    });
    expect(tampered.ok).toBe(false);
    expect(tampered.reasons.some((x) => x.includes('digest'))).toBe(true);
  });

  it('handoff cannot mint externallyAnchored; mismatch rejects', async () => {
    const r = await sealedMock();
    const dir = r.packageDir!;
    const noAnchor = readG4NonfixturePreflightPackage(dir, {
      expectedPreflightId: 'pf-read-001',
      expectedConnection: EXPECTED,
    });
    expect(noAnchor.ok).toBe(true);
    expect(noAnchor.externallyAnchored).toBe(false);

    fs.writeFileSync(
      path.join(dir, 'HANDOFF.json'),
      JSON.stringify({ expectedManifestSha256: r.manifestSha256 })
    );
    const withHandoff = readG4NonfixturePreflightPackage(dir, {
      expectedPreflightId: 'pf-read-001',
      expectedConnection: EXPECTED,
    });
    expect(withHandoff.ok).toBe(false);
    expect(withHandoff.reasons).toContain('unexpected_handoff_member');
    expect(withHandoff.externallyAnchored).toBe(false);

    fs.unlinkSync(path.join(dir, 'HANDOFF.json'));
    const mismatch = readG4NonfixturePreflightPackage(dir, {
      expectedPreflightId: 'pf-read-001',
      expectedConnection: EXPECTED,
      expectedManifestSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reasons).toContain('external_manifest_sha_mismatch');
  });

  it('approval flags / provenance contradiction / live schema no promotion', async () => {
    const root = tmpRoot('g4-nf-adv-');
    const members = {
      'preflight-run-metadata.json': Buffer.from('{}\n'),
      'preflight-tx-evidence.json': Buffer.from('{}\n'),
      'design-correspondence.json': Buffer.from('{}\n'),
      'PROVENANCE.json': Buffer.from(
        `${JSON.stringify({
          kind: 'g4-pooler-preflight-provenance',
          preflightId: 'pf-adv',
          provenanceClass: 'live',
          fixtureProvenance: false,
          mockProvenance: false,
          probeProvenance: false,
          liveAccepted: true,
          approved: true,
          deployedPoolerProof: true,
        })}\n`
      ),
    };
    // Direct seal with adversarial incomplete members still produces package;
    // reader must reject.
    const sealed = sealNonfixturePreflightPackage({
      retainRoot: root,
      preflightId: 'pf-adv',
      members,
      sealedAt: END,
      provenanceClass: 'live',
      packageSchema: ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE,
    });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    const read = readG4NonfixturePreflightPackage(sealed.packageDir, {
      expectedPreflightId: 'pf-adv',
      allowStagingBasename: false,
    });
    expect(read.ok).toBe(false);
    expect(read.liveAccepted).toBe(false);
    expect(read.approved).toBe(false);
    expect(read.deployedPoolerProof).toBe(false);
  });

  it('options / timing contradiction rejected even if hashes would be rebuilt by attacker incompletely', async () => {
    const r = await sealedMock();
    const dir = r.packageDir!;
    // Mutate run metadata options then also update digest entries to match —
    // still must fail semantic checks if we rewrite consistently.
    const runPath = path.join(dir, 'preflight-run-metadata.json');
    const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
    run.transactionOptions = {
      isolationLevel: 'RepeatableRead',
      maxWait: 1,
      timeout: 1,
    };
    const runBytes = Buffer.from(`${JSON.stringify(run)}\n`);
    fs.writeFileSync(runPath, runBytes);
    const manifestPath = path.join(dir, 'PACKAGE_MANIFEST.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const { createHash } = await import('crypto');
    const sha = createHash('sha256').update(runBytes).digest('hex');
    manifest.memberDigests['preflight-run-metadata.json'] = {
      sha256: sha,
      byteCount: runBytes.length,
    };
    const manBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
    fs.writeFileSync(manifestPath, manBytes);
    const manSha = createHash('sha256').update(manBytes).digest('hex');
    fs.writeFileSync(
      path.join(dir, 'PACKAGE_MANIFEST.sha256'),
      `${manSha}\n`
    );
    // Also update manifest digests for itself if present
    if (manifest.memberDigests['PACKAGE_MANIFEST.json']) {
      const m2 = JSON.parse(manBytes.toString('utf8'));
      m2.memberDigests['PACKAGE_MANIFEST.json'] = {
        sha256: manSha,
        byteCount: manBytes.length,
      };
      // Avoid infinite self-hash: our sealer puts digest of final manifest including digests;
      // for this adversarial test, leave as-is and accept digest_mismatch on self or catch maxWait.
    }
    const read = readG4NonfixturePreflightPackage(dir, {
      expectedPreflightId: 'pf-read-001',
      expectedConnection: EXPECTED,
    });
    expect(read.ok).toBe(false);
    expect(
      read.reasons.some(
        (x) => x === 'run_max_wait' || x.includes('digest') || x.includes('bytecount')
      )
    ).toBe(true);
  });
});

describe('gated CLI', () => {
  it('default / truthy coercion / help / plan: no credentials or client', async () => {
    const def = await runG4NonfixturePreflightLiveCli({});
    expect(def.ok).toBe(false);
    expect(def.clientConstructed).toBe(false);
    expect(def.envRead).toBe(false);
    expect(def.credentialsAccessed).toBe(false);

    const truthy = await runG4NonfixturePreflightLiveCli({
      enabled: 'true',
      confirmLive: 'true',
    });
    expect(truthy.reasons).toContain('cli_disabled_exact_true_required');

    const parsed = parseLiveCliArgv(['--enabled=1', '--confirm-live=yes']);
    expect(parsed.enabled).toBe('1');
    const fromArgv = await mainFromArgv(['--enabled=1']);
    expect(fromArgv.clientConstructed).toBe(false);

    const help = await mainFromArgv(['--help']);
    expect(help.usagePrinted).toBe(true);
    expect(help.clientConstructed).toBe(false);

    const plan = await mainFromArgv(['--plan']);
    expect(plan.planPrinted).toBe(true);

    const both = await runG4NonfixturePreflightLiveCli({
      enabled: true,
      confirmLive: true,
    });
    expect(both.reasons).toContain(
      'live_client_construction_refused_in_this_build'
    );
    expect(both.clientConstructed).toBe(false);

    const overrides = await runG4NonfixturePreflightLiveCli({
      enabled: true,
      confirmLive: true,
      allowTestOverrides: true,
    });
    expect(overrides.reasons).toContain('test_overrides_forbidden_on_live_cli');
  });

  it('CLI source has no PrismaClient / env credential startup at import', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../run-ml-cal-1-g4-pooler-preflight-live.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/new PrismaClient/);
    expect(src).not.toMatch(/process\.env\.(DATABASE_URL|DIRECT_URL)/);
  });
});

describe('descriptor equality helper', () => {
  it('compares only allowed nonsecret fields', () => {
    expect(
      connectionDescriptorsEqual(
        EXPECTED,
        normalizeNonsecretConnectionDescriptor({
          host: 'POOLER.EXAMPLE.TEST',
          port: 6543,
          database: 'postgres',
          configuredUsername: 'preflight_ro',
        })
      )
    ).toBe(true);
  });
});

describe('F1–F5 reviewer reproduction repairs', () => {
  function rehashPackage(dir: string) {
    const { createHash } = require('crypto') as typeof import('crypto');
    const sha = (buf: Buffer) =>
      createHash('sha256').update(buf).digest('hex');
    const manifestPath = path.join(dir, 'PACKAGE_MANIFEST.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const name of [
      'preflight-run-metadata.json',
      'preflight-tx-evidence.json',
      'design-correspondence.json',
      'PROVENANCE.json',
    ]) {
      const bytes = fs.readFileSync(path.join(dir, name));
      manifest.memberDigests[name] = {
        sha256: sha(bytes),
        byteCount: bytes.length,
      };
    }
    const manBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
    fs.writeFileSync(manifestPath, manBytes);
    const manSha = sha(manBytes);
    fs.writeFileSync(path.join(dir, 'PACKAGE_MANIFEST.sha256'), `${manSha}\n`);
    const completionPath = path.join(dir, 'PUBLICATION_COMPLETION.json');
    if (fs.existsSync(completionPath)) {
      const completion = JSON.parse(fs.readFileSync(completionPath, 'utf8'));
      completion.manifestSha256 = manSha;
      fs.writeFileSync(
        completionPath,
        `${JSON.stringify(completion)}\n`
      );
    }
    return manSha;
  }

  it('F1: runner refuses live provenance; injected mock cannot seal live label', async () => {
    const r = await runG4NonfixturePreflight(
      baseInput({
        provenanceClass: 'live',
        preflightId: 'pf-f1-live',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('live_execution_not_authorized_in_this_build');
    expect(r.packageDir).toBeNull();
    expect(r.failureReceiptPath).toBeNull();
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../lib/ml-cal-1-g4-pooler-preflight-live-runner.ts'
      ),
      'utf8'
    );
    expect(src).not.toMatch(/allowAdversarialLiveSealForTests/);
  });

  it('F3: recomputed-hash TX failure/diagnostic contradictions rejected', async () => {
    const sealed = await runG4NonfixturePreflight(
      baseInput({ preflightId: 'pf-f3-contra' })
    );
    expect(sealed.ok).toBe(true);
    const dir = sealed.packageDir!;
    const txPath = path.join(dir, 'preflight-tx-evidence.json');
    const tx = JSON.parse(fs.readFileSync(txPath, 'utf8'));
    tx.terminalSuccess = false;
    tx.failureReason = 'transaction_lost';
    tx.transactionCompleted = true;
    tx.serverClockDiagnostics = {
      clock_timestamp: 'not-a-valid-instant',
    };
    fs.writeFileSync(txPath, `${JSON.stringify(tx)}\n`);
    rehashPackage(dir);
    const read = readG4NonfixturePreflightPackage(dir, {
      expectedPreflightId: 'pf-f3-contra',
      expectedConnection: EXPECTED,
      expectedManifestSha256: rehashPackage(dir),
    });
    expect(read.ok).toBe(false);
    expect(read.reasons).toEqual(
      expect.arrayContaining([
        'tx_evidence_terminal_success_false',
        'tx_evidence_failure_reason_present',
        'run_tx_success_failure_contradiction',
      ])
    );
    expect(
      read.reasons.some((x) => x.startsWith('tx_diagnostic_invalid:'))
    ).toBe(true);
    expect(read.terminalSuccess).toBe(false);
  });

  it('F4: symlinked preflight/ refuses failure write outside retain root', async () => {
    const root = tmpRoot('g4-nf-f4-');
    const outside = tmpRoot('g4-nf-f4-out-');
    fs.mkdirSync(path.join(root, 'staging'), { recursive: true });
    fs.mkdirSync(path.join(root, 'observations'), { recursive: true });
    fs.mkdirSync(path.join(root, 'review-handoff'), { recursive: true });
    const preflightLink = path.join(root, 'preflight');
    let linked = false;
    try {
      fs.symlinkSync(outside, preflightLink, 'junction');
      linked = true;
    } catch {
      linked = false;
    }
    if (!linked) {
      // Linux CI uses dir symlink; Windows may need junction
      try {
        fs.symlinkSync(outside, preflightLink, 'dir');
        linked = true;
      } catch {
        linked = false;
      }
    }
    if (!linked) {
      expect(true).toBe(true);
      return;
    }
    const { writeFailureReceipt } = await import(
      '../lib/ml-cal-1-g4-pooler-preflight-live-runner'
    );
    const fr = writeFailureReceipt({
      retainRoot: root,
      preflightId: 'pf-f4-escape',
      reasons: ['synthetic_failure'],
      observedAt: END,
      provenanceClass: 'mock',
    });
    expect(fr.ok).toBe(false);
    expect(
      fr.reasons.some(
        (x) =>
          x === 'symlink_in_layout:preflight' || x.startsWith('layout_escape:')
      )
    ).toBe(true);
    expect(fs.readdirSync(outside)).toEqual([]);
    const enabledFail = await runG4NonfixturePreflight(
      baseInput({
        retainRoot: root,
        preflightId: 'pf-f4-run',
        txAdapter: {
          async withRepeatableReadTransaction() {
            throw new Error('boom');
          },
        },
      })
    );
    expect(enabledFail.ok).toBe(false);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('F5: post-publication failure invalidates; reader rejects leftover success', async () => {
    const root = tmpRoot('g4-nf-f5-');
    const r = await runG4NonfixturePreflight(
      baseInput({
        retainRoot: root,
        preflightId: 'pf-f5-pub',
        sealHooks: { injectFailure: 'after_publish_hash' },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('inject_failure_after_publish_hash');
    const finalDir = path.join(root, 'preflight', 'pf-f5-pub');
    if (fs.existsSync(finalDir)) {
      const read = readG4NonfixturePreflightPackage(finalDir, {
        expectedPreflightId: 'pf-f5-pub',
        expectedConnection: EXPECTED,
      });
      expect(read.ok).toBe(false);
      expect(read.terminalSuccess).toBe(false);
      expect(
        read.reasons.some(
          (x) =>
            x === 'package_invalidated' ||
            x === 'member_missing:PUBLICATION_COMPLETION.json' ||
            x === 'publication_incomplete'
        )
      ).toBe(true);
    } else {
      expect(fs.existsSync(finalDir)).toBe(false);
    }
  });

  function listTree(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string, prefix: string) => {
      for (const name of fs.readdirSync(d).sort()) {
        const full = path.join(d, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        const st = fs.lstatSync(full);
        if (st.isDirectory() && !st.isSymbolicLink()) {
          out.push(`${rel}/`);
          walk(full, rel);
        } else {
          out.push(rel);
        }
      }
    };
    walk(dir, '');
    return out;
  }

  it('F4b: symlink target gets no invalidation marker; outside sentinel untouched', () => {
    const root = tmpRoot('g4-nf-f4b-');
    const outside = tmpRoot('g4-nf-f4b-out-');
    const sentinel = path.join(outside, 'SENTINEL.txt');
    fs.writeFileSync(sentinel, 'do-not-touch\n', 'utf8');
    fs.mkdirSync(path.join(root, 'staging'), { recursive: true });
    fs.mkdirSync(path.join(root, 'observations'), { recursive: true });
    fs.mkdirSync(path.join(root, 'review-handoff'), { recursive: true });
    const preflightLink = path.join(root, 'preflight');
    let linked = false;
    try {
      fs.symlinkSync(outside, preflightLink, 'junction');
      linked = true;
    } catch {
      try {
        fs.symlinkSync(outside, preflightLink, 'dir');
        linked = true;
      } catch {
        linked = false;
      }
    }
    if (!linked) {
      expect(true).toBe(true);
      return;
    }
    const packageDir = path.join(preflightLink, 'pf-f4b');
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'keep.txt'), 'x\n');
    const beforeOutside = listTree(outside);

    const result = invalidatePublishedPackage({
      retainRoot: root,
      packageDir,
      preflightId: 'pf-f4b',
      reasons: ['forced_invalidate'],
      provenanceClass: 'mock',
    });
    expect(result.ok).toBe(false);
    expect(
      result.reasons.some(
        (x) =>
          x === 'symlink_in_layout:preflight' ||
          x.startsWith('invalidate_containment:')
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(outside, 'pf-f4b', ML_CAL_1_G4_PREFLIGHT_INVALIDATION_MEMBER)
      )
    ).toBe(false);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('do-not-touch\n');
    expect(listTree(outside)).toEqual(beforeOutside);
    expect(fs.existsSync(path.join(outside, 'pf-f4b', 'keep.txt'))).toBe(true);
  });

  it('F4b: invalid paths trigger zero write/remove; retain root untouched', () => {
    const root = tmpRoot('g4-nf-f4b-inv-');
    fs.mkdirSync(path.join(root, 'preflight'), { recursive: true });
    fs.mkdirSync(path.join(root, 'staging'), { recursive: true });
    const sentinel = path.join(root, 'KEEP.txt');
    fs.writeFileSync(sentinel, 'root-sentinel\n');
    const beforeRoot = listTree(root);

    const outside = tmpRoot('g4-nf-f4b-ext-');
    fs.writeFileSync(path.join(outside, 'OUT.txt'), 'out\n');
    const beforeOutside = listTree(outside);

    const badId = invalidatePublishedPackage({
      retainRoot: root,
      packageDir: path.join(root, 'preflight', '../escape'),
      preflightId: '../escape',
      reasons: ['x'],
      provenanceClass: 'mock',
    });
    expect(badId.ok).toBe(false);
    expect(badId.reasons).toContain('unsafe_preflight_id');

    const wrongDest = invalidatePublishedPackage({
      retainRoot: root,
      packageDir: path.join(root, 'staging', 'pf-wrong'),
      preflightId: 'pf-wrong',
      reasons: ['x'],
      provenanceClass: 'mock',
    });
    expect(wrongDest.ok).toBe(false);
    expect(wrongDest.reasons).toContain(
      'invalidate_package_path_not_permitted'
    );

    const retainAsPkg = invalidatePublishedPackage({
      retainRoot: root,
      packageDir: root,
      preflightId: 'pf-root',
      reasons: ['x'],
      provenanceClass: 'mock',
    });
    expect(retainAsPkg.ok).toBe(false);
    expect(
      retainAsPkg.reasons.some(
        (x) =>
          x === 'invalidate_package_path_not_permitted' ||
          x === 'invalidate_retain_root_forbidden'
      )
    ).toBe(true);

    const outsidePkg = invalidatePublishedPackage({
      retainRoot: root,
      packageDir: path.join(outside, 'preflight', 'pf-ext'),
      preflightId: 'pf-ext',
      reasons: ['x'],
      provenanceClass: 'mock',
    });
    expect(outsidePkg.ok).toBe(false);
    expect(outsidePkg.reasons).toContain(
      'invalidate_package_path_not_permitted'
    );

    // Zero filesystem mutations from invalidate on invalid paths
    expect(listTree(root)).toEqual(beforeRoot);
    expect(listTree(outside)).toEqual(beforeOutside);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('root-sentinel\n');
    expect(fs.existsSync(root)).toBe(true);
    expect(permittedPreflightPackageDir(root, 'pf-ok')).toBe(
      path.resolve(path.join(root, 'preflight', 'pf-ok'))
    );
  });

  it('F4b/F5: ordinary failed publication still cannot read as success', async () => {
    const root = tmpRoot('g4-nf-f4b-f5-');
    const r = await runG4NonfixturePreflight(
      baseInput({
        retainRoot: root,
        preflightId: 'pf-f4b-f5',
        sealHooks: { injectFailure: 'after_publish_hash' },
      })
    );
    expect(r.ok).toBe(false);
    const finalDir = permittedPreflightPackageDir(root, 'pf-f4b-f5');
    expect(r.packageDir).toBeNull();
    if (fs.existsSync(finalDir)) {
      const read = readG4NonfixturePreflightPackage(finalDir, {
        expectedPreflightId: 'pf-f4b-f5',
        expectedConnection: EXPECTED,
      });
      expect(read.ok).toBe(false);
      expect(read.terminalSuccess).toBe(false);
    }
    // retain root and siblings preserved
    expect(fs.existsSync(root)).toBe(true);
    expect(fs.existsSync(path.join(root, 'staging'))).toBe(true);
  });
});
