'use strict';

const DEFAULT_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

function stable(status, errorCode, errorMessage) {
  return { status, results: [], errorCode: errorCode || null, errorMessage: errorMessage || null };
}

function validFetch(value) { return typeof value === 'function'; }

function mapFreshness(days) {
  if (!Number.isInteger(days) || days < 1) return null;
  if (days <= 1) return 'pd';
  if (days <= 7) return 'pw';
  if (days <= 31) return 'pm';
  if (days <= 365) return 'py';
  return null;
}

function countryFromLocale(locale) {
  const match = typeof locale === 'string' && locale.match(/[-_]([A-Za-z]{2})$/);
  return match ? match[1].toUpperCase() : null;
}

function abortError(error, signal) {
  return Boolean(signal && signal.aborted) || Boolean(error && error.name === 'AbortError');
}

function createBraveSearchTransport(options = {}) {
  if (typeof options.apiKey !== 'string' || !options.apiKey.trim()) throw Error('BRAVE_API_KEY_REQUIRED');
  const fetchImpl = options.fetchImpl === undefined ? globalThis.fetch : options.fetchImpl;
  if (!validFetch(fetchImpl)) throw Error('BRAVE_FETCH_UNAVAILABLE');
  const endpoint = options.endpoint === undefined ? DEFAULT_ENDPOINT : options.endpoint;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) throw Error('BRAVE_ENDPOINT_INVALID');

  async function search(searchRequest, runtimeContext = {}) {
    if (!searchRequest || typeof searchRequest.query !== 'string' || !searchRequest.query.trim()) return stable('error', 'BRAVE_INVALID_REQUEST', 'Search request is invalid.');
    if (!Array.isArray(searchRequest.domains) || searchRequest.domains.length !== 1 || searchRequest.domains.some(domain => typeof domain !== 'string' || !domain)) return stable('error', 'BRAVE_MULTIPLE_DOMAINS_NOT_SUPPORTED', 'Brave transport requires exactly one approved domain.');
    if (/\bsite\s*:/i.test(searchRequest.query)) return stable('error', 'BRAVE_QUERY_OPERATOR_NOT_ALLOWED', 'Search query contains a restricted operator.');
    const domain = searchRequest.domains[0].toLowerCase();
    const params = new URLSearchParams({ q: `${searchRequest.query} site:${domain}`, count: String(searchRequest.maxResults) });
    const freshness = mapFreshness(searchRequest.recencyDays);
    const language = typeof searchRequest.language === 'string' && searchRequest.language ? searchRequest.language : null;
    const locale = typeof searchRequest.locale === 'string' && searchRequest.locale ? searchRequest.locale : runtimeContext.locale;
    const country = countryFromLocale(locale);
    if (freshness) params.set('freshness', freshness);
    if (language) params.set('search_lang', language);
    if (country) params.set('country', country);
    if (typeof locale === 'string' && locale) params.set('ui_lang', locale);
    let response;
    try {
      response = await fetchImpl(`${endpoint}?${params.toString()}`, { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': options.apiKey }, signal: runtimeContext.signal });
    } catch (error) {
      return abortError(error, runtimeContext.signal) ? stable('unavailable', 'BRAVE_SEARCH_TIMEOUT', 'Brave search timed out.') : stable('unavailable', 'BRAVE_NETWORK_ERROR', 'Brave search is unavailable.');
    }
    if (!response || !Number.isInteger(response.status)) return stable('error', 'BRAVE_INVALID_RESPONSE', 'Brave search returned an invalid response.');
    if (response.status === 401 || response.status === 403) return stable('error', 'BRAVE_AUTH_ERROR', 'Brave authentication failed.');
    if (response.status === 429) return stable('unavailable', 'BRAVE_RATE_LIMITED', 'Brave rate limit was reached.');
    if (response.status >= 500) return stable('unavailable', 'BRAVE_SERVICE_UNAVAILABLE', 'Brave search is unavailable.');
    if (response.status < 200 || response.status >= 300) return stable('error', 'BRAVE_HTTP_ERROR', 'Brave search failed.');
    let body;
    try { body = await response.json(); } catch (_) { return stable('error', 'BRAVE_INVALID_RESPONSE', 'Brave search returned invalid JSON.'); }
    const rows = body && body.web && body.web.results;
    if (!Array.isArray(rows)) return stable('error', 'BRAVE_INVALID_RESPONSE', 'Brave search returned invalid results.');
    if (!rows.length) return stable('empty');
    const results = [];
    for (const row of rows.slice(0, searchRequest.maxResults)) {
      if (!row || typeof row.title !== 'string' || typeof row.url !== 'string' || (row.description !== undefined && row.description !== null && typeof row.description !== 'string')) return stable('error', 'BRAVE_INVALID_RESPONSE', 'Brave search returned an invalid result.');
      results.push({ externalId: null, title: row.title, url: row.url, snippet: row.description || null, publisher: null, author: null, publishedAt: null, officialAuthorVerified: null, rank: results.length + 1, metadata: { provider: 'brave', providerRank: results.length + 1 } });
    }
    return results.length ? { status: 'ok', results, errorCode: null, errorMessage: null } : stable('empty');
  }

  return { search };
}

module.exports = { DEFAULT_ENDPOINT, createBraveSearchTransport, mapFreshness, countryFromLocale };
