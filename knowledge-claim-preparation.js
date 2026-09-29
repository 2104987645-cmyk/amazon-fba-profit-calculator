(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./knowledge-claim-contracts') : root.KnowledgeClaimContracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KnowledgeClaimPreparation = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Claims) {
  'use strict';

  const PREPARED_CLAIM_STATUSES = ['ready', 'ambiguous', 'unsupported', 'invalid'];
  const MAX_CLAIMS = 3;
  const clone = value => JSON.parse(JSON.stringify(value));
  const includesAll = (actual, required) => required.every(value => actual.includes(value));

  function invalid(errors) { return { status: 'invalid', claims: [], ambiguities: [], confidence: 'low', metadata: { errors: [...new Set(errors)] } }; }
  function validatePreparedClaimSet(proposal, understanding) {
    const errors = [];
    const claims = proposal && Array.isArray(proposal.claims) ? proposal.claims : null;
    if (!proposal || !PREPARED_CLAIM_STATUSES.includes(proposal.status)) errors.push('STATUS');
    if (!proposal || !Array.isArray(proposal.ambiguities)) errors.push('AMBIGUITIES');
    if (!proposal || typeof proposal.confidence !== 'string' || !proposal.confidence) errors.push('CONFIDENCE');
    if (!proposal || !proposal.metadata || typeof proposal.metadata !== 'object' || Array.isArray(proposal.metadata)) errors.push('METADATA');
    if (!claims) errors.push('CLAIMS');
    if (claims && claims.length > MAX_CLAIMS) errors.push('MAX_CLAIMS');
    if (understanding && understanding.status === 'account-specific' && claims && claims.length) errors.push('ACCOUNT_SPECIFIC');
    (claims || []).forEach((claim, index) => {
      const prefix = `CLAIM_${index}_`;
      const contract = Claims.validateClaimRequest(claim);
      if (!contract.valid) errors.push(prefix + 'CLAIM_REQUEST');
      if (!claim || typeof claim.text !== 'string' || !claim.text.trim()) errors.push(prefix + 'EMPTY_TEXT');
      if (claim && ['answer', 'finalAnswer', 'citation', 'citations', 'supportVerdict', 'supportStatus'].some(key => Object.prototype.hasOwnProperty.call(claim, key))) errors.push(prefix + 'FORBIDDEN_CONTENT');
      if (claim && typeof claim.text === 'string' && /(final answer|最终答案|citation|引用|\bsupports\b|\bcontradicts\b)/i.test(claim.text)) errors.push(prefix + 'FORBIDDEN_CONTENT');
      if (understanding && Array.isArray(claim.marketplaces) && !includesAll(understanding.marketplaces || [], claim.marketplaces)) errors.push(prefix + 'MARKETPLACE_CONFLICT');
      if (understanding && Array.isArray(claim.regions) && !includesAll(understanding.regions || [], claim.regions)) errors.push(prefix + 'REGION_CONFLICT');
      if (understanding && understanding.timeSensitivity === 'current' && (!claim.temporalRequirement || claim.temporalRequirement.mode !== 'current')) errors.push(prefix + 'CURRENT_REQUIREMENT');
      if (understanding && claim.metadata && claim.metadata.topic && claim.metadata.topic !== understanding.topic) errors.push(prefix + 'TOPIC_CONFLICT');
      if (understanding && claim.metadata && claim.metadata.intent && claim.metadata.intent !== understanding.intent) errors.push(prefix + 'INTENT_CONFLICT');
    });
    return { valid: !errors.length, errors: [...new Set(errors)] };
  }

  function createClaimPreparation(options) {
    const plannerImpl = options && options.plannerImpl;
    return {
      prepareClaimsFromUnderstanding(input) {
        const request = input || {};
        const understanding = request.understanding || {};
        if (understanding.status === 'matched-template') {
          const templateClaims = request.templatePreparation && request.templatePreparation.claims;
          if (!Array.isArray(templateClaims)) return invalid(['MISSING_TEMPLATE_CLAIMS']);
          const proposal = { status: 'ready', claims: clone(templateClaims), ambiguities: [], confidence: 'high', metadata: { source: 'exact-template' } };
          const validation = validatePreparedClaimSet(proposal, understanding);
          return validation.valid ? proposal : invalid(validation.errors);
        }
        if (understanding.status === 'account-specific') return { status: 'unsupported', claims: [], ambiguities: ['account-data-required'], confidence: 'high', metadata: { reason: 'ACCOUNT_SPECIFIC' } };
        if (understanding.status === 'ambiguous') return { status: 'ambiguous', claims: [], ambiguities: (understanding.ambiguities || []).slice(), confidence: understanding.confidence || 'low', metadata: { reason: 'AMBIGUOUS' } };
        if (understanding.status !== 'open-ended-public') return { status: 'unsupported', claims: [], ambiguities: [], confidence: 'low', metadata: { reason: 'NOT_OPEN_ENDED_PUBLIC' } };
        if (typeof plannerImpl !== 'function') return { status: 'unsupported', claims: [], ambiguities: [], confidence: 'low', metadata: { reason: 'PLANNER_UNAVAILABLE' } };
        const finalize = proposal => {
          const validation = validatePreparedClaimSet(proposal, understanding);
          if (!validation.valid) return invalid(validation.errors);
          return { status: 'ready', claims: clone(proposal.claims), ambiguities: proposal.ambiguities.slice(), confidence: proposal.confidence, metadata: Object.assign({}, proposal.metadata, { source: 'planner' }) };
        };
        try {
          const proposal = plannerImpl({ question: request.question, understanding: clone(understanding), constraints: { maxClaims: MAX_CLAIMS, noAnswer: true, noCitation: true, requireClaimRequestValidation: true } }, request.signal ? { signal: request.signal } : {});
          if (proposal && typeof proposal.then === 'function') return proposal.then(finalize, () => ({ status: 'unsupported', claims: [], ambiguities: [], confidence: 'low', metadata: { reason: 'PLANNER_FAILED' } }));
          return finalize(proposal);
        } catch (_) {
          return { status: 'unsupported', claims: [], ambiguities: [], confidence: 'low', metadata: { reason: 'PLANNER_FAILED' } };
        }
      }
    };
  }

  return { PREPARED_CLAIM_STATUSES: PREPARED_CLAIM_STATUSES.slice(), MAX_CLAIMS, validatePreparedClaimSet, createClaimPreparation };
});
