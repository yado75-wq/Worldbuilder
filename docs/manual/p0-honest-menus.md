# Manual: P0 honest menus

Time: ~5–10 minutes.

## Setup

1. Vault with one world and template set that normally has Character.
2. Note a Characters (or equivalent) entity folder and one character note.

## Cases

### A — Empty fields ⇒ no New / Edit

1. Clear `Character_Fields.md` (empty file) or remove title line; reload plugin / refresh state.
2. Settings: template set should show invalid / no-title issue.
3. Right-click **Characters** folder → **New character** must **not** appear.
4. Right-click an existing character note → **Edit character** must **not** appear.
5. Restore valid `Character_Fields.md` with a title field; reload.
6. **New character** / **Edit character** appear again and open the form.

### B — Valid type still works

1. With valid Character fields, **New character** creates a note after Save with a name.
2. **Edit character** updates the note.

### C — Active-world conflict gate

1. Set two worlds to `status: active` (or use settings repair state).
2. Right-click world folder → Sync / Refresh dashboard / New (if any) → Notice about conflict; no action.
3. Right-click entity folder **New** / entity file **Edit** → same Notice; no modal.
4. Fix to one active world; actions work again.

## Pass criteria

- [ ] A: no hyping empty type
- [ ] B: happy path intact
- [ ] C: conflict blocks create/edit/meta/sync/dashboard/timeframes from menu
