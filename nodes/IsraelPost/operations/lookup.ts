import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeParameterResourceLocator,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getLocalities, getStreets } from '../api';
import { ambiguousMessage, resolveByName } from '../resolve';
import type { ApiLocality, ApiStreet, Language, NameMatching } from '../types';
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
}

/** `{ mode, value }` of a resource locator, with the value as a trimmed string. */
export function readLocator(value: unknown): { mode: string; value: string } {
	if (value && typeof value === 'object') {
		const locator = value as INodeParameterResourceLocator;
		return { mode: String(locator.mode ?? 'name'), value: String(locator.value ?? '').trim() };
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

/**
 * Resolves the locality picker to an Israel Post locality.
 * Returns null when a name matches nothing; throws when it is ambiguous.
 */
export async function resolveLocality(
	ctx: Context,
	locator: { mode: string; value: string },
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
		return { id: value, name: null, code: null, zip: null, resolvedByName: false };
	}
	const pick = await resolveByName(
		value,
		async (prefix) => await getLocalities(ctx, prefix, opts.lang, opts.itemIndex),
		opts.matching,
	);
	if (pick.status === 'notFound') return null;
	if (pick.status === 'ambiguous') {
		throw new NodeOperationError(
			ctx.getNode(),
			ambiguousMessage('Locality', value, pick.candidates),
			{ itemIndex: opts.itemIndex },
		);
	}
	const raw = pick.candidate;
	return { id: raw.id, name: raw.n, code: raw.sym, zip: localityZipOf(raw), resolvedByName: true, raw };
}

/**
 * Resolves the street picker within a locality.
 * Returns null when a name matches nothing; throws when it is ambiguous.
 */
export async function resolveStreet(
	ctx: Context,
	localityId: string,
	locator: { mode: string; value: string },
	opts: ResolveOptions,
): Promise<ResolvedStreet | null> {
	const { mode, value } = locator;
	if (mode !== 'name') {
		assertId(ctx, 'Street', value, opts.itemIndex);
		return { id: value, name: null, code: null };
	}
	const pick = await resolveByName(
		value,
		async (prefix) => await getStreets(ctx, localityId, prefix, opts.lang, opts.itemIndex),
		opts.matching,
	);
	if (pick.status === 'notFound') return null;
	if (pick.status === 'ambiguous') {
		throw new NodeOperationError(
			ctx.getNode(),
			ambiguousMessage('Street', value, pick.candidates),
			{
				itemIndex: opts.itemIndex,
			},
		);
	}
	const raw = pick.candidate;
	return { id: raw.id, name: raw.n, code: raw.sym, raw };
}
