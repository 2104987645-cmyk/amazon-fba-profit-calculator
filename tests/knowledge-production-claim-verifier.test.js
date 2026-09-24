'use strict';

const assert = require('node:assert/strict');
const Verifier = require('../knowledge-production-claim-verifier');

function claim(overrides = {}) {
  return { claimId: 'claim-1', text: 'Amazon policy definition', claimType: 'definition', topic: 'policy', intent: 'definition', marketplaces: ['US'], regions: [], requestedYear: '2026', freshness: 'current', authorityRequirement: { mustInclude: ['amazon-official'] }, temporalRequirement: { mode: 'current' }, metadata: {}, ...overrides };
}

function candidate(overrides = {}) {
  return { candidateId: 'candidate-1', claimId: 'claim-1', retrievalItemId: 'item-1', requestId: 'request-1', sourceId: 'amazon-seller-help', providerId: 'amazon-seller-help-provider', title: 'Official policy', url: 'https://sellercentral.amazon.com/help/policy', externalId: null, excerpt: 'Amazon policy definition excerpt.', content: 'Official content: Amazon policy definition excerpt.', marketplaces: ['US'], regions: [], publishedAt: '2026-01-01', effectiveAt: null, metadata: {}, ...overrides };
}

function result(overrides = {}) {
  return { status: 'supports', supportStrength: 'direct', excerpt: 'Amazon policy definition excerpt.', rationale: 'The source states the definition.', verifierType: 'test', metadata: { trace: 'fake' }, confidence: 0.99, claims: ['new-claim'], ...overrides };
}

async function run() {
  assert.equal(typeof Verifier.createProductionClaimVerifier, 'function');
  assert.throws(() => Verifier.createProductionClaimVerifier(), /CLAIM_VERIFIER_VERIFY_IMPL_REQUIRED/);
  assert.throws(() => Verifier.createProductionClaimVerifier({ verifyImpl: 'x' }), /CLAIM_VERIFIER_VERIFY_IMPL_REQUIRED/);
  assert.throws(() => Verifier.createProductionClaimVerifier({ verifyImpl: async () => ({}), timeoutMs: 0 }), /CLAIM_VERIFIER_INVALID_TIMEOUT/);
  let payload;
  let providerContext;
  const originalClaim = claim();
  const originalCandidate = candidate();
  const originalContext = { now: '2026-02-01T00:00:00.000Z', question: 'private question', accountContext: { secret: 'not forwarded' } };
  const verifier = Verifier.createProductionClaimVerifier({ verifyImpl: async (value, context) => { payload = value; providerContext = context; return result(); } });
  assert.equal(typeof verifier.verify, 'function');
  let output = await verifier.verify(originalClaim, originalCandidate, originalContext);
  assert.deepEqual([output.status, output.supportStrength, output.excerpt, output.verifierType], ['supports', 'direct', 'Amazon policy definition excerpt.', 'test']);
  assert.equal(Object.hasOwn(output, 'confidence'), false);
  assert.equal(Object.hasOwn(output, 'claims'), false);
  assert.deepEqual(Object.keys(payload).sort(), ['claim', 'context', 'evidence']);
  assert.deepEqual(Object.keys(payload.context), ['now']);
  assert.equal(payload.context.now, originalContext.now);
  assert.equal(Object.hasOwn(payload, 'candidateId'), false);
  assert.equal(Object.hasOwn(payload.evidence, 'metadata'), false);
  assert.equal(Object.hasOwn(payload, 'question'), false);
  assert.equal(typeof providerContext.signal, 'object');
  assert.deepEqual(originalClaim, claim());
  assert.deepEqual(originalCandidate, candidate());
  assert.deepEqual(originalContext, { now: '2026-02-01T00:00:00.000Z', question: 'private question', accountContext: { secret: 'not forwarded' } });

  for (const value of [result({ status: 'supports', supportStrength: 'indirect' }), result({ status: 'contradicts', supportStrength: 'direct' }), result({ status: 'not-addressed', supportStrength: 'none', excerpt: null }), result({ status: 'unclear', supportStrength: 'indirect', excerpt: null }), result({ status: 'unknown', supportStrength: 'unknown', excerpt: null })]) {
    output = await Verifier.createProductionClaimVerifier({ verifyImpl: async () => value }).verify(claim(), candidate(), {});
    assert.equal(output.status, value.status);
  }
  for (const value of [null, 'prose answer', [], result({ status: 'yes' }), result({ supportStrength: 'high' }), result({ verifierType: '' }), result({ metadata: null }), result({ status: 'supports', supportStrength: 'none' }), result({ excerpt: 'fabricated quote' }), result({ excerpt: 'x'.repeat(Verifier.MAX_VERIFIER_EXCERPT_CHARS + 1) }), result({ rationale: 'x'.repeat(Verifier.MAX_VERIFIER_RATIONALE_CHARS + 1) })]) {
    output = await Verifier.createProductionClaimVerifier({ verifyImpl: async () => value }).verify(claim(), candidate(), {});
    assert.deepEqual([output.status, output.supportStrength], ['unknown', 'unknown']);
  }
  output = await Verifier.createProductionClaimVerifier({ verifyImpl: async () => { throw Error('provider secret'); } }).verify(claim(), candidate(), {});
  assert.deepEqual([output.status, output.metadata.errorCode], ['unknown', 'CLAIM_VERIFIER_ERROR']);
  output = await Verifier.createProductionClaimVerifier({ verifyImpl: async () => new Promise(() => {}), timeoutMs: 5 }).verify(claim(), candidate(), {});
  assert.deepEqual([output.status, output.metadata.errorCode], ['unknown', 'CLAIM_VERIFIER_TIMEOUT']);
  output = await Verifier.createProductionClaimVerifier({ verifyImpl: async () => result() }).verify({ ...claim(), requestedYear: null }, candidate(), {});
  assert.equal(output.metadata.errorCode, 'CLAIM_VERIFIER_INVALID_CLAIM');
  output = await Verifier.createProductionClaimVerifier({ verifyImpl: async () => result() }).verify(claim(), { ...candidate(), candidateId: null }, {});
  assert.equal(output.metadata.errorCode, 'CLAIM_VERIFIER_INVALID_CANDIDATE');
  output = await Verifier.createProductionClaimVerifier({ verifyImpl: async () => result() }).verify(claim(), candidate({ content: 'x'.repeat(Verifier.MAX_VERIFIER_EVIDENCE_CHARS + 1), excerpt: null }), {});
  assert.equal(output.metadata.errorCode, 'CLAIM_VERIFIER_EVIDENCE_TOO_LARGE');
  assert.equal(Verifier.validateEvidenceCandidate(candidate(), claim()).valid, true);
  assert.equal(Verifier.validateEvidenceCandidate(candidate({ claimId: 'other' }), claim()).valid, false);
  const [first, second] = await Promise.all([
    verifier.verify(claim(), candidate(), { now: '2026-01-01T00:00:00.000Z' }),
    verifier.verify(claim(), candidate({ candidateId: 'candidate-2' }), { now: '2026-01-02T00:00:00.000Z' })
  ]);
  assert.deepEqual([first.status, second.status], ['supports', 'supports']);
  console.log('knowledge production claim verifier passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
