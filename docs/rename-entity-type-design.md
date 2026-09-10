# Design: Rename entity type + template-set audit

**Status:** design (decisions locked 2026-09-09)  
**Last updated:** 2026-09-09  
**Related:** `docs/ROADMAP.md`, `docs/next-release-consistency-sharing.md`

## Goals

1. **Rename entity type** inside a template set without leaving the set inconsistent (fields file, folder-rules, link tokens, note tags).
2. **Audit** a template set (and bound worlds) so damage from **external** Obsidian edits (delete/rename fields file by hand) is visible and actionable.
3. No silent rebinding of worlds; no destructive “fix everything” without confirm.
4. Testable pure helpers first (TDD); commands return result codes; user text via `t()`.

## Non-goals (v1)

- **Plugin “Delete entity type” command** — vault delete of `*_Fields.md` is enough; audit reports fallout.
- Auto-rename of **target folders** (`Characters` → `Postavy`) — optional later; v1 keeps folder paths in rules unchanged.
- Rewriting prose or `[[wikilink]]` display text inside note bodies.
- Cross-template-set rename (same stem in two sets as one operation).
- Shipping non-English locale packs for new strings beyond `en.json`.
- Making WorldMeta fields mandatory; locking `WorldMeta_Fields.md` on disk.

---

## Decisions locked

### Generic vs WorldMeta

| Topic | Decision |
| --- | --- |
| **Generic required file** | **No.** Remove `Generic_Fields.md` from `REQUIRED_FILES`. Same class as `Character_Fields.md`. |
| **Generic in defaults** | Still **copied** on new/reset template set so users have a starter type; absence later ≠ invalid set. |
| **Generic in folder-rules** | Not required; unlisted / `*` placement already covers “create anywhere.” |
| **Generic rename** | **Allowed** (normal entity type). |
| **Edit by tag for `generic`** | **Remove the skip** in `ContextResolver.findEntityFile`. Edit still renames the file when title ≠ basename and rewrites the auto shell even if the only field is name. |
| **WorldMeta** | **Infrastructure**, not an entity type for rename/menus. |
| **WorldMeta required file** | **Yes** — keep `WorldMeta_Fields.md` in `REQUIRED_FILES`. |
| **WorldMeta rename** | **Hard block** (`reserved-type`). |
| **WorldMeta placement / New** | Unchanged — `NON_PLACEMENT_TYPES`; Edit world meta command only. |
| **Hand-edit WorldMeta_Fields.md** | Possible but advanced; product path is Edit world meta. Not filesystem-locked. |

### Time fields on world index

| Field | Role | Undefined behavior |
| --- | --- | --- |
| `time_unit` | Optional WorldMeta property | `getWorldTimeUnit` → **`'years'`**; never auto-written; dashboard may *display* default |
| `time_zero` | Optional / documentary today | **Not read** by `TimeframeResolver` / lookup; bare numbers use implicit zero |

No requirement to make these mandatory. Timeframe failures stay data (`unresolved-entity`, etc.), not throws.

### Delete type

No plugin Delete command. Explorer delete + audit is enough.

---

## Confirmed product rules (from current code)

| Fact | Source |
| --- | --- |
| Type id = stem of `Type_Fields.md` | `WorldState` / `fieldSets` keys |
| Note tag = **`entityType.toLowerCase()`** | `EntityContentBuilder` |
| Entity file = tag match vs `fieldSets` (case-insensitive), not folder | `ContextResolver` |
| WorldMeta non-placement | `EntityTypeUsable` `NON_PLACEMENT_TYPES` |
| Folder rules: `EntityType \| TargetFolder` | parse / scan |
| Link types in field type tokens | formkit / `ParseTemplateLines` |
| `time_unit` default `'years'` | `TimeframeLookupBuilder.getWorldTimeUnit` |
| Implicit time zero (no `time_zero` lookup) | `TimeframeResolver` |

**Target after this epic:** `REQUIRED_FILES = ['WorldMeta_Fields.md']` only.

---

## Problem statement

| User action | Without plugin support |
| --- | --- |
| Rename `Character_Fields.md` → `Postava_Fields.md` only | Rules, `link:Character`, note tags still old; menus use new id only for new work |
| Delete `Character_Fields.md` in explorer | Rules/link refs and tagged notes remain; honest menus hide New/Edit |
| Want localized type **identity** (menu “New postava”) | Needs coordinated migrate, not label-only edit |
| Delete/rename Generic in explorer | Fine once not required; audit reports fallout like any type |

---

## Architecture principles

- **Pure core, thin commands** — rewrite and impact counting are pure; vault I/O in commands only.
- **One template set per operation** — field files + rules in that folder; notes only under worlds with `template_set === that set`.
- **Dry-run / impact summary before write** — rename shows counts; audit is read-only.
- **Leading `_`** — new type name rejected via `hasLeadingUnderscore`.
- **Result codes** for tests; no asserts on Notice text.

---

## Prerequisite slice — Generic / required files

Small change, can land before or with audit:

1. `WorldState` / `SetupCommand`: `REQUIRED_FILES` = `WorldMeta_Fields.md` only.  
2. Defaults still install `Generic_Fields.md`.  
3. `ContextResolver`: remove `entityType.toLowerCase() === 'generic' continue` so Edit is offered when the type is usable.  
4. Tests: set without Generic remains valid if WorldMeta + other rules ok; generic-tagged file gets entity-file context when `Generic_Fields.md` exists and is usable.

---

## Feature A — Audit (read-only)

### Intent

Surface inconsistency after external delete/rename or partial hand edits.

### Checks (v1)

| Kind | Severity | Detection |
| --- | --- | --- |
| `rule-without-fields` | error | Rule entity type with no `Type_Fields.md` (align with existing scan) |
| `link-target-missing` | error | `link:` / `multiselect:link:` chain member with no fields file |
| `orphan-entity-notes` | warning | Bound worlds: note tags a type not in `fieldSets` (exclude `world`; do not treat WorldMeta as entity orphan) |
| `fields-without-rule` | info | Type in `fieldSets` with no folder-rules row → `*` placement |
| `missing-worldmeta` | error | Via required-file scan (existing) |

### Outputs

- Issues list with severity, kind, file/line when known.  
- Settings issues UI and/or template-set **Audit** action.  
- **No vault writes.**

### Definition of done (Audit)

- [ ] Pure link-target collection tests  
- [ ] Orphan note tests (fake vault)  
- [ ] External delete of a type → visible finding after refresh  
- [ ] Manual: no crash, no writes  

---

## Feature B — Rename entity type

### Preconditions

- Live template set (not `_` archived).  
- `Old_Fields.md` exists; `New_Fields.md` does not.  
- `New` non-empty, no leading `_`.  
- **`Old` is not WorldMeta** (case-insensitive) → `reserved-type`.  
- **Generic allowed.**

### Steps (best-effort order)

1. Dry-run impact (rules, field tokens, notes).  
2. User confirm; cancel → no writes.  
3. Rewrite link/multiselect type tokens in all `*_Fields.md` in the set.  
4. Rewrite `folder-rules.md` entity column; **folder column unchanged**.  
5. Vault rename `Old_Fields.md` → `New_Fields.md`.  
6. Retag notes in worlds bound to this set: tag `old.toLowerCase()` → `new.toLowerCase()`.  
7. `refreshState`.

### Token / tag rules

- Replace type **segments** in link-like field types only, not arbitrary key/label substrings.  
- Tags: equality on lowercase type tag; preserve other tags; do not rename note paths.

### Result codes (sketch)

```ts
type RenameEntityTypeResult =
  | { ok: true; oldType: string; newType: string; notesRetagged: number }
  | { ok: false; code:
      | 'set-not-found'
      | 'old-not-found'
      | 'new-exists'
      | 'reserved-type'      // WorldMeta
      | 'leading-underscore'
      | 'cancelled'
      | 'invalid-name'
    };
```

### UX

- Settings → template set → rename entity type (dropdown of types **excluding WorldMeta**).  
- Confirm with impact counts; Notices via `t()`.

### Definition of done (Rename)

- [ ] Pure rewrite helpers unit-tested  
- [ ] Command tests: happy path, new exists, WorldMeta blocked, Generic allowed, cancel  
- [ ] Manual: Character → Postava across two worlds on the same set  
- [ ] Generic → other name does not mark set invalid for missing Generic  

---

## Testing strategy

| Layer | What |
| --- | --- |
| Unit | Rules rewrite, field link tokens, retag frontmatter, link-target collect |
| Command | Fake vault rename + reserved + Generic |
| Regression | Create/Edit tags; ContextResolver Edit on generic when usable |
| Catalog | `setCatalogForTests(en)` where `t()` runs |

## Implementation order

1. Prerequisite: REQUIRED_FILES + remove generic edit skip + tests.  
2. Pure helpers + unit tests (audit + rewrite).  
3. Audit wiring.  
4. Rename command + settings entry.  
5. README / ROADMAP: plugin rename vs hand-rename; Generic optional; WorldMeta reserved.

## Remaining open (minor)

1. **Audit UI:** settings-only vs command palette too — default **settings** under template set.  
2. **New stem casing:** allow any non-empty stem except leading `_`; file `stem_Fields.md`.  
3. **Partial failure** mid-rename — document manual recovery; no multi-file transaction.

## Files likely involved (paste current versions before coding)

- `src/state/WorldState.ts`, `ParseTemplateLines.ts`  
- `src/context/ContextResolver.ts`, `EntityTypeUsable.ts`  
- `src/commands/SetupCommand.ts` (defaults copy list)  
- `src/commands/shared/EntityContentBuilder.ts`  
- `src/settings.ts`, `locales/en.json`  
- `tests/state/WorldState.test.ts`, fakes  

New (suggested):

- `src/util/entityTypeRewrite.ts`  
- audit helper module  
- `src/commands/RenameEntityTypeCommand.ts`  
- matching tests  
