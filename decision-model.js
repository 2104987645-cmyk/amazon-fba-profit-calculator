(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DecisionModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const IMPACT_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, unknown: 4 });
  const URGENCY_RANK = Object.freeze({ overdue: 0, immediate: 1, soon: 2, later: 3, none: 4, unknown: 5 });
  const RELEVANCE_RANK = Object.freeze({ exact: 0, high: 1, medium: 2, low: 3, irrelevant: 4, unknown: 5 });
  const PRIORITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });
  const MODULES = new Set(['profit', 'profitability', 'inventory', 'news', 'knowledge']);

  function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
  function rank(table, value) { return table[value] === undefined ? 99 : table[value]; }
  function dateOnly(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) ? value : null; }
  function daysBetween(from, to) { return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000); }
  function normalizeRelevance(relevance) {
    const source = relevance || {};
    if (source.isRelevant === false || source.level === 'irrelevant' || source.status === 'irrelevant') return 'irrelevant';
    if (source.level && RELEVANCE_RANK[source.level] !== undefined) return source.level;
    if (source.status === 'relevant' || source.isRelevant === true) {
      const codes = source.reasons || source.reasonCodes || [];
      return codes.some(code => /EXACT/.test(code)) ? 'exact' : codes.some(code => /REGIONAL|GLOBAL/.test(code)) ? 'high' : 'medium';
    }
    return 'unknown';
  }
  function normalizeImpact(value) { return IMPACT_RANK[value] === undefined ? 'unknown' : value; }
  function normalizeUrgency(value) { return URGENCY_RANK[value] === undefined ? 'unknown' : value; }
  function urgencyForDate(days) { if (days === null) return 'none'; if (days < 0) return 'overdue'; if (days <= 3) return 'immediate'; if (days <= 14) return 'soon'; if (days <= 45) return 'later'; return 'none'; }
  function priorityFor(item) {
    const relevant = rank(RELEVANCE_RANK, item.relevance) <= rank(RELEVANCE_RANK, 'medium');
    const exactHigh = rank(RELEVANCE_RANK, item.relevance) <= rank(RELEVANCE_RANK, 'high');
    const highImpact = rank(IMPACT_RANK, item.impactLevel) <= rank(IMPACT_RANK, 'high');
    const mediumImpact = rank(IMPACT_RANK, item.impactLevel) <= rank(IMPACT_RANK, 'medium');
    const urgent = rank(URGENCY_RANK, item.effectiveUrgency) <= rank(URGENCY_RANK, 'immediate');
    if (relevant && item.impactLevel === 'critical' && (item.actionRequired || urgent)) return 'critical';
    if (exactHigh && item.actionRequired && item.daysRemaining !== null && item.daysRemaining <= 3 && highImpact) return 'critical';
    if (relevant && item.actionRequired && highImpact) return 'high';
    if (exactHigh && highImpact && rank(URGENCY_RANK, item.effectiveUrgency) <= rank(URGENCY_RANK, 'soon')) return 'high';
    if (exactHigh && item.actionRequired && item.daysRemaining !== null && item.daysRemaining <= 14) return 'high';
    if (relevant && item.actionRequired) return 'medium';
    if (exactHigh && (mediumImpact || item.effectiveUrgency === 'soon')) return 'medium';
    return 'low';
  }
  function sectionFor(item) {
    const actionEligible = item.actionRequired && item.recommendedAction && item.userStatus === 'pending' &&
      rank(RELEVANCE_RANK, item.relevance) <= rank(RELEVANCE_RANK, 'medium') &&
      (item.priority === 'critical' || item.priority === 'high' ||
        (item.priority === 'medium' && item.daysRemaining !== null && item.daysRemaining <= 14 && rank(IMPACT_RANK, item.impactLevel) <= rank(IMPACT_RANK, 'medium')) ||
        (item.priority === 'medium' && ['overdue', 'immediate'].includes(item.effectiveUrgency) && rank(RELEVANCE_RANK, item.relevance) <= rank(RELEVANCE_RANK, 'high')));
    if (actionEligible) return 'actions';
    if (rank(IMPACT_RANK, item.impactLevel) <= rank(IMPACT_RANK, 'high')) return 'risks';
    if (item.daysRemaining !== null && item.daysRemaining >= 15 && item.daysRemaining <= 45) return 'monitor';
    return 'summary';
  }
  function compare(a, b) {
    let result = rank(PRIORITY_RANK, a.priority) - rank(PRIORITY_RANK, b.priority);
    if (result) return result;
    result = Number(b.actionRequired) - Number(a.actionRequired); if (result) return result;
    const aDays = a.daysRemaining === null ? Infinity : a.daysRemaining;
    const bDays = b.daysRemaining === null ? Infinity : b.daysRemaining;
    result = aDays - bDays; if (result) return result;
    result = rank(IMPACT_RANK, a.impactLevel) - rank(IMPACT_RANK, b.impactLevel); if (result) return result;
    result = rank(RELEVANCE_RANK, a.relevance) - rank(RELEVANCE_RANK, b.relevance); if (result) return result;
    result = rank(URGENCY_RANK, a.effectiveUrgency) - rank(URGENCY_RANK, b.effectiveUrgency); if (result) return result;
    result = (a.effectiveAt || '9999-12-31').localeCompare(b.effectiveAt || '9999-12-31'); if (result) return result;
    result = String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')); if (result) return result;
    return a.sourceNewsIds[0].localeCompare(b.sourceNewsIds[0]);
  }
  function increment(counts, reason) { counts[reason] = (counts[reason] || 0) + 1; }
  function buildItem(input, briefDate, hidden) {
    const news = input && input.news;
    if (!news || !news.id || !news.officialUrl) { increment(hidden, 'INCOMPLETE_INTELLIGENCE'); return null; }
    const relevance = normalizeRelevance(input.relevance);
    if (relevance === 'irrelevant') { increment(hidden, 'IRRELEVANT'); return null; }
    if (relevance === 'unknown') { increment(hidden, 'UNKNOWN_RELEVANCE'); return null; }
    if (!input.impact) { increment(hidden, 'INCOMPLETE_INTELLIGENCE'); return null; }
    const deadline = dateOnly(input.impact.deadline) || dateOnly(news.effectiveAt);
    const invalidDeadline = (input.impact.deadline && !dateOnly(input.impact.deadline)) || (news.effectiveAt && !dateOnly(news.effectiveAt));
    const daysRemaining = deadline ? daysBetween(briefDate, deadline) : null;
    const urgency = normalizeUrgency(input.impact.urgency);
    const dateUrgency = urgencyForDate(daysRemaining);
    const effectiveUrgency = rank(URGENCY_RANK, urgency) < rank(URGENCY_RANK, dateUrgency) ? urgency : dateUrgency;
    const userStatus = input.actionState && input.actionState.status === 'completed' ? 'completed' : input.userStatus === 'dismissed' ? 'dismissed' : 'pending';
    const actionRequired = Boolean(input.impact.actionRequired ?? news.actionRequired);
    if (news.status === 'expired' && !(actionRequired && userStatus === 'pending' && effectiveUrgency === 'overdue')) { increment(hidden, 'EXPIRED'); return null; }
    if (userStatus === 'completed') { increment(hidden, 'COMPLETED'); return null; }
    const relatedModule = MODULES.has(news.affectedModules && news.affectedModules[0]) ? news.affectedModules[0] : 'news';
    const item = {
      id: `decision-${news.id}`, priority: 'low', category: news.category || 'general', title: news.title || news.id,
      explanation: news.summary || news.title || news.id, whyItMatters: (input.relevance.reasons || input.relevance.reasonCodes || []).join('; ') || 'Relevant to this seller profile.',
      affectedMarketplace: unique((input.relevance.matchedMarketplaces || news.marketplaces || []).map(value => String(value).toUpperCase())),
      deadline, daysRemaining, relatedModule, supportingModules: unique((news.affectedModules || []).filter(module => MODULES.has(module) && module !== relatedModule)),
      recommendedAction: actionRequired && typeof news.actionText === 'string' && news.actionText.trim() ? news.actionText.trim() : null,
      section: 'summary', impactLevel: normalizeImpact(input.impact.impactLevel), urgency, actionRequired, relevance,
      sourceNewsIds: [news.id], sourceUrls: [news.officialUrl], mergeCount: 1,
      rationaleCodes: unique([...(input.relevance.reasons || input.relevance.reasonCodes || []), ...(input.impact.reasons || []), ...(invalidDeadline ? ['INVALID_DEADLINE'] : []), ...(urgency !== 'unknown' && deadline && urgency !== dateUrgency ? ['URGENCY_DATE_CONFLICT'] : [])]),
      userStatus,
      effectiveUrgency, effectiveAt: dateOnly(news.effectiveAt), publishedAt: news.publishedAt || null
    };
    if (relatedModule === 'news' && !(news.affectedModules || []).includes('news')) item.rationaleCodes.push('UNKNOWN_MODULE_FALLBACK');
    item.priority = priorityFor(item); item.section = sectionFor(item);
    return item;
  }
  function publicItem(item) { const { effectiveUrgency, effectiveAt, publishedAt, ...result } = item; return result; }
  function create(dependencies) {
    const deps = dependencies || {};
    function buildDailyBrief(intelligence, sellerProfile, options) {
      const source = Array.isArray(intelligence) ? intelligence : [];
      const config = options || {};
      const briefDate = dateOnly(config.briefDate) || new Date().toISOString().slice(0, 10);
      const maxItems = Math.max(0, Math.min(5, Number.isInteger(config.maxItems) ? config.maxItems : 5));
      const hidden = {}; const seen = new Set(); const candidates = []; let relevantNews = 0; let mergedNews = 0;
      source.forEach(input => {
        const relevance = normalizeRelevance(input && input.relevance);
        if (relevance !== 'irrelevant' && relevance !== 'unknown') relevantNews += 1;
        const newsId = input && input.news && input.news.id;
        if (newsId && seen.has(newsId)) { increment(hidden, 'DUPLICATE'); mergedNews += 1; return; }
        if (newsId) seen.add(newsId);
        const item = buildItem(input, briefDate, hidden); if (item) candidates.push(item);
      });
      candidates.sort(compare);
      const selected = candidates.slice(0, maxItems);
      candidates.slice(maxItems).forEach(() => increment(hidden, 'LOWER_PRIORITY'));
      const sections = { actions: [], risks: [], monitor: [], information: [] };
      selected.forEach(item => sections[item.section === 'summary' ? 'information' : item.section].push(publicItem(item)));
      const outputDecisions = selected.length;
      const profile = sellerProfile || {};
      const summary = outputDecisions ? `${outputDecisions} decision${outputDecisions === 1 ? '' : 's'} for ${briefDate}.` : 'No decisions require attention today.';
      return {
        schemaVersion: '3.0', briefId: `brief-${profile.id || profile.profileId || 'seller'}-${briefDate}`, briefDate,
        generatedAt: config.generatedAt || `${briefDate}T00:00:00.000Z`, sellerProfileId: profile.id || profile.profileId || 'unknown', sellerProfileVersion: profile.version || null,
        summary, actions: sections.actions, risks: sections.risks, monitor: sections.monitor, opportunities: [], information: sections.information,
        counts: { inputNews: source.length, relevantNews, decisionCandidates: candidates.length, outputDecisions, hiddenNews: source.length - outputDecisions, mergedNews },
        sourceWindow: { from: config.sourceWindow && config.sourceWindow.from || briefDate, to: config.sourceWindow && config.sourceWindow.to || briefDate, timezone: config.timezone || 'UTC' },
        diagnostics: { truncated: candidates.length > maxItems, hiddenReasonCounts: hidden }
      };
    }
    return { buildDailyBrief };
  }
  const api = create(); api.create = create;
  return api;
});
