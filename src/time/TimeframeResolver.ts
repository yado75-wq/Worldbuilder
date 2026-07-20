// Resolver for the `timeframe` storage syntax — TIME_DESIGN.md §4, §4.1, §5, §6.
// Pure, no Obsidian dependency. Takes an injected lookup rather than the real
// `app`, same pattern as EntityCompleteness.ts / PreservedSection.ts.
//
// Resolution failures are returned as data (never thrown), same spirit as
// ParseResult in TimeframeSyntax.ts — an unresolvable chain is a normal,
// reportable state (§6), not an exceptional one. Failures always carry the
// *root-cause* entity — whichever link in the anchor chain actually breaks —
// not the entity that was originally asked to resolve (§0, §6).
//
// Design notes on two conventions this module takes that TIME_DESIGN.md
// leaves as unenforced convention rather than mechanism (§7):
//   - A bare `[[Milestone]]` timepoint, and a triplet's anchor, both use the
//     referenced entity's resolved *start* as "that entity's own date." This
//     is exact for genuine points (start === end, the normal Milestone case,
//     §7) and is a documented, non-enforced default for the (unconventional)
//     case of anchoring to a genuine range.
//   - Per §4.1, a successfully resolved timepoint is *exactly* a number or a
//     signed Infinity — no unit or anchor-identity metadata travels with it.
//     Matching units and a shared ultimate anchor (§4's comparability rule)
//     is therefore a separate concern layered on top of this module, not
//     something `resolveComparableDate` itself enforces.

import { Timepoint, TimeframeValue, parseTimeframeValue } from './TimeframeSyntax';

/** Returns the raw `timeframe` frontmatter string for an entity, or `undefined` if it has none. */
export type TimeframeLookup = (entityRef: string) => string | undefined;

export type ResolutionError =
	| { kind: 'unresolved-entity'; entity: string; message: string }
	| { kind: 'malformed-value'; entity: string; raw: string; parseError: string; message: string }
	| { kind: 'cycle'; entity: string; chain: string[]; message: string }
	| { kind: 'boundary-on-point'; entity: string; boundary: 'start' | 'end'; message: string };

type Failure = { ok: false; error: ResolutionError };

export type ResolveResult = { ok: true; value: number } | Failure;
export type ResolveIntervalResult = { ok: true; value: { start: number; end: number } } | Failure;

function unresolvedEntity(entity: string): Failure {
	return {
		ok: false,
		error: { kind: 'unresolved-entity', entity, message: `"${entity}" has no timeframe defined.` },
	};
}

function malformedValue(entity: string, raw: string, parseError: string): Failure {
	return {
		ok: false,
		error: {
			kind: 'malformed-value',
			entity,
			raw,
			parseError,
			message: `"${entity}"'s timeframe is malformed: ${parseError}`,
		},
	};
}

function cycle(entity: string, stack: readonly string[]): Failure {
	const chain = [...stack, entity];
	return {
		ok: false,
		error: { kind: 'cycle', entity, chain, message: `Cycle detected while resolving: ${chain.join(' → ')}` },
	};
}

function boundaryOnPoint(entity: string, boundary: 'start' | 'end'): Failure {
	return {
		ok: false,
		error: {
			kind: 'boundary-on-point',
			entity,
			boundary,
			message: `"${entity}" is a single point in time and has no distinct ${boundary}.`,
		},
	};
}

/**
 * Resolves a single `Timepoint` to a real number or a signed `Infinity`
 * (§4.1). `stack` holds the entity refs currently being resolved, in order,
 * for cycle detection (§5) — callers outside this module should not pass it.
 */
export function resolveComparableDate(
	timepoint: Timepoint,
	lookup: TimeframeLookup,
	stack: readonly string[] = [],
): ResolveResult {
	switch (timepoint.kind) {
		case 'number':
			// A bare number is already an offset from the world's implicit zero
			// (§4) — no anchor entity is involved, so there's nothing to resolve.
			return { ok: true, value: timepoint.offset };

		case 'infinity':
			return { ok: true, value: timepoint.sign === 1 ? Infinity : -Infinity };

		case 'milestone': {
			// Bare [[Milestone]] link — offset 0 relative to that milestone (§2, §7.1).
			const target = resolveEntityTimeframe(timepoint.link, lookup, stack);
			if (!target.ok) return target;
			return { ok: true, value: target.value.start };
		}

		case 'boundary': {
			const target = resolveEntityTimeframe(timepoint.link, lookup, stack);
			if (!target.ok) return target;
			if (target.value.start === target.value.end) {
				return boundaryOnPoint(timepoint.link, timepoint.boundary);
			}
			return { ok: true, value: target.value[timepoint.boundary] };
		}

		case 'triplet': {
			// Anchor omitted → world's implicit zero, automatically, no lookup (§4).
			if (timepoint.anchor === null) {
				return { ok: true, value: timepoint.offset };
			}
			const base = resolveEntityTimeframe(timepoint.anchor, lookup, stack);
			if (!base.ok) return base;
			return { ok: true, value: base.value.start + timepoint.offset };
		}
	}
}

/**
 * Resolves an entity's own `timeframe` field — looking it up, parsing it,
 * and recursively resolving both sides (or following an `inherit` link) —
 * down to a concrete `{ start, end }` pair (§5). This is what a bare
 * top-level `[[Entity]]` timeframe, a milestone timepoint, and a boundary
 * reference all ultimately resolve through.
 */
export function resolveEntityTimeframe(
	entityRef: string,
	lookup: TimeframeLookup,
	stack: readonly string[] = [],
): ResolveIntervalResult {
	if (stack.includes(entityRef)) {
		return cycle(entityRef, stack);
	}

	const raw = lookup(entityRef);
	if (raw === undefined) {
		return unresolvedEntity(entityRef);
	}

	const parsed = parseTimeframeValue(raw);
	if (!parsed.ok) {
		return malformedValue(entityRef, raw, parsed.error);
	}

	const nextStack = [...stack, entityRef];
	return resolveTimeframeValue(parsed.value, lookup, nextStack);
}

/**
 * Resolves an already-parsed `TimeframeValue` down to `{ start, end }`.
 * `stack` must already include the entity this value came from (if any),
 * so a cycle reached from within this value's own sides is caught.
 */
function resolveTimeframeValue(
	value: TimeframeValue,
	lookup: TimeframeLookup,
	stack: readonly string[],
): ResolveIntervalResult {
	if (value.kind === 'inherit') {
		return resolveEntityTimeframe(value.link, lookup, stack);
	}

	const start = resolveComparableDate(value.start, lookup, stack);
	if (!start.ok) return start;

	const end = resolveComparableDate(value.end, lookup, stack);
	if (!end.ok) return end;

	return { ok: true, value: { start: start.value, end: end.value } };
}
