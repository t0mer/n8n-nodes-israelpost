import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';
import {
	apiRequest,
	getLocalities,
	getStreets,
	searchAddressByZip,
	searchZip,
	zipOf,
} from '../nodes/IsraelPost/api';
import type { ApiZipResult } from '../nodes/IsraelPost/types';
import { fakeCtx, fixture, ok } from './helpers';

vi.mock('n8n-workflow', async (importOriginal) => {
	const actual = await importOriginal<typeof import('n8n-workflow')>();
	return { ...actual, sleep: vi.fn(async () => undefined) };
});

beforeEach(() => vi.mocked(sleep).mockClear());

describe('apiRequest', () => {
	it('returns Result and builds the URL from the credential base URL', async () => {
		const { ctx, calls } = fakeCtx([ok(fixture('cities-telaviv-he'))], {
			credentials: { subscriptionKey: 'k', baseUrl: 'https://example.test/mypost-zip/' },
		});
		const result = await getLocalities(ctx, 'תל א', 'he');
		expect(result[0]).toMatchObject({ id: '1212', n: 'תל אביב - יפו' });
		expect(calls[0].options.url).toBe('https://example.test/mypost-zip/getcities-lang');
		expect(calls[0].qs).toEqual({ CityStartsWith: 'תל א', Lang: 'he' });
		expect(calls[0].options.method).toBe('GET');
	});

	it('authenticates with the israelPostApi credential', async () => {
		const { ctx } = fakeCtx([ok(fixture('cities-nomatch'))]);
		await getLocalities(ctx, 'zzz', 'he');
		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'israelPostApi',
			expect.any(Object),
		);
	});

	it('sends the street search parameters', async () => {
		const { ctx, calls } = fakeCtx([ok(fixture('streets-dizengoff'))]);
		const streets = await getStreets(ctx, '1212', 'דיזנגוף', 'he');
		expect(streets.map((s) => s.id)).toContain('91992');
		expect(calls[0].path).toBe('/GetStreets-lang');
		expect(calls[0].qs).toEqual({
			CityID: '1212',
			SearchMode: 'ID-StartsWith',
			StartsWith: 'דיזנגוף',
			Lang: 'he',
		});
	});

	it('omits empty zip query fields (entrance only when given)', async () => {
		const { ctx, calls } = fakeCtx([ok(fixture('zip-address-dizengoff-100'))]);
		const result = await searchZip(ctx, {
			localityId: '1212',
			streetId: '91992',
			house: '100',
			entrance: '',
			lang: 'he',
		});
		expect(zipOf(result)).toBe('6439612');
		expect(calls[0].qs).toEqual({
			CityID: '1212',
			StreetID: '91992',
			House: '100',
			Lang: 'he',
			ByMaanimID: 'true',
		});
	});

	it('queries the reverse lookup endpoint', async () => {
		const { ctx, calls } = fakeCtx([ok(fixture('address-by-zip-6439612'))]);
		const result = await searchAddressByZip(ctx, '6439612', 'he');
		expect(result.streetname).toBe('דיזנגוף');
		expect(calls[0].path).toBe('/searchaddressbyzip-lang');
		expect(calls[0].qs).toEqual({ Zip: '6439612', Lang: 'he' });
	});

	it.each([401, 403])('maps HTTP %i to a subscription key error', async (statusCode) => {
		const { ctx } = fakeCtx([{ statusCode, body: fixture('err-wrong-key') }]);
		const error = await apiRequest(ctx, '/getcities-lang', {}).catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Israel Post rejected the subscription key');
		expect(error.description).toMatch(/credential/);
		expect(sleep).not.toHaveBeenCalled();
	});

	it('retries 503 with 1 s and 3 s backoff, then succeeds', async () => {
		const { ctx, calls } = fakeCtx([
			{ statusCode: 503, body: 'down' },
			{ statusCode: 503, body: 'down' },
			ok(fixture('cities-elad-he')),
		]);
		const result = await getLocalities(ctx, 'אלעד', 'he');
		expect(result[0].id).toBe('929');
		expect(calls).toHaveLength(3);
		expect(vi.mocked(sleep).mock.calls.map((c) => c[0])).toEqual([1000, 3000]);
	});

	it('gives up after two retries on 429', async () => {
		const { ctx, calls } = fakeCtx([
			{ statusCode: 429, body: {} },
			{ statusCode: 429, body: {} },
			{ statusCode: 429, body: {} },
		]);
		const error = await apiRequest(ctx, '/getcities-lang', {}).catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Israel Post returned HTTP 429');
		expect(calls).toHaveLength(3);
	});

	it('does not retry other HTTP errors', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 404, body: { message: 'nope' } }]);
		const error = await apiRequest(ctx, '/x', {}).catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Israel Post returned HTTP 404');
		expect(calls).toHaveLength(1);
	});

	it('rejects a non-JSON body', async () => {
		const { ctx } = fakeCtx([ok('<html>maintenance</html>')]);
		const error = await apiRequest(ctx, '/x', {}).catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Unexpected response from Israel Post (the site may have changed)');
	});

	it('maps ReturnCode !== 0 to an operation error with the message verbatim', async () => {
		const { ctx } = fakeCtx([ok({ ReturnCode: 3, ErrorMessage: 'שגיאה כללית', Result: null })]);
		const error = await apiRequest(ctx, '/x', {}, 2).catch((e) => e);
		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toContain('שגיאה כללית');
		expect(error.context.itemIndex).toBe(2);
	});

	it('wraps network failures', async () => {
		const { ctx } = fakeCtx([new Error('ECONNRESET')]);
		const error = await apiRequest(ctx, '/x', {}).catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Could not reach Israel Post');
	});

	it('treats a null zip Result as not found', async () => {
		const empty = { ReturnCode: 0, ErrorMessage: null, Result: null };
		const { ctx } = fakeCtx([ok(empty), ok(empty)]);
		expect(await searchZip(ctx, { localityId: '1', lang: 'he' })).toMatchObject({
			msgtype: 'notfound',
			zip: null,
		});
		expect((await searchAddressByZip(ctx, '1234567', 'he')).msgtype).toBe('notfound');
	});

	it('treats a null list Result as empty', async () => {
		const { ctx } = fakeCtx([ok({ ReturnCode: 0, ErrorMessage: null, Result: null })]);
		expect(await getLocalities(ctx, 'x', 'he')).toEqual([]);
	});
});

describe('zipOf', () => {
	it.each([
		['zip-address-dizengoff-100', '6439612'],
		['zip-pob-elad-100', '4081002'],
		['zip-locality-only-teladashim', '1931500'],
		['zip-address-house-9999', null],
		['zip-pob-notfound', null],
		['zip-locality-only-telaviv', null],
	])('%s → %s', (name, expected) => {
		const { Result } = fixture(name) as { Result: ApiZipResult };
		expect(zipOf(Result)).toBe(expected);
	});
});
