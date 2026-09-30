'use strict';

const assert = require('node:assert/strict');
const SearXNG = require('../knowledge-searxng-search-transport');

const response = (status, body) => ({ status, async json() { return body; } });
const request = (overrides = {}) => ({ query: 'Vine Pre-Launch 是什么？', domains: ['sellercentral.amazon.com'], maxResults: 3, language: 'zh-CN', metadata: {}, ...overrides });

async function run() {
  assert.equal(typeof SearXNG.createSearXNGSearchTransport, 'function');
  assert.throws(() => SearXNG.createSearXNGSearchTransport(), /SEARXNG_BASE_URL_REQUIRED/);
  assert.throws(() => SearXNG.createSearXNGSearchTransport({ baseUrl: 'not-url', fetchImpl: async () => {} }), /SEARXNG_BASE_URL_INVALID/);
  assert.throws(() => SearXNG.createSearXNGSearchTransport({ baseUrl: 'http://searxng:8080', fetchImpl: null }), /SEARXNG_FETCH_UNAVAILABLE/);
  let call; let calls = 0; const source = request(); const snapshot = structuredClone(source);
  const transport = SearXNG.createSearXNGSearchTransport({ baseUrl: 'http://searxng:8080/', fetchImpl: async (url, options) => { calls += 1; call = { url, options }; return response(200, { results: [{ title: 'Amazon Vine', url: 'https://sellercentral.amazon.com/help/vine', content: 'Official English source.' }] }); } });
  const output = await transport.search(source, {});
  assert.equal(calls, 1); assert.deepEqual(source, snapshot); const url = new URL(call.url); assert.equal(url.origin, 'http://searxng:8080'); assert.equal(url.pathname, '/search'); assert.equal(url.searchParams.get('format'), 'json'); assert.equal(url.searchParams.get('q'), 'site:sellercentral.amazon.com Vine Pre-Launch 是什么？'); assert.equal(url.searchParams.get('language'), 'zh-CN'); assert.equal(call.options.method, 'GET'); assert.equal(call.options.headers.Accept, 'application/json'); assert.deepEqual([output.status, output.results.length], ['ok', 1]); assert.deepEqual(output.results[0], { externalId: null, title: 'Amazon Vine', url: 'https://sellercentral.amazon.com/help/vine', snippet: 'Official English source.', publisher: null, author: null, publishedAt: null, officialAuthorVerified: null, rank: 1, metadata: { provider: 'searxng', providerRank: 1 } });
  let englishCall; await SearXNG.createSearXNGSearchTransport({ baseUrl: 'https://search.example', fetchImpl: async url => { englishCall = url; return response(200, { results: [] }); } }).search(request({ query: 'Amazon Vine requirements', language: null })); assert.equal(new URL(englishCall).searchParams.get('q'), 'site:sellercentral.amazon.com Amazon Vine requirements');
  assert.equal((await transport.search(request({ query: 'site:evil.example test' }))).errorCode, 'SEARXNG_QUERY_OPERATOR_NOT_ALLOWED');
  assert.equal((await transport.search(request({ domains: ['a', 'b'] }))).errorCode, 'SEARXNG_MULTIPLE_DOMAINS_NOT_SUPPORTED');
  assert.equal((await SearXNG.createSearXNGSearchTransport({ baseUrl: 'https://search.example', fetchImpl: async () => response(200, { results: [] }) }).search(request())).status, 'empty');
  for (const [status, expected] of [[403, ['error', 'SEARXNG_AUTH_ERROR']], [429, ['unavailable', 'SEARXNG_RATE_LIMITED']], [500, ['unavailable', 'SEARXNG_SERVICE_UNAVAILABLE']]]) { const value = await SearXNG.createSearXNGSearchTransport({ baseUrl: 'https://search.example', fetchImpl: async () => response(status, {}) }).search(request()); assert.deepEqual([value.status, value.errorCode], expected); }
  for (const fetchImpl of [async () => { throw Error('network'); }, async () => { const error = Error('abort'); error.name = 'AbortError'; throw error; }]) { const value = await SearXNG.createSearXNGSearchTransport({ baseUrl: 'https://search.example', fetchImpl }).search(request()); assert.equal(value.status, 'unavailable'); }
  for (const body of [{}, { results: {} }, { results: [{ title: 'bad' }] }]) { const value = await SearXNG.createSearXNGSearchTransport({ baseUrl: 'https://search.example', fetchImpl: async () => response(200, body) }).search(request()); assert.deepEqual([value.status, value.errorCode], ['error', 'SEARXNG_INVALID_RESPONSE']); }
  const malformedJson = await SearXNG.createSearXNGSearchTransport({ baseUrl: 'https://search.example', fetchImpl: async () => ({ status: 200, async json() { throw Error('bad json'); } }) }).search(request()); assert.equal(malformedJson.errorCode, 'SEARXNG_INVALID_RESPONSE');
  console.log('knowledge searxng search transport passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
