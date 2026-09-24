'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const Server = require('../server');
const Brave = require('../knowledge-brave-search-transport');
const HttpDocument = require('../knowledge-http-document-transport');

function request(address, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const req = http.request({ hostname: '127.0.0.1', port: address.port, method, path: pathname, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {} }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function searchRequest(overrides = {}) {
  return {
    requestId: 'search-1',
    providerId: 'amazon-seller-help-provider',
    sourceId: 'amazon-seller-help',
    query: 'Vine Pre Launch',
    domains: ['sellercentral.amazon.com'],
    maxResults: 5,
    recencyDays: 30,
    locale: 'zh-CN',
    language: null,
    metadata: {},
    ...overrides
  };
}

function providerResponse(status, body) {
  return { status, async json() { return body; } };
}

function documentResponse(status, headers = {}, text = '') {
  return {
    status,
    headers: { get(name) { const key = Object.keys(headers).find(item => item.toLowerCase() === name.toLowerCase()); return key ? headers[key] : null; } },
    async text() { return text; }
  };
}

function validClaim() {
  return { claimId: 'vine', text: 'Vine Pre-Launch 的当前定义和适用条件。', claimType: 'definition', topic: 'brand-reviews', intent: 'definition', marketplaces: [], regions: ['GLOBAL'], requestedYear: '2026', freshness: 'current', authorityRequirement: { mustInclude: ['amazon-official'] }, temporalRequirement: { mode: 'current' }, metadata: {} };
}

async function run() {
  assert.equal(typeof Server.createProductionSearchTransport, 'function');
  assert.equal(typeof Server.createProductionDocumentTransport, 'function');
  assert.equal(typeof Server.createProductionServerOptions, 'function');
  const emptyEnvironments = [{}, { BRAVE_SEARCH_API_KEY: '' }, { BRAVE_SEARCH_API_KEY: '   ' }];
  for (const env of emptyEnvironments) {
    const snapshot = structuredClone(env);
    assert.equal(Server.createProductionSearchTransport(env, { fetchImpl: async () => providerResponse(200, {}) }), undefined);
    assert.deepEqual(env, snapshot);
  }
  const productionEnv = { BRAVE_SEARCH_API_KEY: '  test-production-key  ' };
  const productionEnvSnapshot = structuredClone(productionEnv);
  const productionFetchCalls = [];
  const productionOptions = Server.createProductionServerOptions({
    env: productionEnv,
    fetchImpl: async (url, options) => {
      productionFetchCalls.push({ url, options });
      return providerResponse(200, { web: { results: [{ title: 'Configured search', url: 'https://sellercentral.amazon.com/help/configured', description: 'official result' }] } });
    }
  });
  assert.equal(typeof productionOptions.searchTransport.search, 'function');
  assert.deepEqual(productionEnv, productionEnvSnapshot);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = undefined;
    assert.equal(Server.createProductionSearchTransport({ BRAVE_SEARCH_API_KEY: 'configured' }), undefined);
    assert.equal(Server.createProductionDocumentTransport(), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const logs = [];
  const app = Server.createAppServer({ rootDir: path.join(__dirname, '..'), host: '127.0.0.1', port: 0, logger: entry => logs.push(entry) });
  const address = await app.start();
  try {
    assert.equal(address.address, '127.0.0.1');
    assert.equal(typeof Server.createAppServer, 'function');
    assert.equal(typeof Server.startServer, 'function');
    assert.equal(Server.BODY_LIMIT_BYTES, 256 * 1024);
    assert.equal(app.server.requestTimeout, Server.REQUEST_TIMEOUT_MS);

    let response = await request(address, 'GET', '/');
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.match(response.text, /Amazon Seller Workbench/);
    response = await request(address, 'GET', '/knowledge-page.js');
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /javascript/);
    response = await request(address, 'GET', '/knowledge-page.css');
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/css/);
    response = await request(address, 'GET', '/%2e%2e/%2e%2e/server.js');
    assert.notEqual(response.statusCode, 200);
    assert.doesNotMatch(response.text, /const http/);
    response = await request(address, 'GET', '/does-not-exist.js');
    assert.equal(response.statusCode, 404);

    response = await request(address, 'POST', '/api/knowledge/search', searchRequest());
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, { requestId: 'search-1', status: 'unavailable', results: [], errorCode: 'SEARCH_TRANSPORT_NOT_CONFIGURED', errorMessage: 'Search transport is not configured.', retryable: false, metadata: {} });
    response = await request(address, 'GET', '/api/knowledge/search');
    assert.equal(response.statusCode, 405);
    assert.equal(response.json.errorCode, 'METHOD_NOT_ALLOWED');
    response = await request(address, 'POST', '/api/knowledge/search', Buffer.from('{'));
    assert.equal(response.statusCode, 400);
    assert.equal(response.json.errorCode, 'INVALID_JSON');
    response = await request(address, 'POST', '/api/knowledge/search', Buffer.alloc(Server.BODY_LIMIT_BYTES + 1, 'x'));
    assert.equal(response.statusCode, 413);
    assert.equal(response.json.errorCode, 'REQUEST_TOO_LARGE');
    response = await request(address, 'POST', '/api/knowledge/search', searchRequest({ sourceId: 'government' }));
    assert.equal(response.json.errorCode, 'UNKNOWN_SOURCE');
    response = await request(address, 'POST', '/api/knowledge/search', searchRequest({ providerId: 'unknown-provider' }));
    assert.equal(response.json.errorCode, 'UNKNOWN_PROVIDER');
    response = await request(address, 'POST', '/api/knowledge/search', searchRequest({ providerId: 'amazon-ads-provider' }));
    assert.equal(response.json.errorCode, 'SOURCE_PROVIDER_MISMATCH');
    response = await request(address, 'POST', '/api/knowledge/search', searchRequest({ domains: ['sellercentral.amazon.com.evil'] }));
    assert.equal(response.json.errorCode, 'DOMAIN_NOT_ALLOWED');

    const documentRequest = { requestId: 'document-1', providerId: 'amazon-seller-help-provider', sourceId: 'amazon-seller-help', url: 'https://sellercentral.amazon.com/help' };
    response = await request(address, 'POST', '/api/knowledge/document', documentRequest);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.status, 'unavailable');
    assert.equal(response.json.errorCode, 'DOCUMENT_TRANSPORT_NOT_CONFIGURED');
    for (const url of ['http://sellercentral.amazon.com/help', 'http://localhost/x', 'https://127.0.0.1/x', 'http://10.0.0.1/x', 'javascript:alert(1)', 'data:text/plain,x', 'https://sellercentral.amazon.com.evil/help']) {
      response = await request(address, 'POST', '/api/knowledge/document', { ...documentRequest, url });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json.errorCode, 'URL_NOT_ALLOWED');
    }
    response = await request(address, 'POST', '/api/knowledge/document', { ...documentRequest, providerId: 'amazon-ads-provider' });
    assert.equal(response.json.errorCode, 'SOURCE_PROVIDER_MISMATCH');

    const verifyRequest = { requestId: 'verify-1', claim: validClaim(), candidate: { candidateId: 'candidate-1', claimId: 'vine', retrievalItemId: 'item-1', sourceId: 'amazon-seller-help', providerId: 'amazon-seller-help-provider', url: 'https://sellercentral.amazon.com/help/vine', externalId: null, content: 'Vine Pre-Launch official definition.', excerpt: 'official definition' }, context: {} };
    response = await request(address, 'POST', '/api/knowledge/verify', verifyRequest);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'unconfigured', metadata: { errorCode: 'CLAIM_VERIFIER_NOT_CONFIGURED' } });
    assert.equal(Object.hasOwn(response.json, 'verificationStatus'), false);
    response = await request(address, 'POST', '/api/knowledge/verify', { ...verifyRequest, claim: { ...validClaim(), requestedYear: null } });
    assert.equal(response.statusCode, 400);
    response = await request(address, 'POST', '/api/knowledge/verify', { ...verifyRequest, candidate: null });
    assert.equal(response.statusCode, 400);
    response = await request(address, 'GET', '/api/knowledge/verify');
    assert.equal(response.statusCode, 405);
    response = await request(address, 'POST', '/api/knowledge/verify', Buffer.alloc(Server.BODY_LIMIT_BYTES + 1, 'x'));
    assert.equal(response.statusCode, 413);

    response = await request(address, 'POST', '/api/knowledge/search', searchRequest({ query: '<sensitive query>' }));
    assert.equal(response.statusCode, 200);
    assert.ok(logs.length);
    const lastLog = logs.at(-1);
    assert.deepEqual(Object.keys(lastLog).sort(), ['durationMs', 'method', 'path', 'requestId', 'statusCode']);
    assert.equal(JSON.stringify(logs).includes('<sensitive query>'), false);
    const source = fs.readFileSync(require.resolve('../server'), 'utf8');
    assert.doesNotMatch(source, /require\(['"](?:node:)?https['"]\)|\bfetch\s*\(|axios|openai|anthropic|gemini|embedding/i);
    assert.equal(fs.existsSync(path.join(__dirname, '..', '.env')), false);
    assert.doesNotMatch(response.text, /server\.js|C:\\|\//i);
  } finally {
    await app.close();
  }
  const productionApp = Server.createAppServer({
    rootDir: path.join(__dirname, '..'),
    host: '127.0.0.1',
    port: 0,
    ...productionOptions
  });
  const productionAddress = await productionApp.start();
  try {
    const response = await request(productionAddress, 'POST', '/api/knowledge/search', searchRequest({ requestId: 'configured-search' }));
    assert.equal(response.json.status, 'ok');
    assert.equal(response.json.errorCode, null);
    assert.equal(response.json.results[0].url, 'https://sellercentral.amazon.com/help/configured');
    assert.equal(productionFetchCalls.length, 1);
    assert.equal(productionFetchCalls[0].options.headers['X-Subscription-Token'], 'test-production-key');
    assert.equal(JSON.stringify(response.json).includes('test-production-key'), false);
  } finally {
    await productionApp.close();
  }
  const noKeyOptions = Server.createProductionServerOptions({ env: {}, fetchImpl: async () => providerResponse(200, {}) });
  assert.equal(noKeyOptions.searchTransport, undefined);
  const productionDocumentCalls = [];
  const productionDocumentOptions = Server.createProductionServerOptions({
    env: {},
    documentFetchImpl: async (url, options) => {
      productionDocumentCalls.push({ url, options });
      return documentResponse(200, { 'content-type': 'text/plain' });
    }
  });
  assert.equal(typeof productionDocumentOptions.documentTransport.fetchDocument, 'function');
  const productionDocumentApp = Server.createAppServer({
    rootDir: path.join(__dirname, '..'),
    host: '127.0.0.1',
    port: 0,
    ...productionDocumentOptions
  });
  const productionDocumentAddress = await productionDocumentApp.start();
  try {
    const response = await request(productionDocumentAddress, 'POST', '/api/knowledge/document', {
      requestId: 'production-document',
      providerId: 'amazon-seller-help-provider',
      sourceId: 'amazon-seller-help',
      url: 'https://sellercentral.amazon.com/help/production-document'
    });
    assert.equal(response.json.status, 'empty');
    assert.equal(productionDocumentCalls.length, 1);
    assert.equal(productionDocumentCalls[0].options.redirect, 'manual');
  } finally {
    await productionDocumentApp.close();
  }
  const guardedDocumentApp = Server.createAppServer({
    rootDir: path.join(__dirname, '..'),
    host: '127.0.0.1',
    port: 0,
    documentTransport: HttpDocument.createHttpDocumentTransport({
      fetchImpl: async url => {
        if (url.endsWith('/redirect')) return documentResponse(302, { location: 'http://sellercentral.amazon.com/help/nope' });
        if (url.endsWith('/large')) return documentResponse(200, { 'content-type': 'text/plain', 'content-length': String(HttpDocument.MAX_RESPONSE_BYTES + 1) });
        return documentResponse(429);
      }
    })
  });
  const guardedDocumentAddress = await guardedDocumentApp.start();
  try {
    for (const [pathSuffix, expectedStatus, expectedCode] of [
      ['redirect', 'error', 'DOCUMENT_REDIRECT_NOT_ALLOWED'],
      ['large', 'error', 'DOCUMENT_RESPONSE_TOO_LARGE'],
      ['limited', 'unavailable', 'DOCUMENT_RATE_LIMITED']
    ]) {
      const response = await request(guardedDocumentAddress, 'POST', '/api/knowledge/document', {
        requestId: `guarded-${pathSuffix}`,
        providerId: 'amazon-seller-help-provider',
        sourceId: 'amazon-seller-help',
        url: `https://sellercentral.amazon.com/help/${pathSuffix}`
      });
      assert.deepEqual([response.json.status, response.json.errorCode], [expectedStatus, expectedCode]);
    }
  } finally {
    await guardedDocumentApp.close();
  }
  const browserFiles = ['index.html', 'knowledge-page.js', 'workbench.js'];
  for (const fileName of browserFiles) {
    assert.equal(fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8').includes('BRAVE_SEARCH_API_KEY'), false);
  }
  assert.match(fs.readFileSync(require.resolve('../server'), 'utf8'), /if \(require\.main === module\)/);
  assert.throws(() => Server.createAppServer({ searchTransport: null }), /INVALID_SEARCH_TRANSPORT/);
  assert.throws(() => Server.createAppServer({ documentTransport: {} }), /INVALID_DOCUMENT_TRANSPORT/);
  assert.throws(() => Server.createAppServer({ claimVerifier: {} }), /INVALID_CLAIM_VERIFIER/);
  const calls = { search: [], document: [] };
  const injected = Server.createAppServer({
    rootDir: path.join(__dirname, '..'), host: '127.0.0.1', port: 0,
    searchTransport: { async search(input, context) { calls.search.push({ input, context }); return { status: 'ok', results: [{ externalId: 'safe', title: 'Safe Amazon', url: 'https://sellercentral.amazon.com/help', snippet: null, publisher: null, author: null, publishedAt: null, officialAuthorVerified: null, rank: 1, metadata: {} }, { externalId: 'evil', title: 'Evil', url: 'https://sellercentral.amazon.com.evil/x', snippet: null, publisher: null, author: null, publishedAt: null, officialAuthorVerified: null, rank: 2, metadata: {} }] }; } },
    documentTransport: { async fetchDocument(input, context) { calls.document.push({ input, context }); return { status: 'ok', url: input.url, finalUrl: input.url, text: 'approved document', title: 'Approved', publisher: null, author: null, publishedAt: null, effectiveAt: null }; } }
  });
  const injectedAddress = await injected.start();
  try {
    let response = await request(injectedAddress, 'POST', '/api/knowledge/search', searchRequest());
    assert.equal(response.json.status, 'ok');
    assert.equal(response.json.results.length, 1);
    assert.equal(calls.search.length, 1);
    assert.deepEqual(Object.keys(calls.search[0].context).sort(), ['locale', 'now', 'requestId', 'signal']);
    assert.equal(calls.search[0].context.requestId, 'search-1');
    response = await request(injectedAddress, 'POST', '/api/knowledge/document', { requestId: 'document-2', providerId: 'amazon-seller-help-provider', sourceId: 'amazon-seller-help', url: 'https://sellercentral.amazon.com/help' });
    assert.equal(response.json.status, 'ok');
    assert.equal(response.json.text, 'approved document');
    assert.equal(calls.document.length, 1);
    response = await request(injectedAddress, 'POST', '/api/knowledge/document', { requestId: 'invalid-url', providerId: 'amazon-seller-help-provider', sourceId: 'amazon-seller-help', url: 'https://localhost/x' });
    assert.equal(response.json.errorCode, 'URL_NOT_ALLOWED');
    assert.equal(calls.document.length, 1);
  } finally {
    await injected.close();
  }
  const verifierCalls = [];
  const verifierApp = Server.createAppServer({
    rootDir: path.join(__dirname, '..'),
    host: '127.0.0.1',
    port: 0,
    claimVerifier: {
      async verify(claim, candidate, context) {
        verifierCalls.push({ claim, candidate, context });
        if (context.requestId === 'verify-contradicts') return { status: 'contradicts', supportStrength: 'direct', excerpt: 'official definition', rationale: null, verifierType: 'test', metadata: {} };
        if (context.requestId === 'verify-unknown') return { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'test', metadata: {} };
        if (context.requestId === 'verify-malformed') return { status: 'probably' };
        if (context.requestId === 'verify-throws') throw Error('provider secret stack');
        return { status: 'supports', supportStrength: 'direct', excerpt: 'official definition', rationale: 'test rationale', verifierType: 'test', metadata: {} };
      }
    }
  });
  const verifierAddress = await verifierApp.start();
  try {
    const validVerifyRequest = { requestId: 'verify-injected', claim: validClaim(), candidate: { candidateId: 'candidate-injected', claimId: 'vine', retrievalItemId: 'item-injected', sourceId: 'amazon-seller-help', providerId: 'amazon-seller-help-provider', url: 'https://sellercentral.amazon.com/help/vine', externalId: null, content: 'Vine Pre-Launch official definition.', excerpt: 'official definition' }, context: { secret: 'do not forward' } };
    let response = await request(verifierAddress, 'POST', '/api/knowledge/verify', validVerifyRequest);
    assert.deepEqual([response.statusCode, response.json.status, response.json.supportStrength], [200, 'supports', 'direct']);
    assert.equal(verifierCalls.length, 1);
    assert.deepEqual(verifierCalls[0].claim, validVerifyRequest.claim);
    assert.deepEqual(verifierCalls[0].candidate, validVerifyRequest.candidate);
    assert.deepEqual(Object.keys(verifierCalls[0].context).sort(), ['now', 'providerId', 'requestId', 'signal', 'sourceId']);
    response = await request(verifierAddress, 'POST', '/api/knowledge/verify', { ...validVerifyRequest, requestId: 'verify-contradicts' });
    assert.deepEqual([response.statusCode, response.json.status], [200, 'contradicts']);
    response = await request(verifierAddress, 'POST', '/api/knowledge/verify', { ...validVerifyRequest, requestId: 'verify-unknown' });
    assert.deepEqual([response.statusCode, response.json.status], [200, 'unknown']);
    response = await request(verifierAddress, 'POST', '/api/knowledge/verify', { ...validVerifyRequest, requestId: 'verify-malformed' });
    assert.deepEqual([response.statusCode, response.json.status, response.json.metadata.errorCode], [200, 'unknown', 'CLAIM_VERIFIER_INVALID_RESPONSE']);
    response = await request(verifierAddress, 'POST', '/api/knowledge/verify', { ...validVerifyRequest, requestId: 'verify-throws' });
    assert.deepEqual([response.statusCode, response.json.status, response.json.metadata.errorCode], [200, 'unknown', 'CLAIM_VERIFIER_ERROR']);
    assert.equal(JSON.stringify(response.json).includes('provider secret stack'), false);
    response = await request(verifierAddress, 'POST', '/api/knowledge/verify', { ...validVerifyRequest, candidate: { ...validVerifyRequest.candidate, candidateId: null } });
    assert.equal(response.statusCode, 400);
    assert.equal(verifierCalls.length, 5);
  } finally {
    await verifierApp.close();
  }
  const braveCalls = [];
  let braveStatus = 200;
  const braveTransport = Brave.createBraveSearchTransport({ apiKey: 'test-secret', fetchImpl: async (url, options) => {
    braveCalls.push({ url, options });
    if (braveStatus === 429) return providerResponse(429, {});
    if (url.includes('site%3Asell.amazon.com')) {
      return providerResponse(200, { web: { results: [
        { title: 'Sell Amazon', url: 'https://sell.amazon.com/news', description: 'seller news' },
        { title: 'Shared', url: 'https://sellercentral.amazon.com/help/shared', description: 'shared result' }
      ] } });
    }
    if (url.includes('site%3Asellercentral.amazon.com') && url.includes('Multi-domain')) {
      return providerResponse(200, { web: { results: [
        { title: 'Shared', url: 'https://sellercentral.amazon.com/help/shared', description: 'shared result' },
        { title: 'Seller Central', url: 'https://sellercentral.amazon.com/help/news', description: 'seller news' }
      ] } });
    }
    return providerResponse(200, { web: { results: [
      { title: 'Seller Central', url: 'https://sellercentral.amazon.com/help', description: 'official result' },
      { title: 'Lookalike', url: 'https://sellercentral.amazon.com.evil.com/x', description: 'bad result' }
    ] } });
  } });
  const braveApp = Server.createAppServer({ rootDir: path.join(__dirname, '..'), host: '127.0.0.1', port: 0, searchTransport: braveTransport });
  const braveAddress = await braveApp.start();
  try {
    let response = await request(braveAddress, 'POST', '/api/knowledge/search', searchRequest());
    assert.equal(response.json.status, 'ok');
    assert.equal(response.json.results.length, 1);
    assert.equal(response.json.results[0].url, 'https://sellercentral.amazon.com/help');
    assert.equal(JSON.stringify(response.json).includes('test-secret'), false);
    assert.equal(braveCalls.length, 1);
    response = await request(braveAddress, 'POST', '/api/knowledge/search', searchRequest({
      requestId: 'multi-domain',
      sourceId: 'amazon-seller-news',
      providerId: 'amazon-seller-news-provider',
      query: 'Multi-domain',
      domains: ['sell.amazon.com', 'sellercentral.amazon.com'],
      maxResults: 2
    }));
    assert.equal(response.json.status, 'ok');
    assert.deepEqual(response.json.results.map(item => item.url), [
      'https://sell.amazon.com/news',
      'https://sellercentral.amazon.com/help/shared'
    ]);
    assert.deepEqual(response.json.results.map(item => item.rank), [1, 2]);
    assert.equal(braveCalls.length, 3);
    assert.match(new URL(braveCalls[1].url).searchParams.get('q'), /site:sell\.amazon\.com$/);
    assert.match(new URL(braveCalls[2].url).searchParams.get('q'), /site:sellercentral\.amazon\.com$/);
    braveStatus = 429;
    response = await request(braveAddress, 'POST', '/api/knowledge/search', searchRequest({ requestId: 'rate-limited' }));
    assert.deepEqual([response.json.status, response.json.errorCode], ['unavailable', 'BRAVE_RATE_LIMITED']);
  } finally {
    await braveApp.close();
  }
  console.log('knowledge runtime server passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
