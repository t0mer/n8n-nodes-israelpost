import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getStreets } from '../api';
import { dedupeById } from '../resolve';
import type { Language } from '../types';
import { readLocator, resolveLocality, type LookupCache } from './lookup';
import { mapStreet } from './mappers';

export async function searchStreets(
	this: IExecuteFunctions,
	itemIndex: number,
	cache: LookupCache,
): Promise<IDataObject[]> {
	const localityInput = readLocator(this.getNodeParameter('locality', itemIndex));
	const searchText = String(this.getNodeParameter('searchText', itemIndex)).trim();
	if (!searchText) {
		throw new NodeOperationError(this.getNode(), 'Search Text must not be empty', { itemIndex });
	}
	const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', itemIndex) as number);
	const lang = this.getNodeParameter('options.language', itemIndex, 'he') as Language;

	const locality = await resolveLocality(this, localityInput, {
		lang,
		matching: 'exact',
		itemIndex,
		cache,
	});
	if (!locality) {
		throw new NodeOperationError(
			this.getNode(),
			`Locality "${localityInput.value}" was not found`,
			{
				itemIndex,
			},
		);
	}
	const streets = dedupeById(await getStreets(this, locality.id, searchText, lang, itemIndex));
	return streets.slice(0, limit).map(mapStreet);
}
