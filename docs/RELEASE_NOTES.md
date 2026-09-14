# World Builder Tools — Release notes

Copy the block for the version you are tagging into the GitHub release description.
Keep `manifest.json` / tag / zip assets in sync with the version heading.

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

