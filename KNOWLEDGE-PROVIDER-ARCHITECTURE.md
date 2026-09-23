# Knowledge Provider Architecture — Phase 7.2

Phase 7.2 adds deterministic retrieval infrastructure only: `RetrievalPlan → ProviderRequest → injected adapter → RawProviderResponse → NormalizedRetrievalItem → RetrievalBatch`. It does not call the network, connect an account, generate Evidence or answers, reconcile conflicts, retry, or alter the UI.

## Providers and sources

There are exactly ten one-to-one provider bindings: Seller Help, Seller University, Seller News, Amazon Ads, SP-API, Official Forum, Government, Internal Knowledge, Community, and User Account map to the same source IDs with `-provider` appended. Channels are `public-web`, `internal-index`, and `account-data`. A provider is an execution descriptor; a source owns provenance and authority. Authority and source type always come from `KnowledgeSourceRegistry`, never from an adapter.

Each descriptor contains `id`, `label`, `sourceIds`, `channel`, `adapterKey`, `resultKind`, `requiresAdapter`, `requiresAccountConnection`, `requiresOfficialAuthorVerification`, `supportsFreshRetrieval`, `supportsHistoricalRetrieval`, and `notes`.

## Request and adapter boundary

`ProviderRequest` contains deterministic `requestId`, `providerId`, `sourceId`, `priority`, `role`, `required`, `query`, `constraints`, and optional retrieval hints such as `jurisdictions`. Query preserves the analyzed question, scope, year, and freshness. Constraints preserve plan freshness, age, community, and authority rules. The builder follows `sourcePriority` exactly, does not read Seller Profile, re-route, or add sources.

Adapters are injected fixtures or future integrations with `retrieve(request, runtimeContext?)`; they may return synchronously or as a Promise. They cannot choose authority, mode, source priority, confidence, evidence, or an answer.

## Raw, normalized, and execution contracts

`RawProviderResponse.status` is one of `ok`, `empty`, `blocked`, `unavailable`, or `error`. Raw items can carry document/account fields including identifiers, text, URL, scope, dates, publisher/author, official-author verification, and metadata. They cannot be Evidence or answers.

`NormalizedRetrievalItem` retains `id`, request/provider/source IDs, source type, registry-derived authority, document fields, scope, dates, external ID, and metadata. Official Forum verification is retained. Normalization never turns `claim`, `supports`, `confidence`, or `answer` into fields. Exact external-ID and canonical-URL duplicates are removed; similar titles are not merged. URL canonicalization only trims and removes fragments, preserving query parameters.

`RetrievalExecutionResult` contains `request`, `status`, `rawResponse`, `normalizedItems`, `errorCode`, and `errorMessage`. `RetrievalBatch` contains `requests`, `results`, flattened `items`, and diagnostics: requested/ok/empty/blocked/unavailable/error counts plus required failures. Order is request order then adapter-item order.

## Safety and failures

Community is blocked unless the request explicitly permits `allowCommunitySupplement`. A disconnected User Account request is blocked and its adapter is not called. Government is only a regulator channel descriptor; no jurisdiction is inferred. There is no automatic fallback or retry. Required blocked, unavailable, and error sources are recorded as diagnostics, not converted to Evidence or an answer. Future Phase 7.3 can inject real adapters without changing these contracts.
