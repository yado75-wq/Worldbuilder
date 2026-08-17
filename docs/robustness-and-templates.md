# Robustness & template files

Last updated: 2026-08-17

## Goal

The plugin may assume a **happy path** and user common sense, but it must **not crash** on empty, missing, or half-broken template data.

The **file-tree menu is a promise**. Only offer an action when the plugin can follow through. Do **not** show **New X** / **Edit X** (or world sync/meta tools) and then stop with a Notice as the normal path.

Empty template file ≡ missing for practical purposes. **A title (`display: title`) field must exist** before create/edit entity is offered or can succeed.

---

## Official / ecosystem stance (short)

- Defensive null-checks; don’t assume vault structure.
- User-fixable problems → Notice, don’t throw through the app.
- Prefer safe APIs (`normalizePath`, etc.); avoid noisy console logging.

We are **not** building a heavyweight template schema system—only **no crash**, **honest menus**, and **clear refusal** when something is invoked anyway.

---

## Template validation (current)

**No second subsystem.** Loading and issues live in scan + pure parsers:

| Piece | Role |
| --- | --- |
| `WorldState.ts` → `buildTemplateSetInfo` | Scan, `isValid`, required files, title checks |
| `ParseTemplateLines.ts` | `parseFieldsWithIssues` / `parseFolderRulesWithIssues` (line-aware issues) |
| Settings | ✗ / ✓, collapsible issues table (file, line, kind, message) |

Commands and menus **consume** scan results and shared helpers (`isEntityTypeUsable`, `hasActiveWorldConflict`), not ad hoc re-parses with different rules.

Full JSON Schema for templates remains **out of scope**.

---

## How templates are loaded

| Input | Result |
| --- | --- |
| Missing required file | Error → `isValid: false` |
| Empty `*_Fields.md` | Empty field set → no-title error → often `isValid: false` |
| Empty `folder-rules.md` | `folderRules = []` (may still be valid) |
| Empty / missing `world-template.md` | `worldTemplate = []`; **sync folders does not delete** empty folders based on a missing template |
| Bad / duplicate field lines | Warnings; first key wins |
| Unknown type tokens | Warnings in settings |

**Entity type not in folder-rules** → treated as `*` (creatable under normal folder contexts), not forced into a fixed folder.

**World folders starting with `_`** → ignored entirely (archived / user domain). Template-set `_` archive is **not** implemented yet.

---

## Non-entity template files

| File | Empty / broken | Absorb? |
| --- | --- | --- |
| `folder-rules.md` | Fewer structure-driven menus | Yes |
| `world-template.md` | Sync folders no-op for creates; no wipe | Yes |
| `WorldMeta_Fields.md` | No usable Edit world meta | Notice if invoked |
| Required file missing | Set invalid | Settings ✗ |

### Damage budget

- Absorb emptiness by **offering fewer actions**.
- Do not absorb by **offering actions that cannot work**.
- Never auto-rewrite user templates to “fix” emptiness.
- Never uncaught exceptions; no writes with empty/undefined paths.

---

## Menu strategy (implemented)

### Type usable

Shared rule (`EntityTypeUsable`): field set non-empty **and** at least one `display: title` field.

- **New / Edit** only when the type is usable for that world’s template set.
- Wildcards filtered the same way.
- Empty or missing `*_Fields.md` ⇒ type not offered.

### Active-world conflict

Shared helper: `src/context/ActiveWorld.ts`.

| Active count | Meaning |
| --- | --- |
| Exactly 1 | Normal |
| 0 (worlds exist) or >1 | **Conflict** |

#### While conflicted

- File tree **omits** create/edit entity, edit meta, refresh dashboard, sync folders/files, refresh timeframes.
- **Switch to this world** remains (repair); disabled only when that world is already the **unique** active.
- **New world** remains (recovery).
- Settings: **Set as active** remains; **Actions** multiselect disabled.
- Blocked **commands** still call `requireUniqueActiveWorld` (Notice + no write) if invoked another way.

**Notice (commands):**  
`Active world conflict: open Worldbuilder settings and use Set as active (exactly one world must be active).`

---

## Command behaviour (current)

| Command | Guards |
| --- | --- |
| create / edit entity | Usable type, fields, title, name; **unique active world** |
| edit world meta | Usable WorldMeta; **unique active world** |
| refresh dashboard / sync folders / sync files / refresh timeframes / clone world | **Unique active world** |
| switch / set active | Allowed in conflict (repair) |
| new world | Template set `isValid`; allowed with zero active |

Modal: no open when fields unusable; submit requires title when a title field exists.

---

## Policy summary

| Situation | Menu | Command if invoked | Settings |
| --- | --- | --- | --- |
| Empty / missing type fields | No New/Edit | Notice, no write | Issues / ✗ |
| No title field | No New/Edit | Notice, no write | Issues |
| Active conflict | Omit world work; keep Switch | Notice, no write | Set as active; Actions disabled |
| Empty folder-rules | Less structure | No crash | Optional warning later |
| Empty world-template | — | Sync folders no-op | Optional warning later |
| User clears name in form | — | No write | — |

---

## Planned work status

### P0 — Honest menus — **done**

- [x] Type usable rule shared
- [x] New/Edit only when usable
- [x] Wildcards filtered
- [x] Active-world conflict on menu paths + Switch repair semantics

### P1 — Command safety net — **done**

- [x] Empty fields / no title / empty name Notices
- [x] World meta unusable → Notice
- [x] Unique active world on blocked commands  
- [ ] Optional: refuse whole-set `!isValid` on create/edit (still **per-type** only unless we change product)

### P2 — Tests — **largely done**

- [x] Usable-type / create-edit guards / conflict helper tests as landed in suite
- [x] CI green for those paths

### P3 — Optional polish — **open**

- [ ] Informational menu stub if omission confuses users (default remains omit)
- [ ] Settings **warnings** for empty `folder-rules.md` / `world-template.md`
- [ ] Template-set folder `_` prefix archive (worlds already archived that way)

### Other backlog (not P0–P3)

- Multiselect picker search / scale
- Hot-create for multi-type link chains
- Wiki mirror of field-type docs
- Extract MultiselectPicker as separate package later

---

## What we will not do (for now)

- Auto-repair empty template files
- Block the entire plugin when one set is invalid
- Full YAML/JSON schema for `_Fields.md`
- Show New/Edit and rely on Notice as the normal discovery path
- Separate heavyweight validator parallel to scan

---

## Related code map

| Area | Path |
| --- | --- |
| Scan / validity | `src/state/WorldState.ts` |
| Field / folder-rule parse | `src/state/ParseTemplateLines.ts` |
| Type usable | `src/context/EntityTypeUsable.ts` |
| Active world conflict | `src/context/ActiveWorld.ts` |
| Menus | `src/context/MenuBuilder.ts` |
| Context resolution | `src/context/ContextResolver.ts` |
| Create / edit entity | `src/commands/CreateEntityCommand.ts`, `EditEntityCommand.ts` |
| New world / switch | `NewWorldCommand.ts`, `SwitchWorldCommand.ts` |
| Form UI | `src/ui/EntityFormModal.ts` |
| Settings | `src/settings.ts` |

---

## Session note

Robustness track: honest menus → command nets → active-world gates. Prefer pure helpers + unit tests; short manual checklists for menu/settings paint.

Testing process: see `docs/testing-strategy.md`.
