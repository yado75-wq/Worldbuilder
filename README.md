# WorldBuilder Tools for Obsidian

A worldbuilding plugin for [Obsidian](https://obsidian.md) designed to simulate the core functionality of tools like World Anvil and Chronicler — directly inside your vault, with no external dependencies.

## Features

- **World management** — create worlds with templated folder structures, switch between active worlds, sync folders as your template evolves
- **Entity creation** — create Characters, Locations, Factions, and any custom entity type via a clean form UI, directly from the right-click menu
- **Template-driven** — all entity fields, folder rules, and world structure defined in plain markdown files you can edit freely
- **Template set management** — create, clone, reset, assign to a world, and set a default template set from the plugin settings tab
- **Dashboard** — auto-generated world dashboard with entity counts, world meta, TODO tracking, and a protected Notes section that survives refresh
- **World meta** — structured world bible (genre, tone, themes, premise, conflict etc.) editable via form
- **File sync** — move misplaced entity files to their correct folders based on their tags
- **Context-aware menus** — right-click commands appear only where they make sense

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
| `type` | `text` \| `link:FolderName` \| `link:Primary>Fallback` \| `select:A,B,C` |
| `display` | `title` \| `property` \| `section` |

### Folder rules format

```text
- EntityType | TargetFolder
```

Use `*` as target folder to allow placement anywhere (e.g. `Generic | *`).

## Right-click commands

| Context | Commands |
| ------- | -------- |
| Vault root or non-world folder | New world |
| Template set folder | Set as default template set |
| World root folder | Edit world meta, Refresh dashboard, Sync world folders, Sync world files, Switch to this world |
| Entity folder | New `<entity type>`, New generic |
| Entity file | Edit `<entity type>` |
| `_index.md` | Edit world meta, Refresh dashboard |

## Installation

### Manual install

1. Download `main.js`, `styles.css`, `manifest.json` from the latest release
2. Copy to your vault: `.obsidian/plugins/WorldBuilder/`
3. Enable the plugin in Obsidian settings → Community plugins

### Development

```bash
git clone https://github.com/yado75-wq/Worldbuilder
cd Worldbuilder
npm install
npm run dev
```

Requires Node.js v18+.

## First run

On first load the plugin creates `_system/templates/defaults/` in your vault with the default template set. This is your starting point — copy it, rename the copy, and customize freely. The `defaults/` folder is restored from plugin built-ins if deleted.

## Releasing

- Bump the version in manifest.json and package.json.
- Update versions.json so the new version maps to the minimum Obsidian version.
- Run `npm run build` to produce the release artifacts.
- Create a Git tag matching the manifest version, for example `1.0.1`, and push it to GitHub.
- The existing GitHub Actions workflow will create a draft release with `main.js`, `manifest.json`, and `styles.css`.

## Customization

- **Add entity types** — create a new `_Fields.md` file and add a line to `folder-rules.md`. No code changes needed.
- **Translate labels** — edit any `_Fields.md` file, change the label column to your language
- **Change world structure** — edit `world-template.md` to add or remove subfolders, then use Sync world folders on existing worlds
- **Multiple template sets** — create different sets for different genres (fantasy, sci-fi, horror) via plugin settings
- **Manage template sets** — in the plugin settings tab you can create a new set, clone an existing one, assign a set to a specific world, reset a set to plugin defaults, or mark one as the default for new worlds

## Roadmap

- Timeline system (epoch entities, equipment lifespan, era-aware creation)
- Sub-dashboards per entity type
- Relationship wizard
- Template set localization

## Requirements

- Obsidian v1.6.6 or later
- Desktop only (Windows, macOS, Linux)
