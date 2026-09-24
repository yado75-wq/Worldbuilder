# World Builder Tools — Release notes

Copy the block for the version you are tagging into the GitHub release description.
Keep `manifest.json` / tag / zip assets in sync with the version heading.

---

## 1.0.6

**Suggest fields from worlds, folder-rule inference, underscore type stems**

### What's new

- **Suggest fields from worlds…** (Settings → template set → **Manage**)
  - Always creates a **new** template set (source set is not modified)
  - Field files for types with note evidence: **Generic + keys from notes** (not a silent full copy of the source type template)
  - Wikilink lists → `multiselect:link`; second pass resolves link chains from target note tags when possible
  - **Folder rules (approach A):** for types in the run only, set first-level folder when ≥80% of notes agree (≥2 notes); otherwise `*`; other rules kept from the clone
  - Writes **`_report.md`** (ignored by scanners) with localized prose and raw keys/paths
  - Worlds are **not** rebound until **Assign**
- **Underscore type stems ignored** — `_Character_Fields.md` is not registered as a type (same rule as archived worlds/sets and `_report.md`)

### Fixes / behavior notes

- Create / hot-create / rename already reject names starting with `_`; scan now matches that for field file stems
- Audit still does not rewrite notes; Suggest is the recovery path for extra keys / missing fields files

### Install

Extract the release zip into `.obsidian/plugins/world-builder-tools/`, or update via BRAT.

Requires **Obsidian 1.13.0+** (desktop).

---

## 1.0.5

**Delete entity type, catalog-safe hot-create, rename template set, catalog audit**

### What’s new

- **Delete entity type** (Settings → template set → **Manage** → **Delete entity type…**)
  - Removes `Type_Fields.md` so New / Edit / hot-create stop for that type
  - **Does not** delete notes or strip type tags — notes stay linkable (catalog / rulebook mode)
  - Zero instances: default cleanup of folder-rules line and inbound link tokens
  - With instances: keep rules and link tokens by default
  - **WorldMeta** cannot be deleted; **Generic** on `defaults` may be restored on ensure-defaults
- **Hot-create gated on usable fields** — form “Create new …” and `createLinkedEntity` require a usable field set for the target type (same rule as honest menus)
- **Rename template set** (Settings → template set → **Manage** → **Rename template set…**)
  - Renames the set folder under `_system/templates/`
  - Live→live: world checklist (default all selected) for who gets `template_set` updated; unchecked worlds stay on the old name (orphaned until Assign)
  - Rename to `_…`: archive path — no world updates (same as a hand-rename outside the plugin)
  - Confirm reminds you to **Clone** first when finished worlds need a frozen schema
- **Catalog-aware world audit** — notes tagged for a type with no `*_Fields.md` are reported as **info** (`catalog-type`): linkable, New/Edit/hot-create off; not framed as a broken restore target
- **Schema drift** findings use kind `schema-drift` (warning) for extra / missing mandatory keys
- **Link target without fields** on set audit is a **warning** (catalog-friendly), so intentional rulebook types do not mark the set invalid by themselves

### Fixes / behavior notes

- Deleting only the fields file by hand is still incomplete; use **Delete entity type** when you want controlled cleanup
- After delete or rename, refresh settings/state before relying on menus
- FakeVault tests support folder rename via `fileManager.renameFile` (parity with production)
- `fields-without-rule` remains an **info** note when a type has fields but no folder-rules row (`*` placement)

### Install

Same as before: extract the release zip into `.obsidian/plugins/world-builder-tools/`, or update via BRAT.

Requires **Obsidian 1.13.0+** (desktop).

---

## 1.0.4

**Template hygiene and type rename**

### What’s new

- **Rename entity type** (Settings → template set → **Manage** → **Rename entity type…**)
  - Rewrites `link:` / `multiselect:link:` tokens in the set
  - Updates `folder-rules.md` (entity column only; folders stay put)
  - Renames `Old_Fields.md` → `New_Fields.md`
  - Retags notes in **worlds that use this set**
  - **WorldMeta** cannot be renamed; names cannot start with `_`
- **Audit set** — bindings, missing link targets, fields without rules; results in the issues table under the set
- **Audit world** — missing template set, orphan type tags, instance↔template drift (extra or missing mandatory frontmatter keys); results under the world row
- **Docs** — README explains settings controls, safe vs hand rename, and what audit warnings mean

### Fixes / behavior notes

- Hand-renaming only a `*_Fields.md` file is still unsafe; use **Rename entity type** when the type id must change
- Audit does not rewrite notes; it only reports mismatches (useful before a future “suggest fields from entities” recovery)

### Install

Same as before: extract the release zip into `.obsidian/plugins/world-builder-tools/`, or update via BRAT.

Requires **Obsidian 1.13.0+** (desktop).

---

## Earlier 1.0.x (summary for readers who skipped notes)

Useful context if this is the first time you publish release text:

- World / template-set / entity forms, dashboards, folder + file sync
- Timeframes, link chains, multiselect
- Active-world conflict repair in settings
- Honest menus (usable types only)
- Template validation in settings
- Exact template-set binding (no silent fallback)
- Archive via leading `_` on worlds and template sets
- World kit **export / import** (zip)
- i18n via `locales/*.json` (English shipped)

---

## Template for the next release

```markdown
## x.y.z

### What’s new
- …

### Fixes
- …

### Install
Extract the zip into `.obsidian/plugins/world-builder-tools/`, or update via BRAT.
Requires Obsidian 1.13.0+ (desktop).
```
