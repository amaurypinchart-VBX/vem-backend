---
name: vem-delivery
description: How to hand work back to Amaury Pinchart (VEM owner, non-technical, French) — commit / push to the right branch, verify the push and the Railway deploy, keep CLAUDE.md up to date, and write the final message. Use at the end of every VEM task and whenever he asks to change, fix or ship something.
---

# Delivering a VEM change

**Who**: Amaury Pinchart, Viewbox International. He writes in French and is not a developer. Answer in French, short, concrete: what changed for him in the app, where to click, what to test. No jargon walls, no long diffs. When he asks to change code by hand, give **full drop-in files / functions** (he pastes them in github.dev), never patches.

**Steps**
1. Verify first (skill `vem-verify`; for UI also `vem-e2e`).
2. Update `CLAUDE.md`: every feature is documented in the section of its module (dense one-paragraph style, file names, functions, his decisions with the date « (his choice 25.10.2026) »). Wrong or outdated sentences are fixed, not appended to.
3. Commit on the session branch (never directly on `main` unless he asks; `main` auto-deploys on Railway). Message style of the repo: `feat(module): …` / `fix(module): …` in French, summary of the visible effect. No model name in commits, code or PR text.
4. `git push -u origin <branch>` (retry with backoff on network errors only). Open a PR only when he asks.
5. After a merge to `main`: a push that « doesn't take effect » is usually a push that didn't land or a Railway build that didn't pick it up — check the commit on GitHub and the deployed commit hash before suspecting the code. Health check `GET /health`.
6. Decisions that are his (business rules, quantities, structural assumptions, what clients may see): ask, never invent. Rules from him are recorded with their date (CLAUDE.md, `docs/loading/PLAN.md`, `library/decisions.ts`…).

**Final message** (French): 2–5 lines — what's done, how to see it (menu / tab / button), what was tested, what remains or needs his answer, branch / PR link.
