# Rename template set — design

Status: **approved for implementation** (2026-09-17)  
Related: exact template-set binding, template-set archive (`_`), clone template set, delete/rename entity type, world kit export.

---

## Problem

A template set’s **id is its folder name** under `_system/templates/`. Worlds and `defaultTemplateSet` store that string.

Hand-renaming the folder in the file explorer orphans every world still pointing at the old name. The plugin already refuses silent fallback; users must re-assign. A controlled **Rename template set** command should move the folder and let the user choose which world bindings follow.

A second product problem: users often evolve one set while older worlds should stay on an older schema. **Rename cannot freeze content** — it only changes the folder identity. Freezing finished campaigns is **clone** (or archive), not rename.

---

## Goals

1. Live → live rename via Settings, with explicit world multi-select for who gets `template_set` updated.  
2. Live → `_…` rename = archive path (same as hand-rename): folder only, **no** world updates, clear warning.  
3. Update `defaultTemplateSet` when it matched the old name (live → live only, or fallback when archiving).  
4. Never rewrite entity tags, field stems, or world folder names.  
5. Surface “prefer clone” when the user may want divergent schemas for finished vs active work.

## Non-goals (v1)

- Rename from an archived (`_`) set in Settings (archived sets are not listed).  
- Unarchive command.  
- Merging into an existing target folder name.  
- Automatic clone-before-rename wizard (hint/copy only).  
- File-tree context menu entry (Settings Manage only unless added later).

---

## Preconditions

- Set appears in Settings (live scan: name does not start with `_`).  
- Source folder exists under `systemFolder/templatesFolder`.  
- New name: non-empty after trim.  

---

## Two paths

### A. Live → live (new name does **not** start with `_`)

1. Validate new name (see gates).  
2. Show confirm UI (below).  
3. `vault.rename` set folder to new path.  
4. For each **selected** world: rewrite `template_set` on `_index.md` from old → new.  
5. Unselected worlds: leave `template_set` unchanged → they reference a **missing** set after rename (orphan until Assign).  
6. If `settings.defaultTemplateSet === oldName` → set to `newName`, `saveSettings`.  
7. `refreshState` / settings `update`.  
8. Success notice with counts (worlds updated / left pointing at old name).

### B. Live → archive (new name **starts with** `_`)

Matches hand-rename outside the plugin:

1. Confirm with **warning only** (no world checklist): folder will be ignored; **no** worlds will be updated; they will look for the old live name and appear orphaned.  
2. `vault.rename` only.  
3. If `defaultTemplateSet === oldName` → fall back to a live set (prefer `defaults` if present), same policy as existing archive scan + Notice.  
4. Do **not** rewrite any world’s `template_set`.  
5. `refreshState`.

---

## UX

### Entry

Settings → template set row → **Manage → Rename template set…**

### Name prompt

- Prefill current set name.  
- Reject empty / whitespace.  
- Leading `_` routes to path B (after confirm).

### Confirm — path A (live → live)

```text
Rename template set “{old}” → “{new}”

This renames the template folder. Schema content moves with the folder.

If finished worlds should keep an older schema, Cancel and use
Manage → Clone first, then assign worlds as needed.

Worlds currently using “{old}”:
[x] {world name}  {★ if active}   {path}
[x] …
[ ] …

Checked worlds get template_set updated to “{new}”.
Unchecked worlds keep “{old}” and will show a missing template set
until you Assign or fix _index.md.

[ Cancel ]  [ Rename ]
```

Default: **all worlds checked**.

Optional one-liner if `old === 'defaults'`: built-ins may recreate a new `defaults` folder on a later ensure/load.

### Confirm — path B (archive)

```text
Rename “{old}” → “{new}” (archive)

Sets whose names start with “_” are ignored by the plugin.
No world template_set fields will be changed. Worlds still pointing
at “{old}” will be orphaned until reassigned.

[ Cancel ]  [ Archive / Rename ]
```

### Mentinel (clone first)

Do **not** auto-clone. Confirm copy is the mantinel:

- Rename = move identity.  
- Divergent / frozen campaigns = **Clone**, then rename or archive the copy you no longer need.

---

## Validation / result codes

```ts
type RenameTemplateSetResult =
  | {
      ok: true;
      oldName: string;
      newName: string;
      archived: boolean;
      worldsUpdated: number;
      worldsLeftOnOldName: number;
    }
  | {
      ok: false;
      code:
        | 'set-not-found'
        | 'folder-missing'
        | 'invalid-name'
        | 'new-exists'
        | 'cancelled'
        | 'rename-failed';
    };
```

| Gate | Code |
| --- | --- |
| Set not in live `state.templateSets` | `set-not-found` |
| Source folder missing | `folder-missing` |
| Empty new name | `invalid-name` |
| Target path already exists | `new-exists` |
| User cancels | `cancelled` |
| `vault.rename` throws | `rename-failed` |

Same-name (trim equal): treat as cancel or no-op success without writes.

**Case-only rename** (e.g. `Fantasy` → `fantasy` on a case-insensitive FS): if a direct rename is a no-op or conflicts, use two-step rename via a temporary sibling name; if that fails, `rename-failed` with notice.

---

## World frontmatter update

Reuse the same approach as **Assign to world** (regex/`template_set:` line in YAML). Only selected worlds. Do not invent `template_set` on files that lack frontmatter world shape unless Assign already does.

---

## Interaction with existing behavior

| Feature | Interaction |
| --- | --- |
| Exact binding | Unselected / archive path → missing set; commands already refuse with clear notice |
| Archive scan | `_` sets absent from Settings; rename-from-archive N/A |
| Clone template set | Documented alternative when schemas should diverge |
| Ensure defaults | Renaming away from `defaults` may allow recreation of a new `defaults` folder later — warn in confirm |
| Entity type rename/delete | Unaffected (operate inside set path after folder rename, path follows) |
| World kit export | Uses current set name/path after successful rename + refresh |

---

## Testing

| Layer | Cases |
| --- | --- |
| Command | Live→live updates only selected worlds; unselected keep old string; default setting updated when matched |
| Archive | `_` prefix → no world writes; set disappears from live list |
| Gates | `new-exists`, empty name, missing folder, cancel |
| Case-only | If feasible under FakeVault / documented limitation |

Manual:

1. Two worlds on one set → rename, uncheck one → one bound, one missing-set.  
2. Rename to `_foo` → both still say old name; set gone from list.  
3. Clone set, assign active, rename clone — finished world untouched on original name.

---

## Docs (README one-liners)

- **Rename template set** — Settings → Manage; choose which worlds follow the new name.  
- Finished campaigns that must not pick up schema changes: **Clone** the set (or archive a copy), do not rely on rename to keep old content under the old name.  
- Rename to `_…` archives the set; worlds are not updated (same as hand-rename).

---

## Implementation order

1. Pure/helper: apply `template_set` replacement on index content (or share Assign helper).  
2. `RenameTemplateSetCommand` + tests.  
3. Settings Manage entry + confirm UI (checklist for path A).  
4. `en.json` keys.  
5. README / ROADMAP / release notes when shipping.

---

## Open decisions (locked)

| Topic | Decision |
| --- | --- |
| World selection | Multi-select; default all checked |
| Leading `_` new name | Archive path; no world updates; warning |
| Archived sets in UI | Not listed → cannot rename from Settings |
| Clone first | Hint in confirm only, no forced wizard |
| `defaults` | Allowed with short warn about possible recreate |

---

## Out of scope / later

- Richer “clone then reassign” guided flow  
- File-explorer Rename on template folder  
- Catalog-aware audit copy for orphans after partial rename  
ENDOFFILE
