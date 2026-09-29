(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./knowledge-query-preparation') : root.KnowledgeQueryPreparation,
    typeof module === 'object' && module.exports ? require('./knowledge-question-analyzer') : root.KnowledgeQuestionAnalyzer
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KnowledgeQueryUnderstanding = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Preparation, Analyzer) {
  'use strict';

  const ENTRY_STATUSES = ['matched-template', 'open-ended-public', 'account-specific', 'unsupported', 'ambiguous', 'invalid'];
  const TOPICS = ['fees-profit', 'fba-logistics', 'brand-reviews', 'inventory', 'advertising', 'listing', 'compliance-regulatory', 'cross-border-tax', 'account-health', 'api-developer'];
  const INTENTS = ['definition', 'requirements', 'eligibility', 'policy-currentness', 'fees', 'how-to', 'troubleshooting', 'comparison', 'account-diagnosis', 'unknown'];
  const TIME_SENSITIVITY = ['current', 'historical', 'unspecified'];
  const ACCOUNT_PATTERN = /(我的\s*(asin|sku|店铺|账户|账号|商品|listing|库存|广告)|为什么我的\s*(商品|listing)|why\s+my\s+(asin|sku|listing|inventory|account))/i;
  const AMBIGUOUS_PATTERN = /^(这个|此|这项).{0,8}(政策|要求)|^(现在|目前).{0,8}(还能|还可以|还有效|能参加)/;
  const DOMAIN_PATTERN = /(amazon|亚马逊|fba|vine|sipp|ppwr|卖家|seller|asin|listing|广告|库存|包装|合规|vat|税|sp-api|\bapi\b)/i;

  function unique(values) { return [...new Set(values)]; }
  function mapIntent(intent, question) {
    const mapped = ({ policy: 'policy-currentness', fee: 'fees', 'account-specific': 'account-diagnosis', compliance: 'requirements', calculation: 'requirements', metric: 'requirements' })[intent] || (INTENTS.includes(intent) ? intent : null);
    if (mapped) return mapped;
    if (/(需要|条件|要求|requirements?)/i.test(question || '')) return 'requirements';
    return 'unknown';
  }
  function resolveTopic(topic) { return TOPICS.includes(topic) ? topic : 'fba-logistics'; }
  function resolveScope(question, analysis) {
    const text = String(question || '').toLowerCase();
    const marketplaces = (analysis.scope.resolvedMarketplaces || []).slice();
    const regions = (analysis.scope.regions || []).slice();
    const aliases = [['美国站', 'US'], ['英国站', 'UK'], ['德国站', 'DE'], ['法国站', 'FR'], ['意大利站', 'IT'], ['西班牙站', 'ES'], ['澳大利亚站', 'AU'], ['澳洲站', 'AU'], ['加拿大站', 'CA'], ['日本站', 'JP']];
    aliases.forEach(([label, code]) => { if (text.includes(label) && !marketplaces.includes(code)) marketplaces.push(code); });
    if ((text.includes('欧盟') || text.includes('欧洲')) && !regions.includes('EU')) regions.push('EU');
    if (text.includes('全球') && !regions.includes('GLOBAL')) regions.push('GLOBAL');
    return { marketplaces: unique(marketplaces), regions: unique(regions) };
  }
  function timeSensitivity(question, analysis) {
    const text = String(question || '').toLowerCase();
    const year = (text.match(/\b(20\d{2})\b/) || [])[1] || null;
    if (year && year !== '2026') return { value: 'historical', year };
    if (year || /(现在|当前|最新|今年|还有效吗|还能用吗|目前|current|latest)/.test(text) || analysis.freshness === 'current') return { value: 'current', year };
    return { value: 'unspecified', year };
  }
  function base(status, normalized, analysis, extras) {
    const scope = resolveScope(normalized, analysis);
    return Object.assign({
      status,
      normalizedQuestion: normalized,
      intent: mapIntent(analysis.intent, normalized),
      topic: resolveTopic(analysis.topic),
      marketplaces: scope.marketplaces,
      regions: scope.regions,
      timeSensitivity: timeSensitivity(normalized, analysis).value,
      accountDataRequired: false,
      ambiguities: [],
      confidence: status === 'open-ended-public' || status === 'matched-template' ? 'high' : 'low',
      metadata: { requestedYear: timeSensitivity(normalized, analysis).year, classification: 'deterministic' }
    }, extras || {});
  }

  function understandKnowledgeQuery(question, options) {
    const normalized = Preparation.normalizeChineseQuestion(question);
    const registry = options && options.registry;
    if (!normalized) return base('invalid', normalized, { intent: 'unknown', topic: 'unknown', scope: { resolvedMarketplaces: [], regions: [] }, freshness: 'evergreen' }, { metadata: { reason: 'EMPTY_QUESTION' } });
    const template = Preparation.prepareKnowledgeQuery(question, registry);
    const analysis = Analyzer.analyze(question, options && options.context, options && options.analysisOptions);
    if (template.status === 'matched') return base('matched-template', normalized, analysis, {
      marketplaces: template.template.marketplaces.slice(),
      regions: template.template.regions.slice(),
      confidence: 'high',
      metadata: { templateId: template.matchedTemplateId, classification: 'exact-template' }
    });
    if (ACCOUNT_PATTERN.test(normalized) || analysis.intent === 'account-specific') return base('account-specific', normalized, analysis, { intent: 'account-diagnosis', accountDataRequired: true, confidence: 'high' });
    if (AMBIGUOUS_PATTERN.test(normalized)) return base('ambiguous', normalized, analysis, { ambiguities: ['missing-subject'], confidence: 'low' });
    if (!DOMAIN_PATTERN.test(normalized)) return base('unsupported', normalized, analysis, { metadata: { reason: 'OUT_OF_DOMAIN', classification: 'deterministic' } });
    return base('open-ended-public', normalized, analysis, { confidence: 'medium' });
  }

  return { ENTRY_STATUSES: ENTRY_STATUSES.slice(), TOPICS: TOPICS.slice(), INTENTS: INTENTS.slice(), TIME_SENSITIVITY: TIME_SENSITIVITY.slice(), understandKnowledgeQuery };
});
