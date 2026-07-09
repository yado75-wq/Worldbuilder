// Obsidian's Settings modal (App.setting) is not part of the officially
// documented Plugin API surface, but every plugin that deep-links into a
// specific settings tab relies on it. Declaring it here gives us a typed,
// cast-free way to use it instead of scattering `as any` through the code.
import 'obsidian';

declare module 'obsidian' {
	interface App {
		setting: {
			open: () => void;
			openTabById: (id: string) => void;
			close: () => void;
		};
	}
}
