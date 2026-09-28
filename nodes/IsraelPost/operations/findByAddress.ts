import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { searchZip, zipOf } from '../api';
import { localityOutput, notFound, readLookupOptions, streetOutput } from './common';
import { readLocator, resolveLocality, resolveStreet, type ResolvedLocality } from './lookup';

const HOUSE_PATTERN = /^\d{1,4}$/;

export async function findByAddress(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = readLookupOptions(this, itemIndex);
	const { lang, matching } = options;
	const localityInput = readLocator(this.getNodeParameter('locality', itemIndex));
	const streetInput = readLocator(this.getNodeParameter('street', itemIndex, ''));
	const house = String(this.getNodeParameter('houseNumber', itemIndex, '')).trim();
	const entrance = String(this.getNodeParameter('entrance', itemIndex, '')).trim();
	const fail = (message: string) => new NodeOperationError(this.getNode(), message, { itemIndex });

	if (streetInput.value && !house) throw fail('House Number is required when a street is set');
	if (streetInput.value && !HOUSE_PATTERN.test(house)) {
		throw fail(
			`House Number "${house}" is not valid: use 1 to 4 digits. Israel Post does not accept letter suffixes such as 12א.`,
		);
	}

	const locality = await resolveLocality(this, localityInput, { lang, matching, itemIndex });
	if (!locality) {
		return [
			notFound(this, itemIndex, options, `Locality "${localityInput.value}" was not found`, {
				source: 'address',
				locality: null,
				street: null,
				house,
				entrance,
			}),
		];
	}

	const localityRow = (zip: string, message: string | null, note?: string): IDataObject => ({
		found: true,
		zip,
		source: 'locality',
		locality: localityOutput(locality),
		street: null,
		house: '',
		entrance: '',
		message,
		...(note ? { note } : {}),
	});

	if (!streetInput.value) {
		const zip = await localityZip.call(this, locality, lang, itemIndex);
		if (zip) return [localityRow(zip.zip, zip.message)];
		throw fail(
			`Locality "${locality.name ?? locality.id}" has no single zip code, a street is required`,
		);
	}

	const street = await resolveStreet(this, locality.id, streetInput, {
		lang,
		matching,
		itemIndex,
	});
	if (!street) {
		const localityName = locality.name ?? locality.id;
		if (locality.zip) {
			return [
				localityRow(
					locality.zip,
					null,
					`Street "${streetInput.value}" was not found in ${localityName}; returned the locality-wide zip code`,
				),
			];
		}
		return [
			notFound(
				this,
				itemIndex,
				options,
				`Street "${streetInput.value}" was not found in locality "${localityName}"`,
				{ source: 'address', locality: localityOutput(locality), street: null, house, entrance },
			),
		];
	}

	const result = await searchZip(
		this,
		{ localityId: locality.id, streetId: street.id, house, entrance, lang },
		itemIndex,
	);
	const row: IDataObject = {
		source: 'address',
		locality: localityOutput(locality),
		street: streetOutput(street),
		house,
		entrance,
	};
	const zip = zipOf(result);
	if (zip) return [{ found: true, zip, ...row, message: result.messageResult }];

	const address = `${street.name ?? street.id} ${house}, ${locality.name ?? locality.id}`;
	const hint = entrance
		? ' Israel Post returns no zip code for an entrance the building does not have: try without Entrance.'
		: '';
	return [notFound(this, itemIndex, options, `No zip code found for ${address}.${hint}`, row)];
}

/** The locality-wide zip: from the locality row when known, else asked from the API. */
async function localityZip(
	this: IExecuteFunctions,
	locality: ResolvedLocality,
	lang: 'he' | 'en',
	itemIndex: number,
): Promise<{ zip: string; message: string | null } | null> {
	if (locality.resolvedByName) return locality.zip ? { zip: locality.zip, message: null } : null;
	const result = await searchZip(this, { localityId: locality.id, lang }, itemIndex);
	const zip = zipOf(result);
	return zip ? { zip, message: result.messageResult } : null;
}
