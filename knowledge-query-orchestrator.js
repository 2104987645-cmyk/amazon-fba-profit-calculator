(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./knowledge-query-contracts') : root.KnowledgeQueryContracts,
    typeof module === 'object' && module.exports ? require('./knowledge-question-analyzer') : root.KnowledgeQuestionAnalyzer,
    typeof module === 'object' && module.exports ? require('./knowledge-source-router') : root.KnowledgeSourceRouter,
    typeof module === 'object' && module.exports ? require('./knowledge-retrieval-request-builder') : root.KnowledgeRetrievalRequestBuilder,
    typeof module === 'object' && module.exports ? require('./knowledge-retrieval-executor') : root.KnowledgeRetrievalExecutor,
    typeof module === 'object' && module.exports ? require('./knowledge-evidence-engine') : root.KnowledgeEvidenceEngine,
    typeof module === 'object' && module.exports ? require('./knowledge-answer-engine') : root.KnowledgeAnswerEngine,
    typeof module === 'object' && module.exports ? require('./knowledge-answer-contracts') : root.KnowledgeAnswerContracts
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KnowledgeQueryOrchestrator = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Q, A, R, B, X, E, N, V) {
  'use strict';

  const FAILURE_CODES = {
    analysis: 'QUERY_ANALYSIS_FAILED',
    routing: 'QUERY_ROUTING_FAILED',
    'retrieval-planning': 'QUERY_RETRIEVAL_PLANNING_FAILED',
    retrieval: 'QUERY_RETRIEVAL_FAILED',
    evidence: 'QUERY_EVIDENCE_FAILED',
    answer: 'QUERY_ANSWER_FAILED'
  };

  function initialState() {
    return {
      analysis: null,
      retrievalPlan: null,
      requests: [],
      retrieval: { results: [], items: [], diagnostics: {} },
      evidenceBundles: [],
      answer: null,
      completedStages: []
    };
  }

  function resultEnvelope(request, state, status, errors) {
    return {
      queryId: request && request.queryId || '',
      analysis: state.analysis,
      retrievalPlan: state.retrievalPlan,
      requests: state.requests,
      retrieval: state.retrieval,
      evidenceBundles: state.evidenceBundles,
      answer: state.answer,
      status,
      errors,
      diagnostics: {
        completedStages: state.completedStages.slice(),
        claimCount: Array.isArray(request && request.claims) ? request.claims.length : 0,
        evidenceBundleCount: state.evidenceBundles.length,
        retrievalDiagnostics: state.retrieval.diagnostics
      },
      metadata: request && request.metadata || {}
    };
  }

  function errorResult(request, state, stage, code, message, claimId, metadata) {
    return resultEnvelope(request, state, 'error', [{
      stage,
      code,
      message,
      recoverable: false,
      sourceId: null,
      providerId: null,
      claimId: claimId || null,
      metadata: metadata || {}
    }]);
  }

  function stageError(request, state, stage, error, claimId) {
    const message = error && error.message ? String(error.message) : `${stage} failed.`;
    return errorResult(request, state, stage, FAILURE_CODES[stage], message, claimId);
  }

  function resolveComponents(dependencies) {
    const injected = dependencies.components || {};
    return {
      questionAnalyzer: injected.questionAnalyzer || A,
      sourceRouter: injected.sourceRouter || R,
      requestBuilder: injected.requestBuilder || B,
      retrievalExecutor: injected.retrievalExecutor || X,
      evidenceEngine: injected.evidenceEngine || E,
      answerEngine: injected.answerEngine || N
    };
  }

  function failedProviderResult(result) {
    return result && ['blocked', 'unavailable', 'error'].includes(result.status);
  }

  function noLegalContinuationPath(retrievalPlan, retrieval, accountConnected) {
    const results = Array.isArray(retrieval.results) ? retrieval.results : [];
    const allProvidersUnavailable = results.length > 0 && results.every(failedProviderResult);
    const accountUnavailable = retrievalPlan.requiresAccountData === true && (
      accountConnected !== true || results.some(result => result && result.request && result.request.sourceId === 'user-account' && failedProviderResult(result))
    );
    const requiredNonAccountFailure = results.some(result => result && result.request && result.request.required === true && result.request.sourceId !== 'user-account' && failedProviderResult(result));
    return allProvidersUnavailable || requiredNonAccountFailure || (accountUnavailable && retrievalPlan.publicKnowledgeCanFullyAnswer !== true);
  }

  function retrievalDegraded(retrievalPlan, retrieval, accountConnected) {
    const results = Array.isArray(retrieval.results) ? retrieval.results : [];
    const providerFailure = results.some(failedProviderResult);
    const accountUnavailable = retrievalPlan.requiresAccountData === true && (
      accountConnected !== true || results.some(result => result && result.request && result.request.sourceId === 'user-account' && failedProviderResult(result))
    );
    return providerFailure || accountUnavailable;
  }

  async function executeKnowledgeQuery(request, dependencies) {
    const state = initialState();
    const requestValidation = Q.validateKnowledgeQueryRequest(request);
    const dependencyValidation = Q.validateKnowledgeQueryDependencies(dependencies);
    if (!requestValidation.valid || !dependencyValidation.valid) {
      return errorResult(request, state, 'received', 'INVALID_INPUT', requestValidation.errors.concat(dependencyValidation.errors).join(','));
    }

    const components = resolveComponents(dependencies);
    try {
      state.analysis = await components.questionAnalyzer.analyze(
        request.question,
        { sellerProfile: request.sellerProfile },
        { now: dependencies.now, locale: dependencies.locale }
      );
      state.completedStages.push('analysis');
    } catch (error) {
      return stageError(request, state, 'analysis', error);
    }

    try {
      state.retrievalPlan = await components.sourceRouter.resolve(state.analysis);
      state.completedStages.push('routing');
    } catch (error) {
      return stageError(request, state, 'routing', error);
    }

    try {
      state.requests = await components.requestBuilder.buildRequests(state.analysis, state.retrievalPlan);
      state.completedStages.push('retrieval-planning');
    } catch (error) {
      return stageError(request, state, 'retrieval-planning', error);
    }

    try {
      const retrieval = await components.retrievalExecutor.execute(state.requests, {
        adapters: dependencies.adapters,
        now: dependencies.now,
        locale: dependencies.locale,
        accountConnected: !!(request.accountContext && request.accountContext.connected)
      });
      state.retrieval = {
        results: retrieval.results,
        items: retrieval.items,
        diagnostics: retrieval.diagnostics
      };
      state.completedStages.push('retrieval');
    } catch (error) {
      return stageError(request, state, 'retrieval', error);
    }

    const accountConnected = !!(request.accountContext && request.accountContext.connected);
    if (noLegalContinuationPath(state.retrievalPlan, state.retrieval, accountConnected)) {
      return resultEnvelope(request, state, Q.resolveQueryStatus({ fatalError: false, blocked: true, insufficient: false, degraded: retrievalDegraded(state.retrievalPlan, state.retrieval, accountConnected) }), []);
    }

    try {
      const bundles = [];
      for (const claim of request.claims) {
        try {
          bundles.push(await components.evidenceEngine.buildBundle(claim, state.retrieval.items, {
            now: dependencies.now,
            claimVerifier: dependencies.claimVerifier
          }));
        } catch (error) {
          return stageError(request, state, 'evidence', error, claim.claimId);
        }
      }
      state.evidenceBundles = bundles;
      state.completedStages.push('evidence');
    } catch (error) {
      return stageError(request, state, 'evidence', error);
    }

    try {
      state.answer = await components.answerEngine.answer(state.analysis, request.claims, state.evidenceBundles, {
        now: dependencies.now,
        locale: dependencies.locale,
        derivedFindings: request.options && request.options.derivedFindings,
        operationalAdvice: request.options && request.options.operationalAdvice
      });
      const validation = V.validateStructuredAnswer(state.answer, {
        evidenceBundles: state.evidenceBundles,
        claims: request.claims
      });
      if (!validation.valid) {
        state.answer = null;
        return errorResult(request, state, 'answer', 'QUERY_ANSWER_VALIDATION_FAILED', 'Structured answer validation failed.', null, { validation: 'invalid-structured-answer' });
      }
      state.completedStages.push('answer');
    } catch (error) {
      return stageError(request, state, 'answer', error);
    }

    return resultEnvelope(request, state, Q.resolveQueryStatus({
      fatalError: false,
      blocked: false,
      insufficient: state.answer.answerType === 'insufficient',
      degraded: retrievalDegraded(state.retrievalPlan, state.retrieval, accountConnected)
    }), []);
  }

  return { executeKnowledgeQuery };
});
