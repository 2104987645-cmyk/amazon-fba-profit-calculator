'use strict';

const assert = require('node:assert/strict');
const B = require('../knowledge-brave-search-transport');

function request(overrides = {}) {
  return { requestId: 'r1', providerId: 'amazon-seller-help-provider', sourceId: 'amazon-seller-help', query: 'Vine Pre Launch', domains: ['sellercentral.amazon.com'], maxResults: 2, recencyDays: 7, locale: 'en-GB', language: 'en', metadata: {}, ...overrides };
}

function response(status, body) { return { status, async json() { return body; } }; }

async function run() {
  assert.equal(typeof B.createBraveSearchTransport, 'function');
  assert.equal(B.DEFAULT_ENDPOINT, 'https://api.search.brave.com/res/v1/web/search');
  assert.equal(B.mapFreshness(1), 'pd');
  assert.equal(B.mapFreshness(7), 'pw');
  assert.equal(B.mapFreshness(31), 'pm');
  assert.equal(B.mapFreshness(365), 'py');
  assert.equal(B.countryFromLocale('zh-CN'), 'CN');
  assert.throws(() => B.createBraveSearchTransport(), /BRAVE_API_KEY_REQUIRED/);
  assert.throws(() => B.createBraveSearchTransport({ apiKey: 'x', fetchImpl: {} }), /BRAVE_FETCH_UNAVAILABLE/);
  let seen;
  const transport = B.createBraveSearchTransport({ apiKey: 'test-secret', endpoint: 'https://test.invalid/search', fetchImpl: async (url, options) => {
    seen = { url, options };
    return response(200, { web: { results: [
      { title: 'A', url: 'https://sellercentral.amazon.com/help/a', description: 'snippet A' },
      { title: 'B', url: 'https://sellercentral.amazon.com/help/b', description: 'snippet B' },
      { title: 'C', url: 'https://sellercentral.amazon.com/help/c', description: 'snippet C' }
    ] } });
  } });
  assert.equal(typeof transport.search, 'function');
  const controller = new AbortController();
  let output = await transport.search(request(), { locale: 'zh-CN', requestId: 'r1', signal: controller.signal });
  const target = new URL(seen.url);
  assert.equal(target.searchParams.get('q'), 'Vine Pre Launch site:sellercentral.amazon.com');
  assert.equal(target.searchParams.get('count'), '2');
  assert.equal(target.searchParams.get('freshness'), 'pw');
  assert.equal(target.searchParams.get('search_lang'), 'en');
  assert.equal(target.searchParams.get('country'), 'GB');
  assert.equal(target.searchParams.get('ui_lang'), 'en-GB');
  assert.equal(seen.options.headers['X-Subscription-Token'], 'test-secret');
  assert.equal(seen.url.includes('test-secret'), false);
  assert.strictEqual(seen.options.signal, controller.signal);
  assert.equal(output.status, 'ok');
  assert.equal(output.results.length, 2);
  assert.deepEqual(output.results[0], { externalId: null, title: 'A', url: 'https://sellercentral.amazon.com/help/a', snippet: 'snippet A', publisher: null, author: null, publishedAt: null, officialAuthorVerified: null, rank: 1, metadata: { provider: 'brave', providerRank: 1 } });
  assert.equal(Object.hasOwn(output.results[0], 'confidence'), false);
  assert.equal(JSON.stringify(output).includes('test-secret'), false);

  output = await transport.search(request({ domains: ['sellercentral.amazon.com', 'sell.amazon.com'] }), {});
  assert.equal(output.errorCode, 'BRAVE_MULTIPLE_DOMAINS_NOT_SUPPORTED');
  output = await transport.search(request({ query: 'Vine site:evil.example' }), {});
  assert.equal(output.errorCode, 'BRAVE_QUERY_OPERATOR_NOT_ALLOWED');
  const empty = B.createBraveSearchTransport({ apiKey: 'x', fetchImpl: async () => response(200, { web: { results: [] } }) });
  assert.equal((await empty.search(request(), {})).status, 'empty');
  for (const [status, code, expected] of [[401, 'BRAVE_AUTH_ERROR', 'error'], [403, 'BRAVE_AUTH_ERROR', 'error'], [429, 'BRAVE_RATE_LIMITED', 'unavailable'], [503, 'BRAVE_SERVICE_UNAVAILABLE', 'unavailable']]) {
    const instance = B.createBraveSearchTransport({ apiKey: 'x', fetchImpl: async () => response(status, {}) });
    const out = await instance.search(request(), {});
    assert.deepEqual([out.status, out.errorCode], [expected, code]);
  }
  const network = B.createBraveSearchTransport({ apiKey: 'x', fetchImpl: async () => { throw Error('network details'); } });
  assert.deepEqual((await network.search(request(), {})).errorCode, 'BRAVE_NETWORK_ERROR');
  const abort = B.createBraveSearchTransport({ apiKey: 'x', fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; } });
  assert.equal((await abort.search(request(), { signal: new AbortController().signal })).errorCode, 'BRAVE_SEARCH_TIMEOUT');
  const invalidJson = B.createBraveSearchTransport({ apiKey: 'x', fetchImpl: async () => ({ status: 200, async json() { throw Error('bad'); } }) });
  assert.equal((await invalidJson.search(request(), {})).errorCode, 'BRAVE_INVALID_RESPONSE');
  const invalidRow = B.createBraveSearchTransport({ apiKey: 'x', fetchImpl: async () => response(200, { web: { results: [{ title: 'missing URL' }] } }) });
  assert.equal((await invalidRow.search(request(), {})).errorCode, 'BRAVE_INVALID_RESPONSE');
  const source = require('node:fs').readFileSync(require.resolve('../knowledge-brave-search-transport'), 'utf8');
  assert.equal(/openai|anthropic|gemini|\bllm\b|embedding|answers|llm context/i.test(source), false);
  console.log('knowledge brave search transport passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
