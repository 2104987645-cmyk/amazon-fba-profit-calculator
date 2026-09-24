'use strict';

const Access = require('./knowledge-source-access-registry');
const Url = require('./knowledge-live-url-validator');

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_USER_AGENT = 'AmazonSellerWorkbench/1.0 KnowledgeDocumentFetcher';
const ACCEPT = 'text/html, text/plain, application/xhtml+xml';

function response(status, values = {}) {
  return {
    status,
    url: null,
    finalUrl: null,
    text: '',
    title: null,
    publisher: null,
    author: null,
    publishedAt: null,
    effectiveAt: null,
    errorCode: null,
    errorMessage: null,
    ...values
  };
}

function error(code, message) {
  return response('error', { errorCode: code, errorMessage: message });
}

function unavailable(code, message) {
  return response('unavailable', { errorCode: code, errorMessage: message });
}

function policyFor(sourceId) {
  return Access.getPolicy(sourceId);
}

function approvedUrl(value, sourceId) {
  const policy = policyFor(sourceId);
  if (!policy) return null;
  const checked = Url.validateUrl(value, policy);
  return checked.valid ? checked.url : null;
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find(item => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function contentType(value) {
  return typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : '';
}

function isUtf8(value) {
  if (!value) return true;
  const match = /charset\s*=\s*([^;\s]+)/i.exec(value);
  return !match || ['utf-8', 'utf8'].includes(match[1].replace(/["']/g, '').toLowerCase());
}

function decodeEntities(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
    const lower = entity.toLowerCase();
    if (named[lower] !== undefined) return named[lower];
    const numeric = lower.slice(2, -1);
    const codePoint = numeric.startsWith('x') ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
  });
}

function extractHtml(html) {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const withoutInactiveContent = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ');
  const text = decodeEntities(withoutInactiveContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return {
    text,
    title: titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || null : null
  };
}

async function readResponseText(httpResponse, maxBytes) {
  const contentLength = headerValue(httpResponse.headers, 'content-length');
  if (contentLength && Number(contentLength) > maxBytes) throw Error('DOCUMENT_RESPONSE_TOO_LARGE');
  if (httpResponse.body && typeof httpResponse.body.getReader === 'function') {
    const reader = httpResponse.body.getReader();
    const chunks = [];
    let byteLength = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
        byteLength += chunk.byteLength;
        if (byteLength > maxBytes) {
          await reader.cancel();
          throw Error('DOCUMENT_RESPONSE_TOO_LARGE');
        }
        chunks.push(chunk);
      }
      const data = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(data);
    } finally {
      reader.releaseLock();
    }
  }
  if (typeof httpResponse.text !== 'function') throw Error('DOCUMENT_INVALID_RESPONSE');
  const text = await httpResponse.text();
  if (typeof text !== 'string') throw Error('DOCUMENT_INVALID_RESPONSE');
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw Error('DOCUMENT_RESPONSE_TOO_LARGE');
  return text;
}

function createHttpDocumentTransport(options = {}) {
  const fetchImpl = options.fetchImpl === undefined ? globalThis.fetch : options.fetchImpl;
  const maxRedirects = options.maxRedirects === undefined ? MAX_REDIRECTS : options.maxRedirects;
  const maxBytes = options.maxBytes === undefined ? MAX_RESPONSE_BYTES : options.maxBytes;
  const userAgent = options.userAgent === undefined ? DEFAULT_USER_AGENT : options.userAgent;
  if (typeof fetchImpl !== 'function') throw Error('DOCUMENT_FETCH_UNAVAILABLE');
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) throw Error('DOCUMENT_INVALID_MAX_REDIRECTS');
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RESPONSE_BYTES) throw Error('DOCUMENT_INVALID_MAX_BYTES');
  if (typeof userAgent !== 'string' || !userAgent.trim()) throw Error('DOCUMENT_INVALID_USER_AGENT');

  async function fetchDocument(input, runtimeContext = {}) {
    const initialUrl = approvedUrl(input && input.url, input && input.sourceId);
    if (!initialUrl) return error('DOCUMENT_URL_NOT_ALLOWED', 'Document URL is not allowed.');
    let currentUrl = initialUrl;
    let redirectCount = 0;
    while (true) {
      let httpResponse;
      try {
        httpResponse = await fetchImpl(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: runtimeContext.signal,
          headers: { Accept: ACCEPT, 'User-Agent': userAgent }
        });
      } catch (fetchError) {
        if (fetchError && fetchError.name === 'AbortError') return unavailable('DOCUMENT_FETCH_TIMEOUT', 'Document fetch timed out.');
        return unavailable('DOCUMENT_NETWORK_ERROR', 'Document fetch is unavailable.');
      }
      if (!httpResponse || typeof httpResponse.status !== 'number') return error('DOCUMENT_INVALID_RESPONSE', 'Document transport received an invalid response.');
      if (httpResponse.status >= 300 && httpResponse.status < 400) {
        if (redirectCount >= maxRedirects) return error('DOCUMENT_TOO_MANY_REDIRECTS', 'Document redirect limit was reached.');
        const location = headerValue(httpResponse.headers, 'location');
        let redirected;
        try { redirected = new URL(location, currentUrl).toString(); } catch (_) { return error('DOCUMENT_REDIRECT_NOT_ALLOWED', 'Document redirect is not allowed.'); }
        const approvedRedirect = approvedUrl(redirected, input.sourceId);
        if (!approvedRedirect) return error('DOCUMENT_REDIRECT_NOT_ALLOWED', 'Document redirect is not allowed.');
        currentUrl = approvedRedirect;
        redirectCount += 1;
        continue;
      }
      if (httpResponse.status === 204 || httpResponse.status === 404) return response('empty', { url: initialUrl, finalUrl: currentUrl });
      if (httpResponse.status === 401 || httpResponse.status === 403) return error('DOCUMENT_ACCESS_DENIED', 'Document access was denied.');
      if (httpResponse.status === 429) return unavailable('DOCUMENT_RATE_LIMITED', 'Document fetch is rate limited.');
      if (httpResponse.status >= 500) return unavailable('DOCUMENT_SERVICE_UNAVAILABLE', 'Document service is unavailable.');
      if (httpResponse.status < 200 || httpResponse.status >= 300) return error('DOCUMENT_HTTP_ERROR', 'Document request failed.');
      const type = contentType(headerValue(httpResponse.headers, 'content-type'));
      if (!['text/html', 'text/plain', 'application/xhtml+xml'].includes(type)) return error('DOCUMENT_UNSUPPORTED_CONTENT_TYPE', 'Document content type is not supported.');
      if (!isUtf8(headerValue(httpResponse.headers, 'content-type'))) return error('DOCUMENT_UNSUPPORTED_ENCODING', 'Document encoding is not supported.');
      let rawText;
      try {
        rawText = await readResponseText(httpResponse, maxBytes);
      } catch (readError) {
        if (readError && readError.message === 'DOCUMENT_RESPONSE_TOO_LARGE') return error('DOCUMENT_RESPONSE_TOO_LARGE', 'Document response exceeds the size limit.');
        return error('DOCUMENT_INVALID_RESPONSE', 'Document response could not be read.');
      }
      const extracted = type === 'text/plain' ? { text: rawText, title: null } : extractHtml(rawText);
      if (!extracted.text) return response('empty', { url: initialUrl, finalUrl: currentUrl });
      return response('ok', { url: initialUrl, finalUrl: currentUrl, text: extracted.text, title: extracted.title });
    }
  }

  return { fetchDocument };
}

module.exports = {
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  DEFAULT_USER_AGENT,
  ACCEPT,
  createHttpDocumentTransport
};
