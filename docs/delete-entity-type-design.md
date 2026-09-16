# Delete entity type — design

Status: **approved for implementation** (2026-09-15)  
Related: rename entity type (shipped), world/set audit (shipped), honest menus / usable types.

---

## Problem

Users need a controlled way to remove an entity **type definition** (`Type_Fields.md`) from a template set without:

- silently destroying notes,
- breaking the “catalog / rulebook” workflow, or
- leaving folder-rules and link tokens in a confusing state with no guidance.

Hand-deleting only the fields file is possible but does not clean rules/tokens and does not explain runtime behaviour.

---

## Product intent

### Authoring vs catalog

| Concept | Meaning |
| --- | --- |
| **Type definition** | `Type_Fields.md` — form schema, New/Edit, hot-create |
| **Type instances** | Notes tagged with that type (lowercase tag) under worlds bound to the set |

Removing the definition **stops manufacturing** (no New / Edit / hot-create).  
Instances **remain entities** for linking, sync-by-tag, and audit.

**Library / rulebook scenario (e.g. Shadowrun, AD&D equipment):**  
A set (or kit) ships many pre-built, balanced items. Adventure authors **pick** via `link:` / `multiselect:link:`; they should not need (or may be discouraged from) hot-create. That state is exactly:

- no `Type_Fields.md` (or type not usable),
- notes still tagged and linkable.

Delete-entity-type is how an existing authoring type **becomes** a catalog type. Kits may also ship catalog types from day one (never include fields for that type).

### What delete must not do (v1)

- Delete or rename note files  
- Strip type tags from notes (would remove notes from plugin handling permanently — **unwanted**)  
- Retag to Generic  
- Delete **WorldMeta**  
- Auto-full-cleanup when instances exist  

---

## Preconditions

- Template set exists and is live (not `_`-archived).  
- `Type_Fields.md` exists for the chosen stem.  
- Type is **not** WorldMeta (case-insensitive) → `reserved-type`.  
- **Generic may be deleted.** If the set is `defaults`, warn that ensure-defaults / next load **may restore** `Generic_Fields.md` from plugin built-ins. On non-default sets, delete is permanent until Reset or manual copy.

---

## Runtime requirements (beyond the command)

These are required for the library scenario to work; implement or verify **with** delete.

| Behaviour | Rule |
| --- | --- |
| Honest menus | No fields / not usable → no **New** / **Edit** for that type |
| Hot-create | Only when type is usable (fields + title) — already; remains false without fields |
| **Link / multiselect:link candidates** | Resolve by **tag / existing notes**, not only by presence in `fieldSets`. Missing fields file + existing tagged notes → candidates still listed; empty if no notes |
| File sync | Still uses tags; catalog notes keep placement rules if folder-rules line kept |

If candidates currently disappear when a type leaves `fieldSets`, fix that as part of this work.

---

## Preflight (read-only impact)

Before confirm, compute for the set + bound worlds:

| Signal | Meaning |
| --- | --- |
| `instanceCount` | Notes under bound worlds tagged with this type (exclude `_` files, `_index`) |
| `hasFolderRule` | folder-rules line for this entity type |
| `inboundFieldFiles` | Other `*_Fields.md` in the set whose type cell references this type in `link:` / `multiselect:link:` chains |

---

## User choices (confirm UI)

```text
Delete entity type “{Type}” from set “{set}”

Instances in bound worlds: {n}
→ New / Edit / hot-create will stop.
→ Existing notes keep their tags and remain link targets (catalog).

folder-rules line: yes/no
Inbound link tokens: {k} field file(s)

[x] Delete {Type}_Fields.md              ← always on, not optional
[ ] Remove folder-rules line
[ ] Remove link tokens in other field files

[ Cancel ]  [ Delete ]
```

### Defaults for the two optional cleanups

**Same rule for folder-rules and link/multilink tokens:**

| `instanceCount` | Remove folder-rules line | Remove inbound link tokens |
| --- | --- | --- |
| **0** | Default **on** (full tidy) | Default **on** |
| **≥ 1** | Default **off** (ask) | Default **off** (ask) |

Rationale:

- No instances → nothing to pick in links; rule and tokens only create noise / audit noise.  
- Has instances → keep rule (placement) and tokens (authors still pick from catalog) unless the user opts out.

If set name is `defaults` and type is Generic, add a short warning about possible restore on ensure-defaults.

---

## Write order (after confirm)

1. **Delete** `{setPath}/{Type}_Fields.md`.  
2. If requested: **rewrite folder-rules** — remove lines whose entity column equals Type (folder column irrelevant).  
3. If requested: **strip type segments** from `link:` / `multiselect:link:` chains in other field files in the set (reuse pure helpers; do not touch key/label text).  
4. `refreshState` / settings `update`.  
5. Notice with summary (deleted; rules cleaned yes/no; tokens cleaned yes/no; instance count left in vault).

No note body/tag writes in v1.

---

## Result codes (sketch)

```ts
type DeleteEntityTypeResult =
  | {
      ok: true;
      type: string;
      setName: string;
      instancesRemaining: number;
      removedFolderRule: boolean;
      cleanedLinkTokens: boolean;
    }
  | {
      ok: false;
      code:
        | 'set-not-found'
        | 'type-not-found'
        | 'reserved-type' // WorldMeta
        | 'cancelled'
        | 'folder-missing';
    };
```

---

## UX placement

- **Settings → Template sets → Manage → Delete entity type…** (near Rename).  
- Not in file-tree menus for v1 (templates are settings-managed).  
- Confirm modal with impact + checkboxes as above.

---

## Interaction with audit

After delete with instances remaining:

- **World audit** may report missing fields / orphan-style or drift messages for that tag — expected for catalog types until the user restores fields or accepts catalog-only.  
- **Set audit** may report missing link targets only if tokens were kept and fields are gone — expected; cleaning tokens removes that noise.

Audit remains report-only; delete does not auto-fix audit issues beyond the optional cleanups above.

---

## Testing

| Layer | Cases |
| --- | --- |
| Pure | Remove folder-rules line; strip type from link chains; leave unrelated lines |
| Command | WorldMeta blocked; cancel; zero instances → both cleanups default applied when confirmed; with instances → fields gone, tags intact, optional cleanups respected |
| Link candidates | Type without fields file still lists tagged notes as candidates |
| Regression | Honest menus hide New/Edit; hot-create absent |

Manual:

1. Catalog path: delete type with N notes → cannot New; can still link from another type’s form.  
2. Full tidy: delete type with 0 notes → no rules line, no inbound tokens.  
3. Generic on `defaults` → warning; on clone set → stays gone after reload.

---

## Docs (README one-liner)

- **Delete entity type** removes the fields file (no New/Edit/hot-create). Notes keep tags and stay linkable. Optional cleanup of folder-rules and link tokens follows whether instances exist. Prefer this over hand-deleting only `*_Fields.md`.

---

## Implementation order

1. Verify/fix **link candidates without fieldSets entry** (tag-based).  
2. Pure helpers + unit tests (rules remove, token strip — may extend `entityTypeRewrite.ts`).  
3. `DeleteEntityTypeCommand` + tests.  
4. Settings Manage entry + `en.json`.  
5. README / ROADMAP: delete shipped; library behaviour documented.

---

## Out of scope (later)

- Delete entity **notes** bulk  
- Strip tags / convert to Generic  
- File-tree delete type  
- “Mark type as catalog-only” without deleting fields (soft flag) — not needed if missing fields already means no authoring  
- Changing ensure-defaults so Generic is never re-seeded into `defaults`  
ENDOFFILE
