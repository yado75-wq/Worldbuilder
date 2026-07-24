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
- Vitest test suite for pure logic (no Obsidian mocking)
- **QuickAdd + Commander fully replaced** — WorldBuilder is now a
  single-plugin install, no external dependencies
- **Time model** — the `timeframe` field type: anchor/offset/unit
  timepoints, intervals, half-open ranges, the "Same as another entity"
  form, resolution + cycle detection with root-cause reporting through
  `## Needs attention` and inline in an entity's own generated content, and
  a manual `Refresh all timeframes` command for stale resolved values. See
  `TIME_DESIGN.md`, which now documents shipped behavior (not the original
  pre-implementation plan — several details changed during build; see that
  document's §12 for what and why). This unblocks Relations below.

## In design (not yet implemented)

- **Relations** — two-tier storage (frontmatter list vs. per-instance
  files), relation-type schema, cardinality reporting. Drafted; see
  `RELATIONS_DESIGN.md`. No longer blocked — Time (its one dependency, for
  relation-instance duration via the `timeframe` field) is now shipped.

## Deferred, not rejected

- **Delete Entity Type command** — real gap (removing a type from
  `_Fields.md`/`folder-rules.md` plus handling existing files of that type),
  just not prioritized yet.
- **Reckoning-to-reckoning unit conversion** (Time §9) — build only if a
  world genuinely needs two mutually-convertible calendars.
- **Localized unit pluralization** (Time §10) — cosmetic, additive when
  needed.
- **Comparability-by-matching-units enforcement** (Time §4) — designed but
  never built as a runtime check; low priority since the shipped widget
  can't currently produce divergent units on its own (see Time §12).
- **Automatic propagation of stale `Resolved:` values** (Time §10, §11) —
  the manual `Refresh all timeframes` command covers this today; automating
  it safely would need real dependency-graph-ordering work, not attempted
  without a concrete need.
- **Decimal offsets in the Time widget** (Time §10) — the storage grammar
  already permits them; the widget restricts to whole numbers since there's
  no calendar to make a fraction meaningful.

## Explicitly rejected

Listed so these don't get silently re-proposed:

- **Auto-refreshing the dashboard on entity delete** — the existing manual
  Sync command already covers this; not worth the added complexity.
- **Deep Obsidian Bases integration** for entity listings — researched;
  creating a Base is already near-zero-friction via Obsidian's own UI,
  nothing for WorldBuilder to add here.
- **A general physical-measurement-units system** — researched; no mature
  worldbuilding tool treats this as structured data, universally handled as
  prose. Not pursued.
- **Building our own fictional-calendar engine** — Calendarium already
  solves this well; an optional export bridge may come later, never our own
  parallel implementation.
- **Hard validation / blocking saves for Time** — malformed ranges and
  unresolvable anchors stay report-only (`## Needs attention`), matching
  the plugin's existing report-don't-block approach everywhere else.
