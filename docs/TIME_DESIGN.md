# WorldBuilder — Time Design

Status: design agreed, not yet implemented.
This document is the reference to build against. Where something was
explicitly deferred, it's listed under "Out of scope" so it doesn't get
silently re-litigated or silently reintroduced by accident.

See also: `RELATIONS_DESIGN.md`, which depends on the `timeframe` field type
defined here (relation instances use it to express duration / ongoing state).

---

## 0. Design principles

These recur throughout the plugin already and apply here too:

- **Report, don't block.** Malformed ranges, unresolvable anchors, and a
  mandatory `timeframe` field left entirely unset are all surfaced (`##
  Needs attention`), never a hard-validation error that stops a save.
- **Refuse to guess rather than guess wrong.** Where two dates *might* be
  comparable but we can't prove it (different anchors, different units,
  loosely-parsed numbers), treat them as not comparable.
- **Integrate, don't rebuild.** Real fictional-calendar structure (day/month/
  year, leap rules, multiple moons, non-Earth-shaped time) is Calendarium's
  job, not ours.
- **One uniform data model, not special cases per use.** A `timeframe` is
  always an interval. Points, half-open ranges, and bounded ranges are the
  same underlying shape, distinguished only by content — never by a
  type-level switch (no `mode` config; see §9).
- **WorldBuilder generates data, not narrative prose.** Anything shown to
  the reader is either raw/factual, or composed by the *user* linking to it
  in their own words (§7) — the plugin never writes sentences on someone's
  behalf.

---

## 1. The `timeframe` field type

A new `FieldDefinition.type`, alongside existing `text` / `link` / `select`.

**Widget:** a Start input, a checkbox ("point in time", default checked),
and a second End input that only appears when unchecked. Self-contained
within the field's own widget — no generic cross-field conditional
rendering needed in `EntityFormModal`.

**Anchor picker supports hot-create.** Referencing a Milestone (or any
anchor entity) that doesn't exist yet should reuse the exact mechanism
`link` fields already have — `onCreateLink` / `createLinkedEntity`
(`EntityFormModal.ts`, `CreateEntityCommand.ts`) — not a new creation path.
Combined with §7, this makes it safe and normal to have many unresolved
timepoint links mid-draft while writing.

**Storage — two outputs from one generation pass:**
1. A single, always-quoted frontmatter key holding the value in the syntax
   defined in §2 (e.g. `timeframe_key: "(1200, 1250)"`).
2. A generated markdown **section** in the entity's body — see §7. This is
   not optional decoration; it's what makes the field referenceable at all,
   since Obsidian has no way to link directly to a frontmatter property.

**Mandatory-field completeness:** a mandatory `timeframe` field is "missing"
when its single frontmatter key is entirely absent. `findMissingMandatoryFields`
(`EntityCompleteness.ts`) needs a new case for this — it currently only
branches on `section` vs. the property/link default, and doesn't yet know
about `timeframe`.

---

## 2. Storage syntax

A `timeframe` frontmatter value, when present, is always a single quoted
string — quoting is deliberate, not optional, so YAML never has a chance to
parse `(`/`)` content as something other than our own string.

**Top-level forms:**
- **Absent** (key not present in frontmatter) → unset.
- **`"(a, b)"`** → an explicit interval. `a` and `b` are each a *timepoint*
  (below). Round parens are pure delimiters — there is no open/closed
  (mathematical inclusivity) distinction; this design doesn't need that
  precision (see §9).
- **A bare `"[[Entity]]"`** → inherit that entity's own whole resolved
  interval. Used for anchoring to an interval-valued entity as a whole
  (e.g. "during the Thirty Years' War").

**A timepoint** (one side of an interval, or a whole point-only value) can
be:
- a **bare number** — offset relative to the world's implicit zero (§4),
  unit = the world's `time_unit`;
- a **bare `[[Milestone]]` link** — offset `0` relative to that milestone
  (see §6.1);
- an **infinity token** — the unbounded side of a half-open interval.
  *(Exact token not yet decided — see §10.)*
- a **full tuple** — fully explicit `(offset, [[Anchor]], unit)`.
  *(Exact internal ordering/delimiter not yet decided — see §10.)*
- a **boundary reference**, `[[Entity]]:start` or `[[Entity]]:end` — reach
  into one specific boundary of another interval-valued entity (e.g. "the
  end of the Thirty Years' War"), rather than inheriting its whole interval.

This supersedes an earlier proposal (two flat frontmatter keys, `<key>_start`
/ `<key>_end`). That shape couldn't express "anchor to a whole interval"
(the bare-link top-level form) without an awkward two-key convention, and a
single bracketed string reads more naturally end-to-end.

---

## 3. Point vs. range vs. half-open: the actual rule

Determined from the stored value's shape (§2), independent of how it was
entered via the checkbox:

| stored value | meaning |
|---|---|
| key absent | **unset** — nothing entered. Reported via Needs attention if mandatory (§1). |
| `(a, ∞)` — one side an infinity token | **half-open** — deliberate, meaningful data (e.g. an ongoing Epoch), not "incomplete." |
| `(a, b)`, **equal** | **point** (degenerate interval). |
| `(a, b)`, **different** | **bounded range**. |

Checking the "point in time" checkbox and leaving only Start visible mirrors
`start` into `end` on save, producing the equal-values case by construction.
A single filled side in range mode is never auto-mirrored into a point — it
produces a genuine half-open interval, preserved as entered.

*(Deferred, not built: flagging `end` before `start`, once both resolve to
real comparable numbers — see §5, §10.)*

---

## 4. What a single timepoint actually means: anchor + offset + unit

`(anchor, signed offset, unit)`:

- **Anchor** — optional link to another entity. **If omitted, resolves to
  the world's own implicit zero-point** — a single, anonymous origin that
  exists automatically the moment the world exists, paired with the world's
  `time_unit` (shipped default: `"years"`). This is the primary, everyday
  path, not a fallback for an unconfigured world — two entries that both
  omit an anchor are automatically comparable within that world from the
  moment it's created, zero setup required. If an anchor *is* specified, the
  offset is relative to that entity's own resolved date instead (chaining;
  see §5 for the boundary-reference case).
- **Offset** — a signed number. The sign natively replaces BC/AD-style
  string suffixes.
- **Unit** — a free-form, **opaque** string ("years", "winters", "cycles").
  Never interpreted or converted — only ever compared for exact string
  equality. If omitted, defaults to the world's configured `time_unit`
  (itself defaulting to `"years"` for a new world).

**Comparability rule:** two dates are comparable only if they resolve
(transitively, through the anchor chain) to the same anchor **and** have
matching unit strings. Otherwise: correctly, deliberately incomparable.

**Bare-number parsing must be strict**: a value only counts as a bare number
if the *entire* string matches `^-?\d+(\.\d+)?$`. Loose parsing (`parseInt`
on "500 BC") is explicitly rejected.

### 4.1 Resolved boundary representation

Once a timepoint is resolved for comparison, it must be exactly one of:
a **real number**, **`+Infinity`** / **`-Infinity`** (an unbounded side), or
**`undefined`** (genuinely unset — should only reach comparison for an
*optional* field, since mandatory ones are caught by completeness checking
first). Using signed infinities means ordinary numeric comparison works
uniformly across points, bounded ranges, and half-open ranges with no
per-shape branching.

---

## 5. Anchor resolution

`resolveComparableDate(entity)` — recursive: return the entity's own
timepoint if set, otherwise follow its anchor link and resolve *that*
entity's date instead. **Must have a cycle guard.**

**Boundary references** (`[[Entity]]:start` / `[[Entity]]:end`, §2) are a
distinct resolution case: when the anchor resolves to an interval-valued
entity (not a point-only Milestone), the reference must specify which side
it means — resolution returns that specific boundary's resolved value, not
"the entity's date" as a single ambiguous thing.

Resolution can fail (return `undefined`) for two different reasons that
should both be treated as normal, non-error outcomes at the resolver level
(though still worth surfacing via Needs attention, §10): a chain leading to
an entity whose own timepoint is genuinely unset, or a boundary reference
that doesn't resolve (dangling link, or a reference into a point-only
entity that has no distinct start/end).

---

## 6. Milestone, Event, and Epoch — entity-type conventions, not field variants

All three use the exact same `timeframe` field and the same uniform interval
data model, with no per-type mechanism or enforcement — a naming and usage
convention, not a technical distinction the plugin needs to know about:

- **Milestone** — the pure anchor type. In practice always a point (start =
  end). Nothing else beyond a name — the minimal, dedicated "thing other
  entities can anchor to."
- **Event** — point *or* interval, depending on the event. A coronation is a
  point; the Thirty Years' War is a bounded range.
- **Epoch** — always an interval. Within an ordered sequence of epochs
  covering a world's timeline, interior epochs are always fully bounded —
  only the first (unbounded start) and last/current (unbounded end) can be
  half-open, and only on their outward-facing side.

### 6.1 Epoch boundaries in practice: anchoring to Milestones

Requires no new mechanism — it's §3 and §4 composing as already specified:

- An Epoch boundary anchored to a Milestone is `(anchor = [[Milestone]],
  offset = 0)` — the epoch begins/ends exactly when the milestone occurs.
- **Interior epochs** reference a real Milestone on both sides → bounded,
  automatically.
- **The first epoch** has no Milestone to reference for its start → that
  side is an infinity token → left-unbounded, automatically. Same for the
  **last epoch**'s end.

The "only first and last can be unbounded" rule isn't separately enforced —
it falls directly out of this pattern: any interior gap between two
milestones necessarily has a real milestone on each side by definition.

---

## 7. Display: the generated section is what makes a timeframe referenceable

Obsidian has no way to link directly to a frontmatter property — only to a
heading or section, via `[[Note#Heading]]`. So a `timeframe` field's
generated markdown section (§1) isn't a display nicety; it's what makes the
field linkable at all.

**The section's own content is a plain, factual rendering — not composed
narrative.** Something like the raw stored expression and/or the resolved
absolute value, if resolvable. WorldBuilder never writes a sentence like "5
years after the war ended" itself — that phrasing is entirely the *linking*
author's job, using Obsidian's native alias syntax
(`[[Entity#Timeframe|however they want it to read]]`) in their own prose.
This keeps the plugin's job strictly "generate reachable, factual data,"
consistent with §0.

**Best-effort content, always — even when unresolvable.** A link targets
the *heading*, not any specific value inside it, so the heading is a valid,
stable link target the instant it exists, regardless of whether the
underlying timepoint resolves. An unresolved reference can render as
something like `<unresolved>` in the section body without breaking anything
that already links to it. No special-case branching between "broken" and
"working" — same generation pass, different content.

This is exactly what makes hot-create (§1) safe: a hot-created Milestone
stub is immediately, stably linkable via its own generated section the
moment it exists, even before its own timeframe is filled in. Many
unresolved timepoint links present mid-draft is a normal, expected state
while writing — not an error condition (§0).

Unresolvable timepoints are still always reported via `## Needs attention`
(§10) — display and validation are two separate concerns, solved by two
different existing mechanisms, not one combined feature.

---

## 8. Multiple reckonings (different cultures/calendars in one world)

A world may have more than one named reckoning (e.g. "Imperial Calendar" vs.
"Old Faith Calendar"), each with its own zero-point and own unit, mutually
convertible **only if a human explicitly links them** — a reckoning's own
zero-point is itself just a timepoint, expressed in terms of another
reckoning.

**The one genuinely new piece this needs:** if two reckonings don't share a
unit, an additive offset alone isn't enough to convert between them — a
**ratio** is also needed (e.g. how many "winters" per "year").

**Deferred** — build only if/when a world genuinely needs two
differently-unit'd, mutually convertible reckonings. Ship single-reckoning
first.

---

## 9. Explicitly out of scope / deferred

- **Generic cross-field conditional field visibility** in `EntityFormModal`.
  The `timeframe` checkbox is self-contained and doesn't need this.
- **A per-field `mode` config for Milestone/Event/Epoch constraints.**
  Considered and rejected — data is always a uniform interval (§6).
- **Mathematical open/closed interval precision** (inclusive vs. exclusive
  endpoints). Parens in §2 are pure delimiters; this design isn't that
  precise and doesn't need to be.
- **A real calendar engine** — day/month/year structure, leap-day rules,
  multiple moons, non-Earth-shaped time in general. Calendarium's job.
- **Adopting Calendarium's `fc-date`/`fc-end`/`fc-calendar` frontmatter as
  our own foundation.** Only meaningful relative to a fully-configured
  calendar (defeats zero-setup goal), and has currently-open upstream bugs.
  If built later, an optional export/bridge only, never the core model.
- **Reckoning-to-reckoning unit conversion** (the ratio piece, §8).
- **Localized unit pluralization** (e.g. Slavic numeral-class grammar).
  `unit` stays a single opaque display string, shown as typed.
- **Hard validation / blocking saves** for a malformed timeframe or an
  unresolvable anchor. Stays report-only.
- **A general physical-measurement-units system** (distance/weight/volume,
  currency). Researched separately: no mature worldbuilding tool treats
  this as structured data — universally handled as prose. Not pursued.

---

## 10. Open implementation questions

1. **The exact infinity token** used for an unbounded timepoint (§2, §3).
2. **The exact syntax/ordering for the full explicit timepoint tuple** —
   `(offset, [[Anchor]], unit)` assumed; delimiter and field order not
   confirmed.
3. **Where and how unresolvable timeframes surface** via `## Needs
   attention` — mechanism is decided (extend the existing check), but exact
   triggers (malformed range, dangling anchor, cycle, unresolved boundary
   reference) and message granularity aren't yet designed in detail.
