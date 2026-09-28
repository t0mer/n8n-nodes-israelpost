import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { searchZip, zipOf } from '../api';
import { localityOutput, notFound, readLookupOptions } from './common';
import { readLocator, resolveLocality } from './lookup';

export async function findByPoBox(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = readLookupOptions(this, itemIndex);
	const { lang, matching } = options;
	const localityInput = readLocator(this.getNodeParameter('locality', itemIndex));
	const poBox = String(this.getNodeParameter('poBox', itemIndex)).trim();
	if (!/^\d+$/.test(poBox)) {
		throw new NodeOperationError(
			this.getNode(),
			`PO Box Number "${poBox}" is not valid: use digits only`,
			{ itemIndex },
		);
	}

	const locality = await resolveLocality(this, localityInput, { lang, matching, itemIndex });
	if (!locality) {
		return [
			notFound(this, itemIndex, options, `Locality "${localityInput.value}" was not found`, {
				source: 'pobox',
				locality: null,
				poBox,
			}),
		];
	}

	const result = await searchZip(this, { localityId: locality.id, poBox, lang }, itemIndex);
	const row: IDataObject = {
		source: 'pobox',
		locality: localityOutput({ ...locality, name: locality.name ?? result.cityname }),
		poBox,
	};
	const zip = zipOf(result);
	if (zip) return [{ found: true, zip, ...row, message: result.messageResult }];
	const localityName = locality.name ?? locality.id;
	return [
		notFound(
			this,
			itemIndex,
			options,
			`No zip code found for PO box ${poBox} in ${localityName}`,
			row,
		),
	];
}
