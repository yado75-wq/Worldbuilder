# WorldBuilder Tools for Obsidian

A worldbuilding plugin for [Obsidian](https://obsidian.md) designed to simulate the core functionality of World building tools like Chronicler — directly inside your vault, with no external dependencies.  Plugin does not enable any presentation functionality which other applications have and Obsidian does not. The core philosophy is that the user can complicate his life as much as he wants, we will hand him the tools to do it. Everything is based on Entities and Rules. User doesn't have to create folders via command, it's just easier if the user already knows the structure. User can add folder rules later when the structure is clear and there is a command to move entities to specified folders to keep vault clean. We try to add `Hot create` functionality to menus so the workflow would be as smooth as possible.

---

THIS PROJECT WAS CREATED USING AI - Claude and Grok.

These two failed so many times that it made me reconsider my view of project managers. But the sole purpose of this project is to make me learn how to use an AI.

---

## Features

- **World management** — create worlds with templated folder structures, switch between active worlds, sync folders as your template evolves
- **Entity creation** — create Characters, Locations, Factions, and any custom entity type via a clean form UI, directly from the right-click menu. Freeform notes added below the auto-generated content survive future edits, same protected-section behavior as the dashboard
- **Template-driven** — all entity fields, folder rules, and world structure defined in plain markdown files you can edit freely
- **Template set management** — create, clone, reset, assign to a world, and set a default template set from the plugin settings tab
- **Dashboard** — auto-generated world dashboard with entity counts, world meta, TODO tracking, a `## Needs attention` section flagging entities missing mandatory fields, and a protected Notes section that survives refresh
- **World meta** — structured world bible (genre, tone, themes, premise, conflict etc.) editable via form
- **File sync** — move misplaced entity files to their correct folders based on their tags
- **Context-aware menus** — right-click commands appear only where they make sense
- **Ribbon icon** — hover to see the active world at a glance, click for a quick status menu and a shortcut into plugin settings
- **Multi-value fields** — optional `multiselect` types for fixed strings or multiple entity links (picker modal)

## How it works

WorldBuilder uses a **template set** — a folder of plain markdown config files that define your world's structure:

```text
_system/templates/
  defaults/               ← plugin defaults, your starting point
  fantasy/                ← your working set (copy and customize)
    world-template.md     ← subfolders created for every new world
    folder-rules.md       ← maps entity types to folders
    WorldMeta_Fields.md   ← world bible fields
    Character_Fields.md   ← character form fields
    Location_Fields.md    ← location form fields
    Faction_Fields.md     ← faction form fields
    Generic_Fields.md     ← minimal fallback for any entity
```

### Field file format

Each `_Fields.md` file defines one field per line:

```text
- key | Label | mandatory/optional | type | display
```

| Column | Values |
| ------ | ------ |
| `type` | `See Field types below` |
| `display` | `title` \| `property` \| `section` |

#### Field Types

| Type | Example | Behaviour |
| ---- | ------- | --------- |
| text | text | Free text |
| select | select:"Active","Inactive" | Single choice; options must be quoted |
| link | link:Faction | Link to one entity of that type |
| link (chain) | link:Weapon>Armor | Candidates from each type in order (grouped in the UI) |
| multiselect:text | multiselect:text:"Fire","Ice","Storm" | Several fixed strings; empty list allowed |
| multiselect:link | multiselect:link:Weapon>Armor | Several entity links via picker modal; order follows the candidate list; no hot-create |
| timeframe | timeframe | Interval / point / inherit; not valid inside multiselect |

Notes:

- Links and multiselect:link target entity types, not folder names (folder placement still comes from folder-rules.md).
- Hot-create is available only for single link: fields with exactly one type.
- Multiselect values are stored as a YAML list in frontmatter and shown as nested bullets under the property in the note body.
- Invalid or unknown type tokens are reported in Settings → template issues (file, line, message).

### Folder rules format

```text
- EntityType | TargetFolder
```

Use `*` as target folder to allow placement anywhere (e.g. Generic | *).
Entity types not listed in folder rules are treated as `*` (creatable anywhere).
Worlds or folders whose names start with _ are ignored by the plugin (archive / system).

## Right-click commands

| Context | Commands |
| ------- | -------- |
| Vault root or non-world folder | New world |
| Template set folder | Set as default template set |
| World root folder | Edit world meta, Refresh dashboard, Sync world folders, Sync world files, Switch to this world |
| Entity folder | New `<entity type>`, New generic |
| Entity file | Edit `<entity type>` |
| `_index.md` | Edit world meta, Refresh dashboard |

Menus stay honest: entity types only appear when their field set is usable (non-empty, has a title field).

## Installation

### Manual install

1. Download the latest `worldbuilder.zip` from the GitHub release page
2. Extract it into your vault at `.obsidian/plugins/world-builder-tools/`
3. Ensure the plugin folder contains main.js, manifest.json, styles.css (if present), defaults/, and locales/ (at least locales/en.json).
4. Enable the plugin in Obsidian settings → Community plugins

### Beta (BRAT)

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) from Community plugins.
2. Command palette → **BRAT: Add a beta plugin for testing**.
3. Paste: `https://github.com/yado75-wq/Worldbuilder`
4. Enable **World Builder Tools** under Community plugins.
5. Updates: BRAT → check for beta plugin updates (or auto-update in BRAT settings).

Requires a GitHub **release** with `main.js`, `manifest.json`, and `styles.css` as assets (same as manual install).

### Development

```bash
git clone https://github.com/yado75-wq/Worldbuilder
cd Worldbuilder
npm install
npm run dev
```

Run the test suite (pure-logic unit tests, no Obsidian mocking) with:

```bash
npm test
```

Requires Node.js v18+.

## First run

On first load the plugin creates `_system/templates/defaults/` in your vault with the default template set. This is your starting point — copy it, rename the copy, and customize freely. The `defaults/` folder is restored from plugin built-ins if deleted.

### Missing or renamed template sets

- Each world’s `template_set` in `_index.md` must match a folder under `_system/templates/`.
- If the name is missing or the folder was renamed/removed, the world still appears in settings, but create/edit/sync/dashboard commands refuse to run until you reassign the set (Settings → Assign to world) or fix `_index.md`.
- The plugin does **not** silently use another template set.
- If the whole `templates` folder is deleted, the next load recreates `_system/templates/defaults/` from plugin built-ins.

### Renaming `*_Fields.md` (entity type id)

The file stem is the **type id** (menus, tags, folder-rules, `link:Type`).

Renaming e.g. `Character_Fields.md` → `Postava_Fields.md` by hand changes the type id for **new** scans only. Existing notes keep old tags; `folder-rules.md` and `link:Character` lines are not updated. The type can look broken or empty until everything is aligned.

#### **Safe today**

- Translate the **label** column only (forms and, after regenerate, generated headings).
- Rename **folders** and update `folder-rules.md` / `world-template.md` to match.
- Leave **keys**, type stems, and tags alone unless you migrate them all yourself.

A dedicated **Rename entity type** command (rules + tags + link targets) is planned; until then, do not rely on renaming only the fields file.

## Releasing

- Bump the version in manifest.json and package.json.
- Update versions.json so the new version maps to the minimum Obsidian version.
- Run `npm run build` to produce the release artifacts.
- Create a Git tag matching the manifest version, for example `1.0.1`, and push it to GitHub.
- The existing GitHub Actions workflow will create a draft release containing a ready-to-install `worldbuilder.zip` archive.

## Customization

- **Add entity types** — create a new `_Fields.md` file and add a line to `folder-rules.md`. No code changes needed.
- **Translate labels** — change the label column in `*_Fields.md`; keep keys and type stems stable (see Renaming above)
- **Change world structure** — edit `world-template.md` to add or remove subfolders, then use Sync world folders on existing worlds
- **Multiple template sets** — create different sets for different genres (fantasy, sci-fi, horror) via plugin settings
- **Manage template sets** — in the plugin settings tab you can create a new set, clone an existing one, assign a set to a specific world, reset a set to plugin defaults, or mark one as the default for new worlds

## Localization

User-visible plugin strings (notices, menus, settings chrome) live in locales/en.json.

On load the plugin reads Obsidian's language via getLanguage(), loads `locales/<code>.json` when present, and falls back to `en.json`.

### Add a language

1. Copy locales/en.json to locales/`<code>`.json (for example cs.json or de.json).
2. Translate values only. Keep keys and {placeholders} unchanged.
3. Include the new file in the plugin folder. Releases ship the locales/ directory.

English is required. Other locale files are optional. Result codes and generated vault markdown (entity notes, dashboard body) are not translated through this catalog.

Template field labels in `*_Fields.md` stay under your control in the vault (edit the label column).

### UI language vs note content

- Menus, notices, settings, and form chrome follow Obsidian’s language and `locales/*.json` (English fallback).
- Text already written into notes (entity bodies, resolved timeframes, dashboard stock phrases) is **not** rewritten when you change language.
- To refresh generated shells after label or language changes, edit/save entities or run Refresh dashboard / Refresh all timeframes. Mixed language in the vault is possible.

### Sharing a world with someone else

There is no export command yet. Hand off:

1. Compatible **plugin** version (release zip or BRAT).
2. The **world folder** (the folder that contains `_index.md`).
3. The **template set folder** named in that world’s `template_set` field (under `_system/templates/`).

Recipient: place both in the vault, enable the plugin, reassign the template set in settings if needed, set the world active if desired.

Do not send only the world folder — without the matching template set, create/edit/sync/dashboard will refuse to run.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) — also published to the project
[Wiki](../../wiki), kept in sync automatically. Not duplicated here, so
there's exactly one place this ever needs updating.

## Requirements

- Obsidian v1.13.0 or later (check 'manifest.json' for the exact minimum)
- Desktop only (Windows, macOS, Linux)
