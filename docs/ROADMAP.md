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
- **Clone world / name sync** — clone inactive; display name follows folder
  when synced
- **Command result codes** — structured ok/code returns for tests; Notices
  Notices via `t()`
  - **Internal formkit** — form UI/types under `src/formkit/`; domain stays in commands/state
- **i18n foundation** — `locales/en.json`, `t()` / `loadI18n`, notices, menus, settings, formkit `form.*`; tests use result codes, not Notice text

## In design (not yet implemented)

Nothing currently.

## Deferred, not rejected

- **Rename / delete entity type** — rename or remove `*_Fields.md` + folder-rules + retag existing notes; manual rename today does not migrate tags (no crash).
- **Template-set `_` archive** — same ignore rule as worlds for
  `_system/templates/_foo` (not implemented yet).
- **Reckoning-to-reckoning unit conversion** (Time §9) — only if a world needs
  two mutually convertible calendars.
- **Localized unit pluralization** (Time §10) — cosmetic.
- **Comparability-by-matching-units enforcement** (Time §4) — low priority;
  widget does not currently produce divergent units alone (Time §12).
- **Automatic propagation of stale `Resolved:` values** (Time §10–11) —
  manual `Refresh all timeframes` covers this; full graph ordering later if needed.
- **Decimal offsets in the Time widget** (Time §10) — storage allows; widget
  stays whole numbers for now.
- **Multiselect picker search / large lists** — scale UX if vaults get huge
  equipment sets.

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

## Next Version

Nothing locked. Candidates from **Deferred** (pick one):

- Rename / delete entity type (migrate rules + tags)
- Template-set `_` archive
- Multiselect picker search / large lists

Or release hygiene only: tag current tree, update wiki pointer, community process when ready.
