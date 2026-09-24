# Knowledge Answer Engine

Phase 7.5 is an expression layer: `Question -> Phase 7.4 EvidenceBundle -> Answer Planner -> Grounding -> Composer -> Citations / Limitations -> StructuredAnswer`. EvidenceBundle is the factual boundary. Phase 7.5 does not perform retrieval, network access, AI/LLM calls, truth verification, authority re-evaluation, sufficiency upgrades, or silent conflict resolution.

## Claims and grounding

Phase 7.4 bundles do not contain `bundle.claim`. The engine builds `claimsById` from its explicit `claims` input and resolves `bundle.claimId -> claimsById -> real Claim`. Missing displayable `claim.text` produces `missing-claim-text`; it never uses a claim ID as prose.

Grounding follows `statement -> groundingRef.assessmentId -> assessment -> assessment.candidateId -> candidate -> candidate.retrievalItemId -> provenance -> Citation`. `groundingRef.candidateId` must equal `assessment.candidateId`; `candidateId` and `retrievalItemId` are distinct identifiers.

## Evidence roles and citations

- admissible primary/supporting: `factual-support`
- contextual: `context`
- conflicting: `conflict`
- inadmissible: no factual citation

Source authority is not claim support. Citation provenance is copied from the real candidate; absent values remain `null` and URLs, providers, and dates are never fabricated.

```js
{ citationId, sourceId, providerId, externalId, title, url, publisher,
  author, publishedAt, effectiveAt, retrievedAt, retrievalItemId,
  candidateIds, assessmentIds, claimIds, usageRole, metadata }
```

## Enums

```js
ANSWER_TYPES = ['direct','qualified','insufficient','conflicted','account-data-required']
STATEMENT_TYPES = ['official-fact','derived-conclusion','operational-advice','account-finding','conflict-note','limitation']
LIMITATION_TYPES = ['insufficient-evidence','conflicting-evidence','partial-scope','scope-mismatch','stale-evidence','historical-evidence','future-evidence','expired-evidence','unknown-time-validity','snippet-only','missing-authority','missing-official-evidence','missing-regulator-evidence','missing-account-data','missing-current-verification','missing-claim-text','other']
```

## Contracts

```js
// AnswerPlan
{ planId, question, answerType, primaryClaimIds, supportingClaimIds,
  conflictedClaimIds, insufficientClaimIds, sections,
  includeLimitations, includeSources, includeOperationalAdvice,
  includeAccountFindings, metadata:{scope} }

// StructuredAnswer
{ answerType, shortAnswer, officialFacts, derivedConclusions,
  operationalAdvice, accountSpecificFindings, conflictNotes, limitations,
  citations, confidence, marketplaces, regions, verifiedAt, diagnostics }

// Standard limitation, created by createLimitation()
{ statementId, statementType:'limitation', limitationId, type, claimIds,
  text, message, groundingRefs, citationIds, relatedAssessmentIds, metadata }
```

`validateAnswerPlan` checks enum validity, question, metadata, unique string ID arrays, primary classification conflicts, and required booleans. `validateStructuredAnswer(answer)` performs structural validation, factual citation/grounding presence, claim-ID-as-prose rejection, and floating-citation rejection. With `{ evidenceBundles, claims }`, it additionally validates assessment/candidate/retrieval linkage, candidate/assessment/claim citation provenance, admissible primary/supporting factual grounding, insufficient and partial behavior, conflict representation, and final citation linkage.

## Sufficiency, limitations, and conflict diagnostics

Sufficient evidence can produce grounded direct facts. Partially-supported evidence produces `qualified` output with qualification; insufficient evidence produces no unsupported factual answer. Account-required insufficient claims produce `account-data-required` and `missing-account-data`.

Phase 7.5 consumes Phase 7.4 temporal, authority, and scope outcomes: stale, historical, future, expired, unknown, current-verification, official/regulator/generic/account authority, mismatch, and partial map to their corresponding limitation types.

Conflicts remain represented. `diagnostics.incompleteConflictCitationIds` compares real `bundle.conflicts[].assessmentIds` with the final retained `StructuredAnswer.citations[].assessmentIds`. It does not use `groundingRefs.length`, does not require `usageRole === 'conflict'`, and retains only real Phase 7.4 `conflictId` values.

`shortAnswer` is a deterministic status summary. It does not add ungrounded numbers, dates, fees, percentages, eligibility, marketplace/account/regulator facts, URLs, or internal versions. The conflicted template is: `The available evidence is conflicting and unresolved.`

## Immutability and compatibility

Phase 7.5 does not mutate EvidenceBundle, candidates, verifications, assessments, conflicts, sufficiency, diagnostics, or claims input. It may create Maps and output objects. Tests cover real Phase 7.4-compatible bundles with `bundle.claim` absent, claim lookup by ID, candidate provenance, and distinct candidate/retrieval IDs.
