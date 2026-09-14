/**
 * Candidate B V1 normalizationManifest persistence transport.
 *
 * Persistence invariant only. Does not enter semantic manifests, rowHash, or snapshotHash.
 * Stores canonical JSON text inside a JSONB envelope so PostgreSQL cannot mutate numeric leaves.
 */

import {
  canonicalJsonString,
  sha256CanonicalJson,
} from '../../../../web/lib/shadow-model-capture-v1';

export const NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID =
  'candidate_b_v1_normalization_manifest_canonical_json_text_v1' as const;

export const NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_MANIFEST = {
  contractId: NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID,
  semanticRole: 'NON_SEMANTIC_PERSISTENCE_TRANSPORT',
  targetTable: 'shadow_model_feature_snapshots',
  targetColumn: 'normalization_manifest',
  targetDatabaseType: 'POSTGRESQL_JSONB',
  semanticInput: 'CANDIDATE_B_V1_NORMALIZATION_MANIFEST',
  canonicalTextEncoding: 'REPOSITORY_CANONICAL_JSON_STRING',
  envelopeEncoding: 'JSONB_OBJECT',
  envelopeEncodingId: NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID,
  envelopeCanonicalJsonKey: 'canonicalJson',
  exactEnvelopeKeys: ['encodingId', 'canonicalJson'],
  readDecode: 'JSON_PARSE_CANONICAL_JSON_TEXT',
  canonicalTextVerification: 'CANONICAL_JSON_STRING_ROUNDTRIP_EXACT',
  semanticHashVerification: 'SHA256_CANONICAL_JSON_EQUALS_PERSISTED_NORMALIZATION_MANIFEST_HASH',
  exactBitRequirement: true,
  schemaMigrationRequired: false,
} as const;

export const FROZEN_NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH =
  'e01fca1c21beca6303092cf5f9b45dbabe2007d9ab6766835a1c202d8104859a';

export const NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH = sha256CanonicalJson(
  NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_MANIFEST
);

if (NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH !== FROZEN_NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH) {
  throw new Error(
    `normalization_manifest_transport_contract_hash_mismatch:${NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH}!=${FROZEN_NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_HASH}`
  );
}

export interface CandidateBNormalizationManifestEnvelope {
  encodingId: typeof NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID;
  canonicalJson: string;
}

export const CANDIDATE_B_NORMALIZATION_MANIFEST_ENVELOPE_KEYS = ['canonicalJson', 'encodingId'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireSemanticObject(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error('candidate_b_normalization_manifest_decoded_value_invalid');
  }
  return value;
}

function requireCanonicalText(parsed: unknown, canonicalJson: string): void {
  if (canonicalJsonString(parsed) !== canonicalJson) {
    throw new Error('candidate_b_normalization_manifest_noncanonical_text');
  }
}

function requireSemanticHash(parsed: unknown, expectedNormalizationManifestHash: string): void {
  if (sha256CanonicalJson(parsed) !== expectedNormalizationManifestHash) {
    throw new Error('candidate_b_normalization_manifest_hash_mismatch');
  }
}

export function encodeCandidateBNormalizationManifest(
  normalizationManifest: unknown,
  expectedNormalizationManifestHash: string
): CandidateBNormalizationManifestEnvelope {
  const canonicalJson = canonicalJsonString(normalizationManifest);
  const parsed = JSON.parse(canonicalJson) as unknown;
  requireSemanticObject(parsed);
  requireCanonicalText(parsed, canonicalJson);
  requireSemanticHash(parsed, expectedNormalizationManifestHash);
  return {
    encodingId: NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID,
    canonicalJson,
  };
}

export function decodeCandidateBNormalizationManifest(
  persistedValue: unknown,
  expectedNormalizationManifestHash: string
): unknown {
  if (!isPlainObject(persistedValue)) {
    throw new Error('candidate_b_normalization_manifest_envelope_not_object');
  }
  const keys = Object.keys(persistedValue).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== 'canonicalJson' ||
    keys[1] !== 'encodingId'
  ) {
    throw new Error('candidate_b_normalization_manifest_envelope_keys_invalid');
  }
  if (persistedValue.encodingId !== NORMALIZATION_MANIFEST_TRANSPORT_CONTRACT_ID) {
    throw new Error('candidate_b_normalization_manifest_encoding_id_invalid');
  }
  if (typeof persistedValue.canonicalJson !== 'string') {
    throw new Error('candidate_b_normalization_manifest_canonical_json_not_string');
  }
  const canonicalJson = persistedValue.canonicalJson;
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    throw new Error('candidate_b_normalization_manifest_json_parse_failed');
  }
  requireSemanticObject(parsed);
  requireCanonicalText(parsed, canonicalJson);
  requireSemanticHash(parsed, expectedNormalizationManifestHash);
  return parsed;
}
