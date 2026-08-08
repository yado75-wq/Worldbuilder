# Testing strategy

Last updated: 2026-08-08

## Goal

- **Automate** everything that can be decided or executed without a real Obsidian window.
- **Manual testing** stays useful but minimal: short, written checklists—not open-ended exploration.
- There is no community QA pipeline to rely on. The author runs automation in CI and a small manual list per feature.
- Prefer **TDD-style** work: plan → tests (and manual guide draft) → implementation → green suite → short manual pass.
- Pure vibecoding (code first, hope later) is not the default.

---

## Layers

| Layer | Role | Runs where |
| --- | --- | --- |
| Automated unit / command tests | Guards, pure helpers, vault fakes, Notices, “no file written” | `npm test` / GitHub Actions |
| Manual test guide | Real menu, settings UI, focus, layout, “item missing vs disabled” | Author in Obsidian, checklist only |
| Exploratory | Optional, rare | Not required for Done |

---

## What we automate

- Command entry guards (missing world, empty fields, no title, empty name, duplicate path).
- Pure predicates (entity type usable?, active-world conflict?).
- File outcomes via in-memory vault fake (create/modify/rename paths, frontmatter snippets).
- Notice messages when they encode product rules.
- Template scan issues / `isValid` when tested through pure or scan helpers.
- Regression for bugs we already hit (e.g. root path `//name` on clone).

## What stays manual

- File-tree **context menu** appearance (unless a future harness makes it cheap).
- Settings tab layout and button enable/disable paint.
- Modal focus, keyboard, visual density.
- End-to-end “click through Obsidian” smoke after a release.

Manual guides must be **written before or with** the feature plan, not invented after coding.

---

## Feature package (required shape)

For each feature or P-item:

1. **Plan / DoD** — behaviour and checklist of done.
2. **Automated test cases** — given / expect table (or equivalent list).
3. **Manual test guide** — short ordered steps, setup, pass/fail.
4. **Implementation** — only enough to satisfy plan + tests.
5. **Done** — automated green in CI **and** manual checklist completed by the author.

If (2) or (3) is missing, the slice is incomplete.

---

## TDD-style flow

1. Agree behaviour and DoD.
2. Draft **manual guide** (only non-automatable steps).
3. Add **failing automated tests** (or pure helper tests) for the rule.
4. Implement until tests pass; avoid extra behaviour.
5. Finalize manual guide; run it once in Obsidian.
6. Commit when suite is green and manual checklist is ticked.

Prefer testing **decisions** (filters, guards) over full UI trees.

---

## Manual guide quality bar

- Runnable in about **10 minutes** or less per feature.
- Concrete vault setup (e.g. empty `Character_Fields.md`, two active worlds).
- Explicit expect: menu item **absent**, Notice text, file **not** created, etc.
- No step that only says “play with the plugin.”

---

## Definition of done (testing process)

A feature is not done when “it works on my machine” alone.

- [ ] Automated tests added or updated for the new rules.
- [ ] `npm test` / CI green.
- [ ] Manual test guide checked in under `docs/` (or feature wiki) if the feature has any non-automatable surface.
- [ ] Manual checklist run once by the author when UI is involved.
- [ ] Planning doc DoD items for that P# ticked.

---

## Relation to robustness work

See `docs/robustness-and-templates.md` (or vault copy).

| P# | Automate | Manual guide focus |
| --- | --- | --- |
| P0 Honest menus | Type usable predicate; conflict helper; filter lists | Empty fields ⇒ no New/Edit; valid type still offered; conflict blocks gated actions |
| P1 Command safety | Create/edit refusal cases | Optional smoke: command still safe if invoked |
| P2 Tests | Entire row is automation DoD | — |
| P3 Polish | Only if logic is testable | Informational menu / settings warnings if shipped |

---

## Anti-patterns

- Shipping menu or command behaviour with only a verbal “I’ll click around later.”
- Large manual scripts that duplicate what unit tests already cover.
- Skipping tests because “it’s just UI”—extract the decision and test that.
- Adding features without updating DoD or this strategy when process changes.

---

## Session handoff

Any new session implementing product behaviour should:

1. Read this file and the relevant planning/DoD doc.
2. Start from automated cases + manual guide draft.
3. Present full files as **copy-pasteable** content for the author to save locally.
4. Not treat green CI as a substitute for the short manual list when Obsidian UI is in scope.
