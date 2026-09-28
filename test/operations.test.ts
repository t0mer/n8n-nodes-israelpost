import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeApiError, sleep, type IDataObject, type ILoadOptionsFunctions } from 'n8n-workflow';
import { IsraelPost } from '../nodes/IsraelPost/IsraelPost.node';
import { fakeCtx, fixture, ok, type FakeOptions, type FakeResponse, type Router } from './helpers';

vi.mock('n8n-workflow', async (importOriginal) => {
	const actual = await importOriginal<typeof import('n8n-workflow')>();
	return { ...actual, sleep: vi.fn(async () => undefined) };
});

beforeEach(() => vi.mocked(sleep).mockClear());

type Row = { id: string; n: string; syn: string; cityID?: string };
const rows = (...names: Parameters<typeof fixture>[0][]) =>
	names.flatMap((name) => (fixture(name) as { Result: Row[] }).Result);
const LOCALITIES_HE = rows('cities-telaviv-he', 'cities-locality-zip', 'cities-elad-he');
const LOCALITIES_EN = rows('cities-tel-en');
const STREETS = rows('streets-dizengoff', 'streets-herzl');

/** Literal prefix match on the name or synonym, ignoring case, like the live API. */
const matching = (list: Row[], prefix: string) => {
	const wanted = prefix.toLowerCase();
	return list.filter(
		(row) => row.n.toLowerCase().startsWith(wanted) || row.syn.toLowerCase().startsWith(wanted),
	);
};
const envelope = (Result: unknown) => ok({ ReturnCode: 0, ErrorMessage: null, Result });

/** Serves the Phase 0 fixtures the way the live API answered them. */
const router: Router = (path, qs): FakeResponse => {
	const text = String(qs.CityStartsWith ?? qs.StartsWith ?? '');
	switch (path) {
		case '/getcities-lang':
			return envelope(matching(qs.Lang === 'en' ? LOCALITIES_EN : LOCALITIES_HE, text));
		case '/GetStreets-lang':
			return envelope(matching(STREETS, text).filter((row) => row.cityID === qs.CityID));
		case '/SearchZip-Lang':
			if (qs.POB) return ok(fixture(qs.POB === '100' ? 'zip-pob-elad-100' : 'zip-pob-notfound'));
			if (!qs.StreetID) {
				return ok(
					fixture(
						qs.CityID === '68' ? 'zip-locality-only-teladashim' : 'zip-locality-only-telaviv',
					),
				);
			}
			if (qs.Entry) return ok(fixture('zip-address-dizengoff-100-entry-alef'));
			if (qs.House === '100') return ok(fixture('zip-address-dizengoff-100'));
			return ok(fixture('zip-address-house-9999'));
		case '/searchaddressbyzip-lang':
			return ok(
				fixture(qs.Zip === '6439612' ? 'address-by-zip-6439612' : 'address-by-zip-notfound'),
			);
	}
	return { statusCode: 404, body: {} };
};

const node = new IsraelPost();

async function run(params: IDataObject | IDataObject[], opts: FakeOptions = {}, route = router) {
	const { ctx, calls } = fakeCtx(route, { params, ...opts });
	const [output] = await node.execute.call(ctx);
	return { output, json: output.map((item) => item.json), calls };
}

const byName = (value: string) => ({ __rl: true, mode: 'name', value });
const byId = (value: string) => ({ __rl: true, mode: 'id', value });

const address = (overrides: IDataObject = {}): IDataObject => ({
	resource: 'zipCode',
	operation: 'findByAddress',
	locality: byName('תל אביב - יפו'),
	street: byName('דיזנגוף'),
	houseNumber: '100',
	entrance: '',
	options: {},
	...overrides,
});

describe('Zip Code › Find by Address', () => {
	it('finds the zip of a street address', async () => {
		const { json, output } = await run(address());
		expect(json).toEqual([
			{
				found: true,
				zip: '6439612',
				source: 'address',
				locality: { id: '1212', name: 'תל אביב - יפו', code: '5000' },
				street: { id: '91992', name: 'דיזנגוף', code: '0404' },
				house: '100',
				entrance: '',
				message: 'המיקוד לכתובת הינו: 6439612',
			},
		]);
		expect(output[0].pairedItem).toEqual({ item: 0 });
	});

	it('returns the locality-wide zip when no street is given', async () => {
		const { json, calls } = await run(
			address({ locality: byName('תל עדשים'), street: byName('') }),
		);
		expect(json[0]).toMatchObject({
			found: true,
			zip: '1931500',
			source: 'locality',
			locality: { id: '68', name: 'תל עדשים' },
			street: null,
		});
		expect(calls.map((c) => c.path)).toEqual(['/getcities-lang']);
	});

	it('asks the API for the locality-wide zip of a locality given by ID', async () => {
		const { json, calls } = await run(address({ locality: byId('68'), street: byName('') }));
		expect(json[0]).toMatchObject({ found: true, zip: '1931500', source: 'locality' });
		expect(calls[0].qs).toEqual({ CityID: '68', Lang: 'he', ByMaanimID: 'true' });
	});

	it('requires a street in a locality without a single zip', async () => {
		await expect(run(address({ street: byName('') }))).rejects.toThrow(
			'Locality "תל אביב - יפו" has no single zip code, a street is required',
		);
	});

	it('falls back to the locality-wide zip when the street is not found', async () => {
		const { json } = await run(address({ locality: byName('תל עדשים'), street: byName('זזז') }));
		expect(json[0]).toMatchObject({
			found: true,
			zip: '1931500',
			source: 'locality',
			note: 'Street "זזז" was not found in תל עדשים; returned the locality-wide zip code',
		});
	});

	it('falls back to the locality-wide zip for a locality given by ID', async () => {
		const { json, calls } = await run(address({ locality: byId('68'), street: byName('זזז') }));
		expect(json[0]).toMatchObject({ found: true, zip: '1931500', source: 'locality' });
		expect(json[0].note).toMatch(/was not found in 68/);
		expect(calls.at(-1)?.qs).toEqual({ CityID: '68', Lang: 'he', ByMaanimID: 'true' });
	});

	it('reports a locality without any zip code per On Not Found', async () => {
		const aviya = {
			id: '2888',
			sym: '1234',
			n: 'אביה',
			syn: 'אביה',
			divided: false,
			zip: '0000000',
		};
		const withAviya: Router = (path, qs) =>
			path === '/getcities-lang' && String(qs.CityStartsWith).startsWith('אביה')
				? ok({ ReturnCode: 0, ErrorMessage: null, Result: [aviya] })
				: router(path, qs);
		const params = address({ locality: byName('אביה'), street: byName('') });
		await expect(run(params, {}, withAviya)).rejects.toThrow('Locality "אביה" has no zip code');
		const { json } = await run({ ...params, options: { onNotFound: 'empty' } }, {}, withAviya);
		expect(json[0]).toMatchObject({ found: false, zip: null, source: 'locality' });
	});

	it('lists the candidates of an ambiguous street', async () => {
		await expect(run(address({ street: byName('דיזנגו') }))).rejects.toThrow(
			'Street "דיזנגו" is ambiguous. Candidates: דיזנגוף (id 91992), דיזנגוף סנטר (id 113842)',
		);
	});

	it('takes the first candidate with Name Matching = First Result', async () => {
		const { json } = await run(
			address({ street: byName('דיזנגו'), options: { nameMatching: 'first' } }),
		);
		expect(json[0]).toMatchObject({ zip: '6439612', street: { id: '91992' } });
	});

	it('fails a missing zip by default', async () => {
		await expect(run(address({ houseNumber: '9999' }))).rejects.toThrow(
			'No zip code found for דיזנגוף 9999, תל אביב - יפו.',
		);
	});

	it('returns an empty result with On Not Found = Return Empty', async () => {
		const { json } = await run(address({ houseNumber: '9999', options: { onNotFound: 'empty' } }));
		expect(json[0]).toMatchObject({
			found: false,
			zip: null,
			source: 'address',
			street: { id: '91992' },
			house: '9999',
		});
	});

	it('returns an empty result for an unknown locality with Return Empty', async () => {
		const { json } = await run(
			address({ locality: byName('זזז'), options: { onNotFound: 'empty' } }),
		);
		expect(json[0]).toMatchObject({
			found: false,
			zip: null,
			locality: null,
			message: 'Locality "זזז" was not found',
		});
	});

	it('hints that a wrong entrance breaks the lookup', async () => {
		await expect(run(address({ entrance: 'א' }))).rejects.toThrow(/try without Entrance/);
	});

	it('sends the entrance only when given', async () => {
		const { calls } = await run(address({ entrance: 'א', options: { onNotFound: 'empty' } }));
		expect(calls.at(-1)?.qs.Entry).toBe('א');
		const plain = await run(address());
		expect(plain.calls.at(-1)?.qs).not.toHaveProperty('Entry');
	});

	it.each(['12א', '12a', '12345', ''])('rejects house number "%s"', async (houseNumber) => {
		await expect(run(address({ houseNumber }))).rejects.toThrow(/House Number/);
	});

	it('uses IDs without name lookups', async () => {
		const { json, calls } = await run(address({ locality: byId('1212'), street: byId('91992') }));
		expect(json[0]).toMatchObject({
			zip: '6439612',
			locality: { id: '1212', name: null },
			street: { id: '91992', name: null },
		});
		expect(calls.map((c) => c.path)).toEqual(['/SearchZip-Lang']);
	});

	it('resolves a city once for a batch of 500 addresses', async () => {
		const params = Array.from({ length: 500 }, () => address());
		const { json, calls } = await run(params);
		expect(json).toHaveLength(500);
		const count = (path: string) => calls.filter((c) => c.path === path).length;
		expect(count('/getcities-lang')).toBe(1);
		expect(count('/GetStreets-lang')).toBe(1);
		expect(count('/SearchZip-Lang')).toBe(500);
	});

	it('reuses an ambiguous result instead of asking again', async () => {
		const params = [address({ street: byName('דיזנגו') }), address({ street: byName('דיזנגו') })];
		const { json, calls } = await run(params, { continueOnFail: true });
		expect(json.every((j) => String(j.error).includes('ambiguous'))).toBe(true);
		expect(calls.filter((c) => c.path === '/GetStreets-lang')).toHaveLength(1);
	});

	it('asks again after a failed lookup instead of caching the failure', async () => {
		let failures = 3;
		const flaky: Router = (path, qs) =>
			path === '/getcities-lang' && failures-- > 0
				? { statusCode: 503, body: '' }
				: router(path, qs);
		const { json, calls } = await run([address(), address()], { continueOnFail: true }, flaky);
		expect(json[0].error).toBe('Israel Post returned HTTP 503');
		expect(json[1]).toMatchObject({ found: true, zip: '6439612' });
		expect(calls.filter((c) => c.path === '/getcities-lang')).toHaveLength(4);
	});

	it('merges the result into the input item with Put Output in Field', async () => {
		const { json } = await run(address({ options: { outputField: 'postal' } }), {
			inputJson: [{ customer: 'Dana' }],
		});
		expect(json[0]).toMatchObject({ customer: 'Dana', postal: { zip: '6439612', found: true } });
	});

	it('adds the unmodified results with Include Raw Response', async () => {
		const { json } = await run(address({ options: { includeRaw: true } }));
		expect(json[0].raw).toMatchObject({
			locality: { id: '1212', n: 'תל אביב - יפו', sym: '5000' },
			street: { id: '91992', n: 'דיזנגוף' },
			zip: { zip: '6439612', msgtype: 'address' },
		});
	});

	it('waits between items with Delay Between Items', async () => {
		await run([address({ options: { delayMs: 250 } }), address({ options: { delayMs: 250 } })]);
		expect(vi.mocked(sleep).mock.calls).toEqual([[250]]);
	});

	it('keeps going with Continue On Fail', async () => {
		const { output } = await run([address({ houseNumber: '9999' }), address()], {
			continueOnFail: true,
		});
		expect(output).toEqual([
			{
				json: { error: expect.stringContaining('No zip code found') },
				pairedItem: { item: 0 },
			},
			{ json: expect.objectContaining({ zip: '6439612' }), pairedItem: { item: 1 } },
		]);
	});

	it('sets the failing item index on errors', async () => {
		const error = await run([address(), address({ houseNumber: '9999' })]).catch((e) => e);
		expect(error.context.itemIndex).toBe(1);
	});

	it('maps a rejected key to a clear error', async () => {
		const error = await run(address(), {}, () => ({
			statusCode: 401,
			body: fixture('err-wrong-key'),
		})).catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Israel Post rejected the subscription key');
	});

	it('retries a 503 and then succeeds', async () => {
		let failures = 1;
		const flaky: Router = (path, qs) =>
			path === '/SearchZip-Lang' && failures-- > 0
				? { statusCode: 503, body: '' }
				: router(path, qs);
		const { json } = await run(address(), {}, flaky);
		expect(json[0].zip).toBe('6439612');
		expect(sleep).toHaveBeenCalledWith(1000);
	});
});

describe('Zip Code › Find by PO Box', () => {
	const poBox = (overrides: IDataObject = {}): IDataObject => ({
		resource: 'zipCode',
		operation: 'findByPoBox',
		locality: byName('אלעד'),
		poBox: '100',
		options: {},
		...overrides,
	});

	it('finds the zip of a PO box', async () => {
		const { json, calls } = await run(poBox());
		expect(json[0]).toEqual({
			found: true,
			zip: '4081002',
			source: 'pobox',
			locality: { id: '929', name: 'אלעד', code: expect.any(String) },
			poBox: '100',
			message: 'המיקוד עבור ת.ד 100 באלעד הינו:',
		});
		expect(calls.at(-1)?.qs).toEqual({ CityID: '929', POB: '100', Lang: 'he', ByMaanimID: 'true' });
	});

	it('handles an unknown PO box in both On Not Found modes', async () => {
		await expect(run(poBox({ poBox: '99999' }))).rejects.toThrow(
			'No zip code found for PO box 99999 in אלעד',
		);
		const { json } = await run(poBox({ poBox: '99999', options: { onNotFound: 'empty' } }));
		expect(json[0]).toMatchObject({ found: false, zip: null, poBox: '99999' });
	});

	it('rejects a non-numeric PO box', async () => {
		await expect(run(poBox({ poBox: '10a' }))).rejects.toThrow(/digits only/);
	});

	it('names a locality given by ID from the response', async () => {
		const { json } = await run(poBox({ locality: byId('929') }));
		expect(json[0].locality).toEqual({ id: '929', name: 'אלעד', code: null });
	});
});

describe('Locality › Search', () => {
	const search = (overrides: IDataObject = {}): IDataObject => ({
		resource: 'locality',
		operation: 'search',
		searchText: 'Tel',
		returnAll: true,
		options: { language: 'en' },
		...overrides,
	});

	it('maps localities to readable keys', async () => {
		const { json, calls } = await run(search());
		expect(json[0]).toEqual({
			id: '68',
			name: 'Tel Adashim',
			synonym: expect.any(String),
			code: expect.any(String),
			localityZip: '1931500',
			divided: false,
		});
		expect(json.find((j) => j.id === '1212')).toMatchObject({ localityZip: null, divided: true });
		expect(calls[0].qs).toEqual({ CityStartsWith: 'Tel', Lang: 'en' });
	});

	it('applies the limit', async () => {
		const { json } = await run(search({ returnAll: false, limit: 2 }));
		expect(json).toHaveLength(2);
	});

	it('returns one item per locality', async () => {
		const { json } = await run(search());
		expect(new Set(json.map((j) => j.id)).size).toBe(json.length);
	});

	it('rejects empty search text', async () => {
		await expect(run(search({ searchText: '  ' }))).rejects.toThrow(
			'Search Text must not be empty',
		);
	});
});

describe('Street › Search', () => {
	it('searches the streets of a locality given by name', async () => {
		const { json, calls } = await run({
			resource: 'street',
			operation: 'search',
			locality: byName('תל אביב - יפו'),
			searchText: 'הרצל',
			returnAll: true,
			options: {},
		});
		expect(json).toEqual([
			{ id: '104270', name: 'הרצל', synonym: 'הרצל', code: expect.any(String), localityId: '1212' },
			expect.objectContaining({ id: '106082', name: 'רוזנבלום הרצל' }),
		]);
		expect(calls.at(-1)?.qs).toMatchObject({ CityID: '1212', StartsWith: 'הרצל' });
	});

	it('fails for an unknown locality', async () => {
		await expect(
			run({
				resource: 'street',
				operation: 'search',
				locality: byName('זזז'),
				searchText: 'הרצל',
				returnAll: true,
			}),
		).rejects.toThrow('Locality "זזז" was not found');
	});
});

describe('Address › Find by Zip', () => {
	const byZip = (zip: string, options: IDataObject = {}): IDataObject => ({
		resource: 'address',
		operation: 'findByZip',
		zip,
		options,
	});

	it('finds the address of a zip code', async () => {
		const { json } = await run(byZip('643-9612'));
		expect(json[0]).toEqual({
			found: true,
			zip: '6439612',
			locality: { id: '1212', name: 'תל אביב - יפו', code: null },
			street: { id: '91992', name: 'דיזנגוף', code: null },
			house: '100',
			entrance: '',
			message: 'תל אביב - יפו, דיזנגוף 100',
		});
	});

	it('handles an unknown zip in both On Not Found modes', async () => {
		await expect(run(byZip('1111111'))).rejects.toThrow('No address found for zip code 1111111');
		const { json } = await run(byZip('1111111', { onNotFound: 'empty' }));
		expect(json[0]).toMatchObject({ found: false, zip: null, locality: null });
	});

	it('rejects a zip that is not 7 digits', async () => {
		await expect(run(byZip('12345'))).rejects.toThrow(/7 digits/);
	});
});

describe('list search', () => {
	function loadCtx(params: IDataObject) {
		const { ctx, calls } = fakeCtx(router);
		const load = Object.assign(ctx, {
			getCurrentNodeParameter: (name: string) => params[name],
		}) as unknown as ILoadOptionsFunctions;
		return { load, calls };
	}

	it('lists localities for a filter and none without one', async () => {
		const { load, calls } = loadCtx({});
		const { results } = await node.methods.listSearch.searchLocalities.call(load, 'אלע');
		expect(results).toEqual([{ name: 'אלעד', value: '929', description: expect.any(String) }]);
		expect(await node.methods.listSearch.searchLocalities.call(load, ' ')).toEqual({ results: [] });
		expect(calls).toHaveLength(1);
	});

	it('lists streets of the chosen locality', async () => {
		const { load } = loadCtx({ locality: byName('תל אביב - יפו'), options: {} });
		const { results } = await node.methods.listSearch.searchStreets.call(load, 'הרצל');
		expect(results.map((r) => r.value)).toEqual(['104270', '106082']);
	});

	it('lists no streets before a locality is chosen', async () => {
		const { load, calls } = loadCtx({ locality: byName('') });
		expect(await node.methods.listSearch.searchStreets.call(load, 'הרצל')).toEqual({ results: [] });
		expect(calls).toHaveLength(0);
	});
});
