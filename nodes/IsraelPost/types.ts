/** Envelope around every successful Israel Post response. */
export interface ApiEnvelope<T> {
	ReturnCode: number;
	ErrorMessage: string | null;
	Result: T;
}

/** One row of `getcities-lang`. */
export interface ApiLocality {
	id: string;
	/** CBS locality code (סמל יישוב). */
	sym: string;
	/** Display name. */
	n: string;
	/** Search synonym. */
	syn: string;
	divided: boolean;
	/** Locality-wide zip, or "0000000" when there is none. */
	zip: string;
}

/** One row of `GetStreets-lang`. */
export interface ApiStreet {
	id: string;
	sym: string;
	n: string;
	syn: string;
	cityID: string;
}

/** `Result` of `SearchZip-Lang` and `searchaddressbyzip-lang`. */
export interface ApiZipResult {
	zip: string | null;
	cityid: string | null;
	cityname: string | null;
	streetid: string | null;
	streetname: string | null;
	msgtype: 'address' | 'POB' | 'unitedtown' | 'notfound' | string;
	messageResult: string | null;
	pob: string | null;
	houseNum: string | null;
	entrance: string | null;
}

export type Language = 'he' | 'en';

export type NameMatching = 'exact' | 'first';

/** A name-searchable API row: localities and streets share these fields. */
export interface Candidate {
	id: string;
	n: string;
	syn: string;
}

export interface LocalityOutput {
	id: string;
	name: string | null;
	code: string | null;
}

export interface StreetOutput {
	id: string;
	name: string | null;
	code: string | null;
}
