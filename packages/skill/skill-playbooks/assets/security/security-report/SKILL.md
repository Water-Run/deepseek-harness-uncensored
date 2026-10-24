---
description: "Write the engagement deliverable: findings with severity and CVSS, reproducible steps, impact, remediation, an executive summary, and an evidence appendix rendered from the case file."
whenToUse: "The engagement is ready to be written up, a finding must be documented, or the user asks for a report."
---

# Security report playbook

The report is the product. It must let a defender reproduce every issue and a manager decide what to fix first.

## Structure

```markdown
# Engagement title

## Executive summary
Two short paragraphs: what was tested, what was found, the single most important risk.
No jargon, no tool names, no payloads.

## Scope and approach
Targets, time window, credentials used, phases performed, limits (what was not tested and why).

## Findings overview
| ID | Title | Severity | CVSS | Affected asset |

## Findings
### F-0001 Title
- **Severity:** Critical / High / Medium / Low / Info
- **CVSS:** 3.1 vector and score
- **Asset:** host, service, endpoint
- **Status:** confirmed / best practice / informational

**Summary.** One or two sentences a developer understands immediately.

**Reproduction.**
1. Exact request or command, in a fenced block.
2. Observed response, trimmed to the proving lines.
3. Repeatable every time.

**Impact.** What an attacker gains: data class, accounts, hosts, blast radius.

**Evidence.** Artifact IDs and hashes from the case file.

**Remediation.** The specific fix and, when relevant, the compensating control.

## Appendix
Tool versions, evidence index, timeline, credentials and data handling notes.
```

## Severity rules

| Level | Test that decides it |
| --- | --- |
| Critical | Unauthenticated RCE, full data compromise, domain/cloud admin takeover |
| High | Authenticated RCE, sensitive data mass-read, privilege escalation to admin |
| Medium | Limited data read, stored XSS on authenticated surface, SSRF with internal reach |
| Low | Reflected XSS, information disclosure, missing hardening with a real path |
| Info | Best practice with no demonstrated impact |

CVSS 3.1 base vectors for common cases:

```
AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H   9.8  unauthenticated RCE
AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H   8.8  authenticated RCE
AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N   6.5  authenticated mass read
AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N   6.1  reflected XSS
AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N   5.9  SSRF with internal metadata read
```

Do not inflate: a finding without demonstrated impact is Info or a hardening note, not High.

## Writing rules

- Reproduction before explanation. If a step is not executable as written, the finding is not finished.
- Quote observed output, not the tool's interpretation. `sqlmap identified` is not evidence; the response containing the row is.
- One issue per finding. A finding with three unrelated weaknesses cannot be triaged.
- Say what you did **not** test. Coverage gaps belong in scope, not in a footnote the reader never reaches.
- No moralizing, no legal boilerplate beyond what the user asked to include.

## Rendering from the case file

The ledger knows the targets, evidence, and findings; render a first draft, then edit for voice and precision:

```bash
node ../../shared/scripts/casefile.mjs report --slug TARGET-SLUG --out report.md
```

Edit the generated file in place: fix titles, add impact, attach evidence hashes. Keep the JSON ledger as the source of truth for IDs.

A fuller skeleton lives in `references/report-template.md`.
