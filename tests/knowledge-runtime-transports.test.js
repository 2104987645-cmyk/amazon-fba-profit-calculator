'use strict';

const assert = require('node:assert/strict');
const T = require('../knowledge-runtime-transports');
const Access = require('../knowledge-source-access-registry');
const Url = require('../knowledge-live-url-validator');

async function run() {
  const policy = Access.getPolicy('amazon-seller-help');
  assert.deepEqual(T.STATUS, ['ok', 'empty', 'unavailable', 'error']);
  assert.equal(T.MAX_DOCUMENT_TEXT_BYTES, 1024 * 1024);
  assert.equal(T.validateSearchTransport({ search() {} }), true);
  assert.equal(T.validateSearchTransport({}), false);
  assert.equal(T.validateDocumentTransport({ fetchDocument() {} }), true);
  assert.equal(T.validateDocumentTransport(null), false);
  assert.throws(() => T.assertTransportConfiguration(null, undefined), /INVALID_SEARCH_TRANSPORT/);
  assert.throws(() => T.assertTransportConfiguration(undefined, {}), /INVALID_DOCUMENT_TRANSPORT/);
  const context = T.runtimeContext('r1', 'zh-CN', new AbortController().signal);
  assert.deepEqual(Object.keys(context).sort(), ['locale', 'now', 'requestId', 'signal']);
  assert.equal(context.requestId, 'r1');
  const timedOut = await T.runWithTimeout(() => new Promise(() => {}), 5);
  assert.equal(timedOut.timedOut, true);

  const valid = T.normalizeSearchResponse({ status: 'ok', results: [{ externalId: 'a', title: 'A', url: 'https://sellercentral.amazon.com/help', snippet: null, publisher: null, author: null, publishedAt: null, officialAuthorVerified: null, rank: 1, metadata: {} }] }, policy, ['sellercentral.amazon.com'], Url.validateUrl);
  assert.equal(valid.status, 'ok');
  assert.equal(valid.results.length, 1);
  assert.equal(T.normalizeSearchResponse({ status: 'empty', results: [] }, policy, ['sellercentral.amazon.com'], Url.validateUrl).status, 'empty');
  assert.equal(T.normalizeSearchResponse({ status: 'unavailable', results: [] }, policy, ['sellercentral.amazon.com'], Url.validateUrl).status, 'unavailable');
  assert.equal(T.normalizeSearchResponse({ status: 'ok', results: [{ url: 'https://sellercentral.amazon.com.evil/x' }] }, policy, ['sellercentral.amazon.com'], Url.validateUrl).errorCode, 'SEARCH_RESULT_URL_NOT_ALLOWED');
  assert.equal(T.normalizeSearchResponse({ status: 'ok', results: [{ url: 'http://sellercentral.amazon.com/x' }] }, policy, ['sellercentral.amazon.com'], Url.validateUrl).errorCode, 'SEARCH_RESULT_URL_NOT_ALLOWED');
  assert.equal(T.normalizeSearchResponse({ status: 'ok', results: [{ url: 'https://sellercentral.amazon.com/help' }] }, policy, ['advertising.amazon.com'], Url.validateUrl).errorCode, 'SEARCH_RESULT_URL_NOT_ALLOWED');

  const document = T.normalizeDocumentResponse({ status: 'ok', url: 'https://sellercentral.amazon.com/help', finalUrl: 'https://sellercentral.amazon.com/help', text: 'safe', title: 'A', publisher: null, author: null, publishedAt: null, effectiveAt: null }, policy, 'https://sellercentral.amazon.com/help', Url.validateUrl);
  assert.equal(document.status, 'ok');
  assert.equal(T.normalizeDocumentResponse({ status: 'ok', url: null, finalUrl: 'https://localhost/x', text: 'x', title: null, publisher: null, author: null, publishedAt: null, effectiveAt: null }, policy, 'https://sellercentral.amazon.com/help', Url.validateUrl).errorCode, 'DOCUMENT_FINAL_URL_NOT_ALLOWED');
  assert.equal(T.normalizeDocumentResponse({ status: 'ok', url: null, finalUrl: null, text: 'x'.repeat(T.MAX_DOCUMENT_TEXT_BYTES + 1), title: null, publisher: null, author: null, publishedAt: null, effectiveAt: null }, policy, 'https://sellercentral.amazon.com/help', Url.validateUrl).errorCode, 'DOCUMENT_TEXT_TOO_LARGE');
  console.log('knowledge runtime transports passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
