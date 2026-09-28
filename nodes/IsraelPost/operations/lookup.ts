import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeParameterResourceLocator,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getLocalities, getStreets } from '../api';
import { ambiguousMessage, resolveByName, type PickResult } from '../resolve';
import type { ApiLocality, ApiStreet, Candidate, Language, NameMatching } from '../types';
import { localityZipOf } from './mappers';

type Context = IExecuteFunctions | ILoadOptionsFunctions;

export interface ResolvedLocality {
	id: string;
	name: string | null;
	code: string | null;
	/** Locality-wide zip, when the locality came from a name lookup and has one. */
	zip: string | null;
	/** False when the user gave an ID, so name, code and zip are unknown. */
	resolvedByName: boolean;
	raw?: ApiLocality;
}

export interface ResolvedStreet {
	id: string;
	name: string | null;
	code: string | null;
	raw?: ApiStreet;
}

export interface ResolveOptions {
	lang: Language;
	matching: NameMatching;
	itemIndex?: number;
	cache?: LookupCache;
}

/**
 * Name lookups of one execution, so a batch of addresses in the same city
 * queries the city once. Holds promises, so a failure (an ambiguous name) is
 * reused as well.
 */
export class LookupCache {
	readonly localities = new Map<string, Promise<ResolvedLocality | null>>();

	readonly streets = new Map<string, Promise<ResolvedStreet | null>>();
}

async function cached<T>(
	map: Map<string, Promise<T>> | undefined,
	key: string,
	load: () => Promise<T>,
): Promise<T> {
	if (!map) return await load();
	let entry = map.get(key);
	if (!entry) {
		entry = load();
		map.set(key, entry);
	}
	return await entry;
}

export interface LocatorInput {
	mode: string;
	value: string;
	/** Display name n8n cached for a value picked from the list. */
	name?: string;
}

/** `{ mode, value }` of a resource locator, with the value as a trimmed string. */
export function readLocator(value: unknown): LocatorInput {
	if (value && typeof value === 'object') {
		const locator = value as INodeParameterResourceLocator;
		const name = locator.cachedResultName;
		return {
			mode: String(locator.mode ?? 'name'),
			value: String(locator.value ?? '').trim(),
			name: typeof name === 'string' && name ? name : undefined,
		};
	}
	return { mode: 'name', value: String(value ?? '').trim() };
}

function assertId(ctx: Context, what: string, id: string, itemIndex?: number) {
	if (!/^\d+$/.test(id)) {
		throw new NodeOperationError(ctx.getNode(), `${what} ID "${id}" must contain digits only`, {
			itemIndex,
		});
	}
}

function ambiguous(ctx: Context, kind: string, value: string, pick: PickResult<Candidate>) {
	if (pick.status !== 'ambiguous') return;
	throw new NodeOperationError(ctx.getNode(), ambiguousMessage(kind, value, pick.candidates));
}

/**
 * Resolves the locality picker to an Israel Post locality.
 * Returns null when a name matches nothing; throws when it is ambiguous.
 */
export async function resolveLocality(
	ctx: Context,
	locator: LocatorInput,
	opts: ResolveOptions,
): Promise<ResolvedLocality | null> {
	const { mode, value } = locator;
	if (!value) {
		throw new NodeOperationError(ctx.getNode(), 'Locality is required', {
			itemIndex: opts.itemIndex,
		});
	}
	if (mode !== 'name') {
		assertId(ctx, 'Locality', value, opts.itemIndex);
		return { id: value, name: locator.name ?? null, code: null, zip: null, resolvedByName: false };
	}
	return await cached(
		opts.cache?.localities,
		`${opts.lang}|${opts.matching}|${value}`,
		async () => {
			const pick = await resolveByName(
				value,
				async (prefix) => await getLocalities(ctx, prefix, opts.lang, opts.itemIndex),
				opts.matching,
			);
			ambiguous(ctx, 'Locality', value, pick);
			if (pick.status !== 'found') return null;
			const raw = pick.candidate;
			return {
				id: raw.id,
				name: raw.n,
				code: raw.sym,
				zip: localityZipOf(raw),
				resolvedByName: true,
				raw,
			};
		},
	);
}

/**
 * Resolves the street picker within a locality.
 * Returns null when a name matches nothing; throws when it is ambiguous.
 */
export async function resolveStreet(
	ctx: Context,
	localityId: string,
	locator: LocatorInput,
	opts: ResolveOptions,
): Promise<ResolvedStreet | null> {
	const { mode, value } = locator;
	if (mode !== 'name') {
		assertId(ctx, 'Street', value, opts.itemIndex);
		return { id: value, name: locator.name ?? null, code: null };
	}
	const key = `${opts.lang}|${opts.matching}|${localityId}|${value}`;
	return await cached(opts.cache?.streets, key, async () => {
		const pick = await resolveByName(
			value,
			async (prefix) => await getStreets(ctx, localityId, prefix, opts.lang, opts.itemIndex),
			opts.matching,
		);
		ambiguous(ctx, 'Street', value, pick);
		if (pick.status !== 'found') return null;
		const raw = pick.candidate;
		return { id: raw.id, name: raw.n, code: raw.sym, raw };
	});
}
