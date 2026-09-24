'use strict';

const STATUS = Object.freeze(['ok', 'empty', 'unavailable', 'error']);
const MAX_DOCUMENT_TEXT_BYTES = 1024 * 1024;

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function validNullableString(value) { return value === null || value === undefined || typeof value === 'string'; }
function validStatus(value) { return STATUS.includes(value); }
function validateSearchTransport(value) { return Boolean(value && typeof value.search === 'function'); }
function validateDocumentTransport(value) { return Boolean(value && typeof value.fetchDocument === 'function'); }

function assertTransportConfiguration(searchTransport, documentTransport) {
  if (searchTransport !== undefined && !validateSearchTransport(searchTransport)) throw Error('INVALID_SEARCH_TRANSPORT');
  if (documentTransport !== undefined && !validateDocumentTransport(documentTransport)) throw Error('INVALID_DOCUMENT_TRANSPORT');
}

function runtimeContext(requestId, locale, signal) {
  return { now: new Date().toISOString(), locale: typeof locale === 'string' ? locale : null, requestId, signal };
}

async function runWithTimeout(callback, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ timedOut: true });
      }, timeoutMs);
    });
    const result = await Promise.race([Promise.resolve().then(() => callback(controller.signal)).then(value => ({ value })), timeout]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function response(status, values = {}) {
  return { status, results: [], errorCode: null, errorMessage: null, ...values };
}

function resultIsShapeValid(result) {
  return isObject(result) && validNullableString(result.externalId) && validNullableString(result.title) && validNullableString(result.url) && validNullableString(result.snippet) && validNullableString(result.publisher) && validNullableString(result.author) && validNullableString(result.publishedAt) && (result.officialAuthorVerified === null || result.officialAuthorVerified === undefined || typeof result.officialAuthorVerified === 'boolean') && (result.rank === null || result.rank === undefined || (Number.isInteger(result.rank) && result.rank >= 0)) && (result.metadata === null || result.metadata === undefined || isObject(result.metadata));
}

function normalizeSearchResponse(raw, policy, requestedDomains, validateUrl) {
  if (!isObject(raw) || !validStatus(raw.status)) return response('error', { errorCode: 'SEARCH_TRANSPORT_INVALID_RESPONSE', errorMessage: 'Search transport returned an invalid response.' });
  if (raw.status !== 'ok') return response(raw.status, { errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : null, errorMessage: raw.status === 'error' ? 'Search transport failed.' : null });
  if (!Array.isArray(raw.results)) return response('error', { errorCode: 'SEARCH_TRANSPORT_INVALID_RESPONSE', errorMessage: 'Search transport returned invalid results.' });
  const rejected = [];
  const results = raw.results.filter(item => {
    if (!resultIsShapeValid(item) || typeof item.url !== 'string') { rejected.push('shape'); return false; }
    const checked = validateUrl(item.url, policy);
    let host = null;
    try { host = new URL(checked.url || item.url).hostname.toLowerCase(); } catch (_) {}
    if (!checked.valid || !requestedDomains.includes(host)) { rejected.push('url'); return false; }
    return true;
  }).map(item => ({ externalId: item.externalId || null, title: item.title || null, url: validateUrl(item.url, policy).url, snippet: item.snippet || null, publisher: item.publisher || null, author: item.author || null, publishedAt: item.publishedAt || null, officialAuthorVerified: item.officialAuthorVerified === true ? true : null, rank: item.rank == null ? null : item.rank, metadata: isObject(item.metadata) ? item.metadata : {} }));
  if (!results.length && raw.results.length) return response('error', { errorCode: rejected.includes('url') ? 'SEARCH_RESULT_URL_NOT_ALLOWED' : 'SEARCH_RESULT_INVALID', errorMessage: 'Search transport returned no admissible results.' });
  return response(results.length ? 'ok' : 'empty', { results });
}

function normalizeDocumentResponse(raw, policy, initialUrl, validateUrl) {
  if (!isObject(raw) || !validStatus(raw.status)) return { status: 'error', errorCode: 'DOCUMENT_TRANSPORT_INVALID_RESPONSE', errorMessage: 'Document transport returned an invalid response.' };
  if (raw.status !== 'ok') return { status: raw.status, errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : null, errorMessage: raw.status === 'error' ? 'Document transport failed.' : null };
  if (!validNullableString(raw.url) || !validNullableString(raw.finalUrl) || !validNullableString(raw.text) || !validNullableString(raw.title) || !validNullableString(raw.publisher) || !validNullableString(raw.author) || !validNullableString(raw.publishedAt) || !validNullableString(raw.effectiveAt)) return { status: 'error', errorCode: 'DOCUMENT_TRANSPORT_INVALID_RESPONSE', errorMessage: 'Document transport returned an invalid document.' };
  const finalUrl = typeof raw.finalUrl === 'string' ? raw.finalUrl : initialUrl;
  const checked = validateUrl(finalUrl, policy);
  if (!checked.valid) return { status: 'error', errorCode: 'DOCUMENT_FINAL_URL_NOT_ALLOWED', errorMessage: 'Document final URL is not allowed.' };
  if (typeof raw.text === 'string' && Buffer.byteLength(raw.text, 'utf8') > MAX_DOCUMENT_TEXT_BYTES) return { status: 'error', errorCode: 'DOCUMENT_TEXT_TOO_LARGE', errorMessage: 'Document text exceeds the runtime limit.' };
  return { status: 'ok', url: checked.url, finalUrl: checked.url, text: raw.text || null, title: raw.title || null, publisher: raw.publisher || null, author: raw.author || null, publishedAt: raw.publishedAt || null, effectiveAt: raw.effectiveAt || null, errorCode: null, errorMessage: null };
}

module.exports = { STATUS: STATUS.slice(), MAX_DOCUMENT_TEXT_BYTES, validateSearchTransport, validateDocumentTransport, assertTransportConfiguration, runtimeContext, runWithTimeout, normalizeSearchResponse, normalizeDocumentResponse };
