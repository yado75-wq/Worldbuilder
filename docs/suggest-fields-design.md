# Suggest fields from entities (1.0.6 design)

## Goal

Vault-level recovery: build a **new** template set whose inferred `*_Fields.md` files reflect **what notes actually use**, starting from a **Generic-class floor** (name mandatory), not a silent full copy of the source type templates. Source set stays untouched for comparison and hand correction.

## Non-goals (v1)

- In-place rewrite of an existing template set
- Automatic rebinding of worlds to the new set
- Rewriting entity notes to match the draft
- LLM / cloud inference
- Perfect type detection (timeframe, complex multiselect chains)
- Suggesting folder-rules or world-template changes (fields only unless we explicitly expand later)
- Using source `Character_Fields.md` (etc.) as the field baseline for inferred types

## Product principles

1. **Output is always a new template set folder** under `_system/templates/`.
2. **User confirms the set name** (prompt; placeholder e.g. `{source}-suggested`).
3. **Worlds keep their current `template_set`** until they **Assign** in settings.
4. Inference is **evidence-based** (notes + tags); structured preview + durable **`_report.md`**.
5. **Source set is the human correction reference**, not the automatic merge base for type field lists.
6. **Evidence is first-class**: analysis produces a structured preview; v1 confirm is short; full rationale lives in `_report.md`.

---

## Why a new set (not in-place)

No plugin undo. Creating a new set:

- Leaves the source set intact for finished worlds and for **manual comparison**
- User can copy labels, link chains, or extra keys from the old set into the new one if we under-inferred
- Matches rename-set / clone-set identity model

**Overwrite existing set:** not in v1.

---

## Clone vs field content (important distinction)

### Full clone of source set **S → N**

Still done so that:

- `folder-rules.md`, `world-template.md`, `WorldMeta_Fields.md` carry over
- Types **not** included in this run keep their cloned `*_Fields.md`
- Assigning a world to **N** does not drop unrelated kit files

### Folder rules for types **in this run** (approach A)

For each inferred type, look at note paths under selected worlds:

- First path segment under the world root (e.g. `World/Characters/A.md` → `Characters`)
- If **≥ 80%** of notes (and **≥ 2** notes) share that folder → `Type | ThatFolder`
- Otherwise → `Type | *`
- **Only those types** replace/add lines in cloned `folder-rules.md`; other rules stay from the clone
- Underscore folder segments are ignored

### Field files for types **in this run**

**Do not** use source `Type_Fields.md` as the list of fields to keep.

| Base | Role |
| --- | --- |
| **Generic pattern** | Floor: typically `name` → title + mandatory (from source set’s `Generic_Fields.md` if valid, else the same minimal shape) |
| **Notes** | Every other key: only if present on tagged notes in selected worlds |
| **Source `Type_Fields.md`** | **Not** merged into the written file. Optional report line: “source had keys X,Y not seen on notes — not copied; copy from source set by hand if needed.” |

```text
fieldsToWrite = mergeFieldsAddOnly(genericFields, fieldsInferredFromNotes)
```

Then **overwrite** `N/Type_Fields.md` (whether the clone had a file or not).

### Why not “source type + add”?

- Source may be **defaults restored** (full English kit) while notes are thinner or another language  
- Shipping unused English `race` / `profession` into a “suggested” set is misleading  
- Partial translations of templates must not pollute inference  
- User still has the **old set** open to fix labels and recover keys we skipped  

### Mandatory

- On **Generic / new inference only**: high support (e.g. key on all notes, \(n \ge 2\)) may mark **mandatory** (especially `name`)  
- We do **not** rewrite mandatory flags on copied source type rows — those rows are not the base anymore for types in this run  

---

## Scope of a run

| Choice | Behavior |
| --- | --- |
| **One / several / all types with evidence** | Rebuild those `Type_Fields.md` from Generic + notes |
| **Types with zero notes** | Leave **cloned** file as in S (no inventing) |

Default UX: all types with ≥1 matching note in selected worlds.

---

## Entry and flow

**Primary entry:** Settings → template set → **Manage → Suggest fields from worlds…**  
Source set = baseline for **clone** and default world list (bound worlds), not for type field lists.

### Steps

1. Source set S (Manage context).  
2. Worlds — default: bound to S.  
3. Types — default: all with evidence.  
4. New set name — prompt; `{source}-suggested`; reject `_` and collisions.  
5. Build `SuggestFieldsPreview` (Generic + notes per type).  
6. Confirm — short summary via `t()`.  
7. Apply — `cloneTemplateSet` → overwrite inferred `*_Fields.md` → write **`_report.md`** → `refreshState` → Notice (report + Assign).

---

## Evidence model (API-ready)

```ts
interface SuggestKeyEvidence {
  key: string;
  presentCount: number;
  noteCount: number;
  supportRatio: number;
  proposed: FieldDefinition;
  reason: string; // link-majority | list | text-default | name-title | from-generic
  /** True if this key exists on source Type_Fields (info only; not used as write base) */
  presentOnSourceType?: boolean;
  fromGeneric: boolean;
}

interface SuggestTypePreview {
  typeName: string;
  noteCount: number;
  samplePaths: string[];
  keys: SuggestKeyEvidence[];
  fieldsToWrite: FieldDefinition[]; // Generic + notes only
  keysFromGeneric: string[];
  keysFromNotes: string[];
  keysOnSourceNotInNotes?: string[]; // optional honesty in report
  isNewFile: boolean; // source had no Type_Fields.md
}

interface SuggestFieldsPreview {
  sourceSetName: string;
  newSetName: string;
  worldPaths: string[];
  types: SuggestTypePreview[];
  summaryText: string;
}
```

---

## `_report.md`

### Location

`_system/templates/{newSet}/_report.md` — underscore ⇒ ignored by entity scanners. Only on **N**.

### Localization

Report **prose and headers** via `t('suggest.report.*')` (plugin locale).  
**Not translated:** field keys, paths, set/type names, filenames, schema tokens if shown raw.

Honest intro must state:

- Set was **cloned** from source for kit files / types not in this run  
- Field files **in this run** were built from **Generic + notes**, not a full copy of source type templates  
- Source set is unchanged; use it to correct labels or missing keys  
- Worlds are not rebound until Assign  

Include support tables, added vs generic, low-support hints, sample paths, next steps.

---

## Inference rules (v1, conservative)

**Corpus:** entity notes under selected worlds (skip `_` basenames, `_index.md`, tag `world`). **Not** `_dashboard.md`.

**Keys:** frontmatter minus reserved (`tags`, `position`, …).

**Base:** `Generic_Fields.md` from source set when usable; else minimal `{ name, title, mandatory, text }`.

**Merge:** `mergeFieldsAddOnly(generic, inferredFromNotes)` only.

**Never in v1:** timeframe invention; long link chains; using source type template as field baseline.

**Implementation:** `inferFieldsFromNotes.ts` (aggregate, merge, serialize fields); `formatSuggestFieldsReport` + `t('suggest.report.*')`.

---

## Safety checklist

- [ ] No write under source set path  
- [ ] No change to world `template_set`  
- [ ] Name validation (no leading `_`, no collision)  
- [ ] Confirm before write  
- [ ] Inferred types = Generic + notes only  
- [ ] `_report.md` explains clone vs inferred fields; i18n prose  
- [ ] Tests: pure helpers; report honesty; command FakeVault  

---

## Manual test ideas

1. Source has rich English Character fields; notes only `name` + `faction` → new Character file has name + faction, **not** full English kit; source unchanged.  
2. Catalog type (notes, no fields on source) → new file from Generic + notes.  
3. Zero-note type → cloned file left as-is.  
4. Cancel → nothing created.  
5. User compares old set and hand-fixes new set labels.  
6. Report language follows plugin locale; keys/paths unchanged.

---

## Open for later

- World/type multi-select richness  
- Unbound worlds as evidence  
- Per-key checkboxes before apply  
- Auto-open `_report.md`  

## Decision log

| Topic | Decision |
| --- | --- |
| In-place overwrite | No (v1) |
| New set name | Always prompt; `{source}-suggested` |
| Kit clone | Full clone of source set |
| **Field base for types in run** | **Generic + notes only** — not source `Type_Fields.md` |
| Source type template | Human correction reference; optional “not copied” list in report |
| Types with zero notes | Leave clone unchanged |
| World rebinding | Manual Assign only |
| Evidence | Structured preview + `_report.md` |
| Report name | `_report.md` |
| Report language | `t('suggest.report.*')`; identifiers as in vault |
| Schema format | Unchanged pipe lines; not localized |
