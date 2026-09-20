(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NewsImpact = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function relevanceStatus(relevance) { return relevance && typeof relevance === 'object' ? relevance.status : typeof relevance === 'string' ? relevance : 'unknown'; }
  function isActionRequired(value) { return value === true || value === 'required' || value === 'review'; }
  function dateParts(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number); const stamp = Date.UTC(year, month - 1, day);
    const date = new Date(stamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? { year, month, day, stamp } : null;
  }
  function evaluationDay(value) {
    const date = value instanceof Date ? value : value ? new Date(value) : new Date();
    if (!Number.isFinite(date.getTime())) return null;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  function calendarDaysUntil(effectiveAt, evaluatedAt) {
    const effective = dateParts(effectiveAt); const evaluated = evaluationDay(evaluatedAt);
    return effective && evaluated !== null ? Math.round((effective.stamp - evaluated) / 86400000) : null;
  }
  function newsMarketplaces(news) {
    const source = Array.isArray(news && news.marketplaces) ? news.marketplaces : news && typeof news.marketplace === 'string' ? [news.marketplace] : [];
    return source.filter(value => typeof value === 'string').map(value => value.trim().toUpperCase());
  }
  function confidenceFor(news, status) {
    if (!news || typeof news !== 'object' || !news.id || status === 'unknown') return 'low';
    const fields = [news.importance, news.actionRequired, news.affectedModules, news.effectiveAt];
    const present = fields.filter(value => value !== undefined && value !== null && value !== '').length;
    return present >= 4 ? 'high' : present >= 2 ? 'medium' : 'low';
  }

  function analyze(news, relevance, evaluatedAt) {
    const item = news && typeof news === 'object' ? news : {};
    const status = relevanceStatus(relevance);
    const actionRequired = isActionRequired(item.actionRequired);
    const affectedModules = Array.isArray(item.affectedModules) ? item.affectedModules.slice() : [];
    const effectiveAt = dateParts(item.effectiveAt) ? item.effectiveAt : null;
    const daysUntilEffective = calendarDaysUntil(effectiveAt, evaluatedAt);
    const reasonCodes = [];
    if (String(item.importance || '').toLowerCase() === 'high') reasonCodes.push('HIGH_IMPORTANCE');
    if (actionRequired) reasonCodes.push('ACTION_REQUIRED');
    if (affectedModules.length) reasonCodes.push('AFFECTED_MODULE');
    if (newsMarketplaces(item).includes('GLOBAL')) reasonCodes.push('GLOBAL_NEWS');
    if (status === 'relevant' && !reasonCodes.includes('GLOBAL_NEWS')) reasonCodes.push('RELEVANT_MARKETPLACE');
    if (daysUntilEffective !== null && daysUntilEffective > 0 && daysUntilEffective <= 30) reasonCodes.push('EFFECTIVE_WITHIN_30_DAYS');
    if (daysUntilEffective !== null && daysUntilEffective <= 0) reasonCodes.push('ALREADY_EFFECTIVE');
    if (status === 'unknown') reasonCodes.push('UNKNOWN_RELEVANCE');

    let urgency = 'unknown';
    if (daysUntilEffective !== null) {
      if (daysUntilEffective < 0) urgency = actionRequired ? 'overdue' : 'active';
      else if (daysUntilEffective === 0) urgency = 'active';
      else if (daysUntilEffective <= 30) urgency = 'effective-soon';
      else urgency = 'upcoming';
    }

    let impactLevel;
    if (status === 'irrelevant') impactLevel = 'none';
    else if (status !== 'relevant') impactLevel = 'unknown';
    else if (String(item.importance || '').toLowerCase() === 'high' && actionRequired && daysUntilEffective !== null && daysUntilEffective <= 30) impactLevel = 'critical';
    else if (actionRequired || String(item.importance || '').toLowerCase() === 'high') impactLevel = 'high';
    else if (affectedModules.length) impactLevel = 'medium';
    else impactLevel = 'low';

    return {
      newsId: item.id || null,
      relevance: status,
      impactLevel,
      urgency,
      affectedModules,
      actionRequired,
      actionType: item.actionType == null ? null : item.actionType,
      actionText: typeof item.actionText === 'string' ? item.actionText : '',
      effectiveAt,
      daysUntilEffective,
      reasonCodes,
      confidence: confidenceFor(item, status)
    };
  }

  function assess(news, relevance, evaluatedAt) { return analyze(news, relevance, evaluatedAt); }
  return { analyze, assess, calendarDaysUntil, isActionRequired };
});
