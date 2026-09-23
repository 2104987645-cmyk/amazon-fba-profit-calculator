# Knowledge Retrieval Contract — Phase 7.1

`Question Analyzer → Source Router → Retrieval Engine → Evidence Engine → Answer Engine → Knowledge Library`.
Phase 7.1 implements only the analyzer, registry, router, and data contracts. It makes no network calls, retrievals, answer generation, UI changes, AI/LLM calls, or account connections.

## Sources and authority

The registry contains exactly: `amazon-seller-help`, `amazon-seller-university`, `amazon-seller-news`, `amazon-ads`, `amazon-sp-api`, `amazon-official-forum`, `government`, `internal-knowledge`, `community`, and `user-account`.

Authority classes: `regulator`, `amazon-official`, `user-account`, `internal`, `community`. Community is supplement-only and cannot establish official rules. Official forum content requires a verified official author. Internal knowledge cannot be the sole proof of current official policy. Government is primary for law, tax, EPR, and regulation. User account data proves account facts only, not platform-wide policy.

## Analysis contract

`analyze(question, context?)` returns question, normalizedQuestion, topic, intent, scope, requestedYear, freshness, official/fresh/calculation/account hints, and entities. Intents: definition, how-to, eligibility, policy, fee, calculation, troubleshooting, metric, compliance, account-specific, unknown. Topics: account-store, listing, fees-profit, fba-logistics, inventory, advertising, promotions, brand-reviews, orders-returns, account-health, compliance-regulatory, cross-border-tax, data-reports, api-developer, unknown.

Marketplace codes are seller marketplaces. `EU` and `GLOBAL` are regions, never explicit seller marketplaces. Explicit question scope wins over caller-provided seller marketplace context. Freshness: evergreen, current, historical, account-live.

## Retrieval plans

Modes: knowledge-only, official-live, official-plus-knowledge, official-plus-calculation, account-required, community-supplement. A plan includes prioritized sources, authority requirements, freshness/max-age policy, calculation/account flags, related tools, `conflictPolicy: do-not-silently-reconcile`, and `insufficientEvidencePolicy: return-insufficient`.

Definitions prefer internal knowledge, Seller University, then Seller Help. Rules, fees, eligibility and policy require current official sources. Compliance/tax routes government first. Advertising metrics require Amazon Ads plus calculation. Account-specific questions require user-account plus official context and cannot be fully answered by public knowledge.

## Evidence, knowledge, and answer contracts

KnowledgeItem: id, title, slug, knowledgeType, topic, marketplaces, regions, summary, contentSections, keywords, relatedTools, relatedKnowledgeIds, relatedNewsIds, sourceRefs, verifiedAt, freshnessClass, status. Types: concept, guide, sop, reference. Status: draft, verified, needs-review, stale, deprecated.

EvidenceItem: id, sourceId, sourceType, authorityClass, title, url, claim, supports, marketplaces, regions, publishedAt, effectiveAt, retrievedAt, freshness, confidence. Evidence must directly support its claim; a URL alone is not evidence.

AnswerEnvelope: question, answerType, shortAnswer, officialFacts, derivedConclusions, operationalAdvice, accountSpecificFindings, sources, marketplaces, regions, verifiedAt, effectiveFrom, effectiveTo, confidence, limitations. Official facts, derived conclusions, advice, and account findings remain separate. Confidence is high, medium, low, or insufficient.
