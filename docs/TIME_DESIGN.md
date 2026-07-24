# WorldBuilder — Time Design

Status: **shipped**. This document describes the feature as implemented and
verified — it supersedes the original pre-implementation draft, several
parts of which changed during build. Where behavior ended up different from
what was originally planned, that's called out explicitly (see §12) rather
than silently rewritten over, so anyone who remembers the earlier plan isn't
left wondering what happened to it.

See also: `RELATIONS_DESIGN.md`, which depends on the `timeframe` field type
defined here (relation instances use it to express duration / ongoing
state). Time is fully implemented, so Relations is no longer blocked.

---

## 0. Design principles

These recur throughout the plugin and apply here too:

- **Report, don't block.** Malformed ranges, unresolvable anchors, and a
  mandatory `timeframe` field left entirely unset are all surfaced (`##
  Needs attention`), never a hard-validation error that stops a save.
- **Refuse to guess rather than guess wrong.** Where two dates *might* be
  comparable but we can't prove it, they're treated as not comparable.
- **Integrate, don't rebuild.** Real fictional-calendar structure (day/
  month/year, leap rules, multiple moons) is Calendarium's job, not ours.
- **One uniform data model, not special cases per use.** A `timeframe` is
  always an interval. Points, half-open ranges, and bounded ranges are the
  same underlying shape, distinguished only by content.
- **WorldBuilder generates data, not narrative prose.** Anything shown to
  the reader is either raw/factual, or composed by the *user* linking to it
  in their own words (§8) — the plugin never writes sentences on someone's
  behalf.
- **When something fails to resolve, report the root cause, not the
  symptom.** If entity A's timepoint can't resolve because it chains to
  Milestone B, which itself has no timepoint, the actionable problem is B,
  not A (§6).

---

## 1. The `timeframe` field type

A `FieldDefinition.type`, alongside `text` / `link` / `select`. Declared in
a `*_Fields.md` file as `timeframe` (optionally `timeframe:Folder` or
`timeframe:Folder>Fallback` — see §7.2 on why the folder spec is rarely
useful here).

**Widget** (`EntityFormModal.ts`, state in `TimeframeWidgetState.ts`): not a
single free-text "Start input" as originally sketched — each side (Start,
End) is a small group of dedicated controls:

- a plain **integer offset** box (`type="number" step="1"` — the storage
  grammar, §2, still technically permits decimals, but the widget only ever
  writes whole numbers; there's no calendar to make a fractional year
  meaningful, so this is a UI-level restriction, not a grammar change),
- a **single dropdown** that lists every valid anchor candidate *twice* —
  `Entity:start` and `Entity:end` — plus, when applicable, a mutually
  exclusive `∞`/`-∞` ("unbounded") entry. Picking `Entity:end` selects §2's
  `boundary` form (an *exact* reference to that entity's end, with no
  offset of its own in the data model — the offset box disables itself).
  Picking `Entity:start` behaves like a normal offset-capable anchor. If a
  candidate's own value is itself a point (start == end), only one
  unsuffixed entry is shown for it — `:start`/`:end` would always resolve
  identically, so the split is pure noise for that candidate.
- a **"point in time" checkbox** (default checked) that hides End
  entirely and mirrors Start into End on save.
- a **"Same as another entity" toggle**, above Start/End, that replaces the
  whole Start/End UI with a single anchor picker — this produces §2's bare
  `[[Entity]]` top-level form ("inherit this entity's whole interval"),
  which has no other UI path to create at all.

The world's configured unit (§4) is shown next to each offset as a fixed,
**non-editable** label — see §4 for why there's no per-timepoint unit input
at all, a deliberate change from the original plan.

**Hard rule, enforced both by the UI and defensively in
`composeTimeframeValue`:** a single point can never be unbounded, and Start
and End can never both be unbounded at once (an interval open at both ends
says nothing at all). Picking `∞`/`-∞` on one side removes it as an option
on the other, live, not just cosmetically — the underlying state is cleared
too, so a stale widget state can't sneak a `(-∞, ∞)` value through.

**Anchor picker and hot-create — narrower than originally planned.** The
mechanism (`onCreateLink` / `createLinkedEntity`) is shared with plain
`link` fields, unchanged. But hot-create only ever activates when the field
has a `linkFolder` configured, and no `timeframe` field ships with one — by
design: an anchor can be *any* entity anywhere in the world with a
`timeframe` field of its own (see §7.2), so there's no single folder to
create a new one into. In practice, hot-create is currently unreachable for
`timeframe` anchors; referencing one that doesn't exist yet is still done
by typing/creating it separately, and the resolution check (§6) reports it
gracefully as `unresolved-entity` in the meantime.

**Storage — two outputs from one generation pass:**
1. A single, always-quoted frontmatter key holding the value in the syntax
   defined in §2 (e.g. `timeframe: "(1200, 1250)"`).
2. A generated markdown **section** in the entity's body — see §8, which
   also changed from the original plan (no raw syntax shown to the reader).

**Mandatory-field completeness:** a mandatory `timeframe` field is "missing"
when its frontmatter key is entirely absent (`findMissingMandatoryFields`,
`EntityCompleteness.ts`) — a *presence* check, distinct from the
*resolution* check (§6). A present-but-unresolvable value is never flagged
as "missing."

---

## 2. Storage syntax

A `timeframe` frontmatter value, when present, is always a single quoted
string.

**Top-level forms:**
- **Absent** → unset / unfinished.
- **`"(a, b)"`** → an explicit interval. `a`/`b` are each a *timepoint*
  (below). Parens are pure delimiters — no open/closed distinction.
- **A bare `"[[Entity]]"`** → inherit that entity's own whole resolved
  interval (§1's "Same as another entity" mode is the only widget path to
  this form; it's also what a not-yet-migrated legacy value might be, and
  what `decomposeTimeframeValue` round-trips correctly on reopen).

**A timepoint** can be:
- a **bare number** — offset from the world's implicit zero (§4), unit =
  the world's `time_unit`;
- a **bare `[[Milestone]]` link** — offset `0` relative to that milestone
  (§7.1). The widget never produces this shorthand directly — picking
  `Entity:start` with offset 0 always writes the equivalent, canonical
  triplet form `(0, unit, [[Entity]])` instead. Both mean the same thing to
  the resolver; only a hand-edited or legacy value would still use the bare
  form, and reopening one normalizes it to the triplet form on save
  (meaning-preserving, not data loss);
- an **infinity token**, `∞` / `-∞`;
- a **full tuple**, `(offset, unit, [[Anchor]])` — offset mandatory
  whenever this form is used, `unit`/`Anchor` independently optional. **In
  practice, `unit` is never actually omitted by the widget** — every
  numeric offset it writes carries the world's current unit explicitly,
  even with no anchor (a deliberate choice to keep the data
  self-documenting even though nothing reads a divergent unit back yet, so
  a future unit-comparability feature wouldn't need a migration). A blank
  `unit` slot is still valid grammar and still falls back to the world
  default — only reachable today via a hand-edited value;
- a **boundary reference**, `[[Entity]]:start` or `[[Entity]]:end` — no
  offset of its own; reach directly into one boundary of another
  interval-valued entity.

**Only omitting the offset itself, or the whole timepoint, counts as
unfinished.**

---

## 3. Point vs. range vs. half-open

Determined from the stored value's shape, independent of how it was
entered:

| stored value | meaning |
|---|---|
| key absent | **unset** |
| `(a, ∞)` / `(-∞, b)` | **half-open** — deliberate, e.g. an ongoing Epoch |
| `(a, b)`, equal | **point** |
| `(a, b)`, different | **bounded range** |

The "point in time" checkbox mirrors Start into End on save, producing the
equal-values case by construction. `decomposeTimeframeValue`'s own
point-detection heuristic additionally treats *any* unbounded side as never
a point — this matters specifically because `-∞` and `∞` decompose to
byte-for-byte identical widget-state objects (neither carries a sign; the
sign is inferred purely from which side it's on), so a naive equality check
would otherwise misread a genuine `(-∞, ∞)` as a degenerate point on reopen.

*(Still deferred, not built: flagging `end` before `start` once both
resolve to real comparable numbers — see §5.)*

---

## 4. What a single timepoint means: anchor + offset + unit

`(anchor, signed offset, unit)`:

- **Anchor** — optional link to another entity. If omitted, resolves to the
  world's own implicit zero-point, paired with the world's `time_unit`.
  Zero setup: two entries that both omit an anchor are automatically
  comparable the moment the world exists.
- **Offset** — a signed **integer** in the widget (the grammar still
  permits decimals; the widget doesn't expose them — see §1).
- **Unit** — a free-form, opaque string. Never interpreted or converted,
  only compared for exact string equality *in principle* — see below for
  what's actually built.

**World-level settings (added during implementation, not in the original
plan):** two `WorldMeta` fields, edited via the existing "Edit World Meta"
command, no new UI:
- **`time_unit`** (`text`, optional) — the world's default unit, shown as a
  fixed label in the widget (§1). Not stored at all when left blank; the
  dashboard's World Meta section shows `Time Unit: years _(default)_`
  purely for display in that case — nothing is ever written to frontmatter
  for the default.
- **`time_zero`** (`text`, optional) — a human-readable label for the
  world's already-existing anonymous implicit zero (e.g.
  `[[Founding of the Empire]]`). Purely decorative: it names something that
  already works without it, doesn't need to itself have a `timeframe`
  field, and isn't involved in resolution at all — offset-from-itself is
  trivially `0` regardless of what it points at.

**Comparability rule — designed, not built as enforcement.** The original
plan called for a comparability check (same anchor chain *and* matching
unit strings). This was never implemented as a runtime check —
`TimeframeResolver.ts`'s own resolution deliberately drops the unit once a
value is resolved to a number, by design (matching units was always meant
to be "a separate concern layered on top," not something the resolver
itself enforces). In practice this ended up low-priority: since the widget
only ever writes the world's single current unit (§1, §2), divergent units
essentially can't arise except through hand-edited frontmatter, which
nothing currently checks. If a real need for mixed-unit worlds shows up,
this is the piece to build — not yet started.

**Bare-number parsing is strict**: `^-?\d+(\.\d+)?$`, no loose parsing.

### 4.1 Resolved boundary representation

A resolved timepoint is exactly one of: a real number, or `+Infinity` /
`-Infinity`. Ordinary numeric comparison works uniformly across points,
bounded ranges, and half-open ranges.

---

## 5. Anchor resolution

`resolveComparableDate`/`resolveEntityTimeframe` (`TimeframeResolver.ts`) —
recursive, with a cycle guard via a resolution stack of entity refs
currently being resolved.

**Boundary references** (`[[Entity]]:start`/`:end`) resolve to that
specific boundary. If the target turns out to be a point (start == end),
resolving `:end` (or `:start`) on it fails with a dedicated
`boundary-on-point` error — a point has no distinct end to reference.

**Entities are discovered by their own tag, across the whole world — never
by folder location.** This was a real, repeatedly-hit source of bugs during
implementation (see §12): early versions scanned only the specific folders
`folder-rules.md` maps to an entity type, silently missing anything sitting
in a folder that only matched the `*` wildcard, or any folder without a
dedicated rule at all. The final, correct behavior: which entity *types*
have a `timeframe` field is discovered structurally from
`templateSet.fieldSets`; which files are which type is discovered by
reading each file's own tag; folder location is never consulted for this.
This applies uniformly to anchor resolution, the anchor picker's
candidates, and the vault-wide lookup used by Needs Attention and the
refresh command (§11).

---

## 6. Reporting unresolvable timeframes

**Trigger:** an entity whose own timepoint is genuinely unset, a dangling
anchor link, a cycle, or a boundary reference into a point-only entity.

**Root cause, not symptom.** If A anchors to Milestone B and B has no
timepoint, the report surfaces B, not A.

**Two distinct checks feed `## Needs attention`:**
1. **Presence** (§1) — `findMissingMandatoryFields`.
2. **Resolution** — `TimeframeResolutionReport.ts`'s `findUnresolvedTimeframes`,
   built on `TimeframeResolver.ts`.

**Message wording:** `"Unresolved reference (<field label>): <reason>"` —
`<reason>` is the resolver's own kind-specific message (a cycle shows its
full chain, e.g. `A → B → A`; a dangling anchor names the missing entity;
etc.) rather than a single generic phrase for every failure kind.

**Ordering:** root causes sort before their dependents — a depth-first
post-order traversal over each failure's `error.entity` (which always names
the *ultimate* root cause the resolver found, not necessarily the
immediately-referenced entity, since `resolveComparableDate` propagates the
deepest failure directly rather than wrapping it at each hop).

**The same "Unresolved reference" reporting also appears inline in an
entity's own generated content** (§8), not just the dashboard — a real
addition beyond the original plan: an entity whose own value fails to
resolve shows the actual reason (including a full cycle chain) right in its
`Resolved:` line, computed at create/edit time (§11).

---

## 7. Milestone, Event, and Epoch — conventions, not field variants

All three use the same `timeframe` field and the same uniform interval data
model — a naming and usage convention, not something the plugin
distinguishes technically:

- **Milestone** — the pure anchor type, in practice always a point.
- **Event** — point *or* interval, depending on the event.
- **Epoch** — always an interval; interior epochs bounded on both sides,
  only the first/last half-open on their outward-facing side.

### 7.1 Epoch boundaries: anchoring to Milestones

An Epoch boundary anchored to a Milestone is `(anchor = [[Milestone]],
offset = 0)`. Interior epochs reference a real Milestone on both sides →
bounded, automatically. The first epoch's start and the last epoch's end
have no Milestone to reference → infinity token → unbounded, automatically.
No separate enforcement needed; falls directly out of the pattern.

### 7.2 Why anchors were never given a dedicated folder

The original plan assumed a `timeframe` field's anchor picker would work
like a `link` field's — scoped to one `linkFolder`. This was explicitly
reconsidered during implementation: any entity type with a `timeframe`
field of its own can be a valid anchor for any other, and there's
deliberately no separate "anchor" entity type or folder — Milestones,
Events, and Epochs are all just entity types with a `timeframe` field
(§7). Scoping the picker to one folder would have been actively wrong,
not just limiting. See §5 and §11.

---

## 8. Display: the generated section

Obsidian can only link to a heading, not a frontmatter property, so a
`timeframe` field's generated section is what makes it referenceable at
all — same as originally planned. **What the section actually shows changed
significantly from the original plan:**

The original draft suggested showing "the raw stored expression and/or the
resolved absolute value." **This was reversed** — the raw internal storage
syntax (e.g. `((0, years, [[Start Era]]), (0, years, [[End Era]]))`) is
never shown to the reader; it's implementation detail, and critically, a
`[[Link]]` sitting inside a Markdown backtick code span doesn't get parsed
by Obsidian as a link at all (it renders as literal text and never
registers a backlink) — an early version that wrapped the raw value in
backticks silently broke every reference this way.

The shipped section (`buildTimeframeSection`, `EntityContentBuilder.ts`)
shows up to two lines, built entirely from data — never composed prose:

- **`References:`** — every entity referenced anywhere in the stored value,
  de-duplicated, rendered as plain (non-code) `[[Links]]` so Obsidian
  actually parses and backlinks them. Omitted when the value has no
  anchors at all.
- **`Resolved:`** — the world unit followed by the computed value, e.g.
  `Resolved: years 1200 – 1250` (unit *before* the number, matching how the
  offset field itself is labeled; en-dash with a space on each side for a
  range). For a value with no anchors, this is shown even without a
  supplied resolution, since it's already its own absolute form — nothing
  to look up. When resolution fails, shows `<unresolved>` followed by the
  actual reason (§6) — e.g. `Resolved: <unresolved> — Cycle detected while
  resolving: A → B → A` — not a bare, unexplained placeholder.
- If the field is entirely unset: `_Not yet set._`, and the section still
  renders (a link target must exist before the value does — this is what
  makes hot-create-elsewhere-in-the-form safe, §1).

Resolution info is computed at create/edit time (`TimeframeDisplay.ts`'s
`resolveTimeframeFieldsForDisplay`) and can go stale if something it
anchors to changes later — see §11's refresh command.

---

## 9. Multiple reckonings

Unchanged from the original plan, and still fully deferred, not started. A
world may eventually have more than one named reckoning, mutually
convertible only if a human explicitly links them, needing a ratio (not
just an offset) if units differ. Build only if a world genuinely needs it.

---

## 10. Explicitly out of scope / deferred

- **Generic cross-field conditional field visibility** in `EntityFormModal`.
  Both the point/range toggle and the "Same as another entity" mode switch
  are self-contained within the field's own widget.
- **A per-field `mode` config** for Milestone/Event/Epoch constraints —
  data is always a uniform interval.
- **Mathematical open/closed interval precision.**
- **A real calendar engine** — Calendarium's job.
- **Adopting Calendarium's frontmatter as our own foundation.**
- **Reckoning-to-reckoning unit conversion** (§9's ratio piece).
- **Localized unit pluralization.** `unit` stays a single opaque display
  string, shown as typed.
- **Hard validation / blocking saves.** Stays report-only, including for
  the both-sides-unbounded and point-can't-be-unbounded rules (§1) — those
  are prevented at the widget interaction level and defensively in
  `composeTimeframeValue`, not via a save-time error.
- **A general physical-measurement-units system.**
- **Decimal offsets in the widget.** The storage grammar permits them; the
  offset input is integer-only (`type="number" step="1"`) since there's no
  calendar to make a fraction of a year meaningful. Not the same deferral
  as §9 — this is a UI restriction on an already-built grammar capability,
  not an unbuilt feature.
- **Automatic propagation of stale `Resolved:` values.** The manual
  `Refresh all timeframes` command (§11) exists; making this automatic
  would need real dependency-graph-ordering and cycle-safety work (the
  refresh would have to reuse the same root-cause-first ordering §6 already
  solves for Needs Attention) to avoid re-triggering itself or running in
  circles — deliberately not attempted without a concrete need for it.

---

## 11. What actually shipped beyond the original plan

Two pieces exist that the original design never mentioned at all:

**`Refresh all timeframes`** (`RefreshAllTimeframesCommand.ts`, world-root
context menu) — regenerates every entity in the world with a present
`timeframe` value, recomputing its `Resolved:` line (§8) against the
*current* state of everything it anchors to. Exists because
`CreateEntityCommand.ts`/`EditEntityCommand.ts` only ever compute an
entity's own `Resolved:` line at the moment *that* entity is itself created
or edited — if something it anchors to changes later, its `Resolved:` line
goes stale until it's individually touched again. This command is the
manual, vault-wide catch-up pass for that (see §10 on why it's manual, not
automatic). Only entities whose regenerated content actually differs from
disk are written; previews the change list via a confirm modal first, same
pattern as `Sync world files`.

**Point-candidate simplification in the anchor dropdown** (§1) — a
candidate whose own value is a point doesn't get the redundant
`Entity:start`/`Entity:end` split, computed the same way the widget itself
treats "point" (structural equality of decomposed offset/anchor, not strict
resolved-value equality) rather than a second, different definition.

---

## 12. Summary of deltas from the original pre-implementation draft

For anyone who read the original design and is wondering what changed:

1. **Widget UI is decomposed**, not a single free-text Start/End input —
   separate offset/anchor/unbounded/boundary controls (§1).
2. **Hot-create is effectively off** for timeframe anchors — the mechanism
   exists but no field ships with a `linkFolder` to create into, by
   deliberate design, not oversight (§1, §7.2).
3. **Unit is a fixed label, not a free-text input** — no per-timepoint unit
   entry; the widget always writes the world's current unit (§1, §2, §4).
4. **The generated section never shows raw storage syntax** — reversed
   from the original plan, specifically because a `[[Link]]` inside a
   backtick code span doesn't get parsed by Obsidian at all (§8).
5. **"Same as another entity" (the `inherit` form) has a real widget path**
   now — originally there was none at all, which was a genuine bug, not a
   documented gap (§1, §2).
6. **Entity/anchor discovery is tag-based, never folder-based** — a
   correction made after repeated bugs during implementation, not part of
   the original plan (§5, §7.2).
7. **Comparability-by-matching-units was never built as enforcement** —
   designed in §4 but not implemented; low priority in practice since the
   widget can't currently produce divergent units on its own.
8. **`time_unit`/`time_zero` world-level settings** and the
   **`Refresh all timeframes`** command (§11) exist and were never part of
   the original document at all.
