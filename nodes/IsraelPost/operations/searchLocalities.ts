import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getLocalities } from '../api';
import { dedupeById } from '../resolve';
import type { Language } from '../types';
import { mapLocality } from './mappers';

export async function searchLocalities(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const searchText = String(this.getNodeParameter('searchText', itemIndex)).trim();
	if (!searchText) {
		throw new NodeOperationError(this.getNode(), 'Search Text must not be empty', { itemIndex });
	}
	const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', itemIndex) as number);
	const lang = this.getNodeParameter('options.language', itemIndex, 'he') as Language;

	const localities = dedupeById(await getLocalities(this, searchText, lang, itemIndex));
	return localities.slice(0, limit).map(mapLocality);
}
