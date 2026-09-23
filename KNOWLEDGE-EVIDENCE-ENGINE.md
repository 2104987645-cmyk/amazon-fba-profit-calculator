# Evidence Engine — Phase 7.4

Phase 7.4 evaluates caller-provided ClaimRequests against normalized documents. It never extracts claims, uses AI, accesses the network, or produces an answer.

Temporal Requirement modes are `current`, `historical`, `future`, `any`. Temporal Status is `current`, `historical-match`, `future`, `expired`, `unknown`. Evidence Role is `primary`, `supporting`, `contextual`, `conflicting`, `inadmissible`: contextual is useful background but not direct proof; inadmissible cannot enter sufficiency.

ClaimVerifier is injected. Without it, support is `unknown`; neither an official URL nor source authority implies support. Community/internal sources cannot satisfy official authority; Forum requires a verified author. EU is partial for EU markets and never covers UK; GLOBAL is scope relevance rather than proof. Snippets cap confidence at medium.

Conflict Type is `none`, `support-vs-contradiction`, `authority-conflict`, `temporal-conflict`, `scope-conflict`, `version-conflict`, `unknown`. Conflicts are retained, never voted away. Bundles contain candidates, verifications, assessments, conflicts, sufficiency and diagnostics only.
