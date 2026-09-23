# Live Retrieval Strategy — Phase 7.3

Phase 7.3 adds public-source access policy and live-capable adapters, but never calls `fetch`, axios, an HTTP client, a browser, or a search engine directly. Search and document access are injected transports. Future transports must respect authorization, login requirements, robots, service terms, and rate limits; this layer never bypasses them.

Access policies allow eight public sources only: Seller Help, Seller University, Seller News, Ads, SP-API documentation, Official Forum, Government, and Community. Amazon hosts are explicit allowlists. Community is an allowlisted supplement only. Official Forum author verification is retained. Internal Knowledge remains internal-index and User Account remains account-data.

Government results require a separately approved authority registry. The production registry is intentionally empty: no authority means blocked, never broad `.gov`/`.org` search. Query construction consumes existing ProviderRequests, sanitizes public search text, preserves scope/year/freshness, and never re-routes or trusts user-supplied domains.

URL validation requires HTTPS, exact approved hosts, safe paths, no credentials or private/local hosts, and validates final redirect URLs again. Search results and document text are untrusted external data. Snippets and documents never become claims, confidence, Evidence, instructions, or answers. Exact external-ID/URL deduplication remains; there is no fuzzy merge, fallback, retry, login bypass, HTML scraper, AI, Evidence Engine, or Answer Engine.

The adapter pipeline is ProviderRequest → query builder → injected SearchTransport → post-filtered candidates → optional injected DocumentTransport → RawProviderResponse → existing Phase 7.2 Executor/Normalizer. Failed document fetches retain safe snippets; redirect rejection is recorded in metadata. Phase 7.4 may inject a real authorized server-side transport without changing these contracts.
