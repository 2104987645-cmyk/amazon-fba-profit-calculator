(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DecisionModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const IMPACT_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, none: 4, unknown: 5 });
  const URGENCY_RANK = Object.freeze({ overdue: 0, 'effective-soon': 1, active: 2, upcoming: 3, unknown: 4 });
  const PRIORITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

  function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
  function rank(table, value) { return table[value] === undefined ? 99 : table[value]; }
  function relevanceStatus(relevance) { return relevance && relevance.status || relevance && relevance.level || 'unknown'; }
  function isRelevant(relevance) { return relevance && relevance.isRelevant !== false && (relevanceStatus(relevance) === 'relevant' || ['exact', 'high', 'medium', 'low'].includes(relevanceStatus(relevance))); }
  function isActionableText(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
  function increment(counts, reason) { counts[reason] = (counts[reason] || 0) + 1; }
  function sellerReason(relevance) {
    const codes = relevance && (relevance.reasonCodes || relevance.reasons) || [];
    if (codes.includes('PROFILE_NOT_CONFIGURED_COMPATIBILITY')) return '当前尚未配置卖家站点，本条更新按兼容模式展示；完善站点信息后可获得更准确的相关性判断。';
    if (codes.includes('GLOBAL_NEWS')) return '这是 Amazon 全局更新，与你当前经营的站点相关。';
    const marketplaces = relevance && relevance.matchedMarketplaces || [];
    if (marketplaces.length) return `该更新适用于你的 ${marketplaces.join('、')} 站点，可能影响当前经营安排。`;
    return '该更新与当前卖家经营范围相关，建议结合业务情况关注。';
  }
  function priorityFor(item) {
    if (item.impactLevel === 'critical' && (item.actionRequired || item.urgency === 'overdue' || item.urgency === 'effective-soon')) return 'critical';
    if (item.actionRequired && rank(IMPACT_RANK, item.impactLevel) <= rank(IMPACT_RANK, 'high')) return 'high';
    if (rank(IMPACT_RANK, item.impactLevel) <= rank(IMPACT_RANK, 'high') && ['overdue', 'effective-soon'].includes(item.urgency)) return 'high';
    if (item.actionRequired || item.impactLevel === 'medium' || item.urgency === 'effective-soon') return 'medium';
    return 'low';
  }
  function categoryFor(item) {
    if (item.actionRequired && item.recommendedAction && item.userStatus === 'pending') return 'action';
    if (rank(IMPACT_RANK, item.impactLevel) <= rank(IMPACT_RANK, 'high')) return 'risk';
    if (item.impactLevel === 'medium' && ['effective-soon', 'upcoming'].includes(item.urgency)) return 'monitor';
    return null;
  }
  function compare(a, b) {
    let result = rank(PRIORITY_RANK, a.priority) - rank(PRIORITY_RANK, b.priority); if (result) return result;
    result = Number(b.actionRequired) - Number(a.actionRequired); if (result) return result;
    const aDays = a.daysRemaining === null ? Infinity : a.daysRemaining; const bDays = b.daysRemaining === null ? Infinity : b.daysRemaining;
    result = aDays - bDays; if (result) return result;
    result = rank(IMPACT_RANK, a.impactLevel) - rank(IMPACT_RANK, b.impactLevel); if (result) return result;
    result = rank(URGENCY_RANK, a.urgency) - rank(URGENCY_RANK, b.urgency); if (result) return result;
    result = String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')); if (result) return result;
    return a.sourceNewsIds[0].localeCompare(b.sourceNewsIds[0]);
  }
  function buildItem(input, hidden) {
    const news = input && input.news; const impact = input && input.impact; const relevance = input && input.relevance;
    if (!news || !news.id || !news.officialUrl || !impact) { increment(hidden, 'INCOMPLETE_INTELLIGENCE'); return null; }
    if (!isRelevant(relevance)) { increment(hidden, relevanceStatus(relevance) === 'irrelevant' ? 'IRRELEVANT' : 'UNKNOWN_RELEVANCE'); return null; }
    const userStatus = input.actionState && input.actionState.status === 'completed' ? 'completed' : input.userStatus === 'dismissed' ? 'dismissed' : 'pending';
    if (userStatus === 'completed') { increment(hidden, 'COMPLETED'); return null; }
    const actionRequired = impact.actionRequired === true;
    if (news.status === 'expired' && !(actionRequired && userStatus === 'pending' && impact.urgency === 'overdue')) { increment(hidden, 'EXPIRED'); return null; }
    const item = {
      id: `decision-${news.id}`, priority: 'low', category: null, newsCategory: news.category || 'general', title: news.title || news.id,
      explanation: news.summary || news.title || news.id, whyItMatters: sellerReason(relevance),
      marketplaces: unique((relevance.matchedMarketplaces || news.marketplaces || []).map(value => String(value).toUpperCase())),
      affectedModules: unique(impact.affectedModules || []), recommendedAction: actionRequired ? isActionableText(impact.actionText) : null,
      actionType: impact.actionType == null ? null : impact.actionType, urgency: impact.urgency || 'unknown', impactLevel: impact.impactLevel || 'unknown',
      effectiveAt: impact.effectiveAt || null, daysRemaining: impact.daysUntilEffective === undefined ? null : impact.daysUntilEffective,
      sourceNewsIds: [news.id], sourceCount: 1, reasonCodes: unique([...(relevance.reasonCodes || relevance.reasons || []), ...(impact.reasonCodes || [])]), confidence: impact.confidence || 'low',
      actionRequired, userStatus, publishedAt: news.publishedAt || null
    };
    item.priority = priorityFor(item); item.category = categoryFor(item);
    if (!item.category) { increment(hidden, 'LOW_VALUE'); return null; }
    return item;
  }
  function publicItem(item) { const { actionRequired, userStatus, publishedAt, ...result } = item; return result; }
  function create() {
    function buildDailyBrief(intelligence, sellerProfile, options) {
      const source = Array.isArray(intelligence) ? intelligence : []; const config = options || {}; const briefDate = config.briefDate || new Date().toISOString().slice(0, 10);
      const maxItems = Math.max(0, Math.min(5, Number.isInteger(config.maxItems) ? config.maxItems : 5)); const hidden = {}; const seen = new Set(); const candidates = []; let relevantNews = 0; let mergedNews = 0;
      source.forEach(input => {
        if (isRelevant(input && input.relevance)) relevantNews += 1;
        const newsId = input && input.news && input.news.id;
        if (newsId && seen.has(newsId)) { increment(hidden, 'DUPLICATE'); mergedNews += 1; return; }
        if (newsId) seen.add(newsId); const item = buildItem(input, hidden); if (item) candidates.push(item);
      });
      candidates.sort(compare); const selected = candidates.slice(0, maxItems); candidates.slice(maxItems).forEach(() => increment(hidden, 'LOWER_PRIORITY'));
      const sections = { actions: [], risks: [], monitor: [] }; const sectionKey = { action: 'actions', risk: 'risks', monitor: 'monitor' }; selected.forEach(item => sections[sectionKey[item.category]].push(publicItem(item)));
      const profile = sellerProfile || {}; const outputDecisions = selected.length;
      return {
        schemaVersion: '3.0', briefId: `brief-${profile.id || profile.profileId || 'seller'}-${briefDate}`, briefDate, generatedAt: config.generatedAt || `${briefDate}T00:00:00.000Z`, sellerProfileId: profile.id || profile.profileId || 'unknown', sellerProfileVersion: profile.version || null,
        summary: outputDecisions ? `${outputDecisions} decision${outputDecisions === 1 ? '' : 's'} for ${briefDate}.` : 'No decisions require attention today.', actions: sections.actions, risks: sections.risks, monitor: sections.monitor, opportunities: [],
        counts: { inputNews: source.length, relevantNews, decisionCandidates: candidates.length, outputDecisions, hiddenNews: source.length - outputDecisions, mergedNews }, sourceWindow: { from: config.sourceWindow && config.sourceWindow.from || briefDate, to: config.sourceWindow && config.sourceWindow.to || briefDate, timezone: config.timezone || 'UTC' }, diagnostics: { truncated: candidates.length > maxItems, hiddenReasonCounts: hidden }
      };
    }
    return { buildDailyBrief };
  }
  const api = create(); api.create = create; return api;
});
