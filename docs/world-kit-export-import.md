# Design: World kit export / import

**Status:** design  
**Last updated:** 2026-09-07  
**Related:** `docs/next-release-consistency-sharing.md` (S3 — share world with a friend)

## Intent

Let a user package one world + its exact template set into a single **zip kit**, and let another vault import that kit with clear conflict rules. Plugin owns file pickers; the user should not have to manually stage files in the vault for the feature to work.

## Non-goals

- Export multiple worlds in one kit
- Cloud sync / share links
- Overwriting an existing template set without an explicit choice
- Translating note content as part of import
- Mobile support (plugin remains desktop-only)

## UX

### Settings — Active world group

| Control | Placement | Behavior |
| --- | --- | --- |
| **`+` button** | Group level (near “Active world” heading) | Opens a `Menu` |
| Menu: **New world** | | Existing `newWorld` (vault root parent unless we add path later) |
| Menu: **Import world** | | Open-file dialog → import flow |
| **Export world** | Per-world **Actions** menu | Export that world to zip |

Optional later: file-explorer right-click on world folder → **Export world** (same command).

### i18n keys (suggested)

```text
menu.import-world
menu.export-world
```

Reuse `menu.new-world` for the `+` menu entry.

## Kit format

### Container

- **Zip** (JSZip or equivalent), not a loose folder kit as the primary format.
- Familiar for sharing; one file for handoff.

### Internal layout

```text
worldbuilder-kit.json     # manifest (required)
world/                    # full world folder tree (contents of the world root)
template-set/             # full template set folder tree
```

Paths inside the zip are relative to the archive root. The world folder’s **name** and template set **name** live in the manifest (and are reflected by how we re-create folders on import).

### Manifest (`worldbuilder-kit.json`)

```json
{
  "formatVersion": 1,
  "pluginId": "world-builder-tools",
  "exportedAt": "ISO-8601",
  "worldFolderName": "michal",
  "templateSetName": "Michal",
  "pluginVersion": "optional-semver"
}
```

- **formatVersion** — reject or migrate unknown major versions with a clear Notice.
- **pluginId** — must match; refuse foreign zips.
- World display name in `_index.md` may differ from folder name; folder name in the kit is `worldFolderName`.

## Export

### Inputs

- `app`, `state`, `worldPath` (and settings if needed for `_system/exports`)

### Steps

1. Resolve world; fail if missing.
2. Resolve template set by **exact** `world.templateSet` name; fail if missing (same as other commands — no silent fallback).
3. Build zip:
   - Write manifest.
   - Copy all files under the world folder into `world/…` (preserve relative paths).
   - Copy all files under the template set folder into `template-set/…`.
4. Save zip:
   - Prefer **system save dialog** with suggested name `{worldFolderName}-worldbuilder-kit.zip`.
   - Suggested directory: `_system/exports/` when the environment allows a default path.
   - Fallback: write into vault at `_system/exports/{name}.zip` (create folder on demand) and Notice the path.
5. Result code + Notice.

### Guarantees

- Export never changes vault world/set content.
- Leading-`_` identity rules unchanged (export is read-only).

## Import

### Inputs

- User picks a `.zip` via **system open dialog** (not required to live in the vault).
- Optional: also allow a vault path for tests / power users.

### Preferred folders (defaults only)

| Path | Role |
| --- | --- |
| `_system/exports/` | Default/suggested export location |
| `_system/imports/` | Optional; may store a copy of a zip if we ever want an audit trail — **not** required for import |

User chooses real paths via dialogs whenever possible.

### Steps

1. Read zip → parse `worldbuilder-kit.json`; validate `formatVersion` / `pluginId`.
2. **Template set**
   - If `templateSetName` **not** in live registry → create `_system/templates/{templateSetName}/` from `template-set/`.
   - If **exists** → prompt:
     - **Use existing** — do not copy set files; bind world to existing name.
     - **Import as new name** — ask name (reject leading `_`, empty, conflict); copy into new folder; set world’s `template_set` to that name.
     - **Cancel** — abort entire import.
   - Never silent overwrite of an existing set.
3. **World folder**
   - Target parent: vault root (v1) unless we add a parent picker later.
   - Desired name = `worldFolderName`.
   - If free → use it.
   - If taken → unique name, Obsidian-style, e.g. `{name} (imported)`, then `{name} 2`, `{name} 3`, …
   - Copy `world/…` into that folder.
   - Ensure `_index.md` exists; set `status: inactive`; set `template_set` to the resolved set name; align `name` / heading with final folder name when we uniquified.
4. `refreshState`; Notice success with final world path and set name.

### World name clash (locked)

```text
michal           → try first
michal (imported) → if taken
michal 2, michal 3, … → until free
```

(Exact suffix string can match Obsidian’s duplicate phrasing used on the platform; implement one `allocateUniqueFolderName` helper.)

### Template set clash (locked)

Ask: **reuse existing** vs **import under new name**. No silent overwrite.

## Validation / consistency

- New folder/set names: existing **leading `_` reject** rules apply.
- Imported world is always **inactive** (avoid active-world conflict).
- Exact template-set binding preserved (world points at the set name actually used).
- Result codes for tests (no asserts on Notice text), e.g.:

```text
export: ok | world-not-found | missing-template-set | cancelled | write-failed
import: ok | invalid-kit | cancelled | leading-underscore | write-failed | …
```

## Implementation sketch

```text
src/commands/ExportWorldCommand.ts
src/commands/ImportWorldCommand.ts
src/util/uniqueFolderName.ts    # world path allocation
src/util/worldKitZip.ts         # pack/unpack + manifest (optional split)
```

Wire:

- `settings.ts` — `+` menu (new world, import); Actions → export  
- Optional: `MenuBuilder.ts` — export on world folder  

Dependency: **jszip** (or chosen zip library), desktop only.

## Tests

- Pack/unpack manifest round-trip (pure where possible).
- Unique folder name allocation.
- Import: missing set → created; existing set → branch (mock choice).
- Import: world name collision → `(imported)` / numbered suffix.
- Export fails when template set missing from registry.
- Leading `_` rejected for “import as new set name”.

## Manual checklist

- [ ] Export active/inactive world; open zip; confirm manifest + both trees  
- [ ] Import into empty vault area; world inactive; set present  
- [ ] Import when set name exists — use existing vs new name  
- [ ] Import when world folder exists — unique name  
- [ ] `+` → New world still works  
- [ ] Actions → Export  
- [ ] Friend-style handoff: export on A, import on B (or second folder)

## Open implementation details (non-blocking)

1. Exact Obsidian duplicate suffix strings for the current desktop build.  
2. Save-dialog vs vault fallback for export on each OS.  
3. Whether `_system/imports` is used at all in v1 (can stay unused).

## Success metrics

- Share path is one zip, no tribal “copy two folders” knowledge required.  
- Template set never overwritten silently.  
- User is not forced to place the zip in the vault before import.
