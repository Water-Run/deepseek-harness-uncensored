---
description: "Web application and API testing: surface mapping, authentication and session flaws, access control, injection classes, SSRF, upload, deserialization, JWT/OAuth, race conditions, and business logic, with false-positive checks for each class."
whenToUse: "Testing an HTTP application, API, SPA, or GraphQL endpoint for exploitable weaknesses."
---

# Web attack playbook

## Order of work

1. **Map the surface.** Crawl, read JavaScript bundles for endpoints and parameters, inspect API docs, compare authenticated and anonymous responses.
2. **Understand auth.** How identity is carried (cookie, JWT, bearer, mTLS), how roles are decided server-side, how sessions expire.
3. **Test authorization first.** Broken access control is the highest-yield class and needs no injection payload. Fetch object A as user A, then as user B.
4. **Then injection classes**, in order of observed technology: SQL/NoSQL, template, command, LDAP, XPath, expression language.
5. **Then server-side fetch and file handling:** SSRF, upload, path traversal, deserialization.
6. **Then logic and concurrency:** price/quantity manipulation, coupon reuse, workflow bypass, race windows.

## Access control

- **IDOR/BOLA:** replace numeric/UUID identifiers across users, tenants, and methods (`GET`, `PUT`, `DELETE`). Test both direct object references and nested ones (`/users/1/orders/9`).
- **Function-level:** call admin endpoints with a low-privilege token; try method override (`X-HTTP-Method-Override`), alternate routes (`/api/v1/admin` vs `/admin`), and version downgrade (`/v2/` → `/v1/`).
- **Mass assignment:** add fields the UI never sends (`role`, `isAdmin`, `tenantId`, `verified`, `balance`) and read back the object.
- **JWT:** `alg: none`, HMAC-with-public-key confusion, weak secret offline crack, `kid` path/SQL injection, `jku`/`x5u` pointing at your host, claim confusion between services.
- **OAuth/OIDC:** redirect_uri prefix bypass, missing `state`, token leakage in referrer, implicit-flow token theft, account linking without verification.

## Injection

- **SQLi:** `'`, `''`, `\`, `' OR 1=1-- -`, numeric context, ORDER BY column count, UNION alignment, boolean/time blind, stacked queries. Confirm with a controlled differential — same request, one predicate true, one false, differing responses. Then `sqlmap -r req.txt --batch --level 3 --risk 2` for depth. OAST (`--dns-domain`) when no in-band channel.
- **NoSQL:** `{"$ne":null}`, `{"$gt":""}`, `{"$regex":"^a"}`, array/operator confusion, `$where` JavaScript.
- **SSTI:** `${7*7}`, `{{7*7}}`, `<%= 7*7 %>`, `#{7*7}`, `*{7*7}`. Escalate per engine only after the arithmetic proof.
- **Command injection:** `;id`, `|id`, `$(id)`, backticks, newline, argument injection in binaries that accept `-` flags. Blind: `sleep 5` timing, then DNS callback.
- **XXE:** external entity in XML/SOAP/SVG/DOCX, blind OAST, error-based parameter entities, `expect://` where the wrapper exists.
- **Deserialization:** Java (`ysoserial`/`ysoserial.net` gadget chains), PHP (`phpggc`), .NET (`ysoserial.net`), Python pickle, Ruby Marshal. Confirm the sink before building a chain.

## SSRF

Test every URL-ish parameter: `url`, `uri`, `path`, `dest`, `redirect`, `proxy`, `image`, `webhook`, `feed`, `callback`.

- `http://127.0.0.1:PORT`, `http://localhost`, `http://[::1]`, decimal/octal/hex IP encodings, DNS names resolving to loopback.
- Cloud metadata: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`, Azure `http://169.254.169.254/metadata/instance?api-version=2021-02-01` with `Metadata: true`, GCP `http://metadata.google.internal/computeMetadata/v1/` with `Metadata-Flavor: Google`.
- Protocols: `file://`, `gopher://` (Redis/MySQL/FastCGI), `dict://`, `ftp://`.
- Blind: unique subdomain on your OAST domain, then timing and error differences to distinguish DNS-only from full request.

## Upload and file handling

- Extension matrix: `shell.php`, `shell.php.jpg`, `shell.pHp5`, `shell.php%00.jpg`, `.htaccess`, `.user.ini`, `web.config`.
- Content-Type and magic-byte bypass; polyglot image/PHP; SVG with script; ZIP/DOCX with traversal names (`../../`).
- Where the file lands and how it is served: same origin, object storage, CDN, or an internal path. Execution requires an interpreter mapping — verify it, don't assume it.
- Path traversal in download/preview endpoints: `..%2f`, `..%5c`, double encoding, absolute paths.

## Race conditions

- Single-packet attack (HTTP/2 last-byte sync) for coupon reuse, balance withdrawal, vote limits, invite acceptance.
- Send N identical requests and compare final state; a state machine that tolerates N-1 duplicates is exploitable.
- Test both server-side limits and database constraints; a UI-only guard is not a control.

## Verification rules

- Replay the exact request three times. If the result is not stable, the finding is a timing artifact, not a vulnerability.
- Distinguish "error message changed" from "data returned". Only the latter proves access.
- Capture the request/response pair as evidence, hash the body, and register it in the case file.
- Payload tables: see `references/payloads.md` in this skill directory.
