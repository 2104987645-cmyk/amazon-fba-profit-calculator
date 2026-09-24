'use strict';

const assert = require('node:assert/strict');
const Coordinator = require('../knowledge-search-coordinator');

function result(externalId, url, rank) {
  return {
    externalId,
    title: externalId,
    url,
    snippet: null,
    publisher: null,
    author: null,
    publishedAt: null,
    officialAuthorVerified: null,
    rank,
    metadata: { providerRank: rank }
  };
}

function request(overrides = {}) {
  return {
    requestId: 'multi-domain-1',
    query: 'Vine Pre Launch',
    domains: ['sellercentral.amazon.com', 'sell.amazon.com'],
    maxResults: 2,
    metadata: { purpose: 'test' },
    ...overrides
  };
}

async function run() {
  assert.equal(typeof Coordinator.coordinateSearch, 'function');

  const input = request();
  const snapshot = structuredClone(input);
  const calls = [];
  const transport = {
    async search(domainRequest, runtimeContext) {
      calls.push({ domainRequest, runtimeContext });
      if (domainRequest.domains[0] === 'sellercentral.amazon.com') {
        return {
          status: 'ok',
          results: [
            result('central-a', 'https://sellercentral.amazon.com/help/a', 1),
            result('shared', 'https://sellercentral.amazon.com/help/shared', 2)
          ]
        };
      }
      return {
        status: 'ok',
        results: [
          result('shared', 'https://sellercentral.amazon.com/help/shared', 1),
          result('sell-b', 'https://sell.amazon.com/help/b', 2)
        ]
      };
    }
  };
  const output = await Coordinator.coordinateSearch(transport, input, { requestId: 'multi-domain-1' });
  assert.deepEqual(input, snapshot);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.domainRequest.domains), [['sellercentral.amazon.com'], ['sell.amazon.com']]);
  assert.ok(calls.every(call => call.domainRequest.query === input.query));
  assert.ok(calls.every(call => call.domainRequest.metadata !== input.metadata));
  assert.deepEqual(output.status, 'ok');
  assert.deepEqual(output.results.map(item => item.externalId), ['central-a', 'shared']);
  assert.deepEqual(output.results.map(item => item.rank), [1, 2]);

  const duplicateDomains = await Coordinator.coordinateSearch(transport, request({ domains: ['sellercentral.amazon.com', 'SELLERCENTRAL.AMAZON.COM'] }), {});
  assert.equal(duplicateDomains.status, 'ok');
  assert.equal(calls.length, 3);

  const empty = await Coordinator.coordinateSearch({ async search() { return { status: 'empty', results: [] }; } }, request(), {});
  assert.deepEqual(empty, { status: 'empty', results: [], errorCode: null, errorMessage: null });

  const unavailable = await Coordinator.coordinateSearch({ async search() { return { status: 'unavailable', results: [], errorCode: 'PROVIDER_BUSY' }; } }, request(), {});
  assert.deepEqual([unavailable.status, unavailable.errorCode], ['unavailable', 'PROVIDER_BUSY']);

  const failed = await Coordinator.coordinateSearch({ async search() { return { status: 'error', results: [], errorCode: 'PROVIDER_ERROR' }; } }, request(), {});
  assert.deepEqual([failed.status, failed.errorCode], ['error', 'PROVIDER_ERROR']);

  const invalid = await Coordinator.coordinateSearch({ async search() { return { status: 'ok', results: null }; } }, request(), {});
  assert.deepEqual([invalid.status, invalid.errorCode], ['error', 'SEARCH_DOMAIN_INVALID_RESPONSE']);

  const thrown = await Coordinator.coordinateSearch({ async search() { throw Error('transport detail'); } }, request(), {});
  assert.deepEqual([thrown.status, thrown.errorCode], ['error', 'SEARCH_DOMAIN_TRANSPORT_ERROR']);

  console.log('knowledge search coordinator passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
