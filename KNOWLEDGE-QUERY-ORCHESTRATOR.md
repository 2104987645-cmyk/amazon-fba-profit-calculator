# Knowledge Query Orchestrator

## Purpose and scope

Phase 7.6 provides the `KnowledgeQueryOrchestrator` end-to-end coordination layer. It runs:

`Question -> Question Analyzer -> Source Router -> Retrieval Request Builder -> Retrieval Executor -> Evidence Engine (per explicit claim) -> Answer Engine -> StructuredAnswer validation -> KnowledgeQueryResult`

The orchestrator coordinates existing phases. It does not reimplement retrieval, evidence verification, source authority, scope, temporal, citation, conflict, or answer reasoning.

## Public exports

`knowledge-query-contracts.js` exports:

```js
{
  QUERY_STATUSES,
  QUERY_STAGES,
  validateKnowledgeQueryRequest,
  validateKnowledgeQueryDependencies,
  validateKnowledgeQueryError,
  validateKnowledgeQueryResult,
  resolveQueryStatus
}
```

`knowledge-query-orchestrator.js` exports:

```js
{ executeKnowledgeQuery }
```

`executeKnowledgeQuery(request, dependencies)` is asynchronous.

## KnowledgeQueryRequest

The request contract is:

```js
{
  queryId,          // required non-empty string
  question,         // required non-empty string
  claims,           // required non-empty array of valid Phase 7.4 ClaimRequest values
  sellerProfile,    // optional object
  accountContext,   // optional { connected: boolean, metadata: object }
  options,          // optional object
  metadata          // required object
}
```

Claims are explicit input only. Phase 7.6 does not derive claims from the question, retrieval items, documents, or AI/LLM output, and it does not append claims. Each claim is validated with the real Phase 7.4 `validateClaimRequest` validator.

Request-owned fields are distinct from dependencies: the orchestrator does not consume `adapters`, `claimVerifier`, `components`, `now`, or `locale` from `KnowledgeQueryRequest`. The current request validator validates its stated required and optional fields; it does not implement a general unknown-key rejection rule.

## KnowledgeQueryDependencies

The dependency contract is:

```js
{
  now,
  locale,
  adapters,
  claimVerifier,
  components // optional
}
```

`adapters` is a required object whose values provide `retrieve()`. `claimVerifier` is required and is either a function or an object. `locale`, when supplied, is a string. The current validator preserves the existing permissive handling of `now`.

Dependencies reject request-owned `question`, `claims`, `sellerProfile`, and `accountContext` fields. Validation does not mutate dependencies, adapters, components, component objects, or component methods.

`components` is optional and may be `{}`. Its only allowed keys are:

```js
{
  questionAnalyzer,  // { analyze(question, context, options) }
  sourceRouter,      // { resolve(analysis) }
  requestBuilder,    // { buildRequests(analysis, retrievalPlan) }
  retrievalExecutor, // { execute(requests, runtimeContext) }
  evidenceEngine,    // { buildBundle(claim, items, context) }
  answerEngine       // { answer(analysis, claims, evidenceBundles, context) }
}
```

Every supplied component is an object and must provide its listed method. Unknown component keys are invalid. This is an orchestration test/runtime seam, not a plugin system or business-input channel. Missing components fall back to the existing Phase 7.1–7.5 production modules.

## Pipeline and shared retrieval

For each query, the analyzer, router, request builder, and retrieval executor run once. The resulting `retrieval.items` batch is passed by reference to one `evidenceEngine.buildBundle()` call per explicit request claim. Evidence bundle order follows request claim order. The answer engine receives only `analysis`, `request.claims`, `EvidenceBundle[]`, and answer context; raw retrieval items are not an Answer Engine argument.

Synchronous and asynchronous component returns are supported because every stage result is awaited.

Relevant propagated context is preserved without changing the old module APIs:

- `sellerProfile` is passed to Analyzer context.
- `now` and `locale` are passed to applicable analyzer/runtime/answer contexts.
- `accountContext.connected` becomes Retrieval Executor `accountConnected`.
- `claimVerifier` is passed to Evidence Engine context.

## KnowledgeQueryResult and errors

Every outcome returns this result envelope:

```js
{
  queryId,
  analysis,
  retrievalPlan,
  requests,
  retrieval: { results, items, diagnostics },
  evidenceBundles,
  answer,
  status,
  errors,
  diagnostics,
  metadata
}
```

Unexecuted output uses `null`, `[]`, or the empty retrieval structure `{ results: [], items: [], diagnostics: {} }`.

Orchestrator-created errors use the existing `KnowledgeQueryError` shape:

```js
{
  stage,
  code,
  message,
  recoverable: false,
  sourceId: null,
  providerId: null,
  claimId,
  metadata
}
```

`QUERY_STAGES` is exactly:

```js
['received', 'analysis', 'routing', 'retrieval-planning', 'retrieval', 'evidence', 'answer']
```

Invalid input remains a `received` / `INVALID_INPUT` error. Stage errors are:

```text
analysis             QUERY_ANALYSIS_FAILED
routing              QUERY_ROUTING_FAILED
retrieval-planning   QUERY_RETRIEVAL_PLANNING_FAILED
retrieval            QUERY_RETRIEVAL_FAILED
evidence             QUERY_EVIDENCE_FAILED
answer throw         QUERY_ANSWER_FAILED
answer invalid       QUERY_ANSWER_VALIDATION_FAILED
```

Each successful stage is appended to `completedStages` only after it completes. The exact happy-path value is:

```js
['analysis', 'routing', 'retrieval-planning', 'retrieval', 'evidence', 'answer']
```

An evidence failure clears the externally returned bundle list, preventing a partial bundle list from appearing complete. A claim-specific evidence exception retains that claim ID in the error. An answer failure preserves completed bundles but returns `answer: null`.

## Statuses and retrieval availability

`QUERY_STATUSES` is exactly:

```js
['success', 'partial', 'insufficient', 'blocked', 'error']
```

`resolveQueryStatus()` owns this precedence:

```text
error > blocked > insufficient > partial > success
```

The orchestrator supplies status flags based on stage outcome, real retrieval result status/required request data, retrieval-plan account/public continuation fields, and final validated answer semantics.

- `error`: invalid input, a pipeline exception, or StructuredAnswer validation failure.
- `blocked`: no legal continuation path, including all provider paths unavailable, a failed required non-account path, or an unavailable account-only path.
- `insufficient`: normal completed pipeline whose validated answer has `answerType: 'insufficient'`.
- `partial`: a valid answer completed while provider or account availability was degraded.
- `success`: a valid answer completed with no top-level degradation.

An empty retrieval is neither an error nor blocked by itself: evidence and answer still run. Optional provider failure plus a valid answer is `partial`. A Retrieval Executor exception is `error`, not blocked.

For a mixed public/account query, unavailable account data with `publicKnowledgeCanFullyAnswer: true` permits the public answer to continue and is `partial` unless the final answer is insufficient. For an account-only query with unavailable account data, the result is `blocked`. The orchestrator does not turn public evidence into an account finding.

Answer semantics are distinct from orchestration status: a qualified answer is `success` without degradation; a conflicted answer is also `success` without degradation. Conflict remains a Phase 7.4/7.5 answer semantic. Degraded qualified is `partial`; degraded insufficient remains `insufficient` by precedence.

## StructuredAnswer validation

After `answerEngine.answer()` returns, the orchestrator calls the real Phase 7.5 full-context validator:

```js
validateStructuredAnswer(answer, {
  evidenceBundles,
  claims
})
```

Only a passing validator result completes the answer stage. Validation failure returns `status: 'error'`, `stage: 'answer'`, `code: 'QUERY_ANSWER_VALIDATION_FAILED'`, and `answer: null`; the invalid answer is not returned, repaired, regenerated, or bypassed. Existing evidence bundles are preserved. The validator and orchestrator do not mutate answer, bundles, or claims.

## Diagnostics

Every result has:

```js
{
  completedStages,
  claimCount,
  evidenceBundleCount,
  retrievalDiagnostics
}
```

`claimCount` is the number of request claims. `evidenceBundleCount` is zero until evidence completes, otherwise the completed bundle count. `retrievalDiagnostics` is the retrieval diagnostics value, not a new evidence interpretation. Diagnostics do not calculate truth, authority, support, a conflict winner, citation validity, or confidence.

## Immutability and no-bypass boundaries

The orchestrator does not mutate request, claims, seller profile, account context, dependencies, components, retrieval plan, evidence bundles, or an Answer Engine return value. It does not create citations, alter EvidenceBundle sufficiency, resolve conflicts, generate factual prose, hardcode network access, or invoke AI/LLM services.

## Phase ownership

- Phase 7.1: question analysis and source routing.
- Phase 7.2: provider requests and retrieval execution.
- Phase 7.3: live adapters and retrieval/security boundaries.
- Phase 7.4: evidence candidate processing and verification.
- Phase 7.5: grounded answer composition and validation.
- Phase 7.6: orchestration only.
