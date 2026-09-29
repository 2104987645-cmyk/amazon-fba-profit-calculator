'use strict';

const assert = require('node:assert/strict');
const Planner = require('../knowledge-deepseek-query-planner');
const Preparation = require('../knowledge-claim-preparation');

const response = (status, body) => ({ status, async json() { return body; } });
const responseFor = value => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
function claim(id = 'one', overrides = {}) { return { claimId: id, text: '验证英国站当前规则。', claimType: 'eligibility', topic: 'fba-logistics', intent: 'requirements', marketplaces: ['UK'], regions: [], requestedYear: '2026', freshness: 'current', authorityRequirement: { mustInclude: ['amazon-official'] }, temporalRequirement: { mode: 'current', maxAgeDays: 30 }, metadata: {}, ...overrides }; }
function input() { return { question: '英国站现在需要满足哪些条件？', understanding: { status: 'open-ended-public', accountDataRequired: false, marketplaces: ['UK'], regions: [], topic: 'fba-logistics', intent: 'requirements', timeSensitivity: 'current' }, constraints: { maxClaims: 3, noAnswer: true, noCitation: true } }; }
function proposal(overrides = {}) { return { status: 'ready', claims: [claim()], ambiguities: [], confidence: 'medium', metadata: {}, ...overrides }; }

async function run() {
  assert.equal(Planner.DEFAULT_ENDPOINT, 'https://api.deepseek.com/responses');
  assert.equal(Planner.DEFAULT_MODEL, 'deepseek-flash');
  assert.throws(() => Planner.createDeepSeekQueryPlanner(), /DEEPSEEK_API_KEY_REQUIRED/);
  assert.throws(() => Planner.createDeepSeekQueryPlanner({ apiKey: 'x', fetchImpl: null }), /DEEPSEEK_FETCH_UNAVAILABLE/);
  assert.throws(() => Planner.createDeepSeekQueryPlanner({ apiKey: 'x', fetchImpl: async () => {}, model: 'latest' }), /DEEPSEEK_MODEL_INVALID/);
  let call; let calls = 0; const source = input(); const snapshot = structuredClone(source);
  const adapter = Planner.createDeepSeekQueryPlanner({ apiKey: ' deepseek-secret ', endpoint: 'https://test.invalid/responses', fetchImpl: async (url, options) => { calls += 1; call = { url, options }; return response(200, responseFor(proposal())); } });
  const output = await adapter.plannerImpl(source);
  assert.equal(calls, 1); assert.deepEqual(source, snapshot); assert.equal(call.url, 'https://test.invalid/responses'); assert.equal(call.options.method, 'POST'); assert.equal(call.options.headers.Authorization, 'Bearer deepseek-secret'); assert.equal(call.options.headers['Content-Type'], 'application/json');
  const body = JSON.parse(call.options.body); assert.equal(body.model, 'deepseek-flash'); assert.deepEqual(body.reasoning, { effort: 'none' }); assert.equal(body.text.format.type, 'json_schema'); assert.equal(body.text.format.strict, true); assert.equal(Object.hasOwn(body, 'tools'), false); assert.match(body.input[1].content[0].text, /英国站/); assert.deepEqual(output.metadata, { provider: 'deepseek', model: 'deepseek-flash' });
  assert.equal(output.claims[0].marketplaces[0], 'UK'); assert.equal(output.claims[0].requestedYear, '2026'); assert.equal(output.claims.length, 1);
  for (const invalid of [proposal({ claims: [claim('a'), claim('b'), claim('c'), claim('d')] }), proposal({ claims: [claim('x', { extra: true })] }), { status: 'ready', claims: [], ambiguities: [], confidence: 'low', metadata: {}, extra: true }]) await assert.rejects(() => Planner.createDeepSeekQueryPlanner({ apiKey: 'x', fetchImpl: async () => response(200, responseFor(invalid)) }).plannerImpl(input()), error => error.code === 'DEEPSEEK_PLANNER_INVALID_RESPONSE');
  for (const [status, code] of [[401, 'DEEPSEEK_PLANNER_AUTH_ERROR'], [403, 'DEEPSEEK_PLANNER_AUTH_ERROR'], [429, 'DEEPSEEK_PLANNER_RATE_LIMITED'], [500, 'DEEPSEEK_PLANNER_SERVICE_UNAVAILABLE']]) await assert.rejects(() => Planner.createDeepSeekQueryPlanner({ apiKey: 'x', fetchImpl: async () => response(status, {}) }).plannerImpl(input()), error => error.code === code);
  for (const failure of [async () => { throw Error('network'); }, async () => { const error = Error('abort'); error.name = 'AbortError'; throw error; }]) await assert.rejects(() => Planner.createDeepSeekQueryPlanner({ apiKey: 'x', fetchImpl: failure }).plannerImpl(input()), error => /^DEEPSEEK_PLANNER_(NETWORK_ERROR|TIMEOUT)$/.test(error.code));
  for (const invalidResponse of [{}, { output_text: 'not-json' }, { output: [{ content: [{ type: 'refusal' }] }] }]) await assert.rejects(() => Planner.createDeepSeekQueryPlanner({ apiKey: 'x', fetchImpl: async () => response(200, invalidResponse) }).plannerImpl(input()), error => /^DEEPSEEK_PLANNER_(INVALID_RESPONSE|REFUSED)$/.test(error.code));
  let accountCalls = 0; const account = await Planner.createDeepSeekQueryPlanner({ apiKey: 'x', fetchImpl: async () => { accountCalls += 1; } }).plannerImpl({ question: '我的账户如何？', understanding: { status: 'account-specific', accountDataRequired: true }, constraints: {} }); assert.equal(accountCalls, 0); assert.equal(account.status, 'unsupported');
  const prepared = await Preparation.createClaimPreparation({ plannerImpl: adapter.plannerImpl }).prepareClaimsFromUnderstanding({ question: source.question, understanding: source.understanding }); assert.equal(prepared.status, 'ready');
  console.log('knowledge deepseek query planner passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
