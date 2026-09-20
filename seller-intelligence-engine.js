(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./seller-profile') : root.SellerProfile,
    typeof module === 'object' && module.exports ? require('./news-relevance') : root.NewsRelevance,
    typeof module === 'object' && module.exports ? require('./news-impact') : root.NewsImpact,
    typeof module === 'object' && module.exports ? require('./news-action-state') : root.NewsActionState
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SellerIntelligence = api;
})(typeof window !== 'undefined' ? window : globalThis, function (SellerProfile, NewsRelevance, NewsImpact, NewsActionState) {
  'use strict';

  const IMPACT_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, none: 4, unknown: 5 });

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function normalizedNewsMarketplaces(news) {
    const source = Array.isArray(news && news.marketplaces)
      ? news.marketplaces
      : news && typeof news.marketplace === 'string' ? [news.marketplace] : [];
    return source.filter(value => typeof value === 'string').map(value => value.trim().toUpperCase()).filter(Boolean);
  }

  function compatibilityRelevance(news) {
    const newsMarketplaces = normalizedNewsMarketplaces(news);
    return {
      status: 'relevant',
      reasonCodes: ['PROFILE_NOT_CONFIGURED_COMPATIBILITY'],
      matchedMarketplaces: newsMarketplaces.slice(),
      profileMarketplaces: [],
      newsMarketplaces: newsMarketplaces.slice()
    };
  }

  function create(dependencies) {
    const deps = Object.assign({ SellerProfile, NewsRelevance, NewsImpact, NewsActionState }, dependencies || {});
    const now = typeof deps.now === 'function' ? deps.now : () => new Date();

    function readProfile() {
      const fallback = { marketplaces: [], configured: false, valid: false, unavailable: true, status: 'unavailable' };
      try {
        const profile = deps.SellerProfile && deps.SellerProfile.getProfile ? deps.SellerProfile.getProfile() : null;
        return profile && typeof profile === 'object' ? profile : fallback;
      } catch (_) { return fallback; }
    }

    function actionState(newsId) {
      try {
        const status = deps.NewsActionState && deps.NewsActionState.get ? deps.NewsActionState.get(newsId) : 'pending';
        return { status: status === 'completed' ? 'completed' : 'pending' };
      } catch (_) { return { status: 'pending' }; }
    }

    function evaluateWithProfile(newsItem, profile) {
      const news = clone(newsItem && typeof newsItem === 'object' ? newsItem : {});
      const configured = Boolean(profile && profile.configured && Array.isArray(profile.marketplaces) && profile.marketplaces.length);
      const relevance = configured ? deps.NewsRelevance.evaluate(profile, news) : compatibilityRelevance(news);
      const impact = deps.NewsImpact.analyze(news, relevance, now());
      return { news, relevance: clone(relevance), impact: clone(impact), actionState: actionState(news.id) };
    }

    function evaluateNews(newsItem) { return evaluateWithProfile(newsItem, readProfile()); }

    function evaluateAll(newsItems) {
      const profile = readProfile();
      return (Array.isArray(newsItems) ? newsItems : []).map(item => evaluateWithProfile(item, profile));
    }

    function sortByImpactAndDate(items) {
      return items.slice().sort((a, b) => {
        const impactDifference = (IMPACT_RANK[a.impact.impactLevel] ?? 99) - (IMPACT_RANK[b.impact.impactLevel] ?? 99);
        if (impactDifference) return impactDifference;
        return String(b.news.publishedAt || '').localeCompare(String(a.news.publishedAt || ''));
      });
    }

    function getRelevantNews(newsItems) { return evaluateAll(newsItems).filter(item => item.relevance.status === 'relevant'); }
    function getImpactItems(newsItems) { return sortByImpactAndDate(evaluateAll(newsItems).filter(item => !['none', 'unknown'].includes(item.impact.impactLevel))); }
    function getPendingActions(newsItems) {
      return sortByImpactAndDate(evaluateAll(newsItems).filter(item => item.relevance.status === 'relevant' && item.impact.actionRequired && item.actionState.status !== 'completed'));
    }

    function getDashboardModel(newsItems) {
      const profile = readProfile();
      const items = (Array.isArray(newsItems) ? newsItems : []).map(item => evaluateWithProfile(item, profile));
      const relevant = items.filter(item => item.relevance.status === 'relevant');
      const pendingActions = sortByImpactAndDate(relevant.filter(item => item.impact.actionRequired && item.actionState.status !== 'completed'));
      const criticalImpacts = sortByImpactAndDate(relevant.filter(item => item.impact.impactLevel === 'critical'));
      const relevantHighPriority = sortByImpactAndDate(relevant.filter(item => ['critical', 'high'].includes(item.impact.impactLevel)));
      const relevantLatest = relevant.slice().sort((a, b) => String(b.news.publishedAt || '').localeCompare(String(a.news.publishedAt || '')));
      const unknownMarketplace = items.filter(item => item.relevance.status === 'unknown');
      return {
        profileConfigured: Boolean(profile.configured && Array.isArray(profile.marketplaces) && profile.marketplaces.length),
        marketplaces: Array.isArray(profile.marketplaces) ? profile.marketplaces.slice() : [],
        criticalImpacts,
        pendingActions,
        relevantHighPriority,
        relevantLatest,
        unknownMarketplace,
        counts: {
          total: items.length,
          relevant: relevant.length,
          irrelevant: items.filter(item => item.relevance.status === 'irrelevant').length,
          unknown: unknownMarketplace.length,
          critical: criticalImpacts.length,
          pendingActions: pendingActions.length
        }
      };
    }

    return { evaluateNews, evaluateAll, getRelevantNews, getImpactItems, getPendingActions, getDashboardModel };
  }

  const api = create();
  api.create = create;
  return api;
});
