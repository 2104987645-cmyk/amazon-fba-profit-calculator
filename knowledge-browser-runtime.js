(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./knowledge-live-adapters') : root.KnowledgeLiveAdapters,
    typeof module === 'object' && module.exports ? require('./knowledge-query-orchestrator') : root.KnowledgeQueryOrchestrator,
    typeof module === 'object' && module.exports ? require('./knowledge-query-preparation') : root.KnowledgeQueryPreparation,
    typeof module === 'object' && module.exports ? require('./knowledge-query-understanding') : root.KnowledgeQueryUnderstanding
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KnowledgeBrowserRuntime = api;
})(typeof window !== 'undefined' ? window : globalThis, function (LiveAdapters, Orchestrator, Preparation, Understanding) {
  'use strict';

  const ENDPOINTS = Object.freeze({
    search: '/api/knowledge/search',
    document: '/api/knowledge/document',
    verify: '/api/knowledge/verify',
    plan: '/api/knowledge/plan'
  });
  const TRANSPORT_STATUSES = new Set(['ok', 'empty', 'unavailable', 'error']);
  const VERIFICATION_STATUSES = new Set(['supports', 'contradicts', 'not-addressed', 'unclear', 'unknown']);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function baseUrl(value) {
    if (typeof value !== 'string' || !value || value === '/') return '';
    return value.startsWith('/') && !value.startsWith('//') ? value.replace(/\/$/, '') : '';
  }

  function transportFailure(status, errorCode, errorMessage) {
    return { status, results: [], errorCode, errorMessage };
  }

  async function postJson(fetchImpl, url, payload, signal) {
    if (typeof fetchImpl !== 'function') return { ok: false, status: 'unavailable', errorCode: 'BROWSER_FETCH_UNAVAILABLE', errorMessage: 'Knowledge service is unavailable.' };
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clone(payload)),
        signal
      });
    } catch (error) {
      return { ok: false, status: 'unavailable', errorCode: error && error.name === 'AbortError' ? 'BROWSER_REQUEST_ABORTED' : 'BROWSER_NETWORK_UNAVAILABLE', errorMessage: 'Knowledge service is unavailable.' };
    }
    if (!response || typeof response.status !== 'number') return { ok: false, status: 'error', errorCode: 'BROWSER_RESPONSE_INVALID', errorMessage: 'Knowledge service returned an invalid response.' };
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, status: response.status === 404 ? 'unavailable' : 'error', errorCode: response.status === 404 ? 'BROWSER_SERVICE_UNAVAILABLE' : 'BROWSER_SERVICE_ERROR', errorMessage: 'Knowledge service is unavailable.' };
    }
    if (typeof response.json !== 'function') return { ok: false, status: 'unavailable', errorCode: 'BROWSER_RESPONSE_INVALID', errorMessage: 'Knowledge service is unavailable.' };
    try {
      return { ok: true, value: await response.json() };
    } catch (_) {
      return { ok: false, status: 'unavailable', errorCode: 'BROWSER_RESPONSE_INVALID', errorMessage: 'Knowledge service is unavailable.' };
    }
  }

  function normalizeSearch(value) {
    if (!value || typeof value !== 'object' || !TRANSPORT_STATUSES.has(value.status) || !Array.isArray(value.results)) return transportFailure('error', 'BROWSER_SEARCH_INVALID_RESPONSE', 'Knowledge service returned an invalid search response.');
    return { status: value.status, results: clone(value.results), errorCode: value.errorCode || null, errorMessage: value.errorMessage || null };
  }

  function normalizeDocument(value, input) {
    if (!value || typeof value !== 'object' || !TRANSPORT_STATUSES.has(value.status)) return { status: 'error', url: input.url, finalUrl: null, text: null, title: null, publisher: null, author: null, publishedAt: null, effectiveAt: null, errorCode: 'BROWSER_DOCUMENT_INVALID_RESPONSE', errorMessage: 'Knowledge service returned an invalid document response.' };
    return {
      status: value.status,
      url: typeof value.url === 'string' ? value.url : input.url,
      finalUrl: typeof value.finalUrl === 'string' ? value.finalUrl : null,
      text: typeof value.text === 'string' ? value.text : null,
      title: typeof value.title === 'string' ? value.title : null,
      publisher: typeof value.publisher === 'string' ? value.publisher : null,
      author: typeof value.author === 'string' ? value.author : null,
      publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : null,
      effectiveAt: typeof value.effectiveAt === 'string' ? value.effectiveAt : null,
      errorCode: value.errorCode || null,
      errorMessage: value.errorMessage || null
    };
  }

  function unknownVerification(errorCode) {
    return { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'browser-runtime', metadata: { errorCode } };
  }

  function normalizeVerification(value) {
    if (!value || typeof value !== 'object' || !VERIFICATION_STATUSES.has(value.status) || typeof value.supportStrength !== 'string') return unknownVerification('BROWSER_VERIFY_INVALID_RESPONSE');
    return {
      status: value.status,
      supportStrength: value.supportStrength,
      excerpt: typeof value.excerpt === 'string' ? value.excerpt : null,
      rationale: typeof value.rationale === 'string' ? value.rationale : null,
      verifierType: typeof value.verifierType === 'string' ? value.verifierType : 'server',
      metadata: value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata) ? clone(value.metadata) : {}
    };
  }

  function createBrowserKnowledgeRuntime(options = {}) {
    const fetchImpl = options.fetchImpl === undefined ? root.fetch : options.fetchImpl;
    const prefix = baseUrl(options.baseUrl);
    const endpoints = Object.freeze(Object.fromEntries(Object.entries(ENDPOINTS).map(([name, path]) => [name, `${prefix}${path}`])));
    const ready = typeof fetchImpl === 'function' && LiveAdapters && typeof LiveAdapters.createLiveAdapters === 'function' && Orchestrator && typeof Orchestrator.executeKnowledgeQuery === 'function' && Preparation && Understanding;

    const searchTransport = {
      async search(input, context = {}) {
        const response = await postJson(fetchImpl, endpoints.search, input, context.signal);
        return response.ok ? normalizeSearch(response.value) : transportFailure(response.status, response.errorCode, response.errorMessage);
      }
    };
    const documentTransport = {
      async fetchDocument(input, context = {}) {
        const response = await postJson(fetchImpl, endpoints.document, input, context.signal);
        return response.ok ? normalizeDocument(response.value, input) : normalizeDocument({ status: response.status, errorCode: response.errorCode, errorMessage: response.errorMessage }, input);
      }
    };
    const claimVerifier = {
      async verify(claim, candidate, context = {}) {
        const response = await postJson(fetchImpl, endpoints.verify, { requestId: context.requestId || `verify-${Date.now()}`, claim, candidate, context: {} }, context.signal);
        return response.ok ? normalizeVerification(response.value) : unknownVerification(response.errorCode);
      }
    };

    const queryDependencies = ready ? {
      now: typeof options.now === 'string' ? options.now : new Date().toISOString(),
      locale: typeof options.locale === 'string' ? options.locale : 'zh-CN',
      adapters: LiveAdapters.createLiveAdapters(),
      claimVerifier
    } : null;
    function executeKnowledgeQuery(request, dependencies) {
      const resolved = dependencies || queryDependencies;
      if (!resolved) return Promise.resolve({ queryId: request && request.queryId || '', status: 'blocked', answer: null, errors: [], diagnostics: { runtime: 'unavailable' }, metadata: request && request.metadata || {} });
      const resolvedAdapters = Object.fromEntries(Object.entries(resolved.adapters || {}).map(([providerId, adapter]) => [providerId, {
        retrieve(input, context) {
          return adapter.retrieve(input, { ...context, searchTransport, documentTransport });
        }
      }]));
      return Orchestrator.executeKnowledgeQuery(request, { ...resolved, adapters: resolvedAdapters });
    }

    async function executeQuestion(input = {}) {
      const question = input.question;
      const registry = input.templateRegistry || (Preparation && Preparation.createProductionTemplateRegistry && Preparation.createProductionTemplateRegistry());
      const template = Preparation.prepareKnowledgeQuery(question, registry);
      if (template.status === 'invalid') return { kind: 'preparation', preparationStatus: 'invalid' };
      if (template.status === 'matched') {
        const request = { queryId: input.queryId || `knowledge-${Date.now()}`, question: template.originalQuestion, claims: template.claims, options: input.options || {}, metadata: { entryMode: 'exact-template', templateId: template.matchedTemplateId, normalizedQuestion: template.normalizedQuestion } };
        if (input.sellerProfile !== undefined) request.sellerProfile = input.sellerProfile;
        if (input.accountContext !== undefined) request.accountContext = input.accountContext;
        return executeKnowledgeQuery(request);
      }
      const understanding = Understanding.understandKnowledgeQuery(question, { registry, context: input.context, analysisOptions: input.analysisOptions });
      if (understanding.status !== 'open-ended-public') return { kind: 'preparation', preparationStatus: understanding.status, understanding };
      const planResponse = await postJson(fetchImpl, endpoints.plan, { question, understanding }, input.signal);
      if (!planResponse.ok || !planResponse.value || planResponse.value.status !== 'ready' || !Array.isArray(planResponse.value.claims) || !planResponse.value.claims.length || planResponse.value.claims.length > 3) return { kind: 'planner-unavailable' };
      const request = { queryId: input.queryId || `knowledge-${Date.now()}`, question, claims: clone(planResponse.value.claims), options: input.options || {}, metadata: { entryMode: 'open-ended', topic: understanding.topic, intent: understanding.intent, normalizedQuestion: understanding.normalizedQuestion } };
      if (input.sellerProfile !== undefined) request.sellerProfile = input.sellerProfile;
      if (input.accountContext !== undefined) request.accountContext = input.accountContext;
      return executeKnowledgeQuery(request);
    }

    return {
      status: ready ? 'ready' : 'unavailable',
      queryDependencies,
      transports: { search: searchTransport, document: documentTransport, verify: claimVerifier },
      executeKnowledgeQuery,
      executeQuestion
    };
  }

  return { ENDPOINTS: { ...ENDPOINTS }, createBrowserKnowledgeRuntime };
});
