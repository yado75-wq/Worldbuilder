# Next release planning — consistency, sharing, localization scenarios

**Status:** planning (from exploratory scenarios)  
**Last updated:** 2026-09-03  
**Scope:** product rules and features driven by “what if…” consistency walks — not a translator manual

## Method

Exploratory scenario testing: walk a realistic user path, observe where the plugin stays consistent, and record gaps. Responsibility for consistency lies with the **plugin**, not with users or translators inventing partial fixes.

## Goals

1. Clear rules for template-set lifecycle (live vs archived vs bootstrap `defaults`).
2. Supported handoff of a world to another vault/user (export/import kit).
3. Honest limits when localizing type identity vs labels/folders.
4. Optional recovery when field definitions are lost (suggest schema from entities).
5. Document language policy for UI vs generated markdown.

## Non-goals (this train)

- Shipping reviewed non-English locale packs
- Auto-translating user prose or field values
- Perfect reverse-engineering of select options / link chains
- Public form library
- Overwriting user template content on every load

---

## Scenario map

### S1 — Template-set archive (`_` prefix)

**Rule:** Template set folders under `_system/templates/` whose **name starts with `_`** are ignored entirely (not in registry, settings, default picker, assign targets).

**Edges:**

| Case | Behavior |
| --- | --- |
| World `template_set` points at archived/missing name | Existing missing-set path: no silent fallback; settings show reassign |
| `defaultTemplateSet` names archived set | Treat as invalid; Notice; fall back for **new worlds only** to a live set (prefer `defaults` if live) |
| `ensureDefaultTemplates` | Does not manage `_…` sets; still ensures bootstrap `defaults` **existence** |

**Not required v1:** UI button “Archive set”; auto-migrate worlds off archived set.

---

### S2 — Bootstrap `defaults` vs user default setting

Two different concepts:

| Concept | Role |
| --- | --- |
| Folder `defaults/` | Product bootstrap. **Existence** is preserved (recreate from plugin built-ins if missing). **Content** is user’s once edited (no overwrite of existing files). |
| `settings.defaultTemplateSet` | Which **live** set name new worlds get. User choice; if invalid, fix with Notice + live fallback. |

**World binding:** exact `template_set` name only — never rewrite a world’s set to `defaults` automatically.

---

### S3 — Share world with a friend

**Minimum handoff (today, documented):**

1. Friend installs compatible plugin version.
2. Package **world folder** + **template set folder** named in `_index.md` → `template_set`.
3. Friend places both in vault, enables plugin, sets active world if desired.

#### **Feature: Export / import kit (to build)**

##### **Export**

- Input: world path
- Resolve template set by exact name (fail if missing)
- Kit contains: world tree, template-set tree, optional manifest (plugin id, min app version, set name, world folder name)
- Format: zip or folder kit (decide in implementation)

##### **Import**

- Install template set under `_system/templates/<name>` (conflict policy: skip / rename / overwrite — pick one default + confirm)
- Install world folder (same conflict policy)
- Ensure `_index.md` `template_set` matches
- World **inactive** by default
- `refreshState` + result codes + Notices via `t()`

**Kit does not include** `locales/` — tool language ≠ content language.

---

### S4 — Language switch and generated markdown

**Policy (v1):**

- Plugin UI follows Obsidian language + `locales/*.json` with English fallback.
- Generated note/dashboard text is **frozen at write time**.
- Switching language does **not** rewrite the vault.
- User may refresh/edit to regenerate auto zones; mixed language is possible (own risk, documented).

**Later optional:** `gen.*` keys for timeframe chrome (from/to, start/end) and dashboard stock phrases; regenerate via refresh commands — still not automatic on language change.

**Sync world files** moves files only; it must **not** be the language-rewrite tool.

---

### S5 — Localize a world (labels, folders, type identity)

#### **Safe without new features**

| Change | Consistency |
| --- | --- |
| Translate **labels** in `*_Fields.md` | Safe; regenerate auto body to update shells |
| Translate note prose/values | Safe |
| Rename folders + update `folder-rules.md` / `world-template.md` | Safe |
| Rename template set folder + update world `template_set` / Assign | Safe |

#### **Unsafe by hand today**

| Change | Why |
| --- | --- |
| Rename field **keys** | Orphans frontmatter |
| Rename `Character_Fields.md` → `Postava_Fields.md` only | Breaks rules, tags, `link:Type`, menus |
| Change type tags only | Same join-key split |

**Gap:** Menus use **type id** (`New {type}`), not field labels. Full linguistic type identity (Character → Postava / “Nová postava”) requires a **Rename entity type** command:

1. Rename `*_Fields.md` stem  
2. Update `folder-rules.md` type column  
3. Update `link:` / `multiselect:link:` type references in other field files  
4. Retag notes  
5. Refresh state; honest menus follow new id  

Until then: English (or original) **type ids** + translated **labels** + optional localized **folder** names is the only consistent path.

---

### S6 — Lost or overwritten field definitions

**Scenario:** Custom `*_Fields.md` lost or replaced by defaults restore; many entity notes of that type remain.

#### **Capability: Suggest fields from entities (best-effort)**

- Input: world + type tag (or type name)
- Scan notes with that tag; ignore below preserved marker
- Aggregate keys (union); guess types from values; labels from generated body if present; title heuristic
- More samples → better draft (not 100%)
- Output: draft file or preview — **never** silent overwrite of existing fields
- Folder-rules: optional suggestion from paths; user confirms

**Cannot fully recover:** mandatory flags, select option lists, link type chains, author’s original labels if body was heavily edited.

**Consistency:** Source of truth remains `*_Fields.md` when valid; notes are evidence for recovery only.

---

## Feature backlog (priority suggestion)

| Priority | Item | Primary scenarios |
| --- | --- | --- |
| P0 | Document policies (share kit manual, language freeze, safe edits) | S3–S5 |
| P1 | Template-set `_` archive in scan + defaultSet edge | S1–S2 |
| P1 | Export / import world kit | S3 |
| P2 | Rename entity type (atomic migration) | S5 |
| P2 | Suggest fields from entities (draft schema) | S6 |
| P3 | `gen.*` for generated chrome + regenerate-on-refresh | S4 |
| P3 | “Refresh entity content for world” (rebuild above marker) | S4–S5 |

## Definition of done (per feature)

Each implemented item needs:

- Automated tests for rules/result codes where pure enough  
- Manual checklist from the scenario that motivated it  
- README/wiki note when user-visible policy changes  
- No silent fallback that violates exact template-set binding  

## Open decisions

1. Kit format: **zip** vs **folder kit**  
2. Import name conflict: skip / suffix / overwrite (default?)  
3. Rename entity type: new tag convention (`postava` vs keep English tags — recommend tag derived from type stem as today)  
4. Suggest-fields: minimum sample size and whether to write `*.suggested.md` only  

## Success metrics

- Explained handoff path for “give world to friend” without tribal knowledge  
- Archiving a template set cannot strand the plugin in an undefined registry state  
- Partial hand-rename of type files fails **clearly**; supported rename path keeps rules/tags/menus aligned  
- Recovery from lost fields is possible as an explicit suggest flow, not magic  

## Out of scope / deferred

- Community directory process  
- Multiselect search  
- Reckoning unit conversion and other Time § backlog  
- Machine-generated locale packs as official ships  
