# Obsidian community plugin

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- ESLint is preconfigured with `eslint-plugin-obsidianmd` for Obsidian-specific rules.
- Run `npm run lint` to lint the project.
- A GitHub Action automatically lints every commit on all branches.

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Example file structure**:

    ```
    src/
      main.ts           # Plugin entry point, lifecycle management
      settings.ts       # Settings interface and defaults
      commands/         # Command implementations
        command1.ts
        command2.ts
      ui/              # UI components, modals, views
        modal.ts
        view.ts
      utils/           # Utility functions, helpers
        helpers.ts
        constants.ts
      types.ts         # TypeScript interfaces and types
    ```

- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

## World Builder Tools

### Project

- This is an Obsidian desktop community plugin.
- Source is TypeScript under `src/`; `src/main.ts` is bundled to the root `main.js` by esbuild.
- The plugin is local-first: it reads and writes the current vault and makes no network calls at runtime.
- The stable plugin ID is `world-builder-tools`. Do not change it.

### Commands

Use npm from the repository root:

```text
npm install
npm test              # Vitest suite
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
npm run build         # typecheck plus production esbuild bundle
npm run dev           # esbuild watch mode
npm run check-id      # check the manifest ID against the community registry
```

Run `npm test`, `npm run typecheck`, and `npm run lint` after code changes. Keep tests focused on the changed behavior; the suite uses Vitest and in-memory Obsidian fakes rather than a real Obsidian window.

### Source layout

- `src/main.ts`: plugin lifecycle, settings/state initialization, vault listeners, ribbon status menu.
- `src/settings.ts`: settings tab and template-set/world actions.
- `src/state/`: vault scanning and template-file parsing.
- `src/context/`: context resolution, menu construction, active-world and template-set guards.
- `src/commands/`: user actions such as create/edit, world management, dashboard refresh, and sync.
- `src/commands/shared/`: content builders, link/timeframe helpers, and command-level reusable logic.
- `src/time/`: timeframe syntax, widget state, and resolution.
- `src/ui/`: Obsidian modals and form controls.
- `src/types/`: shared runtime, world, template-set, field, and folder-rule types.
- `tests/`: command and pure-logic tests; `tests/fakes/` contains the test-only Obsidian implementation.
- `defaults/`: built-in markdown templates copied into the vault on first load.
- `docs/`: design, roadmap, robustness, and manual-testing documentation.

Keep `src/main.ts` focused on lifecycle wiring. Put behavior in the owning command, context, state, time, or UI module. Avoid adding broad utility abstractions for one call site.

### Data and behavior invariants

- A world is a non-underscore folder containing a tagged `_index.md`.
- Exactly one managed world should have `status: active`; zero or multiple active worlds are a conflict. World-changing commands must preserve the existing conflict guards.
- A world resolves its template set by the exact `template_set` name. Do not silently substitute another set for a world-bound operation.
- An entity type is usable only when its field set exists and has exactly one `title` field. Menus and commands should use the shared usability predicate.
- Generated files must preserve content below the protected-section marker. Do not overwrite user-authored notes during dashboard or entity refreshes.
- User-facing failures return structured result codes where the command already has a result type, and may also show an Obsidian `Notice`.
- Use Obsidian `fileManager` operations when they preserve links or trash preferences; do not bypass them with raw filesystem APIs.

### Editing conventions

- Match the existing TypeScript style and strict compiler settings in `tsconfig.json`.
- Prefer explicit types and `async`/`await`; avoid `any`, non-null assertions, and casts unless the Obsidian API boundary requires one.
- Register workspace, vault, DOM, and interval listeners through the plugin `register*` helpers so unload cleans them up.
- Keep notices and settings copy short, sentence-cased, and actionable. Do not expose implementation details in normal user-facing text.
- Use Obsidian DOM helpers and CSS classes in `styles.css`; do not assign inline styles when a class can express the state.
- Do not add network access, telemetry, remote code loading, or writes outside the vault without an explicit product requirement and documentation.
- Do not edit `main.js` by hand. It is a generated bundle and is ignored by Git. The release workflow creates the install package from `main.js`, `manifest.json`, `styles.css`, and `defaults/`.

### Tests

For new behavior, add a focused test for the decision or file outcome. Cover refusal paths as well as successful paths when a command can write, rename, or modify vault content. Avoid asserting only incidental prose when a structured result or exact generated section can be checked.

UI layout, focus, and real context-menu behavior remain manual checks in Obsidian. Update the relevant short guide under `docs/manual/` when a change adds a non-automatable workflow.

### Versioning and releases

- Keep the version in `manifest.json`, `package.json`, and `versions.json` aligned. `versions.json` maps each plugin version to its minimum Obsidian version.
- Use semantic versions and tag releases with the exact manifest version, without a leading `v`.
- Release packaging is defined in `.github/workflows/release.yml`; do not hand-edit generated contents under `release/`.
- Before a release, run `npm run build`, `npm test`, and `npm run lint`, then verify the package contains `main.js`, `manifest.json`, `styles.css` when present, and `defaults/`.

### Safety checklist

- Do not rename the plugin ID or existing command IDs.
- Do not overwrite user template files unless the command explicitly means reset and the user has confirmed it.
- Do not fall back from a missing world template set to an unrelated set.
- Do not remove protected sections or user-authored vault content during regeneration.
- Do not commit `node_modules/`, root `main.js`, `data.json`, sourcemaps, or local AI/session context files.
- Add commands with stable IDs (don't rename once released).
