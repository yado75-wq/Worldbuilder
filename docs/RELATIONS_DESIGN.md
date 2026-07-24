# WorldBuilder — Relations Design

Status: draft, not yet started. Time (`TIME_DESIGN.md`), the one thing §4
below depends on, is now shipped — this is no longer blocked, just not yet
picked up.

This document is the reference to build against once work resumes. Where
something was explicitly deferred, it's listed under "Out of scope" so it
doesn't get silently re-litigated or silently reintroduced by accident.

Depends on: `TIME_DESIGN.md` — specifically the `timeframe` field type. This
document does not redefine what a date value is; see that document for the
anchor/offset/unit model and the point-vs-range rule.

---

## 0. Design principles

These recur throughout the plugin already and apply here too:

- **Report, don't block.** Cardinality violations are surfaced (dashboard /
  Needs attention style), never a hard-validation error that stops a save.
- **Refuse to guess rather than guess wrong.** Don't infer relationship facts
  the user hasn't stated.
- **Integrate, don't rebuild.** A dedicated relationship-graph plugin
  (Relations) already exists in the Obsidian ecosystem and does
  visualization well. WorldBuilder's job is generating well-formed data, not
  rendering graphs.
- **No new generic mechanisms for one-off needs.** Prefer reusing the
  existing `FieldDefinition` / `_Fields.md` / folder-rules machinery over
  inventing a new plugin subsystem, wherever it already covers the case.

---

## 1. Storage: two tiers, chosen per relation type

**Tier 1 — fact only, no per-instance data** (e.g. "sibling of", "allied
with" with nothing else to say about it).
Stored as an ordinary frontmatter list-of-links property directly on the
entity. No new files, no new plugin mechanism — this already works today
with existing `link` fields.

**Tier 2 — relation carries its own data** (e.g. "member of" with rank and
joined-date, or any relation type that needs a note/timeframe — see §4).
Stored as one file per relationship *instance*, living in its own per-world
`Relations/` folder, built using the existing `FieldDefinition` / `_Fields.md`
/ folder-rules machinery. This requires **no new plugin code** — a "Relation"
entity type defined in an ordinary `_Fields.md` already works with what
exists.

Rejected: a single per-world ledger file (one `_relations.md` with a markdown
table). Lowest file count, but forecloses Bases querying entirely (Bases
reads files and their properties, not rows inside one file's table) — ruled
out for that reason alone.

---

## 2. Relation *type* schema

Relation types need their own schema, parallel to how entity types have
`_Fields.md`:

- Which entity types are valid on each side (e.g. Character↔Faction only)
- Cardinality: 1:1, 1:many, many:1, many:many
- Symmetric vs. directional (symmetric: unordered pair, e.g. Siblings.
  Directional: ordered, e.g. Rules)
- For Tier 2 only: the instance's own field list (rank, joined-date, etc.)

Proposed as a new `_Relations.md` file, living alongside `_Fields.md` in each
template set. **Exact syntax is an open question — see §6.**

---

## 3. Cardinality is reported, not enforced

Per the "report, don't block" principle: a 1:1 relation type with two active
instances isn't rejected at save time. It's surfaced the same way the
`## Needs attention` dashboard section already surfaces incomplete entities
(see `EntityCompleteness.ts`) — likely the same mechanism, extended.

---

## 4. Time-varying relations (e.g. allies → rivals)

**No in-file history/append-log needed.** Each state is its own Tier 2
instance with its own timeframe (using the `timeframe` field type — see
`TIME_DESIGN.md` §1–§2). "Allied, 1200–1250" and "Rivals, 1250–present" are
two separate relation files, not one file with a change log. The old
instance is never edited to record the change — its own `end` value already
*is* the record that it ended.

**An end resolving to `+∞` — the open-ended half-open case, §3 of
`TIME_DESIGN.md` — on a relation instance means "still ongoing."** This is
specific to relations (present-tense facts that can genuinely still be true)
— it does **not** apply the same way to Events (`TIME_DESIGN.md` §7), which
are logged as having happened, not as being currently in progress.

---

## 5. Mirroring

Handled entirely by the read/generation side, never by asking the user to
write the same relation twice. Since a Tier 2 instance references both
participants via link fields, "show Alice's relations" is just "scan
`Relations/` for instances where Alice is a participant" — no dual-write
step, no sync risk between two copies.

---

## 6. Open implementation questions

Not yet decided — flag before/during implementation:

1. **`_Relations.md` syntax** — needs its own concrete format, parallel to
   `folder-rules.md` and `_Fields.md`.
2. **Where relation cardinality violations surface** — likely extending the
   existing `## Needs attention` dashboard section, but not yet designed in
   detail.
