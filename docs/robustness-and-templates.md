# Robustness & template files

Last updated: 2026-08-08

## Goal

The plugin may assume a **happy path** and user common sense, but it must **not crash** on empty, missing, or half-broken template data.

More importantly for UX: the **file-tree menu is a promise**. Only offer an action when the plugin can follow through (open a form that can save a sensible note). Do **not** show **New X** / **Edit X** and then stop with a Notice—that teases the user and then disappoints them.

Empty template file ≡ missing for practical purposes. **A title (`display: title`) field must exist** before create/edit entity is offered or can succeed.

---

## Official / ecosystem stance (short)

- Defensive null-checks; don’t assume vault structure.
- User-fixable problems → Notice, don’t throw through the app.
- Obsidian plugin guidelines: avoid noisy console logging; prefer safe APIs (`normalizePath`, etc.).

We are **not** building a heavyweight template schema system—only **no crash**, **honest menus**, and **clear refusal** when something is invoked anyway.

---

## Do we need a separate template validator?

**No second subsystem.** Validation already lives in scan: `buildTemplateSetInfo` in `WorldState.ts` (`isValid` + `issues`).

| Approach | Role |
| --- | --- |
| Scan (current) | Source of truth for settings ✗ and issue text |
| Optional extract of pure “is this type usable?” | Shared by **menu** and **commands**; easier to test |
| Full schema / JSON Schema for templates | Out of scope for now |

Commands and menus should **consume** scan results (and per-type field usability), not re-parse files ad hoc with different rules.

---

## How templates are loaded today

**Scan:** `src/state/WorldState.ts` → `buildTemplateSetInfo`

| Input | Result |
| --- | --- |
| Missing required file | Error issue → `isValid: false` |
| Empty `*_Fields.md` (file exists) | `fieldSets[Type] = []` → “no title field” error → `isValid: false` |
| Empty `folder-rules.md` | `folderRules = []` (may still be valid if no other errors) |
| Empty `world-template.md` | `worldTemplate = []` |
| Bad line in `_Fields.md` | Skipped by parser; if no title left → invalid |

**Settings:** invalid sets show ✗ and issue text. Default template cannot be an invalid set (disabled button).

---

## Non-entity template files

| File | Empty / broken | Absorb? |
| --- | --- | --- |
| `folder-rules.md` | No rules → no entity-folder menu from rules | Yes: offer **less** structure, don’t crash |
| `world-template.md` | Sync folders creates nothing from list | Yes: no-op / “no changes” |
| `WorldMeta_Fields.md` | Edit meta should not pretend meta is editable | No fake **Edit world meta** if unusable; Notice if invoked |
| Required file missing | Set invalid | Surface in settings; don’t pretend the set is fine |

### Damage budget

- **Absorb** structural emptiness by **offering fewer actions**.
- **Do not absorb** by **offering actions that cannot work**.
- **Never** auto-rewrite the user’s template files to “fix” emptiness.
- **Never** uncaught exceptions; no writes with empty/undefined paths.

---

## Menu strategy (primary UX)

### Problem today

Menus are driven by **folder rules and tags**, not by “this type has usable fields.”

- Entity folder → **New {type}** from the rule even if `_Fields.md` is empty.
- Wildcards → same.
- Entity file → **Edit {type}** from tags even if fields are empty.

Commands already Notice and return when fields are empty. That is a **safety net**, not acceptable primary UX: user was hyped, then given nothing.

### Agreed strategy

1. **Discovery (menu)** — only list create/edit when the type is **usable**:
   - field set non-empty, and
   - at least one field with `display: title`
   Empty `_Fields.md` ⇒ type does **not** exist for interaction (same as missing file).

2. **Safety (command)** — keep Notice + return if invoked another way (future command palette, race after template edit). Backup only.

3. **Explanation (settings)** — invalid set / missing title / missing files stay visible under template sets so the user knows **why** the menu is thinner.

4. Optional later: a single disabled or informational menu line (“Template incomplete — see settings”) only if we find users are confused by *absence* of items. Prefer omission first.

### Active-world conflict

Unrelated but same philosophy: don’t run world-scoped actions when active-world state is conflicted. Gate **consistently** on all create/edit/meta/dashboard/sync paths (today some branches still skip the gate).

---

## Command behaviour (current code)

### `createEntity`

Already safe for empty field sets (Notice, no modal). Does **not** check whole-set `isValid`. Linked create with no linked fields uses minimal content (does not crash).

### `editEntity`

Same empty-fields / title guards. No whole-set `isValid` check.

### `newWorld`

Checks `templateSet.isValid` and refuses — model for “don’t start work on a broken set” where appropriate.

### Menu (`MenuBuilder`)

- Conflict gated on many world actions, **not** all entity/index paths.
- **No** usability filter on New/Edit entity.

### Modal

Create/edit never open the modal when fields are empty. Submit requires title when a title field exists.

---

## Policy summary

| Situation | Menu | Command if still invoked | Settings |
| --- | --- | --- | --- |
| Empty / missing `Type_Fields.md` | No New/Edit Type | Notice, no write | Issue if scan marks invalid |
| Fields without title | No New/Edit Type | Notice, no write | Issue (no title field) |
| Empty `folder-rules.md` | No rule-based entity folders | Sync/create don’t crash | Optional warning later |
| Empty `world-template.md` | — | Sync folders no-op | — |
| `!isValid` set | No New/Edit for unusable types; don’t pretend set is healthy | Prefer refuse when action needs the set | ✗ + issues |
| User clears name in form | — | Name required; no write | — |

---

## Planned work (ordered)

### P0 — Honest menus (stop hyping)

1. Define **type usable** (non-empty fields + title field) as shared product rule.
2. File-tree menu: only **New** / **Edit** when type is usable.
3. Filter wildcard “New …” the same way.
4. Align **conflict** gates on every create/edit/meta/dashboard/sync entry point in the menu.

- [ ] Shared product rule exists: a type is **usable** only if its field set is non-empty **and** has a `display: title` field.
- [ ] File-tree **New {type}** (entity folder + wildcards) appears only when that type is usable for the world’s template set.
- [ ] File-tree **Edit {type}** appears only when that type is usable.
- [ ] Empty or missing `*_Fields.md` ⇒ type not offered (same as absent).
- [ ] Active-world **conflict** gate runs on every menu path that create/edit/meta/dashboard/sync/timeframes uses (no remaining unguarded branches).
- [ ] Manual check: with empty Character fields, Characters folder has no “New character”; settings still explain the broken set.
- [ ] No new crashes; existing happy-path behaviour for valid types unchanged.

### P1 — Command safety net + consistency

1. Keep empty-fields / no-title Notices on create/edit.
2. Optionally refuse `!isValid` on create/edit (like `newWorld`) when we want set-level consistency—not a substitute for per-type menu filtering.
3. World meta: same honesty if WorldMeta fields are empty.

- [ ] Create/edit still Notice and do not write when fields empty, no title field, or empty name (safety net if invoked outside the menu).
- [ ] Decision recorded and implemented: either refuse `!isValid` on create/edit (like `newWorld`) or explicitly document why only per-type usability is enforced.
- [ ] Edit world meta: no useful action if WorldMeta fields are empty/unusable (Notice if invoked; no crash).
- [ ] Manual or automated check: direct command call with bad template does not create/modify entity files.

### P2 — Tests

| Case | Expect |
| --- | --- |
| Menu / filter: empty field set | Type not offered |
| Menu / filter: fields, no title | Type not offered |
| Create with empty fields (direct call) | Notice, no file |
| Create with no title field | Notice, no file |
| Create with empty name | Notice, no file |
| Edit equivalents | Notice, no modify |

- [ ] Tests (or pure helper tests) cover: empty field set ⇒ not usable; fields without title ⇒ not usable.
- [ ] Create: empty fields / no title / empty name ⇒ Notice, no file on disk.
- [ ] Edit: equivalent cases ⇒ Notice, no modify (or no successful write).
- [ ] Suite green in CI/GitHub.
- [ ] Tests do not require clicking real Obsidian UI beyond existing modal stubs.

### P3 — Optional polish

- Informational menu stub if omission confuses users.
- Warnings (not errors) for empty `folder-rules` / `world-template` in settings.

- [ ] Only if needed after P0: informational menu affordance when types are missing (“see settings”) — omission remains default.
- [ ] Only if desired: settings **warnings** (not errors) for empty `folder-rules.md` / `world-template.md`.
- [ ] No scope creep into auto-repair or full template schema.
- [ ] Doc updated if behaviour diverges from this plan.

---

## What we will not do (for now)

- Auto-repair empty template files
- Block the entire plugin when one set is invalid
- Full YAML/JSON schema for `_Fields.md`
- Show New/Edit and rely on Notice as the normal path for empty templates
- Separate heavyweight “validator product” parallel to scan

---

## Related code map

| Area | Path |
| --- | --- |
| Scan / validity | `src/state/WorldState.ts` |
| Create entity | `src/commands/CreateEntityCommand.ts` |
| Edit entity | `src/commands/EditEntityCommand.ts` |
| New world (`isValid` model) | `src/commands/NewWorldCommand.ts` |
| Menus | `src/context/MenuBuilder.ts` |
| Context resolution | `src/context/ContextResolver.ts` |
| Form UI | `src/ui/EntityFormModal.ts` |
| Settings template list | `src/settings.ts` |

---

## Session note

Happy-path create-entity tests covered successful creation. Robustness focus is **honest discovery (menu)** first, then command safety nets and tests—not more field-type matrix tests unless a crash is found.

Testing process: see `docs/testing-strategy.md`.
