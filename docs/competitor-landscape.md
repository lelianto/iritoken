# Iritoken competitor landscape

Research snapshot: **2026-08-11**

This review compares products and research that reduce the context sent to an
LLM coding agent. Vendor percentages are recorded as vendor claims unless an
independent source is explicitly identified. They are not directly comparable
until the same tasks, models, output settings, quality gates, and token-accounting
boundary are used.

## Closest competitors

| Project | Why it overlaps | Published result | Important limitation |
| --- | --- | --- | --- |
| [Tamp](https://github.com/sliday/tamp) | Open-source HTTP proxy with multi-stage context and tool-result compression | Its [whitepaper](https://tamp.dev/whitepaper.pdf) reports 47.56% input-token reduction at its balanced level and 216/216 quality judgments | Twelve single-turn micro-scenarios do not establish full coding-session or repository-edit quality; quality is LLM-judged |
| [Tokenade](https://tokenade.net/en) | Commercial stack covering command output, MCP, repository search/maps, references/deltas, output terseness, and cache preparation | Reports 38.9% mean cost reduction on its optimizer leaderboard | Cost reduction is not the same estimand as total-token reduction; public material is vendor-controlled |
| [Klood](https://kloodproject.com/) | Hosted multi-provider proxy for tool/JSON output, logs, AST-aware code, RAG/files, and reversible compression | Reports 23,921 to 8,110 tokens (66.1%) on its displayed suite, with some individual payloads above 90% | This is primarily payload/input compression; some source cases save 0%, some quality metrics decline, and hosted processing adds a trust boundary |
| [FastContext](https://arxiv.org/abs/2606.14066) | Repository-exploration subagent returns concise file paths and line ranges instead of broad repository context | Reports coding-agent token reduction up to 60% and resolution improvement up to 5.5% | A retrieval architecture rather than a general-purpose middleware; “up to” is workload-specific |
| RTK | Hook-based shell and tool-output compaction | Commonly advertises reductions in the 60–90% range | An [independent JetBrains evaluation](https://blog.jetbrains.com/ai/2026/07/rtk-claude-code-token-savings/) measured 7.6% higher cost in one configuration and no saving in another, showing that command-output compression need not reduce session usage |

## Nearest match

**Tamp is the closest architectural comparison.** Both projects sit before the
model and attempt to remove or compact context while retaining task-relevant
information. Tamp is currently presented as a transparent proxy, whereas
Iritoken is a provider-agnostic TypeScript toolkit with deterministic stages,
fail-open mandatory-context protection, and an auditable decision ledger.

**Tokenade is the closest broad commercial competitor.** Its public feature set
extends beyond compression into MCP mediation and repository intelligence. It is
therefore the more relevant product-positioning comparison even though its
published headline metric is cost rather than provider-reported total tokens.

Ponytail and output-shortening tools are adjacent rather than direct competitors:
they primarily change the completion, while Iritoken's current core focuses on
input/context selection and mechanically safe compaction. Output policy is kept
as an explicit secondary experiment because changing it alters the request.

## Why percentages cannot be compared at face value

A claimed reduction can refer to any of the following:

- characters or estimated tokens in a selected command payload;
- provider-reported input tokens for one request;
- input plus output tokens across a complete agent session;
- discounted cost after provider prompt-cache hits;
- requests avoided by an application cache;
- a best-case workload reported as “up to.”

These are different outcomes. A fair comparison must use the same raw workload
and model configuration and must report every provider call, retry, helper-model
call, input token, output token, cache token, failure, cost, and latency. Coding
quality should be determined by applying the generated change in a fresh copy and
running compile/typecheck/tests/acceptance checks. Lexical overlap or an LLM judge
alone is not sufficient evidence of functional equivalence.

## Current evidence and positioning

Iritoken's stored DeepSeek campaigns currently support only a scoped exploratory
claim: prompt-token reductions of **5.39–12.0%**, corresponding to approximately
**4.70–9.73% total-token reduction**, with comparable fact recall on the named
synthetic tasks. This does not prove a general 50–90% result.

The defensible position today is:

> Local, auditable, evidence-first context optimization that fails open when a
> requested reduction would discard mandatory information.

This position distinguishes Iritoken from opaque hosted compressors and from
tools whose headline percentage measures only raw tool output. The trade-off is
that Iritoken must not claim industry-leading reduction until a sufficiently
powered, end-to-end comparison establishes it.

## Recommended head-to-head benchmark

The first direct comparison should be **raw control vs Iritoken vs Tamp**, with
Tokenade or Klood added only if their interfaces and data-handling terms permit a
reproducible run. Use the same DeepSeek V4 Flash calls and the same sealed coding
workloads for all arms. Report:

1. provider input, output, and total tokens across the entire session;
2. cache-hit and cache-miss tokens and dated cost separately;
3. successful compile, typecheck, tests, and hidden acceptance criteria;
4. retries, timeouts, context-loss failures, and latency;
5. task-cluster confidence intervals and the highest quality-preserving achieved
   reduction, not merely the requested target.

Until that experiment is run, competitor claims remain useful hypotheses and
design references, not proof that Iritoken should achieve the same percentage.
