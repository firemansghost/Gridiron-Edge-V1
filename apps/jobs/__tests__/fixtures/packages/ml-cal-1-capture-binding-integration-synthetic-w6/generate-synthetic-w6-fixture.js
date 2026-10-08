/**
 * Offline generator for G2 synthetic Week-6 hypothetical fixture package.
 * Provenance: test-only. Not live evidence. Run: node generate-synthetic-w6-fixture.js
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = __dirname;
const WEEK5_MEMBER = path.join(
  __dirname,
  '..',
  'ml-cal-1-lifecycle-binding-week5-commit',
  'core-v1-lifecycle-2026-through-week-5-COMMIT.json'
);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function buildStoreZip(memberPath, memberBytes) {
  const nameBuf = Buffer.from(memberPath, 'utf8');
  const crc = crc32(memberBytes);
  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc >>> 0, 14);
  local.writeUInt32LE(memberBytes.length, 18);
  local.writeUInt32LE(memberBytes.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  nameBuf.copy(local, 30);

  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc >>> 0, 16);
  central.writeUInt32LE(memberBytes.length, 20);
  central.writeUInt32LE(memberBytes.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  nameBuf.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + memberBytes.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, memberBytes, central, eocd]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c;
}

const week5 = fs.readFileSync(WEEK5_MEMBER);
const reportObj = JSON.parse(week5.toString('utf8'));
reportObj.completedThroughWeek = 6;
reportObj.canonicalWeight = 1;
reportObj.expectedConfirmation = 'WRITE_2026_CORE_V1_THROUGH_WEEK_6';
reportObj.rows = reportObj.rows.map((r) => ({ ...r, canonicalWeight: 1 }));
// Deterministic note so package is explicitly test-only.
reportObj.g2FixtureProvenance = {
  provenance: 'test-only',
  kind: 'synthetic-week6-hypothetical',
  note: 'Offline G2 integration fixture; not live evidence; full-weight-hypothetical only.',
};

const memberPath = 'core-v1-lifecycle-2026-through-week-6-COMMIT.json';
const memberBytes = Buffer.from(`${JSON.stringify(reportObj)}\n`, 'utf8');
const zipBytes = buildStoreZip(memberPath, memberBytes);

const provenance = {
  provenance: 'test-only',
  schemaVersion: 'ml-cal-1-capture-binding-integration-g2-fixture-v1',
  kind: 'synthetic-week6-hypothetical',
  liveAccepted: false,
  note: 'Synthetic full-weight archive for offline G2 tests. Not production evidence.',
  derivedFromAuthenticWeek5MemberSha256:
    'c20b789ce45b58362a23b2ab2a69184fda2a39377c99d58db6268376b79a2e1e',
  week5AuthenticPinsUnchanged: true,
};

fs.writeFileSync(path.join(OUT, memberPath), memberBytes);
fs.writeFileSync(path.join(OUT, 'archive.zip'), zipBytes);
fs.writeFileSync(
  path.join(OUT, 'PROVENANCE.json'),
  `${JSON.stringify(provenance, null, 2)}\n`
);

const files = {
  'archive.zip': sha256(zipBytes),
  [memberPath]: sha256(memberBytes),
  'PROVENANCE.json': sha256(
    Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`, 'utf8')
  ),
};

const index = {
  provenance: 'test-only',
  packageId: 'ml-cal-1-capture-binding-integration-synthetic-w6',
  liveAccepted: false,
  files,
  authenticWeek5Reference: {
    package: 'ml-cal-1-lifecycle-binding-week5-commit',
    zipSha256:
      'b0177de089237876c2e258fb97d84af3803ef7d1e7402cae853670ee8a6cd316',
    reportMemberSha256:
      'c20b789ce45b58362a23b2ab2a69184fda2a39377c99d58db6268376b79a2e1e',
    note: 'Authentic Week 5 bytes live in sibling package; unchanged by G2.',
  },
};

fs.writeFileSync(
  path.join(OUT, 'PACKAGE_INDEX.json'),
  `${JSON.stringify(index, null, 2)}\n`
);

console.log(JSON.stringify(index, null, 2));
void zlib;
