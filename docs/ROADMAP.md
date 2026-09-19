# WorldBuilder — Roadmap

This is the source of truth for project status. It's synced automatically
to the GitHub Wiki — edit it here, not there.

---

## Shipped

- Core world / template-set / entity system (forms, folder sync, dashboards)
- Preserved-section support for entities (marker-based, mirrors dashboard
  behavior) — see `PreservedSection.ts`
- `## Needs attention` dashboard section: entities missing mandatory fields
  — see `EntityCompleteness.ts`
- Ribbon icon: active-world status on hover, quick jump to settings
- Vitest test suite (commands + pure logic; Obsidian API faked in tests)
- **QuickAdd + Commander fully replaced** — WorldBuilder is a single-plugin
  install, no external dependencies
- **Time model** — `timeframe` field type (anchor/offset/unit, intervals,
  inherit, resolution + cycle reporting, `Refresh all timeframes`). See
  `TIME_DESIGN.md` (shipped behavior; §12 for design deltas).
- **Link chains** — `link:Type1>Type2>…` candidates grouped by type; single-type
  hot-create where applicable
- **Multiselect** — `multiselect:text:…` and `multiselect:link:…` with picker
  modal; YAML list + body bullets (not the old “multi link” Relations idea)
- **Active-world conflict** — zero or multiple actives: settings repair via
  Set as active; world work gated in menus/commands
- **Honest menus** — New/Edit only when the type is usable (fields + title)
- **Template validation** — scan issues (file/line/kind) in settings;
  empty folder-rules / world-template as info, not silent wipe
- **Exact template-set binding** — world `template_set` name only; no silent
  fallback to another set; settings note when missing; `ensureDefaultTemplates`
  still recreates defaults on load
- **World archive** — world folders starting with `_` ignored entirely
- **Template-set archive** — template set folders under `_system/templates/`
  whose names start with `_` are ignored; `defaultTemplateSet` falls back to a
  live set (prefer `defaults` if present) with Notice; worlds stay orphaned
  until reassigned
- **Clone world / name sync** — clone inactive; display name follows folder
  when synced
- **Command result codes** — structured ok/code returns for tests; Notices via `t()`
- **Internal formkit** — form UI/types under `src/formkit/`; domain stays in commands/state
- **i18n foundation** — `locales/en.json`, `t()` / `loadI18n`, notices, menus, settings,
  formkit `form.*`, main chrome; tests use result codes, not Notice text
- **World kit export / import** — zip pack of world + template set; import inactive;
  folder name clashes use localized `(imported)` / `(imported N)`; template set
  clash offers use existing or import under a new name; Settings group `+` for
  new world / import and new template set
- **Leading `_` identity rules** — block creating worlds, entities, template sets
  with names starting with `_`
- **Template-set audit** — bindings, link-target gaps, fields without rules;
  issues table under the set row
- **World audit** — binding, rule orphans, instance↔template drift (extra /
  missing mandatory frontmatter keys); issues table under the world row
- **Rename entity type** — Settings → Manage: rewrite link tokens + folder-rules,
  rename `Type_Fields.md`, retag notes in bound worlds; WorldMeta reserved
- **Delete entity type** — Settings → Manage: remove `Type_Fields.md` (stops
  New/Edit/hot-create); note tags kept so existing notes stay linkable
  (catalog / rulebook mode); with zero instances, folder-rules line and inbound
  link tokens are cleaned by default; with instances, rules/tokens kept by
  default; WorldMeta cannot be deleted; Generic on `defaults` may be restored
  on ensure-defaults
- **Hot-create gated on usable fields** — `createLinkedEntity` and the form
  “Create new …” row require a usable field set for the target type (same rule
  as honest menus); no minimal stub file when fields are missing
- **Rename template set** — Settings → Manage: rename the set folder; live→live
  offers a world checklist (default all) for who gets `template_set` updated;
  unchecked worlds keep the old name (orphaned until Assign); rename to `_…`
  archives like a hand-rename (no world updates); clone-first hint for frozen schemas

## In design (not yet implemented)

_(none currently)_

## Deferred, not rejected

- **Reckoning-to-reckoning unit conversion** (Time §9) — only if a world needs
  two mutually convertible calendars.
- **Localized unit pluralization** (Time §10) — cosmetic.
- **Comparability-by-matching-units enforcement** (Time §4) — low priority;
  widget does not currently produce divergent units alone (Time §12).
- **Decimal offsets in the Time widget** (Time §10) — storage allows; widget
  stays whole numbers for now.
- **Multiselect picker search / large lists** — scale UX if vaults get huge
  equipment sets.
- **Suggest fields from entities** — draft `*_Fields.md` from notes of a type
  after fields were lost/overwritten (best-effort); world audit drift is the
  pre-step inventory.
- **Kit polish** — file-explorer Export world; richer template-set clash UI.
- **Catalog-aware audit wording** — treat “tagged notes, no fields file” as
  intentional catalog info rather than a hard error (optional polish).

## Considered and dropped

Ideas that got a real look and didn't hold up — listed so they don't get
silently re-proposed without anyone remembering why:

- **Relations system** — dedicated storage/schema for relationships
  (`RELATIONS_DESIGN.md`). Plain frontmatter `[[links]]` covers the simple
  case; timed relationship history wants events/prose, not `timeframe`.
- **Speculative multi-value `link` as Relations** — dropped with Relations;
  **multiselect** was added later for real list-of-values / list-of-links needs.
- **Auto-refresh dashboard on entity delete** — manual refresh/sync is enough.
- **Deep Obsidian Bases integration** for listings — Bases UI is enough.
- **General physical-measurement-units system** — prose is the norm.
- **Own fictional-calendar engine** — Calendarium exists; optional bridge later.
- **Hard validation blocking saves for Time** — report-only in Needs attention.
- **Public form library / npm formkit** — space covered (e.g. Modal Forms);
  keep formkit internal.

## Next version

Primary candidate: **Suggest fields from entities** (using world-audit drift
inventory).

Supporting: kit polish, non-English locale packs when reviewers exist,
catalog-aware audit wording.

Policy reference: `docs/next-release-consistency-sharing.md` (language vs notes,
safe template edits, sharing).
