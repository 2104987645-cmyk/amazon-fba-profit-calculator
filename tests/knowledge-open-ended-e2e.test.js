'use strict';
const assert = require('node:assert/strict');
const Runtime = require('../knowledge-browser-runtime');
const Preparation = require('../knowledge-query-preparation');

function response(status, body) { return { status, async json() { return body; } }; }
function claim() { return { claimId: 'uk-sipp-open', text: 'Verify current UK SIPP applicability requirements.', claimType: 'eligibility', topic: 'fba-logistics', intent: 'requirements', marketplaces: ['UK'], regions: [], requestedYear: '2026', freshness: 'current', authorityRequirement: { mustInclude: ['amazon-official'] }, temporalRequirement: { mode: 'current', maxAgeDays: 30 }, metadata: {} }; }
async function run() {
  const calls = [];
  const runtime = Runtime.createBrowserKnowledgeRuntime({ now: '2026-06-01T00:00:00Z', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/plan')) return response(200, { status: 'ready', claims: [claim()], ambiguities: [], confidence: 'medium', metadata: {} });
    if (url.endsWith('/search')) return response(200, { status: 'ok', results: [{ externalId: 'synthetic', title: 'Synthetic official record', url: 'https://sellercentral.amazon.com/help/synthetic', snippet: 'Synthetic requirement record.', publisher: 'Amazon', author: null, publishedAt: null, officialAuthorVerified: true, rank: 1, metadata: {} }] });
    if (url.endsWith('/document')) return response(200, { status: 'ok', url: 'https://sellercentral.amazon.com/help/synthetic', finalUrl: 'https://sellercentral.amazon.com/help/synthetic', text: 'Synthetic requirement record.', title: 'Synthetic official record', publisher: 'Amazon', author: null, publishedAt: null, effectiveAt: null });
    if (url.endsWith('/verify')) return response(200, { status: 'not-addressed', supportStrength: 'none', excerpt: null, rationale: null, verifierType: 'server', metadata: {} });
    throw Error('unexpected endpoint');
  } });
  const registry = Preparation.createProductionTemplateRegistry();
  assert.equal(calls.length, 0);
  const open = await runtime.executeQuestion({ question: '英国站做 SIPP 现在需要满足哪些条件？', queryId: 'open-e2e', templateRegistry: registry, accountContext: { connected: false, metadata: {} } });
  assert.equal(open.queryId, 'open-e2e');
  assert.ok(open.answer);
  const plan = calls.filter(call => call.url.endsWith('/plan'));
  assert.equal(plan.length, 1);
  const body = JSON.parse(plan[0].options.body);
  assert.deepEqual(body.understanding.marketplaces, ['UK']);
  assert.equal(body.understanding.timeSensitivity, 'current');
  assert.equal(body.question, '英国站做 SIPP 现在需要满足哪些条件？');
  const beforeTemplate = plan.length;
  await runtime.executeQuestion({ question: 'Vine Pre-Launch 是什么？', queryId: 'vine-e2e', templateRegistry: registry, accountContext: { connected: false, metadata: {} } });
  assert.equal(calls.filter(call => call.url.endsWith('/plan')).length, beforeTemplate);
  for (const question of ['我的 ASIN 为什么不能参加 Vine？', '这个政策现在还有效吗？', '今天天气怎么样？']) {
    const result = await runtime.executeQuestion({ question, templateRegistry: registry });
    assert.equal(result.kind, 'preparation');
    assert.equal(calls.filter(call => call.url.endsWith('/plan')).length, beforeTemplate);
  }
  const unavailable = Runtime.createBrowserKnowledgeRuntime({ fetchImpl: async url => url.endsWith('/plan') ? response(404, {}) : response(200, { status: 'empty', results: [] }) });
  assert.equal((await unavailable.executeQuestion({ question: '英国站做 SIPP 现在需要满足哪些条件？', templateRegistry: registry })).kind, 'planner-unavailable');
  console.log('knowledge open-ended e2e passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
