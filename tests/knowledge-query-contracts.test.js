'use strict';

const assert = require('node:assert/strict');
const C = require('../knowledge-query-contracts');

const claim = {
  claimId: 'c',
  text: 'x',
  claimType: 'fact',
  topic: 'x',
  intent: 'x',
  marketplaces: [],
  regions: [],
  requestedYear: '2026',
  freshness: 'evergreen',
  authorityRequirement: { mustInclude: [] },
  temporalRequirement: { mode: 'any' },
  metadata: {}
};
const request = { queryId: 'q', question: 'x', claims: [claim], metadata: {} };

assert.equal(C.validateKnowledgeQueryRequest(request).valid, true);
assert.equal(C.validateKnowledgeQueryRequest({ ...request, queryId: '' }).valid, false);
assert.equal(C.validateKnowledgeQueryRequest({ ...request, claims: [] }).valid, false);
assert.equal(C.validateKnowledgeQueryRequest({ ...request, claims: [{ ...claim, requestedYear: null }] }).valid, false);
assert.equal(C.validateKnowledgeQueryRequest({ ...request, accountContext: { connected: true, metadata: {} } }).valid, true);
assert.equal(C.validateKnowledgeQueryRequest({ ...request, accountContext: { connected: 'yes', metadata: {} } }).valid, false);

const deps = { adapters: { p: { retrieve() {} } }, claimVerifier() {} };
assert.equal(C.validateKnowledgeQueryDependencies(deps).valid, true);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: {} }).valid, true);

const questionAnalyzer = { analyze() {} };
const sourceRouter = { resolve() {} };
const requestBuilder = { buildRequests() {} };
const retrievalExecutor = { execute() {} };
const evidenceEngine = { buildBundle() {} };
const answerEngine = { answer() {} };

assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { questionAnalyzer } }).valid, true);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { sourceRouter } }).valid, true);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { requestBuilder } }).valid, true);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { retrievalExecutor } }).valid, true);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { evidenceEngine } }).valid, true);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { answerEngine } }).valid, true);
assert.equal(C.validateKnowledgeQueryDependencies({
  ...deps,
  components: { questionAnalyzer, sourceRouter, requestBuilder, retrievalExecutor, evidenceEngine, answerEngine }
}).valid, true);

assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { questionAnalyzer: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { questionAnalyzer: { analyze: 'not-a-function' } } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { sourceRouter: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { requestBuilder: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { retrievalExecutor: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { evidenceEngine: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { answerEngine: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { network: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { claimBuilder: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { claimExtractor: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { citationBuilder: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { fetch: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { transport: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { llm: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, components: { ai: {} } }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, question: 'request-owned' }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, claims: [claim] }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, sellerProfile: {} }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ ...deps, accountContext: {} }).valid, false);

const components = { questionAnalyzer, sourceRouter, requestBuilder, retrievalExecutor, evidenceEngine, answerEngine };
const immutableDependencies = {
  now: '2026-09-24T00:00:00.000Z',
  locale: 'en-US',
  adapters: deps.adapters,
  claimVerifier: deps.claimVerifier,
  components
};
const dependenciesSnapshot = { ...immutableDependencies, components: { ...components } };
const adaptersReference = immutableDependencies.adapters;
const componentsReference = immutableDependencies.components;
const analyzerReference = immutableDependencies.components.questionAnalyzer;
const routerReference = immutableDependencies.components.sourceRouter;
const builderReference = immutableDependencies.components.requestBuilder;
const executorReference = immutableDependencies.components.retrievalExecutor;
const evidenceReference = immutableDependencies.components.evidenceEngine;
const answerReference = immutableDependencies.components.answerEngine;
const analyzerMethodReference = immutableDependencies.components.questionAnalyzer.analyze;
const routerMethodReference = immutableDependencies.components.sourceRouter.resolve;
const builderMethodReference = immutableDependencies.components.requestBuilder.buildRequests;
const executorMethodReference = immutableDependencies.components.retrievalExecutor.execute;
const evidenceMethodReference = immutableDependencies.components.evidenceEngine.buildBundle;
const answerMethodReference = immutableDependencies.components.answerEngine.answer;
assert.equal(C.validateKnowledgeQueryDependencies(immutableDependencies).valid, true);
assert.deepEqual(immutableDependencies, dependenciesSnapshot);
assert.strictEqual(immutableDependencies.adapters, adaptersReference);
assert.strictEqual(immutableDependencies.components, componentsReference);
assert.strictEqual(immutableDependencies.components.questionAnalyzer, analyzerReference);
assert.strictEqual(immutableDependencies.components.sourceRouter, routerReference);
assert.strictEqual(immutableDependencies.components.requestBuilder, builderReference);
assert.strictEqual(immutableDependencies.components.retrievalExecutor, executorReference);
assert.strictEqual(immutableDependencies.components.evidenceEngine, evidenceReference);
assert.strictEqual(immutableDependencies.components.answerEngine, answerReference);
assert.strictEqual(immutableDependencies.components.questionAnalyzer.analyze, analyzerMethodReference);
assert.strictEqual(immutableDependencies.components.sourceRouter.resolve, routerMethodReference);
assert.strictEqual(immutableDependencies.components.requestBuilder.buildRequests, builderMethodReference);
assert.strictEqual(immutableDependencies.components.retrievalExecutor.execute, executorMethodReference);
assert.strictEqual(immutableDependencies.components.evidenceEngine.buildBundle, evidenceMethodReference);
assert.strictEqual(immutableDependencies.components.answerEngine.answer, answerMethodReference);

assert.equal(C.validateKnowledgeQueryDependencies({ adapters: { p: {} }, claimVerifier() {} }).valid, false);
assert.equal(C.validateKnowledgeQueryDependencies({ adapters: {}, claimVerifier: null }).valid, false);

const error = { stage: 'retrieval', code: 'X', message: 'x', recoverable: true, sourceId: null, providerId: null, claimId: null, metadata: {} };
assert.equal(C.validateKnowledgeQueryError(error).valid, true);
assert.equal(C.validateKnowledgeQueryError({ ...error, stage: 'bad' }).valid, false);

const result = { queryId: 'q', analysis: null, retrievalPlan: null, requests: [], retrieval: { results: [], items: [], diagnostics: {} }, evidenceBundles: [], answer: null, status: 'success', errors: [], diagnostics: {}, metadata: {} };
assert.equal(C.validateKnowledgeQueryResult(result).valid, true);
assert.equal(C.validateKnowledgeQueryResult({ ...result, status: 'conflicted' }).valid, false);
assert.equal(C.resolveQueryStatus({ fatalError: true, blocked: true, insufficient: true, degraded: true }), 'error');
assert.equal(C.resolveQueryStatus({ blocked: true, insufficient: true, degraded: true }), 'blocked');
assert.equal(C.resolveQueryStatus({ insufficient: true, degraded: true }), 'insufficient');
assert.equal(C.resolveQueryStatus({ degraded: true }), 'partial');
assert.equal(C.resolveQueryStatus({}), 'success');
assert.equal('buildClaims' in C, false);
const before = JSON.stringify(request);
C.validateKnowledgeQueryRequest(request);
assert.equal(JSON.stringify(request), before);

console.log('knowledge query contracts passed');
