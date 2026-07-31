interface DomElementInfo {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string | number | boolean | null>;
	title?: string;
	parent?: Node;
}

function applyInfo(el: HTMLElement, o?: DomElementInfo | string): void {
	if (!o) return;
	if (typeof o === 'string') {
		el.className = o;
		return;
	}
	if (o.cls) {
		const classes = Array.isArray(o.cls) ? o.cls : o.cls.split(' ').filter(Boolean);
		el.classList.add(...classes);
	}
	if (o.text !== undefined) el.textContent = o.text;
	if (o.attr) {
		for (const [k, v] of Object.entries(o.attr)) {
			if (v === null) continue;
			el.setAttribute(k, String(v));
		}
	}
	if (o.title) el.setAttribute('title', o.title);
	if (o.parent) o.parent.appendChild(el);
}

export function installObsidianDomExtensions(): void {
	const NodeProto = globalThis.Node.prototype as unknown as Record<string, unknown>;
	const ElementProto = globalThis.Element.prototype as unknown as Record<string, unknown>;

	NodeProto.empty = function (this: Node): void {
		while (this.firstChild) this.removeChild(this.firstChild);
	};

	NodeProto.createEl = function (
		this: Node,
		tag: string,
		o?: DomElementInfo | string,
		callback?: (el: HTMLElement) => void
	): HTMLElement {
		const el = globalThis.document.createElement(tag);
		applyInfo(el, o);
		this.appendChild(el);
		callback?.(el);
		return el;
	};

	NodeProto.createDiv = function (
		this: Node,
		o?: DomElementInfo | string,
		callback?: (el: HTMLDivElement) => void
	): HTMLDivElement {
		return (NodeProto.createEl as (...a: unknown[]) => HTMLDivElement).call(this, 'div', o, callback);
	};

	NodeProto.createSpan = function (
		this: Node,
		o?: DomElementInfo | string,
		callback?: (el: HTMLSpanElement) => void
	): HTMLSpanElement {
		return (NodeProto.createEl as (...a: unknown[]) => HTMLSpanElement).call(this, 'span', o, callback);
	};

	ElementProto.setText = function (this: Element, val: string): void {
		this.textContent = val;
	};

	ElementProto.addClass = function (this: Element, ...classes: string[]): void {
		this.classList.add(...classes);
	};

	ElementProto.removeClass = function (this: Element, ...classes: string[]): void {
		this.classList.remove(...classes);
	};

	ElementProto.toggleClass = function (this: Element, classes: string | string[], value: boolean): void {
		const list = Array.isArray(classes) ? classes : [classes];
		for (const c of list) this.classList.toggle(c, value);
	};
}
