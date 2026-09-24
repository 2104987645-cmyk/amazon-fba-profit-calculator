'use strict';

const Claims = require('./knowledge-claim-contracts');

const VERIFIER_TIMEOUT_MS = 15 * 1000;
const MAX_VERIFIER_EXCERPT_CHARS = 2000;
const MAX_VERIFIER_RATIONALE_CHARS = 4000;
const MAX_VERIFIER_EVIDENCE_CHARS = 50 * 1000;

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function nonEmptyString(value) { return typeof value === 'string' && value.trim(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function unknown(errorCode) { return { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'production-core', metadata: { errorCode } }; }

function validateEvidenceCandidate(candidate, claim) {
  const errors = [];
  if (!isObject(candidate)) return { valid: false, errors: ['CANDIDATE'] };
  for (const field of ['candidateId', 'claimId', 'retrievalItemId', 'sourceId', 'providerId']) if (!nonEmptyString(candidate[field])) errors.push(field.toUpperCase());
  if (!nonEmptyString(candidate.url) && !nonEmptyString(candidate.externalId)) errors.push('IDENTITY');
  if (candidate.content != null && typeof candidate.content !== 'string') errors.push('CONTENT');
  if (candidate.excerpt != null && typeof candidate.excerpt !== 'string') errors.push('EXCERPT');
  if (claim && candidate.claimId !== claim.claimId) errors.push('CLAIM_ID');
  return { valid: errors.length === 0, errors };
}

function evidenceText(candidate) { return [candidate.content, candidate.excerpt].filter(value => typeof value === 'string' && value).join('\n'); }

function buildPayload(claim, candidate, context) {
  return {
    claim: { claimId: claim.claimId, text: claim.text, marketplaces: clone(claim.marketplaces), regions: clone(claim.regions), temporalRequirement: clone(claim.temporalRequirement), requestedYear: claim.requestedYear, authorityRequirement: clone(claim.authorityRequirement) },
    evidence: { title: candidate.title || null, text: candidate.content || null, snippet: candidate.excerpt || null, url: candidate.url || null, sourceId: candidate.sourceId, providerId: candidate.providerId, publisher: null, publishedAt: candidate.publishedAt || null, effectiveAt: candidate.effectiveAt || null },
    context: { now: context && typeof context.now === 'string' ? context.now : null }
  };
}

function statusStrengthIsConsistent(status, supportStrength) {
  if (status === 'supports' || status === 'contradicts') return ['direct', 'indirect'].includes(supportStrength);
  if (status === 'not-addressed') return supportStrength === 'none';
  if (status === 'unknown') return supportStrength === 'unknown';
  return status === 'unclear' && ['indirect', 'none', 'unknown'].includes(supportStrength);
}

function validateVerificationResult(result, candidate) {
  if (!isObject(result) || !isObject(result.metadata) || !nonEmptyString(result.verifierType) || (result.excerpt !== null && typeof result.excerpt !== 'string') || (result.rationale !== null && typeof result.rationale !== 'string')) return { valid: false, errorCode: 'CLAIM_VERIFIER_INVALID_RESPONSE' };
  const contract = Claims.validateVerification(result);
  if (!contract.valid || !statusStrengthIsConsistent(result.status, result.supportStrength)) return { valid: false, errorCode: 'CLAIM_VERIFIER_INVALID_RESPONSE' };
  if (result.excerpt && result.excerpt.length > MAX_VERIFIER_EXCERPT_CHARS) return { valid: false, errorCode: 'CLAIM_VERIFIER_INVALID_RESPONSE' };
  if (result.rationale && result.rationale.length > MAX_VERIFIER_RATIONALE_CHARS) return { valid: false, errorCode: 'CLAIM_VERIFIER_INVALID_RESPONSE' };
  if (result.excerpt && !evidenceText(candidate).includes(result.excerpt)) return { valid: false, errorCode: 'VERIFIER_EXCERPT_NOT_FOUND' };
  return { valid: true, value: { status: result.status, supportStrength: result.supportStrength, excerpt: result.excerpt || null, rationale: result.rationale || null, verifierType: result.verifierType, metadata: clone(result.metadata) } };
}

async function runWithTimeout(callback, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ timedOut: true }); }, timeoutMs); });
    return await Promise.race([Promise.resolve().then(() => callback(controller.signal)).then(value => ({ value })), timeout]);
  } finally { clearTimeout(timer); }
}

function createProductionClaimVerifier(options = {}) {
  const verifyImpl = options.verifyImpl;
  const timeoutMs = options.timeoutMs === undefined ? VERIFIER_TIMEOUT_MS : options.timeoutMs;
  if (typeof verifyImpl !== 'function') throw Error('CLAIM_VERIFIER_VERIFY_IMPL_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw Error('CLAIM_VERIFIER_INVALID_TIMEOUT');
  async function verify(claim, candidate, context = {}) {
    if (!Claims.validateClaimRequest(claim).valid) return unknown('CLAIM_VERIFIER_INVALID_CLAIM');
    if (!validateEvidenceCandidate(candidate, claim).valid) return unknown('CLAIM_VERIFIER_INVALID_CANDIDATE');
    const text = evidenceText(candidate);
    if (!text) return unknown('CLAIM_VERIFIER_EVIDENCE_MISSING');
    if (text.length > MAX_VERIFIER_EVIDENCE_CHARS) return unknown('CLAIM_VERIFIER_EVIDENCE_TOO_LARGE');
    let execution;
    try { execution = await runWithTimeout(signal => verifyImpl(buildPayload(claim, candidate, context), { signal }), timeoutMs); } catch (_) { return unknown('CLAIM_VERIFIER_ERROR'); }
    if (execution.timedOut) return unknown('CLAIM_VERIFIER_TIMEOUT');
    const checked = validateVerificationResult(execution.value, candidate);
    return checked.valid ? checked.value : unknown(checked.errorCode);
  }
  return { verify };
}

module.exports = { VERIFIER_TIMEOUT_MS, MAX_VERIFIER_EXCERPT_CHARS, MAX_VERIFIER_RATIONALE_CHARS, MAX_VERIFIER_EVIDENCE_CHARS, validateEvidenceCandidate, validateVerificationResult, createProductionClaimVerifier };
