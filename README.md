# WorldBuilder Tools for Obsidian

A worldbuilding plugin for [Obsidian](https://obsidian.md) designed to simulate the core functionality of World building tools like Chronicler — directly inside your vault, with no external dependencies.  Plugin does not enable any presentation functionality which other applications have and Obsidian does not. The core philosophy is that the user can complicate his life as much as he wants, we will hand him the tools to do it. Everything is based on Entities and Rules. User doesn't have to create folders via command, it's just easier if the user already knows the structure. User can add folder rules later when the structure is clear and there is a command to move entities to specified folders to keep vault clean. We try to add `Hot create` functionality to menus so the workflow would be as smooth as possible.

---

THIS PROJECT WAS CREATED USING AI - Claude and Grok.

These two failed so many times that it made me reconsider my view of project managers.

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
3. Ensure the plugin folder contains `main.js`, `manifest.json`, `styles.css` (if present), and the `defaults/` directory
4. Enable the plugin in Obsidian settings → Community plugins

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

## Releasing

- Bump the version in manifest.json and package.json.
- Update versions.json so the new version maps to the minimum Obsidian version.
- Run `npm run build` to produce the release artifacts.
- Create a Git tag matching the manifest version, for example `1.0.1`, and push it to GitHub.
- The existing GitHub Actions workflow will create a draft release containing a ready-to-install `worldbuilder.zip` archive.

## Customization

- **Add entity types** — create a new `_Fields.md` file and add a line to `folder-rules.md`. No code changes needed.
- **Translate labels** — edit any `_Fields.md` file, change the label column to your language
- **Change world structure** — edit `world-template.md` to add or remove subfolders, then use Sync world folders on existing worlds
- **Multiple template sets** — create different sets for different genres (fantasy, sci-fi, horror) via plugin settings
- **Manage template sets** — in the plugin settings tab you can create a new set, clone an existing one, assign a set to a specific world, reset a set to plugin defaults, or mark one as the default for new worlds

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) — also published to the project
[Wiki](../../wiki), kept in sync automatically. Not duplicated here, so
there's exactly one place this ever needs updating.

## Requirements

- Obsidian v1.13.0 or later (check 'manifest.json' for the exact minimum)
- Desktop only (Windows, macOS, Linux)
