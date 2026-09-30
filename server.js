'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const Access = require('./knowledge-source-access-registry');
const Url = require('./knowledge-live-url-validator');
const Claims = require('./knowledge-claim-contracts');
const Transports = require('./knowledge-runtime-transports');
const SearchCoordinator = require('./knowledge-search-coordinator');
const Brave = require('./knowledge-brave-search-transport');
const SearXNG = require('./knowledge-searxng-search-transport');
const HttpDocument = require('./knowledge-http-document-transport');
const ProductionVerifier = require('./knowledge-production-claim-verifier');
const OpenAIAdapter = require('./knowledge-openai-claim-verifier');
const OpenAIQueryPlanner = require('./knowledge-openai-query-planner');
const DeepSeekAdapter = require('./knowledge-deepseek-claim-verifier');
const DeepSeekQueryPlanner = require('./knowledge-deepseek-query-planner');
const ClaimPreparation = require('./knowledge-claim-preparation');
const QueryUnderstanding = require('./knowledge-query-understanding');

const BODY_LIMIT_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 15 * 1000;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PRODUCTION_HOST = '0.0.0.0';
const DEFAULT_PORT = 8000;
const DEFAULT_RATE_LIMITS = Object.freeze({ plan: 20, verify: 30, search: 60, document: 60 });
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_ENTRIES = 10_000;
const MVP_PAIRS = Object.freeze({
  'amazon-seller-help': 'amazon-seller-help-provider',
  'amazon-seller-university': 'amazon-seller-university-provider',
  'amazon-seller-news': 'amazon-seller-news-provider',
  'amazon-ads': 'amazon-ads-provider',
  'amazon-sp-api': 'amazon-sp-api-provider'
});
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requestIdOf(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function errorEnvelope(requestId, errorCode, errorMessage) {
  return { requestId: requestIdOf(requestId), status: 'error', errorCode, errorMessage, retryable: false, metadata: {} };
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  applySecurityHeaders(response);
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload), 'Cache-Control': 'no-store' });
  response.end(payload);
}

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
}

function parsePort(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) return DEFAULT_PORT;
  const port = Number(value.trim());
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}

function resolveCliBinding(env = process.env) {
  const host = env && typeof env.HOST === 'string' && env.HOST.trim() ? env.HOST.trim() : DEFAULT_PRODUCTION_HOST;
  return { host, port: parsePort(env && env.PORT) };
}

function rateLimitName(pathname) {
  return pathname.slice('/api/knowledge/'.length);
}

function clientIp(request, trustProxy) {
  if (trustProxy) {
    const forwarded = request.headers && request.headers['x-forwarded-for'];
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
    if (net.isIP(first)) return first;
  }
  return request.socket && request.socket.remoteAddress ? request.socket.remoteAddress : 'unknown';
}

function createRateLimiter(options = {}) {
  const windowMs = Number.isInteger(options.windowMs) && options.windowMs > 0 ? options.windowMs : DEFAULT_RATE_LIMIT_WINDOW_MS;
  const maxEntries = Number.isInteger(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : DEFAULT_RATE_LIMIT_MAX_ENTRIES;
  const limits = { ...DEFAULT_RATE_LIMITS, ...(isObject(options.limits) ? options.limits : {}) };
  const entries = new Map();
  const now = typeof options.now === 'function' ? options.now : Date.now;

  function cleanup(current) {
    for (const [key, entry] of entries) if (entry.resetAt <= current) entries.delete(key);
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
  }

  return {
    check(request, pathname) {
      const name = rateLimitName(pathname);
      const limit = limits[name];
      if (!Number.isInteger(limit) || limit < 1) return { allowed: true };
      const current = now();
      cleanup(current);
      const key = `${clientIp(request, options.trustProxy === true)}:${name}`;
      const entry = entries.get(key) || { count: 0, resetAt: current + windowMs };
      if (entry.count >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - current) / 1000)) };
      entry.count += 1;
      entries.set(key, entry);
      return { allowed: true };
    },
    size() { return entries.size; }
  };
}

function validatePair(body) {
  if (!isObject(body)) return 'INVALID_REQUEST';
  if (!requestIdOf(body.requestId)) return 'INVALID_REQUEST';
  if (typeof body.sourceId !== 'string' || !Object.hasOwn(MVP_PAIRS, body.sourceId)) return 'UNKNOWN_SOURCE';
  if (typeof body.providerId !== 'string' || !Object.values(MVP_PAIRS).includes(body.providerId)) return 'UNKNOWN_PROVIDER';
  return MVP_PAIRS[body.sourceId] === body.providerId ? null : 'SOURCE_PROVIDER_MISMATCH';
}

function validateSearch(body) {
  const pairError = validatePair(body);
  if (pairError) return pairError;
  if (typeof body.query !== 'string' || !body.query.trim()) return 'INVALID_REQUEST';
  if (!Array.isArray(body.domains) || !body.domains.length || body.domains.some(domain => typeof domain !== 'string' || !domain)) return 'INVALID_REQUEST';
  const policy = Access.getPolicy(body.sourceId);
  if (!policy || body.domains.some(domain => !policy.allowedHosts.includes(domain.toLowerCase()))) return 'DOMAIN_NOT_ALLOWED';
  if (!Number.isInteger(body.maxResults) || body.maxResults < 1 || body.maxResults > 10) return 'INVALID_REQUEST';
  if (body.recencyDays !== null && body.recencyDays !== undefined && (!Number.isInteger(body.recencyDays) || body.recencyDays < 1 || body.recencyDays > 365)) return 'INVALID_REQUEST';
  if (body.locale !== null && body.locale !== undefined && typeof body.locale !== 'string') return 'INVALID_REQUEST';
  if (body.language !== null && body.language !== undefined && typeof body.language !== 'string') return 'INVALID_REQUEST';
  if (!isObject(body.metadata)) return 'INVALID_REQUEST';
  return null;
}

function validateDocument(body) {
  const pairError = validatePair(body);
  if (pairError) return pairError;
  if (typeof body.url !== 'string' || !body.url) return 'INVALID_REQUEST';
  const policy = Access.getPolicy(body.sourceId);
  return policy && Url.validateUrl(body.url, policy).valid ? null : 'URL_NOT_ALLOWED';
}

function validateVerify(body) {
  if (!isObject(body) || !requestIdOf(body.requestId)) return 'INVALID_REQUEST';
  if (!Claims.validateClaimRequest(body.claim).valid) return 'INVALID_REQUEST';
  if (!ProductionVerifier.validateEvidenceCandidate(body.candidate, body.claim).valid) return 'INVALID_REQUEST';
  if (!isObject(body.context)) return 'INVALID_REQUEST';
  return null;
}

function validatePlan(body) {
  if (!isObject(body) || typeof body.question !== 'string' || !body.question.trim() || !isObject(body.understanding)) return 'INVALID_REQUEST';
  const understanding = body.understanding;
  if (understanding.status !== 'open-ended-public' || understanding.accountDataRequired !== false) return 'INVALID_UNDERSTANDING';
  if (typeof understanding.normalizedQuestion !== 'string' || !QueryUnderstanding.TOPICS.includes(understanding.topic) || !QueryUnderstanding.INTENTS.includes(understanding.intent) || !QueryUnderstanding.TIME_SENSITIVITY.includes(understanding.timeSensitivity)) return 'INVALID_UNDERSTANDING';
  if (!Array.isArray(understanding.marketplaces) || understanding.marketplaces.some(value => !['US', 'CA', 'MX', 'UK', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'PL', 'BE', 'AU', 'JP'].includes(value))) return 'INVALID_UNDERSTANDING';
  if (!Array.isArray(understanding.regions) || understanding.regions.some(value => !['EU', 'GLOBAL'].includes(value))) return 'INVALID_UNDERSTANDING';
  if (!Array.isArray(understanding.ambiguities) || typeof understanding.confidence !== 'string' || !isObject(understanding.metadata)) return 'INVALID_UNDERSTANDING';
  return null;
}

function plannerFailure(errorCode) {
  return { status: 'unsupported', claims: [], ambiguities: [], confidence: 'low', metadata: { errorCode } };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    const fail = code => {
      if (!settled) {
        settled = true;
        reject({ code });
      }
    };
    request.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        fail('REQUEST_TOO_LARGE');
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        settled = true;
        resolve(parsed);
      } catch (_) {
        fail('INVALID_JSON');
      }
    });
    request.on('error', () => fail('INVALID_REQUEST'));
  });
}

function safeStaticPath(rootDir, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch (_) {
    return null;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolvedRoot = path.resolve(rootDir);
  const filePath = path.resolve(resolvedRoot, relative);
  const relativePath = path.relative(resolvedRoot, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
  return filePath;
}

function frontendAssetPaths(rootDir) {
  const indexPath = path.join(rootDir, 'index.html');
  let html = '';
  try { html = fs.readFileSync(indexPath, 'utf8'); } catch (_) { return new Set(['index.html']); }
  const assets = new Set(['index.html']);
  const pattern = /(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const value = match[1].split('?')[0];
    if (value && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//')) assets.add(value.replace(/^\/+/, ''));
  }
  return assets;
}

function createAppServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || __dirname);
  const host = options.host || DEFAULT_HOST;
  const port = options.port === undefined ? DEFAULT_PORT : options.port;
  const logger = typeof options.logger === 'function' ? options.logger : null;
  const searchTransport = options.searchTransport;
  const documentTransport = options.documentTransport;
  const claimVerifier = options.claimVerifier;
  const claimPreparation = options.claimPreparation;
  const rateLimiter = options.rateLimiter || createRateLimiter({ ...(isObject(options.rateLimit) ? options.rateLimit : {}), trustProxy: options.trustProxy === true });
  const allowedStaticAssets = frontendAssetPaths(rootDir);
  Transports.assertTransportConfiguration(searchTransport, documentTransport);
  if (claimVerifier !== undefined && (!claimVerifier || typeof claimVerifier.verify !== 'function')) throw Error('INVALID_CLAIM_VERIFIER');
  if (claimPreparation !== undefined && (!claimPreparation || typeof claimPreparation.prepareClaimsFromUnderstanding !== 'function')) throw Error('INVALID_CLAIM_PREPARATION');

  function log(request, statusCode, startedAt, requestId, rateLimited = false) {
    if (logger) logger({ method: request.method, path: new URL(request.url, 'http://localhost').pathname, requestId: requestIdOf(requestId), statusCode, durationMs: Date.now() - startedAt, rateLimited });
  }

  function sendError(request, response, startedAt, statusCode, requestId, code, message) {
    sendJson(response, statusCode, errorEnvelope(requestId, code, message));
    log(request, statusCode, startedAt, requestId);
  }

  async function handleApi(request, response, startedAt, pathname) {
    if (pathname === '/api/health') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendError(request, response, startedAt, 405, null, 'METHOD_NOT_ALLOWED', 'Only GET is allowed.');
        return;
      }
      const health = {
        plannerConfigured: Boolean(claimPreparation),
        verifierConfigured: Boolean(claimVerifier),
        searchConfigured: Boolean(searchTransport),
        documentConfigured: Boolean(documentTransport)
      };
      health.status = Object.values(health).every(Boolean) ? 'ok' : 'degraded';
      sendJson(response, 200, health);
      log(request, 200, startedAt, null);
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendError(request, response, startedAt, 405, null, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
      return;
    }
    const rateLimit = rateLimiter.check(request, pathname);
    if (!rateLimit.allowed) {
      response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      sendJson(response, 429, errorEnvelope(null, 'RATE_LIMITED', 'Too many requests.'));
      log(request, 429, startedAt, null, true);
      return;
    }
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      const code = error && error.code === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON';
      sendError(request, response, startedAt, code === 'REQUEST_TOO_LARGE' ? 413 : 400, null, code, code === 'REQUEST_TOO_LARGE' ? 'Request body is too large.' : 'Request body must be valid JSON.');
      return;
    }
    if (!['/api/knowledge/search', '/api/knowledge/document', '/api/knowledge/verify', '/api/knowledge/plan'].includes(pathname)) {
      sendError(request, response, startedAt, 404, body && body.requestId, 'API_NOT_FOUND', 'Knowledge API endpoint was not found.');
      return;
    }
    const requestId = body && body.requestId;
    let validationError;
    if (pathname === '/api/knowledge/search') validationError = validateSearch(body);
    if (pathname === '/api/knowledge/document') validationError = validateDocument(body);
    if (pathname === '/api/knowledge/verify') validationError = validateVerify(body);
    if (pathname === '/api/knowledge/plan') validationError = validatePlan(body);
    if (validationError) {
      sendError(request, response, startedAt, 400, requestId, validationError, 'Request does not satisfy the knowledge runtime contract.');
      return;
    }
    if (pathname === '/api/knowledge/plan') {
      let output;
      if (!claimPreparation) output = plannerFailure('PLANNER_NOT_CONFIGURED');
      else {
        try {
          const execution = await Transports.runWithTimeout(signal => claimPreparation.prepareClaimsFromUnderstanding({ question: body.question, understanding: body.understanding, signal }), REQUEST_TIMEOUT_MS);
          output = execution.timedOut ? plannerFailure('PLANNER_TIMEOUT') : execution.value;
          if (output && output.status === 'unsupported' && output.metadata && output.metadata.reason === 'PLANNER_FAILED') output = plannerFailure('PLANNER_FAILED');
          if (!output || !ClaimPreparation.PREPARED_CLAIM_STATUSES.includes(output.status) || !Array.isArray(output.claims) || !Array.isArray(output.ambiguities) || typeof output.confidence !== 'string' || !isObject(output.metadata)) output = plannerFailure('PLANNER_INVALID_RESPONSE');
        } catch (_) { output = plannerFailure('PLANNER_UNAVAILABLE'); }
      }
      sendJson(response, 200, { requestId, ...output });
    } else if (pathname === '/api/knowledge/search') {
      let output;
      if (!searchTransport) output = { status: 'unavailable', results: [], errorCode: 'SEARCH_TRANSPORT_NOT_CONFIGURED', errorMessage: 'Search transport is not configured.' };
      else {
        try {
          const execution = await Transports.runWithTimeout(signal => SearchCoordinator.coordinateSearch(searchTransport, body, Transports.runtimeContext(requestId, body.locale, signal)), REQUEST_TIMEOUT_MS);
          output = execution.timedOut ? { status: 'unavailable', results: [], errorCode: 'SEARCH_TRANSPORT_TIMEOUT', errorMessage: 'Search transport timed out.' } : Transports.normalizeSearchResponse(execution.value, Access.getPolicy(body.sourceId), body.domains.map(domain => domain.toLowerCase()), Url.validateUrl);
        } catch (_) {
          output = { status: 'error', results: [], errorCode: 'SEARCH_TRANSPORT_ERROR', errorMessage: 'Search transport failed.' };
        }
      }
      sendJson(response, 200, { requestId, ...output, retryable: false, metadata: {} });
    } else if (pathname === '/api/knowledge/document') {
      let output;
      if (!documentTransport) output = { status: 'unavailable', url: body.url, finalUrl: null, text: null, title: null, publisher: null, author: null, publishedAt: null, effectiveAt: null, errorCode: 'DOCUMENT_TRANSPORT_NOT_CONFIGURED', errorMessage: 'Document transport is not configured.' };
      else {
        try {
          const input = { url: body.url, sourceId: body.sourceId, providerId: body.providerId, requestId };
          const execution = await Transports.runWithTimeout(signal => documentTransport.fetchDocument(input, Transports.runtimeContext(requestId, null, signal)), REQUEST_TIMEOUT_MS);
          output = execution.timedOut ? { status: 'unavailable', url: body.url, finalUrl: null, text: null, title: null, publisher: null, author: null, publishedAt: null, effectiveAt: null, errorCode: 'DOCUMENT_TRANSPORT_TIMEOUT', errorMessage: 'Document transport timed out.' } : Transports.normalizeDocumentResponse(execution.value, Access.getPolicy(body.sourceId), body.url, Url.validateUrl);
        } catch (_) {
          output = { status: 'error', url: body.url, finalUrl: null, text: null, title: null, publisher: null, author: null, publishedAt: null, effectiveAt: null, errorCode: 'DOCUMENT_TRANSPORT_ERROR', errorMessage: 'Document transport failed.' };
        }
      }
      sendJson(response, 200, { requestId, ...output, retryable: false, metadata: {} });
    } else if (!claimVerifier) {
      sendJson(response, 200, { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'unconfigured', metadata: { errorCode: 'CLAIM_VERIFIER_NOT_CONFIGURED' } });
    } else {
      const safeContext = { now: new Date().toISOString(), sourceId: body.candidate.sourceId, providerId: body.candidate.providerId, requestId };
      let output;
      try {
        const execution = await Transports.runWithTimeout(signal => claimVerifier.verify(body.claim, body.candidate, { ...safeContext, signal }), REQUEST_TIMEOUT_MS);
        if (execution.timedOut) output = { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'server', metadata: { errorCode: 'CLAIM_VERIFIER_TIMEOUT' } };
        else {
          const checked = ProductionVerifier.validateVerificationResult(execution.value, body.candidate);
          output = checked.valid ? checked.value : { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'server', metadata: { errorCode: checked.errorCode } };
        }
      } catch (_) {
        output = { status: 'unknown', supportStrength: 'unknown', excerpt: null, rationale: null, verifierType: 'server', metadata: { errorCode: 'CLAIM_VERIFIER_ERROR' } };
      }
      sendJson(response, 200, output);
    }
    log(request, 200, startedAt, requestId);
  }

  async function handler(request, response) {
    const startedAt = Date.now();
    const rawPath = String(request.url || '').split('?')[0];
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch (_) {
      sendError(request, response, startedAt, 400, null, 'INVALID_REQUEST', 'Invalid request URL.');
      return;
    }
    if (pathname === '/api/health' || pathname.startsWith('/api/knowledge/')) {
      await handleApi(request, response, startedAt, pathname);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendError(request, response, startedAt, 405, null, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are allowed for static files.');
      return;
    }
    const filePath = safeStaticPath(rootDir, rawPath);
    const relativePath = filePath ? path.relative(rootDir, filePath).replace(/\\/g, '/') : null;
    if (!filePath) {
      sendError(request, response, startedAt, 403, null, 'STATIC_PATH_NOT_ALLOWED', 'Static path is not allowed.');
      return;
    }
    if (!allowedStaticAssets.has(relativePath)) {
      sendError(request, response, startedAt, 404, null, 'STATIC_NOT_FOUND', 'Static file was not found.');
      return;
    }
    try {
      const data = await fs.promises.readFile(filePath);
      applySecurityHeaders(response);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Content-Length': data.length });
      if (request.method !== 'HEAD') response.end(data); else response.end();
      log(request, 200, startedAt, null);
    } catch (_) {
      sendError(request, response, startedAt, 404, null, 'STATIC_NOT_FOUND', 'Static file was not found.');
    }
  }

  const server = http.createServer((request, response) => {
    handler(request, response).catch(() => sendError(request, response, Date.now(), 500, null, 'INTERNAL_SERVER_ERROR', 'Internal server error.'));
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;

  return {
    server,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  };
}

function startServer(options) {
  const app = createAppServer(options);
  return app.start().then(() => app);
}

function createProductionSearchTransport(env, options = {}) {
  const searxngBaseUrl = env && typeof env.SEARXNG_BASE_URL === 'string' ? env.SEARXNG_BASE_URL.trim() : '';
  const apiKey = env && typeof env.BRAVE_SEARCH_API_KEY === 'string' ? env.BRAVE_SEARCH_API_KEY.trim() : '';
  const fetchImpl = options.fetchImpl;
  if ((fetchImpl === undefined && typeof globalThis.fetch !== 'function') || (fetchImpl !== undefined && typeof fetchImpl !== 'function')) return undefined;
  if (searxngBaseUrl) return SearXNG.createSearXNGSearchTransport({ baseUrl: searxngBaseUrl, ...(fetchImpl === undefined ? {} : { fetchImpl }) });
  if (!apiKey) return undefined;
  return Brave.createBraveSearchTransport({
    apiKey,
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint })
  });
}

function createProductionDocumentTransport(options = {}) {
  const fetchImpl = options.fetchImpl;
  if (fetchImpl === undefined && typeof globalThis.fetch !== 'function') return undefined;
  return HttpDocument.createHttpDocumentTransport(options);
}

function createProductionClaimVerifier(env, options = {}) {
  const deepSeekApiKey = env && typeof env.DEEPSEEK_API_KEY === 'string' ? env.DEEPSEEK_API_KEY.trim() : '';
  const openAiApiKey = env && typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  const fetchImpl = options.fetchImpl;
  if ((fetchImpl === undefined && typeof globalThis.fetch !== 'function') || (fetchImpl !== undefined && typeof fetchImpl !== 'function')) return undefined;
  if (!deepSeekApiKey && !openAiApiKey) return undefined;
  const adapter = deepSeekApiKey
    ? DeepSeekAdapter.createDeepSeekClaimVerifierAdapter({ apiKey: deepSeekApiKey, ...(fetchImpl === undefined ? {} : { fetchImpl }) })
    : OpenAIAdapter.createOpenAIClaimVerifierAdapter({
    apiKey: openAiApiKey,
    ...(fetchImpl === undefined ? {} : { fetchImpl })
  });
  return ProductionVerifier.createProductionClaimVerifier({ verifyImpl: adapter.verifyImpl });
}

function createProductionClaimPreparation(env, options = {}) {
  const deepSeekApiKey = env && typeof env.DEEPSEEK_API_KEY === 'string' ? env.DEEPSEEK_API_KEY.trim() : '';
  const openAiApiKey = env && typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  const fetchImpl = options.fetchImpl;
  if ((fetchImpl === undefined && typeof globalThis.fetch !== 'function') || (fetchImpl !== undefined && typeof fetchImpl !== 'function')) return undefined;
  if (!deepSeekApiKey && !openAiApiKey) return undefined;
  const adapter = deepSeekApiKey
    ? DeepSeekQueryPlanner.createDeepSeekQueryPlanner({ apiKey: deepSeekApiKey, ...(fetchImpl === undefined ? {} : { fetchImpl }) })
    : OpenAIQueryPlanner.createOpenAIQueryPlanner({ apiKey: openAiApiKey, ...(fetchImpl === undefined ? {} : { fetchImpl }) });
  return ClaimPreparation.createClaimPreparation({ plannerImpl: adapter.plannerImpl });
}

function createProductionServerOptions(options = {}) {
  const { env = process.env, fetchImpl, endpoint, searxngFetchImpl, documentFetchImpl, openAIFetchImpl, openAIPlannerFetchImpl, deepSeekFetchImpl, deepSeekPlannerFetchImpl, documentTransportOptions = {}, ...serverOptions } = options;
  return {
    ...serverOptions,
    searchTransport: serverOptions.searchTransport === undefined
      ? createProductionSearchTransport(env, { fetchImpl: (env && typeof env.SEARXNG_BASE_URL === 'string' && env.SEARXNG_BASE_URL.trim()) ? (searxngFetchImpl === undefined ? fetchImpl : searxngFetchImpl) : fetchImpl, endpoint })
      : serverOptions.searchTransport,
    documentTransport: serverOptions.documentTransport === undefined
      ? createProductionDocumentTransport({ ...documentTransportOptions, ...(documentFetchImpl === undefined ? {} : { fetchImpl: documentFetchImpl }) })
      : serverOptions.documentTransport,
    claimVerifier: serverOptions.claimVerifier === undefined
      ? createProductionClaimVerifier(env, (env && typeof env.DEEPSEEK_API_KEY === 'string' && env.DEEPSEEK_API_KEY.trim()) ? (deepSeekFetchImpl === undefined ? {} : { fetchImpl: deepSeekFetchImpl }) : (openAIFetchImpl === undefined ? {} : { fetchImpl: openAIFetchImpl }))
      : serverOptions.claimVerifier,
    claimPreparation: serverOptions.claimPreparation === undefined
      ? createProductionClaimPreparation(env, (env && typeof env.DEEPSEEK_API_KEY === 'string' && env.DEEPSEEK_API_KEY.trim()) ? (deepSeekPlannerFetchImpl === undefined ? {} : { fetchImpl: deepSeekPlannerFetchImpl }) : (openAIPlannerFetchImpl === undefined ? {} : { fetchImpl: openAIPlannerFetchImpl }))
      : serverOptions.claimPreparation
  };
}

function installGracefulShutdown(app, processImpl = process) {
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    Promise.resolve(app.close()).catch(() => {}).finally(() => { processImpl.exitCode = 0; });
  };
  processImpl.once('SIGINT', shutdown);
  processImpl.once('SIGTERM', shutdown);
  return shutdown;
}

module.exports = { BODY_LIMIT_BYTES, REQUEST_TIMEOUT_MS, DEFAULT_HOST, DEFAULT_PRODUCTION_HOST, DEFAULT_PORT, DEFAULT_RATE_LIMITS, MVP_PAIRS, createAppServer, startServer, createRateLimiter, resolveCliBinding, installGracefulShutdown, createProductionSearchTransport, createProductionDocumentTransport, createProductionClaimVerifier, createProductionClaimPreparation, createProductionServerOptions };

if (require.main === module) {
  const binding = resolveCliBinding(process.env);
  const options = createProductionServerOptions(binding);
  process.stdout.write(`Knowledge search provider: ${options.searchTransport ? 'configured' : 'not configured'}\n`);
  process.stdout.write(`Knowledge claim verifier: ${options.claimVerifier ? 'configured' : 'not configured'}\n`);
  process.stdout.write(`Knowledge query planner: ${options.claimPreparation ? 'configured' : 'not configured'}\n`);
  startServer(options).then(app => {
    installGracefulShutdown(app);
    process.stdout.write(`Amazon Workbench server running at http://${binding.host}:${binding.port}\n`);
  }).catch(() => {
    process.stderr.write('Amazon Workbench server failed to start.\n');
    process.exitCode = 1;
  });
}
