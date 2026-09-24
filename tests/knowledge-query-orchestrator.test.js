'use strict';

const assert = require('node:assert/strict');
const O = require('../knowledge-query-orchestrator');
const A = require('../knowledge-question-analyzer');

const stages = ['analysis', 'routing', 'retrieval-planning', 'retrieval', 'evidence', 'answer'];
const failureCodes = {
  analysis: 'QUERY_ANALYSIS_FAILED',
  routing: 'QUERY_ROUTING_FAILED',
  'retrieval-planning': 'QUERY_RETRIEVAL_PLANNING_FAILED',
  retrieval: 'QUERY_RETRIEVAL_FAILED',
  evidence: 'QUERY_EVIDENCE_FAILED',
  answer: 'QUERY_ANSWER_FAILED'
};

function claim(claimId) {
  return { claimId, text: `claim ${claimId}`, claimType: 'fact', topic: 'x', intent: 'definition', marketplaces: [], regions: [], requestedYear: '2026', freshness: 'evergreen', authorityRequirement: { mustInclude: [] }, temporalRequirement: { mode: 'any' }, metadata: { claimId } };
}

function request(claims) {
  return { queryId: 'q', question: 'what is x', claims, sellerProfile: { sellerMarketplaces: ['US'], metadata: { profile: true } }, accountContext: { connected: true, metadata: { account: true } }, options: {}, metadata: { nested: true } };
}

function productionDependencies() {
  const adapter = { retrieve: async () => ({ status: 'ok', items: [] }) };
  return { now: '2026-01-01T00:00:00Z', locale: 'en-US', claimVerifier: () => ({ status: 'supports', supportStrength: 'direct', verifierType: 'test', metadata: {} }), adapters: { 'internal-knowledge-provider': adapter, 'amazon-seller-university-provider': adapter, 'amazon-seller-help-provider': adapter } };
}

function structuredAnswer(answerType, claims, bundles) {
  const answer = { answerType, officialFacts: [], derivedConclusions: [], operationalAdvice: [], accountSpecificFindings: [], conflictNotes: [], limitations: [], citations: [], diagnostics: {} };
  for (const bundle of bundles) {
    if (bundle.sufficiency.status === 'insufficient') continue;
    const factual = bundle.assessments.find(assessment => assessment.evidenceRole === 'supporting');
    const conflicting = bundle.assessments.find(assessment => assessment.evidenceRole === 'conflicting');
    if (bundle.sufficiency.status === 'conflicted') {
      const candidate = bundle.candidates.find(item => item.candidateId === conflicting.candidateId);
      const citationId = `cite-${bundle.claimId}`;
      answer.citations.push({ citationId, candidateIds: [candidate.candidateId], assessmentIds: [conflicting.assessmentId], claimIds: [bundle.claimId], usageRole: 'conflict' });
      answer.conflictNotes.push({ statementId: `conflict-${bundle.claimId}`, claimId: bundle.claimId, statementType: 'conflict-note', text: 'Evidence is conflicting.', groundingRefs: [{ assessmentId: conflicting.assessmentId, candidateId: candidate.candidateId, retrievalItemId: candidate.retrievalItemId, evidenceRole: 'conflicting', admissible: false }], citationIds: [citationId] });
      continue;
    }
    const candidate = bundle.candidates.find(item => item.candidateId === factual.candidateId);
    const citationId = `cite-${bundle.claimId}`;
    answer.citations.push({ citationId, candidateIds: [candidate.candidateId], assessmentIds: [factual.assessmentId], claimIds: [bundle.claimId], usageRole: 'factual-support' });
    answer.officialFacts.push({ statementId: `fact-${bundle.claimId}`, claimId: bundle.claimId, statementType: 'official-fact', text: claims.find(item => item.claimId === bundle.claimId).text, groundingRefs: [{ assessmentId: factual.assessmentId, candidateId: candidate.candidateId, retrievalItemId: candidate.retrievalItemId, evidenceRole: 'supporting', admissible: true }], citationIds: [citationId], qualification: bundle.sufficiency.status === 'partially-supported' ? 'Evidence is partial.' : null });
  }
  return answer;
}

function fakeFixture(config = {}) {
  const log = [];
  const received = {};
  const calls = { analysis: 0, routing: 0, 'retrieval-planning': 0, retrieval: 0, evidence: 0, answer: 0 };
  const sharedItems = [{ itemId: 'shared-item' }];
  const asyncStages = config.asyncStages || new Set();
  const value = (stage, output) => asyncStages.has(stage) ? Promise.resolve(output) : output;
  const fail = (stage, claimId) => {
    if (config.failStage === stage && (!config.failClaimId || config.failClaimId === claimId)) throw new Error(`${stage} failed`);
  };
  const components = {
    questionAnalyzer: { analyze(question, context, options) { calls.analysis++; log.push('Analyzer'); fail('analysis'); received.analysis = { question, context, options }; return value('analysis', { normalizedQuestion: question, scope: {} }); } },
    sourceRouter: { resolve(analysis) { calls.routing++; log.push('Router'); fail('routing'); received.routing = analysis; return value('routing', config.retrievalPlan || { authorityRequirement: { mustInclude: [] }, maxAgeDays: 30, resolvedMarketplaces: ['US'], requiresAccountData: false, publicKnowledgeCanFullyAnswer: true }); } },
    requestBuilder: { buildRequests(analysis, retrievalPlan) { calls['retrieval-planning']++; log.push('Request Builder'); fail('retrieval-planning'); received.planning = { analysis, retrievalPlan }; return value('retrieval-planning', [{ requestId: 'request-1' }]); } },
    retrievalExecutor: { execute(requests, runtimeContext) { calls.retrieval++; log.push('Retrieval Executor'); fail('retrieval'); received.retrieval = { requests, runtimeContext }; return value('retrieval', config.retrieval || { results: [{ request: { sourceId: 'public', required: false }, status: 'ok' }], items: sharedItems, diagnostics: { batch: true, requiredFailureCount: 0, requiredFailures: [] } }); } },
    evidenceEngine: { buildBundle(inputClaim, items, context) { calls.evidence++; log.push('Evidence Engine'); fail('evidence', inputClaim.claimId); (received.evidence || (received.evidence = [])).push({ inputClaim, items, context }); const status = config.answerType === 'insufficient' ? 'insufficient' : config.answerType === 'qualified' ? 'partially-supported' : config.answerType === 'conflicted' ? 'conflicted' : 'sufficient'; const candidateId = `candidate-${inputClaim.claimId}`, assessmentId = `assessment-${inputClaim.claimId}`, candidate = { candidateId, retrievalItemId: `retrieval-${inputClaim.claimId}` }, assessment = { assessmentId, claimId: inputClaim.claimId, candidateId, admissible: true, evidenceRole: 'supporting' }; const bundle = { claimId: inputClaim.claimId, candidates: [candidate], assessments: [assessment], conflicts: [], sufficiency: { status } }; if (status === 'conflicted') { const conflictCandidate = { candidateId: `conflict-candidate-${inputClaim.claimId}`, retrievalItemId: `conflict-retrieval-${inputClaim.claimId}` }, conflictAssessment = { assessmentId: `conflict-assessment-${inputClaim.claimId}`, claimId: inputClaim.claimId, candidateId: conflictCandidate.candidateId, admissible: false, evidenceRole: 'conflicting' }; bundle.candidates.push(conflictCandidate); bundle.assessments.push(conflictAssessment); bundle.conflicts.push({ conflictId: `conflict-${inputClaim.claimId}`, assessmentIds: [conflictAssessment.assessmentId] }); } return value('evidence', bundle); } },
    answerEngine: { answer(analysis, claims, evidenceBundles, context) { calls.answer++; log.push('Answer Engine'); fail('answer'); received.answer = { argsLength: arguments.length, analysis, claims, evidenceBundles, context }; const output = config.invalidAnswer || structuredAnswer(config.answerType || 'direct', claims, evidenceBundles); received.answerSnapshot = JSON.stringify({ output, evidenceBundles, claims }); return value('answer', output); } }
  };
  return { log, received, calls, sharedItems, components, dependencies: { now: '2026-01-01T00:00:00Z', locale: 'en-US', adapters: { test: { retrieve() {} } }, claimVerifier: { verify() {} }, components } };
}

async function executeFake(config, claims) {
  const fixture = fakeFixture(config);
  const input = request(claims);
  if (config.accountConnected !== undefined) input.accountContext.connected = config.accountConnected;
  const requestSnapshot = JSON.parse(JSON.stringify(input));
  const dependencySnapshot = { ...fixture.dependencies };
  const componentReferences = Object.fromEntries(Object.entries(fixture.components));
  const methodReferences = Object.fromEntries(Object.entries(fixture.components).map(([key, component]) => [key, Object.values(component)[0]]));
  const out = await O.executeKnowledgeQuery(input, fixture.dependencies);
  assert.deepEqual(input, requestSnapshot);
  assert.deepEqual(fixture.dependencies, dependencySnapshot);
  assert.strictEqual(fixture.dependencies.adapters, dependencySnapshot.adapters);
  assert.strictEqual(fixture.dependencies.components, dependencySnapshot.components);
  for (const [key, component] of Object.entries(componentReferences)) {
    assert.strictEqual(fixture.components[key], component);
    assert.strictEqual(Object.values(fixture.components[key])[0], methodReferences[key]);
  }
  return { fixture, input, out };
}

function assertFailure(out, stage, completedStages) {
  assert.equal(out.status, 'error');
  assert.equal(out.errors.length, 1);
  assert.equal(out.errors[0].stage, stage);
  assert.equal(out.errors[0].code, failureCodes[stage]);
  assert.equal(out.errors[0].recoverable, false);
  assert.equal(out.errors[0].message, `${stage} failed`);
  assert.deepEqual(out.diagnostics.completedStages, completedStages);
  assert.ok(Object.hasOwn(out, 'analysis'));
  assert.ok(Object.hasOwn(out, 'retrievalPlan'));
  assert.ok(Object.hasOwn(out, 'requests'));
  assert.ok(Object.hasOwn(out, 'retrieval'));
  assert.ok(Object.hasOwn(out, 'evidenceBundles'));
  assert.ok(Object.hasOwn(out, 'answer'));
}

async function run() {
  const productionInput = request([claim('fallback')]);
  const productionBefore = JSON.stringify(productionInput);
  const productionOut = await O.executeKnowledgeQuery(productionInput, productionDependencies());
  assert.equal(JSON.stringify(productionInput), productionBefore);
  assert.equal(productionOut.queryId, 'q');
  assert.ok(productionOut.analysis);
  assert.ok(productionOut.retrievalPlan);
  assert.equal(productionOut.evidenceBundles.length, 1);
  assert.ok(productionOut.answer);
  assert.deepEqual(productionOut.errors, []);

  const happy = await executeFake({}, [claim('one')]);
  assert.deepEqual(happy.fixture.log, ['Analyzer', 'Router', 'Request Builder', 'Retrieval Executor', 'Evidence Engine', 'Answer Engine']);
  assert.deepEqual(happy.out.diagnostics.completedStages, stages);
  assert.deepEqual(Object.keys(happy.out.diagnostics).sort(), ['claimCount', 'completedStages', 'evidenceBundleCount', 'retrievalDiagnostics']);
  assert.equal(happy.out.diagnostics.claimCount, 1);
  assert.equal(happy.out.diagnostics.evidenceBundleCount, 1);
  assert.strictEqual(happy.out.diagnostics.retrievalDiagnostics, happy.out.retrieval.diagnostics);
  assert.deepEqual(happy.fixture.calls, { analysis: 1, routing: 1, 'retrieval-planning': 1, retrieval: 1, evidence: 1, answer: 1 });
  assert.equal(happy.fixture.received.answer.argsLength, 4);
  assert.strictEqual(happy.fixture.received.answer.analysis, happy.out.analysis);
  assert.strictEqual(happy.fixture.received.answer.claims, happy.input.claims);
  assert.strictEqual(happy.fixture.received.answer.evidenceBundles, happy.out.evidenceBundles);
  assert.equal(happy.fixture.received.analysis.context.sellerProfile, happy.input.sellerProfile);
  assert.equal(happy.fixture.received.retrieval.runtimeContext.accountConnected, true);
  assert.equal(happy.fixture.received.retrieval.runtimeContext.now, happy.fixture.dependencies.now);
  assert.equal(happy.fixture.received.retrieval.runtimeContext.locale, happy.fixture.dependencies.locale);
  assert.equal(happy.fixture.received.evidence[0].context.now, happy.fixture.dependencies.now);
  assert.strictEqual(happy.fixture.received.evidence[0].context.claimVerifier, happy.fixture.dependencies.claimVerifier);
  assert.equal(happy.fixture.received.answer.context.locale, happy.fixture.dependencies.locale);

  const multi = await executeFake({}, [claim('first'), claim('second')]);
  assert.deepEqual(multi.fixture.log, ['Analyzer', 'Router', 'Request Builder', 'Retrieval Executor', 'Evidence Engine', 'Evidence Engine', 'Answer Engine']);
  assert.equal(multi.fixture.calls.retrieval, 1);
  assert.equal(multi.fixture.calls.evidence, 2);
  assert.strictEqual(multi.fixture.received.evidence[0].inputClaim, multi.input.claims[0]);
  assert.strictEqual(multi.fixture.received.evidence[1].inputClaim, multi.input.claims[1]);
  assert.strictEqual(multi.fixture.received.evidence[0].items, multi.fixture.sharedItems);
  assert.strictEqual(multi.fixture.received.evidence[1].items, multi.fixture.sharedItems);
  assert.deepEqual(multi.out.evidenceBundles.map(bundle => bundle.claimId), ['first', 'second']);
  assert.equal(multi.fixture.received.answer.claims.length, 2);
  assert.equal(multi.fixture.received.answer.evidenceBundles.length, 2);
  assert.equal(multi.out.diagnostics.claimCount, 2);
  assert.equal(multi.out.diagnostics.evidenceBundleCount, 2);

  const asyncRun = await executeFake({ asyncStages: new Set(['retrieval', 'evidence', 'answer']) }, [claim('async')]);
  assert.equal(asyncRun.out.status, 'success');

  const emptyRetrieval = await executeFake({
    retrieval: { results: [{ request: { sourceId: 'public', required: false }, status: 'empty' }], items: [], diagnostics: { requestedCount: 1, emptyCount: 1, blockedCount: 0, unavailableCount: 0, errorCount: 0, requiredFailureCount: 0, requiredFailures: [] } },
    answerType: 'insufficient'
  }, [claim('empty')]);
  assert.equal(emptyRetrieval.out.status, 'insufficient');
  assert.equal(emptyRetrieval.fixture.calls.evidence, 1);
  assert.equal(emptyRetrieval.fixture.calls.answer, 1);
  assert.deepEqual(emptyRetrieval.out.diagnostics.completedStages, stages);

  const optionalDegraded = await executeFake({
    retrieval: { results: [{ request: { sourceId: 'optional', required: false }, status: 'unavailable' }, { request: { sourceId: 'public', required: false }, status: 'ok' }], items: [{ itemId: 'public' }], diagnostics: { requiredFailureCount: 0, requiredFailures: [] } }
  }, [claim('optional')]);
  assert.equal(optionalDegraded.out.status, 'partial');
  assert.ok(optionalDegraded.out.answer);
  assert.equal(optionalDegraded.out.retrieval.diagnostics.requiredFailureCount, 0);
  assert.deepEqual(optionalDegraded.out.diagnostics.completedStages, stages);

  const requiredBlocked = await executeFake({
    retrieval: { results: [{ request: { sourceId: 'required', required: true }, status: 'blocked' }], items: [], diagnostics: { requiredFailureCount: 1, requiredFailures: [{ sourceId: 'required', status: 'blocked' }] } }
  }, [claim('required')]);
  assert.equal(requiredBlocked.out.status, 'blocked');
  assert.equal(requiredBlocked.out.answer, null);
  assert.equal(requiredBlocked.fixture.calls.evidence, 0);
  assert.equal(requiredBlocked.fixture.calls.answer, 0);
  assert.deepEqual(requiredBlocked.out.diagnostics.completedStages, stages.slice(0, 4));
  assert.equal(requiredBlocked.out.diagnostics.claimCount, 1);
  assert.equal(requiredBlocked.out.diagnostics.evidenceBundleCount, 0);
  assert.strictEqual(requiredBlocked.out.diagnostics.retrievalDiagnostics, requiredBlocked.out.retrieval.diagnostics);

  const allUnavailable = await executeFake({
    retrieval: { results: [{ request: { sourceId: 'one', required: false }, status: 'unavailable' }, { request: { sourceId: 'two', required: false }, status: 'blocked' }], items: [], diagnostics: { requiredFailureCount: 0, requiredFailures: [] } }
  }, [claim('unavailable')]);
  assert.equal(allUnavailable.out.status, 'blocked');
  assert.equal(allUnavailable.fixture.calls.evidence, 0);

  const mixedAccount = await executeFake({
    retrievalPlan: { requiresAccountData: true, publicKnowledgeCanFullyAnswer: true },
    accountConnected: false,
    retrieval: { results: [{ request: { sourceId: 'user-account', required: true }, status: 'blocked' }, { request: { sourceId: 'amazon-seller-help', required: false }, status: 'ok' }], items: [{ itemId: 'public' }], diagnostics: { requiredFailureCount: 1, requiredFailures: [{ sourceId: 'user-account', status: 'blocked' }] } },
    answerType: 'account-data-required'
  }, [claim('public'), claim('account')]);
  assert.equal(mixedAccount.out.status, 'partial');
  assert.ok(mixedAccount.out.answer);
  assert.deepEqual(mixedAccount.out.answer.accountSpecificFindings, []);

  const accountOnlyBlocked = await executeFake({
    retrievalPlan: { requiresAccountData: true, publicKnowledgeCanFullyAnswer: false },
    accountConnected: false,
    retrieval: { results: [{ request: { sourceId: 'user-account', required: true }, status: 'blocked' }], items: [], diagnostics: { requiredFailureCount: 1, requiredFailures: [{ sourceId: 'user-account', status: 'blocked' }] } }
  }, [claim('account-only')]);
  assert.equal(accountOnlyBlocked.out.status, 'blocked');
  assert.equal(accountOnlyBlocked.out.answer, null);
  assert.equal(accountOnlyBlocked.fixture.calls.answer, 0);

  const insufficient = await executeFake({ answerType: 'insufficient' }, [claim('insufficient')]);
  assert.equal(insufficient.out.status, 'insufficient');
  assert.ok(insufficient.out.answer);
  assert.deepEqual(insufficient.out.diagnostics.completedStages, stages);

  const qualified = await executeFake({ answerType: 'qualified' }, [claim('qualified')]);
  assert.equal(qualified.out.status, 'success');
  const conflicted = await executeFake({ answerType: 'conflicted' }, [claim('conflicted')]);
  assert.equal(conflicted.out.status, 'success');
  const degradedQualified = await executeFake({
    answerType: 'qualified',
    retrieval: { results: [{ request: { sourceId: 'optional', required: false }, status: 'error' }, { request: { sourceId: 'public', required: false }, status: 'ok' }], items: [{ itemId: 'public' }], diagnostics: { requiredFailureCount: 0, requiredFailures: [] } }
  }, [claim('degraded-qualified')]);
  assert.equal(degradedQualified.out.status, 'partial');
  const degradedInsufficient = await executeFake({
    answerType: 'insufficient',
    retrieval: { results: [{ request: { sourceId: 'optional', required: false }, status: 'error' }, { request: { sourceId: 'public', required: false }, status: 'ok' }], items: [{ itemId: 'public' }], diagnostics: { requiredFailureCount: 0, requiredFailures: [] } }
  }, [claim('degraded-insufficient')]);
  assert.equal(degradedInsufficient.out.status, 'insufficient');

  let partialCalls = 0;
  const partialDependencies = productionDependencies();
  partialDependencies.components = { questionAnalyzer: { analyze(question, context, options) { partialCalls++; return A.analyze(question, context, options); } } };
  const partialOut = await O.executeKnowledgeQuery(request([claim('partial')]), partialDependencies);
  assert.equal(partialCalls, 1);
  assert.deepEqual(partialOut.errors, []);

  const invalid = await O.executeKnowledgeQuery({ ...request([claim('invalid')]), queryId: '' }, productionDependencies());
  assert.equal(invalid.status, 'error');
  assert.equal(invalid.errors[0].stage, 'received');
  assert.deepEqual(invalid.diagnostics.completedStages, []);

  const analysisFailure = await executeFake({ failStage: 'analysis' }, [claim('a')]);
  assertFailure(analysisFailure.out, 'analysis', []);
  assert.equal(analysisFailure.out.analysis, null);
  assert.deepEqual(analysisFailure.out.requests, []);
  assert.deepEqual(analysisFailure.fixture.calls, { analysis: 1, routing: 0, 'retrieval-planning': 0, retrieval: 0, evidence: 0, answer: 0 });

  const routingFailure = await executeFake({ failStage: 'routing' }, [claim('a')]);
  assertFailure(routingFailure.out, 'routing', ['analysis']);
  assert.ok(routingFailure.out.analysis);
  assert.equal(routingFailure.out.retrievalPlan, null);
  assert.deepEqual(routingFailure.fixture.calls, { analysis: 1, routing: 1, 'retrieval-planning': 0, retrieval: 0, evidence: 0, answer: 0 });

  const planningFailure = await executeFake({ failStage: 'retrieval-planning' }, [claim('a')]);
  assertFailure(planningFailure.out, 'retrieval-planning', ['analysis', 'routing']);
  assert.ok(planningFailure.out.analysis);
  assert.ok(planningFailure.out.retrievalPlan);
  assert.deepEqual(planningFailure.out.requests, []);
  assert.equal(planningFailure.fixture.calls.retrieval, 0);

  const retrievalFailure = await executeFake({ failStage: 'retrieval' }, [claim('a')]);
  assertFailure(retrievalFailure.out, 'retrieval', ['analysis', 'routing', 'retrieval-planning']);
  assert.equal(retrievalFailure.out.requests.length, 1);
  assert.deepEqual(retrievalFailure.out.retrieval, { results: [], items: [], diagnostics: {} });
  assert.equal(retrievalFailure.fixture.calls.evidence, 0);
  assert.equal(retrievalFailure.fixture.calls.answer, 0);

  const evidenceFailure = await executeFake({ failStage: 'evidence', failClaimId: 'a' }, [claim('a')]);
  assertFailure(evidenceFailure.out, 'evidence', ['analysis', 'routing', 'retrieval-planning', 'retrieval']);
  assert.equal(evidenceFailure.out.errors[0].claimId, 'a');
  assert.equal(evidenceFailure.out.retrieval.items.length, 1);
  assert.deepEqual(evidenceFailure.out.evidenceBundles, []);
  assert.equal(evidenceFailure.fixture.calls.answer, 0);
  assert.equal(evidenceFailure.out.diagnostics.evidenceBundleCount, 0);
  assert.strictEqual(evidenceFailure.out.diagnostics.retrievalDiagnostics, evidenceFailure.out.retrieval.diagnostics);

  const multiEvidenceFailure = await executeFake({ failStage: 'evidence', failClaimId: 'second' }, [claim('first'), claim('second')]);
  assertFailure(multiEvidenceFailure.out, 'evidence', ['analysis', 'routing', 'retrieval-planning', 'retrieval']);
  assert.equal(multiEvidenceFailure.out.errors[0].claimId, 'second');
  assert.equal(multiEvidenceFailure.fixture.calls.evidence, 2);
  assert.deepEqual(multiEvidenceFailure.out.evidenceBundles, []);
  assert.equal(multiEvidenceFailure.fixture.calls.answer, 0);

  const answerFailure = await executeFake({ failStage: 'answer' }, [claim('a')]);
  assertFailure(answerFailure.out, 'answer', ['analysis', 'routing', 'retrieval-planning', 'retrieval', 'evidence']);
  assert.equal(answerFailure.out.evidenceBundles.length, 1);
  assert.equal(answerFailure.out.answer, null);

  const invalidAnswer = { answerType: 'direct', officialFacts: [], derivedConclusions: [], operationalAdvice: [], accountSpecificFindings: [], conflictNotes: [], limitations: [], citations: [{ citationId: 'floating' }], diagnostics: {} };
  const validationFailure = await executeFake({ invalidAnswer }, [claim('invalid-answer')]);
  assert.equal(validationFailure.out.status, 'error');
  assert.equal(validationFailure.out.errors[0].stage, 'answer');
  assert.equal(validationFailure.out.errors[0].code, 'QUERY_ANSWER_VALIDATION_FAILED');
  assert.equal(validationFailure.out.errors[0].message, 'Structured answer validation failed.');
  assert.deepEqual(validationFailure.out.errors[0].metadata, { validation: 'invalid-structured-answer' });
  assert.equal(validationFailure.out.answer, null);
  assert.equal(validationFailure.out.evidenceBundles.length, 1);
  assert.deepEqual(validationFailure.out.diagnostics.completedStages, stages.slice(0, 5));
  assert.equal(validationFailure.out.diagnostics.claimCount, 1);
  assert.equal(validationFailure.out.diagnostics.evidenceBundleCount, 1);
  assert.strictEqual(validationFailure.out.diagnostics.retrievalDiagnostics, validationFailure.out.retrieval.diagnostics);
  assert.equal(JSON.stringify({ output: invalidAnswer, evidenceBundles: validationFailure.out.evidenceBundles, claims: validationFailure.input.claims }), validationFailure.fixture.received.answerSnapshot);

  console.log('knowledge query orchestrator passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
