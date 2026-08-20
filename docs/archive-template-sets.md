# Plan: resilient template-set resolution

*For next session — design only, no implementation today.*

---

## Problem

Worlds store `template_set: <folder name>`. Users can rename/delete that folder in the vault. Today scan/commands often do `find(name) ?? templateSets[0]`, which can apply **the wrong set** with little or no feedback.

## Goal

- **Detect** missing / unusable template set references.  
- **Never** silently substitute another set on **write** paths.  
- **Surface** problems in settings; commands **Notice + return**.  
- Keep behaviour consistent across create/edit/meta/menus.  
- Optional later: `_` archive as UI convention only.

---

## Product rules

| Situation | Behaviour |
| --- | --- |
| Name matches a loaded set, `isValid` | Use it |
| Name matches set with errors | Prefer **refuse writes** that need fields (or only allow if per-type still usable — decide in implementation); settings already ✗ |
| Name **not** in loaded sets | **Missing** — no silent `[0]` |
| No template sets in vault at all | Notice; only recovery is restore defaults / setup |
| Default set name missing | Keep current idea: fall back default **setting** + Notice (settings config, not a world’s pointer) |

**Writes** (create/edit entity, edit meta, refresh timeframes, anything that reads `fieldSets`): require **exact** resolve → else Notice, no write.

**Reads** (dashboard lists, etc.): same hard fail unless we explicitly document a soft path (default: hard fail).

---

## Technical design

1. **`resolveTemplateSet(state, name): Result`**
   - `ok + set`
   - `missing`
   - optionally `invalid` (found but `!isValid`) if we want one enum for all callers  

2. **`findWorlds` / scan**  
   - Store `world.templateSet` as the **frontmatter string** (always).  
   - Do **not** attach another set’s `folderRules` under a false name.  
   - Either leave rules empty when missing, or attach only when resolve ok.

3. **Settings**  
   - Per world: if resolve missing → desc or badge: references unknown template set `"Y"`.  
   - Severity: **warning** (world still “exists”; user must reassign).  

4. **Commands**  
   - Replace `find(…) ?? [0]` with `resolveTemplateSet`.  
   - Shared Notice text, e.g. `Template set "Y" not found for this world. Reassign in settings or restore the folder.`

5. **Menus**  
   - If set missing, type usable checks fail → no New/Edit (honest).  
   - Optionally omit world tools that need the set (or rely on command guard).

6. **`_` archive (phase 2)**  
   - Only after resolver exists.  
   - Soft load vs hide-from-picker — separate decision.

---

## Files (likely)

| Area | Path |
| --- | --- |
| Helper | `src/context/TemplateSetResolve.ts` (or under `state/`) |
| Scan | `WorldState.ts` |
| Commands | Create/Edit entity, EditWorldMeta, others using `world.templateSet` |
| Settings | world row desc / issues |
| Tests | resolve helper + one command missing-set Notice |

---

## DoD

- [ ] No write path uses silent `[0]` when name is missing  
- [ ] Settings shows world → missing set  
- [ ] create/edit with missing set → Notice, no file change  
- [ ] Unit tests for resolve + one command  
- [ ] Manual: rename set folder under user → world shows warning; fix frontmatter or rename back → recovery  
- [ ] Robustness doc short section updated  

---

## Out of scope for that slice

- Auto-rewriting frontmatter on rename  
- Blocking Obsidian renames  
- Full template-set `_` product (phase 2)

---

## Session note

Enough for a full next session: helper + scan + commands + settings + tests. Picker search / hot-create stay later.

Park here for today if you want; start next time with `resolveTemplateSet` tests first (TDD).
