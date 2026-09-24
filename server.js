'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Access = require('./knowledge-source-access-registry');
const Url = require('./knowledge-live-url-validator');
const Claims = require('./knowledge-claim-contracts');
const Transports = require('./knowledge-runtime-transports');
const SearchCoordinator = require('./knowledge-search-coordinator');
const Brave = require('./knowledge-brave-search-transport');
const HttpDocument = require('./knowledge-http-document-transport');
const ProductionVerifier = require('./knowledge-production-claim-verifier');

const BODY_LIMIT_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 15 * 1000;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8000;
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
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload), 'Cache-Control': 'no-store' });
  response.end(payload);
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

function createAppServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || __dirname);
  const host = options.host || DEFAULT_HOST;
  const port = options.port === undefined ? DEFAULT_PORT : options.port;
  const logger = typeof options.logger === 'function' ? options.logger : null;
  const searchTransport = options.searchTransport;
  const documentTransport = options.documentTransport;
  const claimVerifier = options.claimVerifier;
  Transports.assertTransportConfiguration(searchTransport, documentTransport);
  if (claimVerifier !== undefined && (!claimVerifier || typeof claimVerifier.verify !== 'function')) throw Error('INVALID_CLAIM_VERIFIER');

  function log(request, statusCode, startedAt, requestId) {
    if (logger) logger({ method: request.method, path: new URL(request.url, 'http://localhost').pathname, requestId: requestIdOf(requestId), statusCode, durationMs: Date.now() - startedAt });
  }

  function sendError(request, response, startedAt, statusCode, requestId, code, message) {
    sendJson(response, statusCode, errorEnvelope(requestId, code, message));
    log(request, statusCode, startedAt, requestId);
  }

  async function handleApi(request, response, startedAt, pathname) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendError(request, response, startedAt, 405, null, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
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
    if (!['/api/knowledge/search', '/api/knowledge/document', '/api/knowledge/verify'].includes(pathname)) {
      sendError(request, response, startedAt, 404, body && body.requestId, 'API_NOT_FOUND', 'Knowledge API endpoint was not found.');
      return;
    }
    const requestId = body && body.requestId;
    let validationError;
    if (pathname === '/api/knowledge/search') validationError = validateSearch(body);
    if (pathname === '/api/knowledge/document') validationError = validateDocument(body);
    if (pathname === '/api/knowledge/verify') validationError = validateVerify(body);
    if (validationError) {
      sendError(request, response, startedAt, 400, requestId, validationError, 'Request does not satisfy the knowledge runtime contract.');
      return;
    }
    if (pathname === '/api/knowledge/search') {
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
    if (pathname.startsWith('/api/knowledge/')) {
      await handleApi(request, response, startedAt, pathname);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendError(request, response, startedAt, 405, null, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are allowed for static files.');
      return;
    }
    const filePath = safeStaticPath(rootDir, rawPath);
    if (!filePath) {
      sendError(request, response, startedAt, 403, null, 'STATIC_PATH_NOT_ALLOWED', 'Static path is not allowed.');
      return;
    }
    try {
      const data = await fs.promises.readFile(filePath);
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
  const apiKey = env && typeof env.BRAVE_SEARCH_API_KEY === 'string' ? env.BRAVE_SEARCH_API_KEY.trim() : '';
  const fetchImpl = options.fetchImpl;
  if (!apiKey || (fetchImpl === undefined && typeof globalThis.fetch !== 'function')) return undefined;
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

function createProductionServerOptions(options = {}) {
  const { env = process.env, fetchImpl, endpoint, documentFetchImpl, documentTransportOptions = {}, ...serverOptions } = options;
  return {
    ...serverOptions,
    searchTransport: serverOptions.searchTransport === undefined
      ? createProductionSearchTransport(env, { fetchImpl, endpoint })
      : serverOptions.searchTransport,
    documentTransport: serverOptions.documentTransport === undefined
      ? createProductionDocumentTransport({ ...documentTransportOptions, ...(documentFetchImpl === undefined ? {} : { fetchImpl: documentFetchImpl }) })
      : serverOptions.documentTransport
  };
}

module.exports = { BODY_LIMIT_BYTES, REQUEST_TIMEOUT_MS, DEFAULT_HOST, DEFAULT_PORT, MVP_PAIRS, createAppServer, startServer, createProductionSearchTransport, createProductionDocumentTransport, createProductionServerOptions };

if (require.main === module) {
  const options = createProductionServerOptions();
  process.stdout.write(`Knowledge search provider: ${options.searchTransport ? 'configured' : 'not configured'}\n`);
  startServer(options).then(() => {
    process.stdout.write(`Amazon Workbench server running at http://${DEFAULT_HOST}:${DEFAULT_PORT}\n`);
  }).catch(() => {
    process.stderr.write('Amazon Workbench server failed to start.\n');
    process.exitCode = 1;
  });
}
