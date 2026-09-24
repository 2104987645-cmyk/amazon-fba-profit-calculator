'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const DocumentTransport = require('../knowledge-http-document-transport');

function documentRequest(overrides = {}) {
  return {
    url: 'https://sellercentral.amazon.com/help/start',
    sourceId: 'amazon-seller-help',
    providerId: 'amazon-seller-help-provider',
    requestId: 'document-1',
    ...overrides
  };
}

function response(status, headers = {}, text = '') {
  return {
    status,
    headers: { get(name) { return Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase()) ? headers[Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase())] : null; } },
    async text() { return text; }
  };
}

function streamResponse(text) {
  const bytes = new TextEncoder().encode(text);
  let consumed = false;
  return {
    status: 200,
    headers: { get(name) { return name.toLowerCase() === 'content-type' ? 'text/plain; charset=utf-8' : null; } },
    body: {
      getReader() {
        return {
          async read() {
            if (consumed) return { done: true };
            consumed = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
          releaseLock() {}
        };
      }
    }
  };
}

async function run() {
  assert.equal(typeof DocumentTransport.createHttpDocumentTransport, 'function');
  assert.equal(DocumentTransport.MAX_REDIRECTS, 5);
  assert.equal(DocumentTransport.MAX_RESPONSE_BYTES, 1024 * 1024);
  assert.throws(() => DocumentTransport.createHttpDocumentTransport({ fetchImpl: null }), /DOCUMENT_FETCH_UNAVAILABLE/);
  assert.throws(() => DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => {}, maxBytes: DocumentTransport.MAX_RESPONSE_BYTES + 1 }), /DOCUMENT_INVALID_MAX_BYTES/);

  const calls = [];
  const transport = DocumentTransport.createHttpDocumentTransport({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { 'content-type': 'text/html; charset=utf-8' }, '<html><head><title> Official &amp; Safe </title><script>throw new Error("never execute")</script></head><body>Hello <b>world</b></body></html>');
    }
  });
  assert.equal(typeof transport.fetchDocument, 'function');
  const controller = new AbortController();
  let output = await transport.fetchDocument(documentRequest(), { signal: controller.signal });
  assert.equal(output.status, 'ok');
  assert.equal(output.url, 'https://sellercentral.amazon.com/help/start');
  assert.equal(output.finalUrl, 'https://sellercentral.amazon.com/help/start');
  assert.equal(output.title, 'Official & Safe');
  assert.equal(output.text, 'Official & Safe Hello world');
  assert.deepEqual([output.publisher, output.author, output.publishedAt, output.effectiveAt], [null, null, null, null]);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.strictEqual(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.headers.Accept, DocumentTransport.ACCEPT);
  assert.equal(calls[0].options.headers['User-Agent'], DocumentTransport.DEFAULT_USER_AGENT);
  assert.equal(Object.hasOwn(calls[0].options.headers, 'Cookie'), false);
  assert.equal(Object.hasOwn(calls[0].options.headers, 'Authorization'), false);

  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(200, { 'content-type': 'text/plain; charset=utf-8' }, '中文 UTF-8 document') }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.text, output.title], ['ok', '中文 UTF-8 document', null]);
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => streamResponse('streamed text') }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.text], ['ok', 'streamed text']);
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(200, { 'content-type': 'text/plain' }, '') }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.text], ['empty', '']);
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(204) }).fetchDocument(documentRequest(), {});
  assert.equal(output.status, 'empty');

  for (const [status, expectedStatus, expectedCode] of [[404, 'empty', null], [401, 'error', 'DOCUMENT_ACCESS_DENIED'], [403, 'error', 'DOCUMENT_ACCESS_DENIED'], [429, 'unavailable', 'DOCUMENT_RATE_LIMITED'], [503, 'unavailable', 'DOCUMENT_SERVICE_UNAVAILABLE'], [418, 'error', 'DOCUMENT_HTTP_ERROR']]) {
    output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(status) }).fetchDocument(documentRequest(), {});
    assert.deepEqual([output.status, output.errorCode], [expectedStatus, expectedCode]);
  }
  for (const type of ['image/png', 'application/octet-stream', 'application/pdf', 'application/zip']) {
    output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(200, { 'content-type': type }, 'binary') }).fetchDocument(documentRequest(), {});
    assert.deepEqual([output.status, output.errorCode], ['error', 'DOCUMENT_UNSUPPORTED_CONTENT_TYPE']);
  }
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(200, { 'content-type': 'text/plain', 'content-length': String(DocumentTransport.MAX_RESPONSE_BYTES + 1) }, '') }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.errorCode], ['error', 'DOCUMENT_RESPONSE_TOO_LARGE']);
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(200, { 'content-type': 'text/plain' }, 'x'.repeat(DocumentTransport.MAX_RESPONSE_BYTES + 1)) }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.errorCode], ['error', 'DOCUMENT_RESPONSE_TOO_LARGE']);
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(200, { 'content-type': 'text/plain; charset=iso-8859-1' }, 'x') }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.errorCode], ['error', 'DOCUMENT_UNSUPPORTED_ENCODING']);

  const redirects = [];
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async url => {
    redirects.push(url);
    return redirects.length === 1 ? response(302, { location: '/help/final' }) : response(200, { 'content-type': 'text/plain' }, 'final document');
  } }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.finalUrl, output.text], ['ok', 'https://sellercentral.amazon.com/help/final', 'final document']);
  assert.equal(redirects.length, 2);
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(302, { location: '/help/again' }), maxRedirects: 0 }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.errorCode], ['error', 'DOCUMENT_TOO_MANY_REDIRECTS']);
  for (const location of ['http://sellercentral.amazon.com/help/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.1/x', 'javascript:alert(1)', 'data:text/plain,x']) {
    output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => response(302, { location }) }).fetchDocument(documentRequest(), {});
    assert.deepEqual([output.status, output.errorCode], ['error', 'DOCUMENT_REDIRECT_NOT_ALLOWED']);
  }
  const abort = DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => { const value = Error('timeout details'); value.name = 'AbortError'; throw value; } });
  output = await abort.fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.errorCode], ['unavailable', 'DOCUMENT_FETCH_TIMEOUT']);
  output = await DocumentTransport.createHttpDocumentTransport({ fetchImpl: async () => { throw Error('private network details'); } }).fetchDocument(documentRequest(), {});
  assert.deepEqual([output.status, output.errorCode], ['unavailable', 'DOCUMENT_NETWORK_ERROR']);
  assert.equal(JSON.stringify(output).includes('private network details'), false);
  output = await transport.fetchDocument(documentRequest({ url: 'http://sellercentral.amazon.com/x' }), {});
  assert.deepEqual([output.status, output.errorCode], ['error', 'DOCUMENT_URL_NOT_ALLOWED']);

  const source = fs.readFileSync(require.resolve('../knowledge-http-document-transport'), 'utf8');
  assert.equal(/puppeteer|playwright|chromium|cookie|authorization|browser automation/i.test(source), false);
  console.log('knowledge http document transport passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
