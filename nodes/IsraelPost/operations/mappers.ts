import type { IDataObject } from 'n8n-workflow';
import type { ApiLocality, ApiStreet } from '../types';

export const NO_LOCALITY_ZIP = '0000000';

/** The locality-wide zip, or null when the locality has none. */
export function localityZipOf(locality: ApiLocality): string | null {
	return /^\d{7}$/.test(locality.zip ?? '') && locality.zip !== NO_LOCALITY_ZIP
		? locality.zip
		: null;
}

export function mapLocality(locality: ApiLocality): IDataObject {
	return {
		id: locality.id,
		name: locality.n,
		synonym: locality.syn,
		code: locality.sym,
		localityZip: localityZipOf(locality),
		divided: locality.divided,
	};
}

export function mapStreet(street: ApiStreet): IDataObject {
	return {
		id: street.id,
		name: street.n,
		synonym: street.syn,
		code: street.sym,
		localityId: street.cityID,
	};
}
