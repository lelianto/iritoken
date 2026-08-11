# Security policy

## Supported versions

Security fixes are provided for the latest published iritoken release. Users should upgrade to the newest patch release before reporting an issue.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting at `https://github.com/lelianto/iritoken/security/advisories/new`. Include the affected version, reproduction steps, impact, and suggested mitigation.

You should receive an acknowledgement within 7 days and an initial assessment within 14 days. Disclosure will be coordinated after a fix is available. If private reporting is unavailable, open a public issue asking the maintainer to enable it without including vulnerability details.

## Scope and security boundary

iritoken processes local strings and files. It does not provide an HTTP server, authentication, database access, or outbound networking. Resource exhaustion, unsafe filesystem behavior, terminal injection, package integrity, and unexpectedly executed input are in scope. CSRF, SSRF, SQL injection prevention, and volumetric DDoS mitigation belong to the application or gateway exposing iritoken over a network.
