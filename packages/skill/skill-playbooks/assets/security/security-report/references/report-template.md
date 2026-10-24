# Penetration test report template

```markdown
# Security assessment — CLIENT / TARGET

**Date:** YYYY-MM-DD
**Assessor:** NAME
**Version:** 1.0
**Classification:** Confidential

## 1. Executive summary

Describe the engagement objective in one sentence. Then the outcome in plain language: how far access went, which business data was reachable, and what should be fixed first. Two paragraphs maximum.

**Overall risk:** Critical / High / Medium / Low

## 2. Scope

| Item | Value |
| --- | --- |
| In-scope targets | DOMAIN, IP ranges, applications |
| Out of scope | Explicitly excluded assets |
| Time window | Start – end, timezone |
| Credentials provided | Role names only |
| Testing types | External, internal, web, API, cloud, social |

## 3. Approach

Phases performed and tools used, one line each. State which phases were skipped and why.

## 4. Findings summary

| ID | Finding | Severity | CVSS | Asset | Status |
| --- | --- | --- | --- | --- | --- |
| F-0001 | ... | High | 8.1 | web01 | Open |

## 5. Findings

### F-0001 — Title

| Field | Value |
| --- | --- |
| Severity | High |
| CVSS 3.1 | `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H` (8.8) |
| Asset | https://TARGET/endpoint |
| Preconditions | Any authenticated user |

**Description.** What the weakness is, in the application's own vocabulary.

**Reproduction.**

```http
POST /api/v1/endpoint HTTP/1.1
Host: TARGET
Authorization: Bearer ROLE_A

{"id": 2}
```

Observed: response contains ROLE_B's data. Repeated 3/3 times at 12:41 UTC.

**Impact.** ROLE_A can read every account's records; 240k rows reachable by enumeration.

**Evidence.** `E-0001` (request/response hash), `E-0002` (enumeration output).

**Remediation.** Enforce object-level authorization server-side on the resource owner, add a regression test that asserts 403 for cross-tenant reads, and log authorization failures.

**References.** CWE-639, OWASP API1:2023.

## 6. Hardening observations

Items with no demonstrated exploit path, kept short: configuration drift, missing headers with a real consequence, outdated components without a reachable CVE.

## 7. Appendix

- Evidence index with hashes and storage location.
- Tool versions.
- Timeline of significant actions.
- Handling notes for captured credentials and data.
```
