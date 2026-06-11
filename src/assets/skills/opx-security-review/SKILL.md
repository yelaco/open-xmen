---
name: opx-security-review
description: Security review of a change — find exploitable vulnerabilities with concrete evidence and severity. Use for high-risk work (auth, sessions, billing, data access, file/network/secret handling, public APIs) or when explicitly asked for a security pass.
---

This skill is a focused, high-signal security review. Report real, exploitable issues with evidence — not a generic checklist dump.

## Scope

Review the change set (`git diff` against the merge base) plus the trust boundaries it touches. Prioritize code that handles untrusted input, authentication/authorization, secrets, money, or user data.

## Threats to hunt

- **Injection** — SQL/NoSQL, command, path traversal, template/SSTI, XSS; any place untrusted input reaches an interpreter, query, filesystem, or markup without proper escaping/parameterization.
- **AuthN/AuthZ** — missing or incorrect authorization checks, IDOR (object access without ownership checks), privilege escalation, auth bypass, session fixation, tokens that don't expire or aren't validated.
- **Secrets & crypto** — hardcoded credentials, secrets in logs/errors/config committed to the repo, weak/again-rolled crypto, predictable randomness for security-sensitive values.
- **Data exposure** — over-broad responses leaking fields, missing access scoping, sensitive data in logs.
- **Unsafe defaults & deserialization** — permissive CORS, disabled TLS verification, untrusted deserialization, SSRF via user-controlled URLs, open redirects.
- **Dependencies** — newly added packages with known-risky patterns or unpinned/untrusted sources.

## Discipline

- Every finding needs **evidence** (file:line + how it's reached) and a **severity** (critical / high / medium / low) tied to real exploitability — not theoretical.
- Give a concrete remediation for each. Distinguish "exploitable now" from "hardening".
- Do not weaken or bypass an existing control to "make it work". Flag, don't fix-around.

## Output

Findings grouped by severity with evidence + remediation; if clean, state what trust boundaries you checked. When run inside a Cerebro task, fold the verdict into your result block (Emma Frost's `VERDICT: OKAY | REJECT`), rejecting when an unmitigated critical/high issue exists.
