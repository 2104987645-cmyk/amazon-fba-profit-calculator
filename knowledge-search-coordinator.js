'use strict';

const SEARCH_STATUSES = new Set(['ok', 'empty', 'unavailable', 'error']);

function response(status, values = {}) {
  return {
    status,
    results: [],
    errorCode: null,
    errorMessage: null,
    ...values
  };
}

function uniqueDomains(domains) {
  const seen = new Set();
  return domains.filter(domain => {
    const key = domain.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resultKeys(result) {
  if (!result || typeof result !== 'object') return [];
  const keys = [];
  if (typeof result.externalId === 'string' && result.externalId) keys.push(`external:${result.externalId}`);
  if (typeof result.url === 'string' && result.url) keys.push(`url:${result.url}`);
  return keys;
}

function singleDomainRequest(searchRequest, domain) {
  return {
    ...searchRequest,
    domains: [domain],
    metadata: { ...searchRequest.metadata }
  };
}

function invalidResponse() {
  return response('error', {
    errorCode: 'SEARCH_DOMAIN_INVALID_RESPONSE',
    errorMessage: 'Search transport returned an invalid domain response.'
  });
}

async function coordinateSearch(searchTransport, searchRequest, runtimeContext) {
  if (!searchTransport || typeof searchTransport.search !== 'function') {
    return response('error', {
      errorCode: 'SEARCH_TRANSPORT_INVALID',
      errorMessage: 'Search transport is invalid.'
    });
  }
  if (!searchRequest || !Array.isArray(searchRequest.domains) || !searchRequest.domains.length) {
    return invalidResponse();
  }

  const results = [];
  const seenResultKeys = new Set();
  const domains = uniqueDomains(searchRequest.domains);
  for (const domain of domains) {
    let domainResponse;
    try {
      domainResponse = await searchTransport.search(singleDomainRequest(searchRequest, domain), runtimeContext);
    } catch (_) {
      return response('error', {
        errorCode: 'SEARCH_DOMAIN_TRANSPORT_ERROR',
        errorMessage: 'Search transport failed for an allowed domain.'
      });
    }
    if (!domainResponse || typeof domainResponse !== 'object' || !SEARCH_STATUSES.has(domainResponse.status)) {
      return invalidResponse();
    }
    if (domainResponse.status === 'unavailable') {
      return response('unavailable', {
        errorCode: typeof domainResponse.errorCode === 'string' ? domainResponse.errorCode : 'SEARCH_DOMAIN_UNAVAILABLE',
        errorMessage: 'Search is unavailable for an allowed domain.'
      });
    }
    if (domainResponse.status === 'error') {
      return response('error', {
        errorCode: typeof domainResponse.errorCode === 'string' ? domainResponse.errorCode : 'SEARCH_DOMAIN_ERROR',
        errorMessage: 'Search failed for an allowed domain.'
      });
    }
    if (domainResponse.status === 'empty') continue;
    if (!Array.isArray(domainResponse.results)) return invalidResponse();

    for (const item of domainResponse.results) {
      const keys = resultKeys(item);
      if (keys.some(key => seenResultKeys.has(key))) continue;
      keys.forEach(key => seenResultKeys.add(key));
      results.push({ ...item, rank: results.length + 1 });
    }
  }

  const maxResults = Number.isInteger(searchRequest.maxResults) ? searchRequest.maxResults : results.length;
  const retained = results.slice(0, maxResults);
  return response(retained.length ? 'ok' : 'empty', { results: retained });
}

module.exports = {
  coordinateSearch
};
