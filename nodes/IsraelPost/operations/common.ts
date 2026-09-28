import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { Language, NameMatching } from '../types';
import type { ResolvedLocality, ResolvedStreet } from './lookup';

export interface LookupOptions {
	lang: Language;
	matching: NameMatching;
	onNotFound: 'error' | 'empty';
}

export function readLookupOptions(ctx: IExecuteFunctions, itemIndex: number): LookupOptions {
	const options = ctx.getNodeParameter('options', itemIndex, {}) as IDataObject;
	return {
		lang: options.language === 'en' ? 'en' : 'he',
		matching: options.nameMatching === 'first' ? 'first' : 'exact',
		onNotFound: options.onNotFound === 'empty' ? 'empty' : 'error',
	};
}

export const localityOutput = (locality: ResolvedLocality | null) =>
	locality && { id: locality.id, name: locality.name, code: locality.code };

export const streetOutput = (street: ResolvedStreet | null) =>
	street && { id: street.id, name: street.name, code: street.code };

/**
 * A miss: fails the item, or with On Not Found = Return Empty outputs `row`
 * with `found: false` and `zip: null`.
 */
export function notFound(
	ctx: IExecuteFunctions,
	itemIndex: number,
	options: LookupOptions,
	message: string,
	row: IDataObject,
): IDataObject {
	if (options.onNotFound === 'error') {
		throw new NodeOperationError(ctx.getNode(), message, { itemIndex });
	}
	return { found: false, zip: null, ...row, message };
}
