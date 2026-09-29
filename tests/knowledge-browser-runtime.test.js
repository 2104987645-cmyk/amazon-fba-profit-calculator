'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Runtime = require('../knowledge-browser-runtime');
const Preparation = require('../knowledge-query-preparation');

function response(status, body) {
  return { status, async json() { return body; } };
}

function retrievalRequest(overrides = {}) {
  return {
    requestId: 'retrieval-vine',
    providerId: 'amazon-seller-help-provider',
    sourceId: 'amazon-seller-help',
    required: false,
    query: { originalQuestion: 'Vine Pre-Launch 是什么？', normalizedQuestion: 'Vine Pre-Launch 是什么？', topic: 'brand-reviews', intent: 'definition', marketplaces: [], regions: ['GLOBAL'], requestedYear: '2026', freshness: 'evergreen' },
    constraints: { requiresFreshVerification: false, maxAgeDays: null, allowCommunitySupplement: false, requiredAuthorityClasses: [] },
    jurisdictions: [],
    ...overrides
  };
}

function claim() {
  return { claimId: 'vine', text: 'Vine Pre-Launch 的定义。', claimType: 'definition', topic: 'brand-reviews', intent: 'definition', marketplaces: [], regions: ['GLOBAL'], requestedYear: '2026', freshness: 'evergreen', authorityRequirement: { mustInclude: [] }, temporalRequirement: { mode: 'evergreen' }, metadata: {} };
}

async function run() {
  assert.equal(typeof Runtime.createBrowserKnowledgeRuntime, 'function');
  assert.deepEqual(Runtime.ENDPOINTS, { search: '/api/knowledge/search', document: '/api/knowledge/document', verify: '/api/knowledge/verify', plan: '/api/knowledge/plan' });

  const browserCalls = [];
  const browserWindow = {
    fetch: async (url, options) => {
      browserCalls.push({ url, options });
      return response(200, { status: 'empty', results: [] });
    },
    KnowledgeLiveAdapters: { createLiveAdapters: () => ({}) },
    KnowledgeQueryOrchestrator: { executeKnowledgeQuery: async () => ({}) },
    KnowledgeQueryPreparation: {},
    KnowledgeQueryUnderstanding: {}
  };
  const browserSource = fs.readFileSync(require.resolve('../knowledge-browser-runtime'), 'utf8');
  vm.runInNewContext(browserSource, { window: browserWindow, globalThis: browserWindow });
  assert.equal(typeof browserWindow.KnowledgeBrowserRuntime.createBrowserKnowledgeRuntime, 'function');
  const browserRuntime = browserWindow.KnowledgeBrowserRuntime.createBrowserKnowledgeRuntime();
  assert.equal(browserRuntime.status, 'ready');
  assert.equal(browserCalls.length, 0, 'runtime construction must not issue startup requests');
  assert.equal((await browserRuntime.transports.search.search({ requestId: 'browser-global', query: 'Vine' })).status, 'empty');
  assert.equal(browserCalls[0].url, '/api/knowledge/search');
  assert.equal(browserCalls[0].options.headers.Authorization, undefined);

  const calls = [];
  const runtime = Runtime.createBrowserKnowledgeRuntime({
    now: '2026-09-28T00:00:00.000Z',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/search')) return response(200, { requestId: 'retrieval-vine', status: 'ok', results: [{ externalId: 'vine-result', title: 'Vine', url: 'https://sellercentral.amazon.com/help/vine', snippet: 'Vine definition', publisher: 'Amazon', author: null, publishedAt: null, officialAuthorVerified: null, rank: 1, metadata: {} }], errorCode: null, errorMessage: null });
      if (url.endsWith('/document')) return response(200, { requestId: 'retrieval-vine', status: 'ok', url: 'https://sellercentral.amazon.com/help/vine', finalUrl: 'https://sellercentral.amazon.com/help/vine', text: 'Vine definition', title: 'Vine', publisher: 'Amazon', author: null, publishedAt: null, effectiveAt: null, errorCode: null, errorMessage: null });
      if (url.endsWith('/verify')) return response(200, { status: 'supports', supportStrength: 'direct', excerpt: 'Vine definition', rationale: 'Direct support.', verifierType: 'server', metadata: {} });
      if (url.endsWith('/plan')) return response(200, { status: 'ready', claims: [{ claimId: 'uk-open', text: 'Verify current UK SIPP applicability requirements.', claimType: 'eligibility', topic: 'fba-logistics', intent: 'requirements', marketplaces: ['UK'], regions: [], requestedYear: '2026', freshness: 'current', authorityRequirement: { mustInclude: ['amazon-official'] }, temporalRequirement: { mode: 'current', maxAgeDays: 30 }, metadata: {} }], ambiguities: [], confidence: 'medium', metadata: {} });
      throw Error('unexpected endpoint');
    }
  });
  assert.equal(runtime.status, 'ready');
  assert.equal(calls.length, 0);
  assert.equal(typeof runtime.queryDependencies.adapters['amazon-seller-help-provider'].retrieve, 'function');

  const input = retrievalRequest();
  const inputSnapshot = structuredClone(input);
  const retrieved = await runtime.queryDependencies.adapters['amazon-seller-help-provider'].retrieve(input, { searchTransport: runtime.transports.search, documentTransport: runtime.transports.document, now: '2026-09-28T00:00:00.000Z' });
  assert.equal(retrieved.status, 'ok');
  assert.equal(retrieved.items[0].content, 'Vine definition');
  assert.deepEqual(input, inputSnapshot);
  assert.equal(calls[0].url, '/api/knowledge/search');
  assert.equal(calls[1].url, '/api/knowledge/document');
  for (const call of calls) {
    assert.equal(call.options.method, 'POST');
    assert.deepEqual(call.options.headers, { 'Content-Type': 'application/json' });
    assert.equal(Object.hasOwn(call.options.headers, 'Authorization'), false);
  }
  const verification = await runtime.transports.verify.verify(claim(), { candidateId: 'candidate-vine', claimId: 'vine', retrievalItemId: 'vine-result', sourceId: 'amazon-seller-help', providerId: 'amazon-seller-help-provider', url: 'https://sellercentral.amazon.com/help/vine', externalId: 'vine-result', content: 'Vine definition', excerpt: 'Vine definition' }, { requestId: 'verify-vine' });
  assert.deepEqual([verification.status, verification.supportStrength], ['supports', 'direct']);
  assert.equal(calls[2].url, '/api/knowledge/verify');

  const prepared = Preparation.prepareKnowledgeQuery('Vine Pre-Launch 是什么？', Preparation.createProductionTemplateRegistry());
  assert.equal(prepared.status, 'matched');
  const query = { queryId: 'browser-vine', question: prepared.originalQuestion, claims: prepared.claims, sellerProfile: null, accountContext: { connected: false, metadata: {} }, options: {}, metadata: {} };
  const querySnapshot = structuredClone(query);
  const queryResult = await runtime.executeKnowledgeQuery(query);
  assert.deepEqual(query, querySnapshot);
  assert.equal(queryResult.queryId, 'browser-vine');
  assert.notEqual(queryResult.status, 'error');
  assert.ok(queryResult.answer);

  const planCallsBeforeTemplate = calls.filter(call => call.url.endsWith('/plan')).length;
  const templateResult = await runtime.executeQuestion({ question: 'Vine Pre-Launch 是什么？', queryId: 'template-fast', templateRegistry: Preparation.createProductionTemplateRegistry(), accountContext: { connected: false, metadata: {} } });
  assert.equal(templateResult.queryId, 'template-fast');
  assert.equal(calls.filter(call => call.url.endsWith('/plan')).length, planCallsBeforeTemplate);
  const openResult = await runtime.executeQuestion({ question: '英国站做 SIPP 现在需要满足哪些条件？', queryId: 'open-ended', templateRegistry: Preparation.createProductionTemplateRegistry(), accountContext: { connected: false, metadata: {} } });
  assert.equal(openResult.queryId, 'open-ended');
  const planCalls = calls.filter(call => call.url.endsWith('/plan'));
  assert.equal(planCalls.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(planCalls[0].options.body)).sort(), ['question', 'understanding']);
  assert.match(planCalls[0].options.body, /英国站做 SIPP/);
  assert.equal(Object.hasOwn(planCalls[0].options.headers, 'Authorization'), false);
  for (const question of ['我的 ASIN 为什么不能卖？', '这个政策现在还有效吗？', '今天天气怎么样？']) {
    const before = planCalls.length;
    const stopped = await runtime.executeQuestion({ question, templateRegistry: Preparation.createProductionTemplateRegistry() });
    assert.equal(stopped.kind, 'preparation');
    assert.equal(calls.filter(call => call.url.endsWith('/plan')).length, before);
  }
  const unavailablePlan = Runtime.createBrowserKnowledgeRuntime({ fetchImpl: async url => url.endsWith('/plan') ? response(404, {}) : response(200, { status: 'empty', results: [] }) });
  assert.equal((await unavailablePlan.executeQuestion({ question: '英国站做 SIPP 现在需要满足哪些条件？', templateRegistry: Preparation.createProductionTemplateRegistry() })).kind, 'planner-unavailable');

  for (const [serverResponse, expectedStatus] of [
    [{ status: 'empty', results: [], errorCode: null, errorMessage: null }, 'empty'],
    [{ status: 'unavailable', results: [], errorCode: 'SERVICE_OFFLINE', errorMessage: 'offline' }, 'unavailable'],
    [{ status: 'error', results: [], errorCode: 'SERVICE_ERROR', errorMessage: 'error' }, 'error']
  ]) {
    const isolated = Runtime.createBrowserKnowledgeRuntime({ fetchImpl: async () => response(200, serverResponse) });
    const output = await isolated.transports.search.search({ requestId: 'status', providerId: 'amazon-seller-help-provider', sourceId: 'amazon-seller-help', query: 'Vine', domains: ['sellercentral.amazon.com'], maxResults: 5, recencyDays: null, locale: 'zh-CN', language: null, metadata: {} });
    assert.equal(output.status, expectedStatus);
  }
  const unknown = Runtime.createBrowserKnowledgeRuntime({ fetchImpl: async () => response(200, { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'unconfigured', metadata: { errorCode: 'CLAIM_VERIFIER_NOT_CONFIGURED' } }) });
  assert.equal((await unknown.transports.verify.verify(claim(), { candidateId: 'c', claimId: 'vine' }, {})).status, 'unknown');

  for (const fakeFetch of [
    async () => response(404, {}),
    async () => ({ status: 200, async json() { throw Error('not json'); } }),
    async () => response(500, {}),
    async () => { throw Error('network'); },
    async () => { const error = Error('abort'); error.name = 'AbortError'; throw error; }
  ]) {
    const isolated = Runtime.createBrowserKnowledgeRuntime({ fetchImpl: fakeFetch });
    const output = await isolated.transports.search.search({ requestId: 'failure', providerId: 'amazon-seller-help-provider', sourceId: 'amazon-seller-help', query: 'Vine', domains: ['sellercentral.amazon.com'], maxResults: 5, recencyDays: null, locale: 'zh-CN', language: null, metadata: {} });
    assert.ok(['unavailable', 'error'].includes(output.status));
  }
  const malformed = Runtime.createBrowserKnowledgeRuntime({ fetchImpl: async () => response(200, { status: 'ok', results: 'not-an-array' }) });
  assert.equal((await malformed.transports.search.search({})).status, 'error');
  const noFetch = Runtime.createBrowserKnowledgeRuntime({ fetchImpl: null });
  assert.equal(noFetch.status, 'unavailable');
  assert.equal(noFetch.queryDependencies, null);

  const source = require('node:fs').readFileSync(require.resolve('../knowledge-browser-runtime'), 'utf8');
  assert.doesNotMatch(source, /OPENAI_API_KEY|BRAVE_SEARCH_API_KEY|Authorization|Bearer|https:\/\/api\.|X-Subscription-Token/i);
  console.log('knowledge browser runtime passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
