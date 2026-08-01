/**
 * Check whether an Obsidian plugin id is free in the community registry.
 *
 * Usage:
 *   node check-plugin-id.mjs                  # uses id from manifest.json
 *   node check-plugin-id.mjs my-candidate-id  # check one or more candidates
 *   npm run check-id
 *   npm run check-id -- yado-world-builder worldbuilder-tools
 *
 * Exit codes:
 *   0  all checked ids are free
 *   1  at least one id is taken, invalid, or the registry could not be fetched
 */

import { readFileSync } from 'node:fs';
import { exit } from 'node:process';

const REGISTRY_URL =
	'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json';

/** @see Obsidian plugin guidelines — ids are lowercase kebab-case. */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function loadManifestId() {
	try {
		const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
		if (typeof manifest.id === 'string' && manifest.id.length > 0) {
			return manifest.id;
		}
	} catch {
		// fall through
	}
	return null;
}

function validateFormat(id) {
	if (!ID_PATTERN.test(id)) {
		return 'invalid format (use lowercase letters, digits, and hyphens only, e.g. yado-world-builder)';
	}
	if (id.length > 64) {
		return 'too long (keep ids short; 64 characters max is a safe bound)';
	}
	return null;
}

async function fetchRegistry() {
	const response = await requestUR(REGISTRY_URL);	
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText}`);
	}
	const data = await response.json();
	if (!Array.isArray(data)) {
		throw new Error('Registry JSON is not an array');
	}
	return data;
}

function findEntry(registry, id) {
	return registry.find((entry) => entry && entry.id === id) ?? null;
}

async function main() {
	const args = process.argv.slice(2).filter((a) => a && !a.startsWith('-'));
	let ids = args;

	if (ids.length === 0) {
		const fromManifest = loadManifestId();
		if (!fromManifest) {
			console.error('No id given and could not read manifest.json "id".');
			console.error('Usage: node check-plugin-id.mjs [id ...]');
			exit(1);
		}
		ids = [fromManifest];
		console.log(`Using id from manifest.json: ${fromManifest}\n`);
	}

	let registry;
	try {
		console.log('Fetching community plugin registry…');
		registry = await fetchRegistry();
		console.log(`Loaded ${registry.length} registered plugins.\n`);
	} catch (err) {
		console.error(`Failed to fetch registry: ${err instanceof Error ? err.message : err}`);
		console.error(`URL: ${REGISTRY_URL}`);
		exit(1);
	}

	let anyTaken = false;

	for (const id of ids) {
		const formatError = validateFormat(id);
		if (formatError) {
			console.log(`✗  ${id}`);
			console.log(`   ${formatError}\n`);
			anyTaken = true;
			continue;
		}

		const entry = findEntry(registry, id);
		if (entry) {
			console.log(`✗  ${id}  — TAKEN`);
			console.log(`   name:   ${entry.name ?? '(unknown)'}`);
			console.log(`   author: ${entry.author ?? '(unknown)'}`);
			console.log(`   repo:   ${entry.repo ? `https://github.com/${entry.repo}` : '(unknown)'}`);
			console.log('');
			anyTaken = true;
		} else {
			console.log(`✓  ${id}  — available\n`);
		}
	}

	if (anyTaken) {
		console.log('At least one id is unavailable or invalid.');
		exit(1);
	}

	console.log('All checked ids are available.');
	exit(0);
}

await main();