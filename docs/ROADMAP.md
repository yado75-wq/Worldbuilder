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

## In design (not yet implemented)

- **Time model** — anchor/offset/unit timepoints, intervals, half-open
  ranges, Milestone/Event/Epoch conventions. Fully designed; see
  `TIME_DESIGN.md`. This unblocks Relations below.
- **Relations** — two-tier storage (frontmatter list vs. per-instance
  files), relation-type schema, cardinality reporting. Drafted, deliberately
  paused until Time is implemented; see `RELATIONS_DESIGN.md`.

## Deferred, not rejected

- **Delete Entity Type command** — real gap (removing a type from
  `_Fields.md`/`folder-rules.md` plus handling existing files of that type),
  just not prioritized yet.
- **Reckoning-to-reckoning unit conversion** (Time §8) — build only if a
  world genuinely needs two mutually-convertible calendars.
- **Localized unit pluralization** (Time §9) — cosmetic, additive when
  needed.

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
