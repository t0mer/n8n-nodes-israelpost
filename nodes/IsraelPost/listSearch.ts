import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { getLocalities, getStreets } from './api';
import { readLocator, resolveLocality } from './operations/lookup';
import { dedupeById } from './resolve';
import type { Candidate, Language } from './types';

function currentLanguage(ctx: ILoadOptionsFunctions): Language {
	const options = (ctx.getCurrentNodeParameter('options') ?? {}) as IDataObject;
	return options.language === 'en' ? 'en' : 'he';
}

function toItems(rows: Array<Candidate & { sym: string }>): INodeListSearchItems[] {
	return dedupeById(rows).map((row) => ({ name: row.n, value: row.id, description: row.sym }));
}

export async function searchLocalities(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const text = filter?.trim();
	// An empty prefix returns every locality in Israel: wait for the user to type.
	if (!text) return { results: [] };
	return { results: toItems(await getLocalities(this, text, currentLanguage(this))) };
}

export async function searchStreets(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const text = filter?.trim();
	const localityInput = readLocator(this.getCurrentNodeParameter('locality'));
	if (!text || !localityInput.value) return { results: [] };
	const lang = currentLanguage(this);
	const locality = await resolveLocality(this, localityInput, { lang, matching: 'exact' });
	if (!locality) return { results: [] };
	return { results: toItems(await getStreets(this, locality.id, text, lang)) };
}
