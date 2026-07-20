import { resolveEntityTimeframe, ResolutionError, TimeframeLookup } from '../../time/TimeframeResolver';

/**
 * One entity whose `timeframe` field should be resolution-checked — i.e. it
 * has a *present* value (the presence check, EntityCompleteness.ts, already
 * covers absence separately).
 */
export interface TimeframeCheckTarget {
	/** The ref other entities' `[[...]]` timepoints would use to reach this entity. */
	ref: string;
	/** Vault path, for building a `[[path|basename]]` report link. */
	path: string;
	/** Display basename, for the report link's alias. */
	basename: string;
	/** Label of the timeframe field being checked (e.g. "Timeframe"). */
	fieldLabel: string;
}

export interface UnresolvedTimeframeEntry {
	target: TimeframeCheckTarget;
	error: ResolutionError;
}

/**
 * Runs the resolution check (TIME_DESIGN.md §6) over every target and
 * returns the failures ordered so that root causes precede their
 * dependents — the order a user should actually fix things in, not
 * file-scan order (§6, §11: "root causes reliably sort before their
 * dependents").
 *
 * A failure's `error.entity` (ResolutionError, TimeframeResolver.ts) always
 * names the root-cause entity in the chain, not necessarily `target` itself
 * — that's what makes the ordering possible: if target A's failure points
 * at entity B, and B is itself one of the checked targets, B is emitted
 * before A.
 */
export function findUnresolvedTimeframes(
	targets: TimeframeCheckTarget[],
	lookup: TimeframeLookup
): UnresolvedTimeframeEntry[] {
	const failuresByRef = new Map<string, UnresolvedTimeframeEntry[]>();

	for (const target of targets) {
		const result = resolveEntityTimeframe(target.ref, lookup);
		if (!result.ok) {
			const list = failuresByRef.get(target.ref) ?? [];
			list.push({ target, error: result.error });
			failuresByRef.set(target.ref, list);
		}
	}

	return topoOrder(failuresByRef);
}

/**
 * Depth-first post-order over the "caused by" edges (this failure's root
 * cause is that other failure), so a root cause is always pushed onto
 * `ordered` before whatever depends on it. `visiting` guards against
 * infinite recursion on a genuine cycle (§6's cycle case) — cycle members
 * just get grouped in first-encountered order relative to each other,
 * since there's no well-defined "root" within a cycle to sort by.
 */
function topoOrder(failuresByRef: Map<string, UnresolvedTimeframeEntry[]>): UnresolvedTimeframeEntry[] {
	const visited = new Set<string>();
	const visiting = new Set<string>();
	const ordered: UnresolvedTimeframeEntry[] = [];

	function visit(ref: string): void {
		if (visited.has(ref) || visiting.has(ref)) return;
		visiting.add(ref);

		const entries = failuresByRef.get(ref) ?? [];
		for (const entry of entries) {
			const rootRef = entry.error.entity;
			if (rootRef !== ref) visit(rootRef);
		}

		visiting.delete(ref);
		visited.add(ref);
		ordered.push(...entries);
	}

	for (const ref of failuresByRef.keys()) visit(ref);
	return ordered;
}

/**
 * Formats one failure as a `## Needs attention` line. Wording is
 * deliberately "Unresolved reference" per §6 — not "unresolvable" — since
 * most cases are fixable by filling in the root-cause entity's timepoint.
 */
export function formatUnresolvedTimeframeEntry(entry: UnresolvedTimeframeEntry): string {
	const { target, error } = entry;
	return `- [[${target.path}|${target.basename}]] — Unresolved reference (${target.fieldLabel}): ${error.message}`;
}
