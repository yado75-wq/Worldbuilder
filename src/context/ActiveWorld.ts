import { WorldInfo } from '../types/world';
import { PluginState } from '../types';

export type ActiveWorldStatus =
	| { kind: 'ok'; world: WorldInfo }
	| { kind: 'none' }
	| { kind: 'multiple'; actives: WorldInfo[] };

/** No worlds at all is not a conflict (nothing to repair). */
export function getActiveWorldStatus(worlds: WorldInfo[]): ActiveWorldStatus {
	const actives = worlds.filter(w => w.status === 'active');
	if (actives.length === 1 && actives[0]) {
		return { kind: 'ok', world: actives[0] };
	}
	if (actives.length === 0) {
		return { kind: 'none' };
	}
	return { kind: 'multiple', actives };
}

export function hasActiveWorldConflict(state: PluginState): boolean {
	if (state.worlds.length === 0) return false;
	return getActiveWorldStatus(state.worlds).kind !== 'ok';
}

export const ACTIVE_WORLD_CONFLICT_NOTICE =
	'Active world conflict: open Worldbuilder settings and use Set as active (exactly one world must be active).';

/** Notice + false when conflict; true when unique active (or no worlds). */
export function requireUniqueActiveWorld(state: PluginState, notice: (msg: string) => void): boolean {
	if (!hasActiveWorldConflict(state)) return true;
	notice(ACTIVE_WORLD_CONFLICT_NOTICE);
	return false;
}