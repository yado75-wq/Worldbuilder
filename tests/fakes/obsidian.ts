/* eslint-disable @typescript-eslint/require-await --
 * These methods mirror the real Obsidian Vault / FileManager API which returns Promises.
 * The implementations are synchronous because this is a lightweight in-memory fake;
 * real async work will appear when actual tests exercise them.
 */
import { installObsidianDomExtensions } from './dom-setup';

installObsidianDomExtensions();

// ── Files ────────────────────────────────────────────────────────────────

export class TAbstractFile {
	vault!: FakeVault;
	path: string;
	name: string;
	parent: TFolder | null = null;

	constructor(path: string) {
		this.path = path;
		this.name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
	}
}

export class TFile extends TAbstractFile {
	basename: string;
	extension: string;
	stat = { ctime: 0, mtime: 0, size: 0 };

	constructor(path: string) {
		super(path);
		const dot = this.name.lastIndexOf('.');
		this.basename = dot === -1 ? this.name : this.name.slice(0, dot);
		this.extension = dot === -1 ? '' : this.name.slice(dot + 1);
	}
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];

	isRoot(): boolean {
		return this.path === '/' || this.path === '';
	}
}

// ── Notices ──────────────────────────────────────────────────────────────

/** Test-visible log of every Notice shown — cleared per test via resetFakeObsidian(). */
export const FakeNoticeLog: string[] = [];

export class Notice {
	constructor(message: string) {
		FakeNoticeLog.push(message);
	}
}

export function resetFakeObsidian(): void {
	FakeNoticeLog.length = 0;
}

// ── Metadata / tags ──────────────────────────────────────────────────────

export interface FrontMatterCache {
	[key: string]: unknown;
}

export interface TagCache {
	tag: string;
}

export interface CachedMetadata {
	frontmatter?: FrontMatterCache;
	tags?: TagCache[];
}

/**
 * Matches the real getAllTags: combines frontmatter `tags` (normalized to
 * `#`-prefixed) with inline tag-cache entries, or null if there are none.
 */
export function getAllTags(cache: CachedMetadata): string[] | null {
	const result: string[] = [];
	const fm = cache.frontmatter?.['tags'];
	const norm = (t: string): string => (t.startsWith('#') ? t : `#${t}`);
	if (Array.isArray(fm)) {
		for (const t of fm) if (typeof t === 'string') result.push(norm(t));
	} else if (typeof fm === 'string') {
		result.push(norm(fm));
	}
	for (const t of cache.tags ?? []) result.push(t.tag);
	return result.length > 0 ? result : null;
}

// ── Vault ────────────────────────────────────────────────────────────────

interface StoredFile {
	file: TFile;
	content: string;
}

/**
 * Deliberately minimal frontmatter parser for test fixtures — handles
 * quoted/bare scalar values and simple `key:\n  - item` lists, which is
 * everything WorldBuilder's own generated content actually produces. Not a
 * general YAML parser; not meant to be one.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match?.[1]) return {};
	const result: Record<string, unknown> = {};
	const lines = match[1].split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (!kv) continue;
		const key = kv[1] ?? '';
		const rest = (kv[2] ?? '').trim();

		if (!rest) {
			const items: string[] = [];
			let j = i + 1;
			while (j < lines.length) {
				const itemLine = lines[j] ?? '';
				const itemMatch = itemLine.match(/^\s*-\s*(.*)$/);
				if (!itemMatch) break;
				items.push(stripQuotes(itemMatch[1] ?? ''));
				j++;
			}
			if (items.length > 0) {
				result[key] = items;
				i = j - 1;
				continue;
			}
		}

		result[key] = stripQuotes(rest);
	}

	return result;
}

function stripQuotes(v: string): string {
	const t = v.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
	return t;
}

export class FakeVault {
	private files = new Map<string, StoredFile>();
	private folders = new Map<string, TFolder>();
	adapter: FakeDataAdapter;

	constructor() {
		this.ensureFolder('');
		this.adapter = new FakeDataAdapter(this);
	}

	private ensureFolder(path: string): TFolder {
		const norm = path === '/' ? '' : path;
		let folder = this.folders.get(norm);
		if (folder) return folder;
		folder = new TFolder(norm);
		folder.vault = this;
		this.folders.set(norm, folder);
		if (norm !== '') {
			const parentPath = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : '';
			const parent = this.ensureFolder(parentPath);
			folder.parent = parent;
			if (!parent.children.includes(folder)) parent.children.push(folder);
		}
		return folder;
	}

	async create(path: string, data: string): Promise<TFile> {
		if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
		const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
		const parent = this.ensureFolder(parentPath);
		const file = new TFile(path);
		file.vault = this;
		file.parent = parent;
		parent.children.push(file);
		this.files.set(path, { file, content: data });
		return file;
	}

	async createFolder(path: string): Promise<TFolder> {
		return this.ensureFolder(path);
	}

	async read(file: TFile): Promise<string> {
		const stored = this.files.get(file.path);
		if (!stored) throw new Error(`File not found: ${file.path}`);
		return stored.content;
	}

	async modify(file: TFile, data: string): Promise<void> {
		const stored = this.files.get(file.path);
		if (!stored) throw new Error(`File not found: ${file.path}`);
		stored.content = data;
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.files.get(path)?.file ?? this.folders.get(path) ?? null;
	}

	getFiles(): TFile[] {
		return [...this.files.values()].map(f => f.file);
	}

	/** Test helper — not part of the real Vault API. Seeds a file directly, bypassing create()'s duplicate-path guard. */
	seedFile(path: string, content: string): TFile {
		const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
		const parent = this.ensureFolder(parentPath);
		const file = new TFile(path);
		file.vault = this;
		file.parent = parent;
		parent.children.push(file);
		this.files.set(path, { file, content });
		return file;
	}

	/** Test helper — not part of the real Vault API. Creates a folder (and any missing parents) without requiring a file inside it. */
	seedFolder(path: string): TFolder {
		return this.ensureFolder(path);
	}

	/** Test helper — current raw content, for asserting on writes. */
	contentAt(path: string): string | undefined {
		return this.files.get(path)?.content;
	}

	/** Test helper — move a stored file's path (used by FakeFileManager.renameFile). */
	movePath(from: string, to: string): void {
		const stored = this.files.get(from);
		if (!stored) throw new Error(`File not found: ${from}`);
		this.files.delete(from);
		stored.file.path = to;
		stored.file.name = to.includes('/') ? to.slice(to.lastIndexOf('/') + 1) : to;
		const dot = stored.file.name.lastIndexOf('.');
		stored.file.basename = dot === -1 ? stored.file.name : stored.file.name.slice(0, dot);

		const oldParent = stored.file.parent;
		if (oldParent) oldParent.children = oldParent.children.filter(c => c !== stored.file);

		const parentPath = to.includes('/') ? to.slice(0, to.lastIndexOf('/')) : '';
		const newParent = this.ensureFolder(parentPath);
		stored.file.parent = newParent;
		newParent.children.push(stored.file);

		this.files.set(to, stored);
	}
}

export class FakeMetadataCache {
	constructor(private vault: FakeVault) {}

	getFileCache(file: TFile): CachedMetadata | null {
		const content = this.vault.contentAt(file.path);
		if (content === undefined) return null;
		return { frontmatter: parseFrontmatter(content) };
	}
}

export class FakeFileManager {
	constructor(private vault: FakeVault) {}

	async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
		this.vault.movePath(file.path, newPath);
	}
}

export class FakeWorkspace {
	getLeaf(_newLeaf: boolean): { openFile: (file: TFile) => Promise<void> } {
		return { openFile: async () => {} };
	}
}

/**
 * Minimal DataAdapter stand-in. `seedExternal` is for plugin-dir files
 * (e.g. pluginDir/defaults/*.md) that are not vault notes.
 */
export class FakeDataAdapter {
	private external = new Map<string, string>();

	constructor(private vault: FakeVault) {}

	/** Test helper — seed a file on the "disk" side (plugin defaults, etc.). */
	seedExternal(path: string, content: string): void {
		this.external.set(normalizePath(path), content);
	}

	async read(path: string): Promise<string> {
		const p = normalizePath(path);
		if (this.external.has(p)) return this.external.get(p) ?? '';
		const fromVault = this.vault.contentAt(p);
		if (fromVault !== undefined) return fromVault;
		throw new Error(`ENOENT: ${path}`);
	}

	async write(path: string, data: string): Promise<void> {
		const p = normalizePath(path);
		this.external.set(p, data);
		const existing = this.vault.getAbstractFileByPath(p);
		if (existing instanceof TFile) {
			await this.vault.modify(existing, data);
		} else {
			this.vault.seedFile(p, data);
		}
	}

	async copy(src: string, dest: string): Promise<void> {
		const content = await this.read(src);
		const p = normalizePath(dest);
		const existing = this.vault.getAbstractFileByPath(p);
		if (existing instanceof TFile) {
			await this.vault.modify(existing, content);
		} else {
			await this.vault.create(p, content);
		}
	}
}

export class App {
	vault: FakeVault;
	metadataCache: FakeMetadataCache;
	fileManager: FakeFileManager;
	workspace: FakeWorkspace;

	constructor() {
		this.vault = new FakeVault();
		this.metadataCache = new FakeMetadataCache(this.vault);
		this.fileManager = new FakeFileManager(this.vault);
		this.workspace = new FakeWorkspace();
	}
}

// ── Modal / Scope ────────────────────────────────────────────────────────

export class Scope {
	private handlers: { key: string; callback: (evt: KeyboardEvent) => boolean | void }[] = [];

	register(_modifiers: string[], key: string, callback: (evt: KeyboardEvent) => boolean | void): void {
		this.handlers.push({ key, callback });
	}

	/** Test helper — not part of the real Scope API. */
	trigger(key: string): void {
		for (const h of this.handlers) {
			if (h.key === key) h.callback({} as KeyboardEvent);
		}
	}
}

export abstract class Modal {
	app: App;
	contentEl: HTMLElement;
	titleEl: HTMLElement;
	scope = new Scope();

	constructor(app: App) {
		this.app = app;
		this.contentEl = document.createDiv();
		this.titleEl = document.createDiv();
	}

	open(): void {
		document.body.appendChild(this.contentEl);
		this.onOpen();
	}

	close(): void {
		this.onClose();
		this.contentEl.remove();
	}

	abstract onOpen(): void;
	onClose(): void {}
}

/**
 * Test-only bridges between our in-memory fake objects and the real
 * `obsidian` package types. Runtime objects are compatible; the cast
 * exists only to satisfy TypeScript in the test harness.
 * (Rule obsidianmd/no-tfile-tfolder-cast is disabled for tests/fakes/**.)
 */
export function asTFile(file: unknown): import('obsidian').TFile {
	return file as import('obsidian').TFile;
}

export function asTFolder(folder: unknown): import('obsidian').TFolder {
	return folder as import('obsidian').TFolder;
}

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

/* eslint-enable @typescript-eslint/require-await --
* required pair of disable comment above to avoid eslint errors in this file
*/