'use strict';

function stable(status, errorCode, errorMessage) {
  return { status, results: [], errorCode: errorCode || null, errorMessage: errorMessage || null };
}

function abortError(error, signal) {
  return Boolean(signal && signal.aborted) || Boolean(error && error.name === 'AbortError');
}

function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw Error('SEARXNG_BASE_URL_REQUIRED');
  let url;
  try { url = new URL(value.trim()); } catch (_) { throw Error('SEARXNG_BASE_URL_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('SEARXNG_BASE_URL_INVALID');
  return url.toString().replace(/\/$/, '');
}

function createSearXNGSearchTransport(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl === undefined ? globalThis.fetch : options.fetchImpl;
  if (typeof fetchImpl !== 'function') throw Error('SEARXNG_FETCH_UNAVAILABLE');

  async function search(searchRequest, runtimeContext = {}) {
    if (!searchRequest || typeof searchRequest.query !== 'string' || !searchRequest.query.trim()) return stable('error', 'SEARXNG_INVALID_REQUEST', 'Search request is invalid.');
    const domains = Array.isArray(searchRequest.domains) ? searchRequest.domains : (typeof searchRequest.domain === 'string' ? [searchRequest.domain] : []);
    if (domains.length !== 1 || typeof domains[0] !== 'string' || !domains[0]) return stable('error', 'SEARXNG_MULTIPLE_DOMAINS_NOT_SUPPORTED', 'SearXNG transport requires exactly one approved domain.');
    if (/\bsite\s*:/i.test(searchRequest.query)) return stable('error', 'SEARXNG_QUERY_OPERATOR_NOT_ALLOWED', 'Search query contains a restricted operator.');
    const params = new URLSearchParams({ q: `site:${domains[0].toLowerCase()} ${searchRequest.query}`, format: 'json' });
    if (typeof searchRequest.language === 'string' && searchRequest.language) params.set('language', searchRequest.language);
    let response;
    try { response = await fetchImpl(`${baseUrl}/search?${params.toString()}`, { method: 'GET', headers: { Accept: 'application/json' }, signal: runtimeContext.signal }); }
    catch (error) { return abortError(error, runtimeContext.signal) ? stable('unavailable', 'SEARXNG_SEARCH_TIMEOUT', 'SearXNG search timed out.') : stable('unavailable', 'SEARXNG_NETWORK_ERROR', 'SearXNG search is unavailable.'); }
    if (!response || !Number.isInteger(response.status)) return stable('error', 'SEARXNG_INVALID_RESPONSE', 'SearXNG search returned an invalid response.');
    if (response.status === 401 || response.status === 403) return stable('error', 'SEARXNG_AUTH_ERROR', 'SearXNG authorization failed.');
    if (response.status === 429) return stable('unavailable', 'SEARXNG_RATE_LIMITED', 'SearXNG rate limit was reached.');
    if (response.status >= 500) return stable('unavailable', 'SEARXNG_SERVICE_UNAVAILABLE', 'SearXNG search is unavailable.');
    if (response.status < 200 || response.status >= 300) return stable('error', 'SEARXNG_HTTP_ERROR', 'SearXNG search failed.');
    let body;
    try { body = await response.json(); } catch (_) { return stable('error', 'SEARXNG_INVALID_RESPONSE', 'SearXNG search returned invalid JSON.'); }
    if (!body || !Array.isArray(body.results)) return stable('error', 'SEARXNG_INVALID_RESPONSE', 'SearXNG search returned invalid results.');
    if (!body.results.length) return stable('empty');
    const results = [];
    for (const row of body.results.slice(0, searchRequest.maxResults)) {
      if (!row || typeof row.title !== 'string' || typeof row.url !== 'string' || (row.content !== undefined && row.content !== null && typeof row.content !== 'string')) return stable('error', 'SEARXNG_INVALID_RESPONSE', 'SearXNG search returned an invalid result.');
      results.push({ externalId: null, title: row.title, url: row.url, snippet: row.content || null, publisher: null, author: null, publishedAt: null, officialAuthorVerified: null, rank: results.length + 1, metadata: { provider: 'searxng', providerRank: results.length + 1 } });
    }
    return results.length ? { status: 'ok', results, errorCode: null, errorMessage: null } : stable('empty');
  }
  return { search };
}

module.exports = { createSearXNGSearchTransport, normalizeBaseUrl };
