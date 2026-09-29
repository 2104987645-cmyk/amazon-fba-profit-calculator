'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const Server = require('../server');
const Understanding = require('../knowledge-query-understanding');
const QueryPreparation = require('../knowledge-query-preparation');

function request(address, method, pathname, body, raw) { return new Promise((resolve, reject) => { const payload = raw === undefined ? (body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body))) : Buffer.from(raw); const req = http.request({ hostname: '127.0.0.1', port: address.port, method, path: pathname, headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length } }, response => { const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); resolve({ statusCode: response.statusCode, text, json: (() => { try { return JSON.parse(text); } catch (_) { return null; } })() }); }); }); req.on('error', reject); req.end(payload); }); }
function response(status, body) { return { status, async json() { return body; } }; }
function responseFor(value) { return { output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }; }
function claim(id) { return { claimId: id, text: 'Verify current UK SIPP applicability requirements.', claimType: 'eligibility', topic: 'fba-logistics', intent: 'requirements', marketplaces: ['UK'], regions: [], requestedYear: '2026', freshness: 'current', authorityRequirement: { mustInclude: ['amazon-official'] }, temporalRequirement: { mode: 'current', maxAgeDays: 30 }, metadata: {} }; }
function proposal(claims) { return { status: 'ready', claims, ambiguities: [], confidence: 'medium', metadata: {} }; }
const registry = QueryPreparation.createProductionTemplateRegistry();
function planRequest() { const question = '英国站做 SIPP 现在需要满足哪些条件？'; return { requestId: 'plan-1', question, understanding: Understanding.understandKnowledgeQuery(question, { registry, analysisOptions: { now: '2026-06-01T00:00:00Z' } }) }; }
async function app(options) { const value = Server.createAppServer({ rootDir: path.join(__dirname, '..'), host: '127.0.0.1', port: 0, ...options }); const address = await value.start(); return { value, address }; }

async function run() {
  let instance = await app({});
  try {
    let result = await request(instance.address, 'POST', '/api/knowledge/plan', planRequest());
    assert.deepEqual([result.statusCode, result.json.status, result.json.metadata.errorCode], [200, 'unsupported', 'PLANNER_NOT_CONFIGURED']);
    result = await request(instance.address, 'GET', '/api/knowledge/plan', {});
    assert.deepEqual([result.statusCode, result.json.errorCode], [405, 'METHOD_NOT_ALLOWED']);
    result = await request(instance.address, 'POST', '/api/knowledge/plan', null, '{broken');
    assert.equal(result.statusCode, 400);
    result = await request(instance.address, 'POST', '/api/knowledge/plan', { requestId: 'bad', understanding: planRequest().understanding });
    assert.equal(result.statusCode, 400);
    result = await request(instance.address, 'POST', '/api/knowledge/plan', { ...planRequest(), understanding: { ...planRequest().understanding, status: 'matched-template' } });
    assert.equal(result.statusCode, 400);
    result = await request(instance.address, 'POST', '/api/knowledge/plan', { ...planRequest(), understanding: { ...planRequest().understanding, accountDataRequired: true } });
    assert.equal(result.statusCode, 400);
    result = await request(instance.address, 'POST', '/api/knowledge/plan', { ...planRequest(), understanding: { ...planRequest().understanding, marketplaces: ['EU'] } });
    assert.equal(result.statusCode, 400);
    result = await request(instance.address, 'POST', '/api/knowledge/plan', { ...planRequest(), understanding: { ...planRequest().understanding, regions: ['US'] } });
    assert.equal(result.statusCode, 400);
    result = await request(instance.address, 'POST', '/api/knowledge/search', { requestId: 'search', sourceId: 'amazon-seller-help', providerId: 'amazon-seller-help-provider', query: 'x', domains: ['sellercentral.amazon.com'], maxResults: 1, recencyDays: null, locale: null, language: null, metadata: {} });
    assert.equal(result.json.errorCode, 'SEARCH_TRANSPORT_NOT_CONFIGURED');
    result = await request(instance.address, 'GET', '/');
    assert.equal(result.statusCode, 200);
  } finally { await instance.value.close(); }

  let calls = 0;
  const fetchImpl = async (url, options) => { calls++; assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.headers.Authorization, 'Bearer shared-key'); return response(200, responseFor(proposal([claim('one')]))); };
  const production = Server.createProductionServerOptions({ env: { OPENAI_API_KEY: ' shared-key ' }, openAIPlannerFetchImpl: fetchImpl, openAIFetchImpl: fetchImpl });
  assert.equal(typeof production.claimPreparation.prepareClaimsFromUnderstanding, 'function');
  assert.equal(typeof production.claimVerifier.verify, 'function');
  assert.equal(calls, 0, 'startup must not call provider');
  instance = await app(production);
  try {
    for (const count of [1, 2, 3]) {
      const output = await request(instance.address, 'POST', '/api/knowledge/plan', planRequest());
      assert.equal(output.statusCode, 200);
      assert.equal(output.json.status, 'ready');
      assert.equal(output.json.claims.length, 1);
      assert.equal(output.json.claims[0].marketplaces[0], 'UK');
      assert.equal(output.json.claims[0].temporalRequirement.mode, 'current');
      assert.equal(output.json.claims[0].requestedYear, '2026');
    }
    assert.equal(calls, 3);
    const verify = await request(instance.address, 'POST', '/api/knowledge/verify', { requestId: 'verify', claim: claim('verify'), candidate: { candidateId: 'c', claimId: 'verify', retrievalItemId: 'r', sourceId: 'amazon-seller-help', providerId: 'amazon-seller-help-provider', url: 'https://sellercentral.amazon.com/help/x', externalId: null, content: 'text', excerpt: null }, context: {} });
    assert.equal(verify.statusCode, 200);
  } finally { await instance.value.close(); }

  for (const provider of [response(401, {}), response(429, {}), response(500, {}), { throw: Error('network secret') }, { throw: Object.assign(Error('abort'), { name: 'AbortError' }) }, response(200, { output: [{ content: [{ type: 'refusal' }] }] }), response(200, { output_text: 'not json' })]) {
    const options = Server.createProductionServerOptions({ env: { OPENAI_API_KEY: 'x' }, openAIPlannerFetchImpl: async () => { if (provider.throw) throw provider.throw; return provider; } });
    instance = await app(options);
    try { const output = await request(instance.address, 'POST', '/api/knowledge/plan', planRequest()); assert.deepEqual([output.statusCode, output.json.status, output.json.metadata.errorCode], [200, 'unsupported', 'PLANNER_FAILED']); assert.equal(output.text.includes('network secret'), false); assert.equal(output.text.includes('OPENAI_PLANNER'), false); assert.equal(output.text.includes('Bearer x'), false); } finally { await instance.value.close(); }
  }
  const noFetch = Server.createProductionServerOptions({ env: { OPENAI_API_KEY: 'x' }, openAIPlannerFetchImpl: null });
  assert.equal(noFetch.claimPreparation, undefined);
  assert.throws(() => Server.createAppServer({ claimPreparation: {} }), /INVALID_CLAIM_PREPARATION/);
  console.log('knowledge planner server passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
