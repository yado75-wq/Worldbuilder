import { App, getLanguage } from 'obsidian';

type Catalog = Record<string, string>;

let active: Catalog = {};
let english: Catalog = {};
let loaded = false;

/**
 * Load locale catalogs from the installed plugin's locales/ folder.
 * Call once from Plugin.onload before any t() usage.
 */
export async function loadI18n(app: App, pluginId: string): Promise<void> {
	const baseDir = `${app.vault.configDir}/plugins/${pluginId}/locales`;

	english = await readCatalog(app, `${baseDir}/en.json`);
	if (Object.keys(english).length === 0) {
		console.warn(
			`[world-builder-tools] locales/en.json missing or empty under ${baseDir}`
		);
	}

	const raw = getLanguage() || 'en';
	const base = raw.split('-')[0] ?? raw;

	let catalog: Catalog = {};
	if (raw !== 'en') {
		catalog = await readCatalog(app, `${baseDir}/${raw}.json`);
	}
	if (Object.keys(catalog).length === 0 && base !== 'en' && base !== raw) {
		catalog = await readCatalog(app, `${baseDir}/${base}.json`);
	}

	// Active = chosen locale overlay, English as structural fallback via t()
	active = Object.keys(catalog).length > 0 ? catalog : english;
	loaded = true;
}

/**
 * Translate a key. Falls back to English catalog, then to the key itself.
 * Placeholders: {name}, {type}, …
 */
export function t(key: string, vars?: Record<string, string | number>): string {
	if (!loaded) {
		// Dev safety: loadI18n not called yet
		console.warn(`[world-builder-tools] t() before loadI18n: ${key}`);
	}

	let s = active[key] ?? english[key] ?? key;

	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			s = s.split(`{${k}}`).join(String(v));
		}
	}

	return s;
}

/** Test helper: install a catalog without touching the filesystem. */
export function setCatalogForTests(catalog: Catalog, en: Catalog = catalog): void {
	active = catalog;
	english = en;
	loaded = true;
}

async function readCatalog(app: App, path: string): Promise<Catalog> {
	try {
		const exists = await app.vault.adapter.exists(path);
		if (!exists) return {};

		const raw = await app.vault.adapter.read(path);
		const parsed: unknown = JSON.parse(raw);

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			console.warn(`[world-builder-tools] Invalid locale JSON (not an object): ${path}`);
			return {};
		}

		const out: Catalog = {};
		for (const [k, v] of Object.entries(parsed)) {
			if (typeof v === 'string') out[k] = v;
		}
		return out;
	} catch (e) {
		console.warn(`[world-builder-tools] Failed to read locale: ${path}`, e);
		return {};
	}
}