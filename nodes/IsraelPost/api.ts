import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';
import type { ApiEnvelope, ApiLocality, ApiStreet, ApiZipResult, Language } from './types';

export const CREDENTIAL_TYPE = 'israelPostApi';

export const DEFAULT_BASE_URL = 'https://apimftprd.israelpost.co.il/mypost-zip';

/** Waits before retry 1 and 2 on 429 / 5xx. */
export const RETRY_DELAYS_MS = [1000, 3000];

const REQUEST_TIMEOUT_MS = 20000;

type Context = IExecuteFunctions | ILoadOptionsFunctions;

const isRetryable = (statusCode: number) => statusCode === 429 || statusCode >= 500;

const isEnvelope = (body: unknown): body is ApiEnvelope<unknown> =>
	typeof body === 'object' &&
	body !== null &&
	typeof (body as IDataObject).ReturnCode === 'number' &&
	'Result' in body;

async function getBaseUrl(ctx: Context): Promise<string> {
	const credentials = await ctx.getCredentials(CREDENTIAL_TYPE);
	const baseUrl = String(credentials.baseUrl ?? '').trim() || DEFAULT_BASE_URL;
	return baseUrl.replace(/\/+$/, '');
}

/** Drops empty values so optional fields left blank are not sent. */
function cleanQs(qs: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(qs)) {
		if (value === undefined || value === null || value === '') continue;
		out[key] = value;
	}
	return out;
}

async function send(
	ctx: Context,
	options: IHttpRequestOptions,
	itemIndex?: number,
): Promise<IN8nHttpFullResponse> {
	let failure: unknown;
	try {
		return (await ctx.helpers.httpRequestWithAuthentication.call(
			ctx,
			CREDENTIAL_TYPE,
			options,
		)) as IN8nHttpFullResponse;
	} catch (error) {
		failure = error;
	}
	// n8n's own errors (e.g. an unreadable credential) pass through unchanged.
	if (failure instanceof NodeApiError || failure instanceof NodeOperationError) throw failure;
	throw new NodeApiError(ctx.getNode(), { message: String(failure) } as JsonObject, {
		message: 'Could not reach Israel Post',
		description: failure instanceof Error ? failure.message : String(failure),
		itemIndex,
	});
}

/**
 * GET `path` on the zip API and return the envelope's `Result`.
 * Retries 429 / 5xx twice, maps 401/403 to a key error and checks the envelope.
 */
export async function apiRequest<T>(
	ctx: Context,
	path: string,
	qs: IDataObject,
	itemIndex?: number,
): Promise<T> {
	const options: IHttpRequestOptions = {
		method: 'GET',
		url: `${await getBaseUrl(ctx)}${path}`,
		qs: cleanQs(qs),
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: REQUEST_TIMEOUT_MS,
	};

	let response = await send(ctx, options, itemIndex);
	for (const delay of RETRY_DELAYS_MS) {
		if (!isRetryable(response.statusCode)) break;
		await sleep(delay);
		response = await send(ctx, options, itemIndex);
	}

	const { statusCode, body } = response;
	const node = ctx.getNode();
	const errorBody = (typeof body === 'object' && body !== null ? body : { body }) as JsonObject;

	if (statusCode === 401 || statusCode === 403) {
		throw new NodeApiError(node, errorBody, {
			message: 'Israel Post rejected the subscription key',
			description:
				'The public key may have changed. Open the Israel Post API credential and replace the Subscription Key (see the credential notice for how to find the current one).',
			httpCode: String(statusCode),
			itemIndex,
		});
	}
	if (statusCode < 200 || statusCode >= 300) {
		throw new NodeApiError(node, errorBody, {
			message: `Israel Post returned HTTP ${statusCode}`,
			httpCode: String(statusCode),
			itemIndex,
		});
	}
	if (!isEnvelope(body)) {
		throw new NodeApiError(node, errorBody, {
			message: 'Unexpected response from Israel Post (the site may have changed)',
			httpCode: String(statusCode),
			itemIndex,
		});
	}
	if (body.ReturnCode !== 0) {
		throw new NodeOperationError(
			node,
			`Israel Post returned an error: ${body.ErrorMessage ?? `ReturnCode ${body.ReturnCode}`}`,
			{ itemIndex },
		);
	}
	return body.Result as T;
}

export async function getLocalities(
	ctx: Context,
	startsWith: string,
	lang: Language,
	itemIndex?: number,
): Promise<ApiLocality[]> {
	const result = await apiRequest<ApiLocality[] | null>(
		ctx,
		'/getcities-lang',
		{ CityStartsWith: startsWith, Lang: lang },
		itemIndex,
	);
	return Array.isArray(result) ? result : [];
}

export async function getStreets(
	ctx: Context,
	localityId: string,
	startsWith: string,
	lang: Language,
	itemIndex?: number,
): Promise<ApiStreet[]> {
	const result = await apiRequest<ApiStreet[] | null>(
		ctx,
		'/GetStreets-lang',
		{
			CityID: localityId,
			CityName: '',
			SearchMode: 'ID-StartsWith',
			StartsWith: startsWith,
			Lang: lang,
		},
		itemIndex,
	);
	return Array.isArray(result) ? result : [];
}

export interface ZipQuery {
	localityId: string;
	streetId?: string;
	house?: string;
	entrance?: string;
	poBox?: string;
	lang: Language;
}

export async function searchZip(
	ctx: Context,
	query: ZipQuery,
	itemIndex?: number,
): Promise<ApiZipResult> {
	return await apiRequest<ApiZipResult>(
		ctx,
		'/SearchZip-Lang',
		{
			CityID: query.localityId,
			StreetID: query.streetId,
			House: query.house,
			Entry: query.entrance,
			POB: query.poBox,
			Lang: query.lang,
			ByMaanimID: 'true',
		},
		itemIndex,
	);
}

export async function searchAddressByZip(
	ctx: Context,
	zip: string,
	lang: Language,
	itemIndex?: number,
): Promise<ApiZipResult> {
	return await apiRequest<ApiZipResult>(
		ctx,
		'/searchaddressbyzip-lang',
		{ Zip: zip, Lang: lang },
		itemIndex,
	);
}

/** The code in a zip result, or null when the result is a miss ("" / null / notfound). */
export function zipOf(result: ApiZipResult | null | undefined): string | null {
	const zip = result?.zip;
	return typeof zip === 'string' && /^\d{7}$/.test(zip) ? zip : null;
}
