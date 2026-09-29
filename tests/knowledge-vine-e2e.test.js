'use strict';

const assert = require('node:assert/strict');
const Preparation = require('../knowledge-query-preparation');
const Runtime = require('../knowledge-browser-runtime');

function response(body) { return { status: 200, async json() { return body; } }; }

function result(sourceId) {
  const domain = sourceId === 'amazon-seller-help' ? 'sellercentral.amazon.com' : 'sell.amazon.com';
  const rows = sourceId === 'amazon-seller-help' ? [
    ['official-supports', 'Synthetic Vine definition: eligible products may enroll before launch.', 'supports', '2026-09-20T00:00:00.000Z'],
    ['official-irrelevant', 'Synthetic unrelated inventory article.', 'not-addressed', '2026-09-20T00:00:00.000Z'],
    ['official-conflict', 'Synthetic alternative statement for conflict preservation.', 'contradicts', '2026-09-20T00:00:00.000Z']
  ] : sourceId === 'amazon-seller-news' ? [
    ['stale-supports', 'Synthetic historical Vine definition.', 'supports', '2020-01-01T00:00:00.000Z']
  ] : [
    ['official-weaker', 'Synthetic limited training explanation.', 'unclear', '2026-09-20T00:00:00.000Z']
  ];
  return rows.map(([id, text, verification, publishedAt], rank) => ({ externalId: id, title: `Synthetic ${id}`, url: `https://${domain}/help/${id}`, snippet: text, publisher: 'Amazon', author: null, publishedAt, officialAuthorVerified: null, rank: rank + 1, metadata: { verification } }));
}

async function run() {
  const registry = Preparation.createProductionTemplateRegistry();
  const preparation = Preparation.prepareKnowledgeQuery('Vine Pre-Launch 是什么？', registry);
  assert.equal(preparation.status, 'matched');
  assert.equal(preparation.matchedTemplateId, 'vine-pre-launch');
  assert.equal(preparation.claims.length, 1);

  const calls = [];
  const runtime = Runtime.createBrowserKnowledgeRuntime({
    now: '2026-09-28T00:00:00.000Z',
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
      if (url.endsWith('/search')) {
        const body = calls.at(-1).body;
        return response({ status: 'ok', results: result(body.sourceId), errorCode: null, errorMessage: null });
      }
      if (url.endsWith('/document')) {
        const body = calls.at(-1).body;
        const row = Object.values(['amazon-seller-help', 'amazon-seller-news', 'amazon-seller-university']).flatMap(result).find(item => item.url === body.url);
        return response({ status: 'ok', url: body.url, finalUrl: body.url, text: row.snippet, title: row.title, publisher: row.publisher, author: null, publishedAt: row.publishedAt, effectiveAt: null, errorCode: null, errorMessage: null });
      }
      if (url.endsWith('/verify')) {
        const body = calls.at(-1).body;
        const verification = body.candidate.metadata.verification;
        return response({ status: verification, supportStrength: verification === 'supports' || verification === 'contradicts' ? 'direct' : verification === 'not-addressed' ? 'none' : 'unknown', excerpt: verification === 'supports' || verification === 'contradicts' ? body.candidate.content : null, rationale: 'Synthetic verifier rationale.', verifierType: 'server', metadata: {} });
      }
      throw Error('unexpected same-origin endpoint');
    }
  });
  const query = { queryId: 'vine-e2e', question: preparation.originalQuestion, claims: preparation.claims, sellerProfile: null, accountContext: { connected: false, metadata: {} }, options: {}, metadata: {} };
  const output = await runtime.executeKnowledgeQuery(query);
  assert.notEqual(output.status, 'error');
  assert.deepEqual(output.requests.map(request => request.sourceId), ['amazon-seller-help', 'amazon-seller-news', 'amazon-seller-university']);
  assert.ok(output.evidenceBundles.length === 1);
  const bundle = output.evidenceBundles[0];
  assert.ok(bundle.candidates.some(candidate => candidate.externalId === 'official-supports'));
  assert.ok(bundle.assessments.some(assessment => assessment.supportStatus === 'not-addressed'));
  assert.ok(bundle.assessments.some(assessment => assessment.supportStatus === 'unclear'));
  const stale = bundle.assessments.find(assessment => assessment.candidateId.includes('stale-supports'));
  assert.ok(stale);
  assert.notEqual(stale.admissible, true);
  assert.ok(output.answer);
  assert.ok(output.answer.shortAnswer);
  assert.ok(['direct', 'qualified', 'insufficient', 'conflicted', 'account-data-required'].includes(output.answer.answerType));
  assert.ok(Array.isArray(output.answer.officialFacts));
  assert.ok(Array.isArray(output.answer.citations));
  assert.ok(output.answer.citations.every(citation => citation.sourceId && citation.url));
  assert.equal(JSON.stringify(output.answer).includes('Synthetic verifier rationale.'), false);
  assert.equal(calls.filter(call => call.url.endsWith('/search')).length, 3);
  assert.ok(calls.some(call => call.url.endsWith('/document')));
  assert.ok(calls.some(call => call.url.endsWith('/verify')));
  assert.ok(calls.every(call => JSON.stringify(call.headers) === JSON.stringify({ 'Content-Type': 'application/json' })));
  console.log('knowledge vine e2e passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
