(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./knowledge-claim-contracts') : root.KnowledgeClaimContracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KnowledgeQueryPreparation = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Claims) {
  'use strict';

  const PREPARATION_STATUSES = ['matched', 'unsupported', 'ambiguous', 'invalid'];
  const MARKETS = new Set(['US', 'CA', 'MX', 'UK', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'PL', 'BE', 'AU', 'JP']);
  const REGIONS = new Set(['EU', 'GLOBAL']);

  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(freeze);
    }
    return value;
  }

  function normalizeChineseQuestion(input) {
    if (typeof input !== 'string') return '';
    return input.normalize('NFKC').toLowerCase()
      .replace(/[，。！？；：、】【、】【、,.!?;:\[\](){}<>"'`~@#$%^&*_+=|\\/\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function validateKnowledgeQueryTemplate(template) {
    const errors = [];
    if (!object(template)) errors.push('TEMPLATE');
    if (!template || typeof template.templateId !== 'string' || !template.templateId.trim()) errors.push('TEMPLATE_ID');
    if (!template || typeof template.title !== 'string' || !template.title.trim()) errors.push('TITLE');
    if (!template || typeof template.question !== 'string' || !template.question.trim()) errors.push('QUESTION');
    if (!template || !Array.isArray(template.aliases) || template.aliases.some(value => typeof value !== 'string' || !value.trim())) errors.push('ALIASES');
    if (!template || !Array.isArray(template.marketplaces) || template.marketplaces.some(value => !MARKETS.has(value))) errors.push('MARKETPLACES');
    if (!template || !Array.isArray(template.regions) || template.regions.some(value => !REGIONS.has(value))) errors.push('REGIONS');
    if (!template || !Array.isArray(template.claims) || !template.claims.length || template.claims.some(claim => !Claims.validateClaimRequest(claim).valid)) errors.push('CLAIMS');
    if (!template || !object(template.metadata)) errors.push('METADATA');
    return { valid: !errors.length, errors: [...new Set(errors)] };
  }

  function createTemplateRegistry(templates) {
    if (!Array.isArray(templates)) throw Error('INVALID_TEMPLATE');
    const seen = new Set();
    const list = templates.map(template => {
      const validation = validateKnowledgeQueryTemplate(template);
      if (!validation.valid || seen.has(template.templateId)) {
        throw Error(seen.has(template && template.templateId) ? 'DUPLICATE_TEMPLATE_ID' : 'INVALID_TEMPLATE');
      }
      seen.add(template.templateId);
      return freeze(clone(template));
    });
    return freeze({ templates: list });
  }

  function initialClaim({ claimId, text, claimType, topic, intent, marketplaces, regions }) {
    return {
      claimId,
      text,
      claimType,
      topic,
      intent,
      marketplaces,
      regions,
      requestedYear: '2026',
      freshness: 'current',
      authorityRequirement: { mustInclude: ['amazon-official'] },
      temporalRequirement: { mode: 'current', maxAgeDays: 30 },
      metadata: { templateClaim: true }
    };
  }

  function createProductionTemplateRegistry() {
    return createTemplateRegistry([
      {
        templateId: 'uk-sipp',
        title: '英国站 SIPP 当前要求',
        question: '英国站 SIPP 现在有什么要求？',
        aliases: ['英国SIPP有什么要求', 'SIPP英国站现在怎么参加'],
        marketplaces: ['UK'],
        regions: [],
        claims: [initialClaim({ claimId: 'uk-sipp-current-requirements', text: '英国站 SIPP 当前参与要求。', claimType: 'eligibility', topic: 'fba-logistics', intent: 'eligibility', marketplaces: ['UK'], regions: [] })],
        metadata: { registry: 'initial-production' }
      },
      {
        templateId: 'vine-pre-launch',
        title: 'Vine Pre-Launch 说明',
        question: 'Vine Pre-Launch 是什么？',
        aliases: ['Vine 是什么'],
        marketplaces: [],
        regions: ['GLOBAL'],
        claims: [initialClaim({ claimId: 'vine-pre-launch-definition', text: 'Vine Pre-Launch 的当前定义和适用条件。', claimType: 'definition', topic: 'brand-reviews', intent: 'definition', marketplaces: [], regions: ['GLOBAL'] })],
        metadata: { registry: 'initial-production' }
      },
      {
        templateId: 'fba-new-selection',
        title: 'FBA New Selection 要求',
        question: 'FBA New Selection 现在有什么要求？',
        aliases: ['FBA New Selection 怎么参加'],
        marketplaces: [],
        regions: ['GLOBAL'],
        claims: [initialClaim({ claimId: 'fba-new-selection-current-requirements', text: 'FBA New Selection 当前参与要求。', claimType: 'eligibility', topic: 'fba-logistics', intent: 'eligibility', marketplaces: [], regions: ['GLOBAL'] })],
        metadata: { registry: 'initial-production' }
      },
      {
        templateId: 'eu-ppwr',
        title: '欧盟 PPWR 包装要求',
        question: '欧盟 PPWR 对包装有什么要求？',
        aliases: ['EU PPWR 包装要求'],
        marketplaces: [],
        regions: ['EU'],
        claims: [initialClaim({ claimId: 'eu-ppwr-packaging-requirements', text: '欧盟 PPWR 当前包装合规要求。', claimType: 'rule', topic: 'compliance-regulatory', intent: 'compliance', marketplaces: [], regions: ['EU'] })],
        metadata: { registry: 'initial-production' }
      }
    ]);
  }

  function base(status, original, normalized, reason, matcher, candidates) {
    return { status, originalQuestion: original, normalizedQuestion: normalized, matchedTemplateId: null, template: null, claims: [], candidates: candidates || [], reason, diagnostics: { matcher: matcher || null, candidateCount: (candidates || []).length } };
  }

  function prepareKnowledgeQuery(question, registry) {
    const original = typeof question === 'string' ? question : question;
    const normalized = normalizeChineseQuestion(question);
    if (!normalized) return base('invalid', original, normalized, 'EMPTY_QUESTION');
    const list = registry && Array.isArray(registry.templates) ? registry.templates : [];
    const exact = list.filter(template => normalizeChineseQuestion(template.question) === normalized);
    let found = exact;
    let matcher = 'exact-question';
    if (!found.length) {
      found = list.filter(template => template.aliases.some(alias => normalizeChineseQuestion(alias) === normalized));
      matcher = 'exact-alias';
    }
    if (!found.length) return base('unsupported', original, normalized, 'NO_REGISTERED_TEMPLATE');
    if (found.length > 1) {
      const candidates = found.map(template => clone({ templateId: template.templateId, title: template.title, marketplaces: template.marketplaces, regions: template.regions }));
      return base('ambiguous', original, normalized, 'MULTIPLE_REGISTERED_TEMPLATES', matcher, candidates);
    }
    const template = found[0];
    const output = base('matched', original, normalized, null, matcher, []);
    output.matchedTemplateId = template.templateId;
    output.template = clone(template);
    output.claims = clone(template.claims);
    output.diagnostics.candidateCount = 1;
    return output;
  }

  return { PREPARATION_STATUSES: PREPARATION_STATUSES.slice(), normalizeChineseQuestion, validateKnowledgeQueryTemplate, createTemplateRegistry, createProductionTemplateRegistry, prepareKnowledgeQuery };
});
