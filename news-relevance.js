(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NewsRelevance = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PROFILE_MARKETPLACES = new Set(['US','CA','MX','UK','DE','FR','IT','ES','NL','SE','PL','BE','AU','JP']);
  const NEWS_MARKETPLACES = new Set([...PROFILE_MARKETPLACES, 'GLOBAL', 'EU']);
  const EU_MEMBERS = new Set(['DE', 'FR', 'IT', 'ES']);

  function normalizeValues(values, allowed) {
    const result = []; let invalid = false;
    values.forEach(value => {
      const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
      if (!allowed.has(code)) { invalid = true; return; }
      if (!result.includes(code)) result.push(code);
    });
    return { values: result, invalid };
  }

  function profileValues(profile) {
    if (!profile || typeof profile !== 'object' || !Array.isArray(profile.marketplaces)) return { values: [], invalid: true };
    return normalizeValues(profile.marketplaces, PROFILE_MARKETPLACES);
  }

  function newsValues(news) {
    if (!news || typeof news !== 'object') return { values: [], missing: true, invalid: false };
    let raw;
    if (Array.isArray(news.marketplaces)) raw = news.marketplaces;
    else if (Object.prototype.hasOwnProperty.call(news, 'marketplaces')) return { values: [], missing: false, invalid: true };
    else if (typeof news.marketplace === 'string') raw = [news.marketplace];
    else if (Object.prototype.hasOwnProperty.call(news, 'marketplace')) return { values: [], missing: false, invalid: true };
    else return { values: [], missing: true, invalid: false };
    if (!raw.length) return { values: [], missing: true, invalid: false };
    const normalized = normalizeValues(raw, NEWS_MARKETPLACES);
    return { values: normalized.values, missing: false, invalid: normalized.invalid };
  }

  function result(status, reasonCodes, matchedMarketplaces, profileMarketplaces, newsMarketplaces) {
    return { status, reasonCodes: reasonCodes.slice(), matchedMarketplaces: matchedMarketplaces.slice(), profileMarketplaces: profileMarketplaces.slice(), newsMarketplaces: newsMarketplaces.slice() };
  }

  function evaluate(profile, news) {
    const newsResult = newsValues(news);
    if (newsResult.missing) return result('unknown', ['NEWS_MARKETPLACE_MISSING'], [], profileValues(profile).values, []);
    if (newsResult.invalid || !newsResult.values.length) return result('unknown', ['NEWS_MARKETPLACE_INVALID'], [], profileValues(profile).values, newsResult.values);
    if (newsResult.values.includes('GLOBAL')) return result('relevant', ['GLOBAL_NEWS'], ['GLOBAL'], profileValues(profile).values, newsResult.values);

    const profileResult = profileValues(profile);
    if (profileResult.invalid || !profileResult.values.length) return result('unknown', ['PROFILE_MISSING'], [], profileResult.values, newsResult.values);

    const exact = newsResult.values.filter(code => PROFILE_MARKETPLACES.has(code) && profileResult.values.includes(code));
    if (exact.length) return result('relevant', ['EXACT_MARKETPLACE_MATCH'], exact, profileResult.values, newsResult.values);

    if (newsResult.values.includes('EU')) {
      const regional = profileResult.values.filter(code => EU_MEMBERS.has(code));
      if (regional.length) return result('relevant', ['REGIONAL_MARKETPLACE_MATCH'], regional, profileResult.values, newsResult.values);
    }
    return result('irrelevant', ['NO_MARKETPLACE_MATCH'], [], profileResult.values, newsResult.values);
  }

  function getRelevance(profile, news) { return evaluate(profile, news); }

  return { evaluate, getRelevance, PROFILE_MARKETPLACES: [...PROFILE_MARKETPLACES], NEWS_MARKETPLACES: [...NEWS_MARKETPLACES], EU_MEMBERS: [...EU_MEMBERS] };
});
