# Next release planning — architecture and localization

**Status:** planning  
**Last updated:** 2026-08-24  
**Scope:** engineering quality and i18n foundation (not a public form library)

## Goals

1. Clearer architecture — isolate schema/form UI from world/entity domain so the form stack is easier to reason about and test.
2. Localization foundation — stop hardcoding user-visible English; introduce `t(key)` and an English dictionary; keep result codes language-independent.
3. No user regression — menus, forms, notices, and note output behave as today unless a change is intentional and documented.
4. No second product — do not publish an npm or community "form library"; generic modal forms already exist (for example Modal Forms). Our edge stays worldbuilding.

## Non-goals

- Public API for other plugins
- Competing with Modal Forms or Meta Bind
- Full multi-language packs in this release (English catalog and plumbing only)
- Entity-type rename/delete command
- Template-set underscore archive (optional stretch only)
- Multiselect search/scale unless already blocking

## Context (decisions)

- **Generic form library:** No. The space is covered; schema alone is not differentiating.
- **Internal formkit:** Yes. Clearer boundaries and easier tests.
- **i18n approach:** Common plugin pattern: `t()` plus English dict; locale via `getLanguage()` with fallback; optional i18n+ later; no hard dependency.
- **Tests:** Assert result codes and vault effects, never Notice text.
- **Prior release:** Work through exact template binding is already shipped. Ship `createLinkedEntity` result codes in this train if not already released.

## Epic A — Internal formkit

### Intent (Epic A)

Move domain-agnostic form pieces behind a stable internal boundary.

### Target layout (Epic A)

```text
src/formkit/
  types.ts
  parseFields.ts
  SchemaFormModal.ts
  MultiselectPickerModal.ts
```

- **Allowed in formkit:** `obsidian`, formkit-local types, pure utils with no world domain.
- **Forbidden in formkit:** `WorldInfo`, `PluginState`, template sets, dashboard, sync, active-world helpers.

### Steps (Epic A)

1. **Inventory** — List EntityFormModal, MultiselectPicker, field parse, EntityContent dependencies.
2. **Folder and re-exports** — Create `src/formkit/`; move modal with a thin re-export from the old path.
3. **Decouple types** — Modal depends on field defs and callbacks only, not full template set.
4. **Call-site migration** — CreateEntity, EditEntity, EditWorldMeta import formkit.
5. **Tests** — Modal/parser tests without full PluginState where possible.
6. **Cleanup** — Remove dead re-exports; short dev-only `src/formkit/README.md` describing the boundary.

### Definition of done (Epic A)

- [ ] `src/formkit/` exists; SchemaFormModal (or equivalent) lives there
- [ ] formkit does not import WorldInfo or PluginState
- [ ] Create entity, edit entity, edit world meta still work (manual smoke)
- [ ] Unit tests green; at least one form-related test does not need a full world scan
- [ ] User-visible behavior unchanged

## Epic B — Localization foundation

### Intent (Epic B)

Prepare for translation without blocking the release on complete locales.

### Target layout (Epic B)

```text
src/i18n/
  index.ts
  en.ts
```

### Steps (Epic B)

1. **Skeleton** — `t(key, vars?)`; locale from `getLanguage()` with fallback to English.
2. **Notice migration** — One command family at a time; stable keys (for example `notice.world-not-found`).
3. **Menus** — MenuBuilder titles.
4. **Settings chrome** — Static labels and headings.
5. **Policy** — Result codes are never translated; tests never assert translated strings.

### Definition of done (Epic B)

- [ ] `t()` and `en.ts` exist and are used by a non-trivial set of Notices (minimum bar: all command Notices, or all menus — pick one and hit it)
- [ ] Missing key or locale falls back to English
- [ ] No test depends on English Notice text
- [ ] README notes that UI strings are centralized

## Epic C — Release hygiene

- [ ] BRAT install section in README
- [ ] ROADMAP updated (formkit + i18n; no public library)
- [ ] Unreleased result-code commits shipped

## Order of work

1. Epic C (quick)
2. Epic A steps 1–4 (formkit boundary)
3. Epic B steps 1–2 (i18n skeleton + Notices)
4. Epic A steps 5–6 and Epic B steps 3–4 as capacity allows

Finish Epic A’s DoD before a deep i18n string migration so renames and string moves do not thrash each other.

## Risks

- **Big-bang imports** — Use re-export shims; migrate call sites in small PRs.
- **Over-extracting EntityContent** — Leave entity markdown building in commands/shared until it is clearly pure.
- **i18n key churn** — Prefer stable code-like keys; skip translating dynamic template issue strings in v1.
- **Scope creep** — Stick to non-goals.

## Manual test checklist

- [ ] New world / switch world / conflict UI
- [ ] Create entity, edit entity, hot-create link
- [ ] Edit world meta
- [ ] Sync folders / files
- [ ] Settings: template issues, missing template set note
- [ ] App language English: strings still correct
- [ ] If a partial locale exists: missing keys fall back to English

## Success metrics

- Form stack has a named boundary; tests are leaner than before.
- No new hardcoded Notices in migrated modules; path is clear for more locales later.
- No intentional UX change except clearer structure under the hood.

## Out of scope (carry forward)

- Template-set underscore archive
- Rename / delete entity type command
- Multiselect picker search
- Optional i18n+ adapter
- Community directory submission (process, not code)
