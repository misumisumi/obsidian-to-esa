# Copilot Instructions for obsidian-to-esa

## Build, test, and lint

```bash
npm install        # Install dependencies
npm run dev        # Watch mode (esbuild, auto-rebuilds on changes)
npm run build      # Production build: tsc type-check + esbuild minified
npm run lint       # ESLint (uses eslint-plugin-obsidianmd)
```

GitHub Actions automatically runs `npm run build` and `npm run lint` on every push/PR across Node 20.x/22.x/24.x.

There is no test framework — validation is manual via lint + type-check + Obsidian reload.

## Architecture

This is an Obsidian community plugin. Source TypeScript (`src/`) is bundled by **esbuild** into a single `main.js` file loaded by Obsidian.

- **`src/main.ts`** — Plugin entry point. Keep minimal: handle lifecycle (`onload`, `onunload`), register commands (`this.addCommand`), register settings tab (`this.addSettingTab`), and set up listeners with `this.register*` helpers.
- **`src/settings.ts`** — Settings interface, `DEFAULT_SETTINGS` object, and `PluginSettingTab` subclass.
- **`src/commands/`** — Command implementations (each file exports a function, imported by a central `registerCommands`).
- **`src/ui/`** — Modals, views, UI components.
- **`src/utils/`** — Helper functions and constants.

esbuild marks Obsidian/CodeMirror/Lezer/Electron modules as **external** (not bundled). Only `main.js` is loaded at runtime — all features must be bundled into this single file.

## Key conventions

### Settings pattern
```ts
interface MyPluginSettings { mySetting: string }
const DEFAULT_SETTINGS: MyPluginSettings = { mySetting: 'default' };

// In Plugin subclass:
async loadSettings() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}
async saveSettings() {
  await this.saveData(this.settings);
}
```

### Commands
- Use stable command IDs (never rename after release).
- Use `editorCallback` for commands that need the active editor, `checkCallback` for context-dependent visibility, and `callback` for simple commands.

### Listener cleanup
Always use `this.registerEvent()`, `this.registerDomEvent()`, and `this.registerInterval()` so listeners are cleaned up automatically on plugin unload. Never manage cleanup manually.

### Formatting
- **Tab indentation** (width 4), single quotes, UTF-8, LF line endings.
- TypeScript with `strict: true`.

### Style
- Prefer sentence case for headings, buttons, and titles.
- Use **bold** for UI labels, arrow notation for navigation paths (e.g., **Settings → Community plugins**).

### Release process
1. Update `minAppVersion` in `manifest.json` if using newer APIs.
2. Run `npm version patch|minor|major` to bump version (updates `manifest.json`, `package.json`, and `versions.json`).
3. Push and create a GitHub release with tag matching the version **without `v` prefix**.
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.

### Manual testing
Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/<plugin-id>/`, then reload Obsidian and enable via **Settings → Community plugins**.

### Mobile
Set `isDesktopOnly: false` in `manifest.json` unless using Node/Electron APIs. Avoid large in-memory structures.

### Security
- Default to local/offline operation. Network requests require explicit user-facing justification and opt-in.
- No hidden telemetry, no remote code execution, no auto-updating outside releases.
- Read/write only what's necessary inside the vault.
