import { FieldDefinition } from '../../types';
import { resolveEntityTimeframe, TimeframeLookup } from '../../time/TimeframeResolver';
import { TimeframeResolution } from './EntityContentBuilder';

/**
 * Resolves every `timeframe` field's current (about-to-be-saved) value for
 * display in its generated section's "Resolved:" line (§8). The current
 * entity's own raw value isn't necessarily on disk yet (this runs during
 * both create and edit), so it's injected into the given `lookup` under
 * `selfRef` — the entity's *real* ref (its basename; the title being
 * created if it doesn't exist yet) — rather than a synthetic placeholder.
 * Using the real ref matters: it's what lets TimeframeResolver.ts's own
 * cycle-detection catch a cycle that loops back to this entity
 * *indirectly*, through some other real entity's chain, not just a direct
 * self-reference. A synthetic ref would never appear on that chain, so an
 * indirect cycle through this entity would silently resolve as if nothing
 * were wrong.
 *
 * This also lets `resolveEntityTimeframe` handle `inherit` and
 * cycle-detection exactly as it already does for any other entity, with no
 * duplicated logic here for the interval-vs-inherit distinction.
 *
 * Resolved absolute numbers are all relative to the world's own implicit
 * zero (§4) — the anchors and units used to *get* there don't survive
 * resolution (TimeframeResolver.ts's own doc comment), so `worldTimeUnit`
 * (the world's configured `time_unit`, already defaulted to `'years'` by
 * the caller if unset) is what makes a bare resolved number like `1945`
 * mean anything on its own, regardless of what units were used along the
 * way to get there.
 */
export function resolveTimeframeFieldsForDisplay(
	fields: FieldDefinition[],
	data: Record<string, string | null>,
	lookup: TimeframeLookup,
	worldTimeUnit: string,
	selfRef: string
): Record<string, TimeframeResolution> {
	const resolutions: Record<string, TimeframeResolution> = {};

	for (const f of fields) {
		if (f.type !== 'timeframe') continue;

		const raw = data[f.key];
		if (!raw) continue;

		const selfLookup: TimeframeLookup = ref => (ref === selfRef ? raw : lookup(ref));

		const result = resolveEntityTimeframe(selfRef, selfLookup);
		resolutions[f.key] = result.ok
			? { ok: true, display: formatResolvedValue(result.value.start, result.value.end, worldTimeUnit) }
			: { ok: false, message: result.error.message };
	}

	return resolutions;
}

function formatResolvedValue(start: number, end: number, unit: string): string {
	const fmt = (n: number): string => {
		if (n === Infinity) return '∞';
		if (n === -Infinity) return '-∞';
		return String(n);
	};
	const range = start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
	return `${unit} ${range}`;
}
