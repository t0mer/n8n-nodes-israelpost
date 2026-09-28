import { describe, expect, it, vi } from 'vitest';
import {
	ambiguousMessage,
	dedupeById,
	normalizeName,
	pickCandidate,
	prefixQueries,
	resolveByName,
} from '../nodes/IsraelPost/resolve';
import type { ApiLocality, ApiStreet, Candidate } from '../nodes/IsraelPost/types';
import { fixture } from './helpers';

const result = <T>(name: Parameters<typeof fixture>[0]) => (fixture(name) as { Result: T }).Result;

const c = (id: string, n: string, syn = n): Candidate => ({ id, n, syn });

describe('normalizeName', () => {
	it.each([
		['  תל   אביב  ', 'תל אביב'],
		['תל אביב - יפו', 'תל אביב יפו'],
		['תל אביב–יפו', 'תל אביב יפו'],
		['מודיעין־מכבים־רעות', 'מודיעין מכבים רעות'],
		["ג'סר א-זרקא", 'גסר א זרקא'],
		['צ׳רצ׳יל', 'צרציל'],
		['רמת גן "הבורסה"', 'רמת גן הבורסה'],
		['יהוד״ה', 'יהודה'],
		['“Tel” ‘Aviv’', 'tel aviv'],
		['TEL AVIV - YAFO', 'tel aviv yafo'],
		['יְרוּשָׁלַיִם', 'ירושלים'],
	])('%s → %s', (input, expected) => {
		expect(normalizeName(input)).toBe(expected);
	});

	it('does not unify spelling variants such as קריית / קרית', () => {
		expect(normalizeName('קריית שמונה')).not.toBe(normalizeName('קרית שמונה'));
	});
});

describe('pickCandidate', () => {
	const streets = result<ApiStreet[]>('streets-dizengoff');

	it('prefers an exact match on the name', () => {
		const pick = pickCandidate('דיזנגוף', streets, 'exact');
		expect(pick).toMatchObject({ status: 'found', candidate: { id: '91992' } });
	});

	it('matches the synonym too', () => {
		const localities = result<ApiLocality[]>('cities-telaviv-he');
		expect(pickCandidate('תל אביב יפו', localities, 'exact')).toMatchObject({
			status: 'found',
			candidate: { id: '1212' },
		});
		expect(pickCandidate('תל-אביב - יפו', localities, 'exact')).toMatchObject({
			status: 'found',
			candidate: { id: '1212' },
		});
	});

	it('uses a single candidate even without an exact match', () => {
		expect(pickCandidate('אלע', result<ApiLocality[]>('cities-elad-he'), 'exact')).toMatchObject({
			status: 'found',
			candidate: { id: '929' },
		});
	});

	it('reports ambiguity in exact mode', () => {
		const pick = pickCandidate('דיזנגוף ס', streets, 'exact');
		expect(pick.status).toBe('ambiguous');
	});

	it('takes the first candidate in first mode', () => {
		const pick = pickCandidate('דיזנגוף ס', streets, 'first');
		expect(pick).toMatchObject({ status: 'found', candidate: { id: streets[0].id } });
	});

	it('returns not found for an empty list', () => {
		expect(pickCandidate('x', [], 'first')).toEqual({ status: 'notFound' });
	});

	it('treats duplicate ids as one candidate', () => {
		const pick = pickCandidate('אבנ', [c('1', 'אבנת'), c('1', 'אובנת')], 'exact');
		expect(pick).toMatchObject({ status: 'found', candidate: { n: 'אבנת' } });
	});

	it('lowercases English names', () => {
		const localities = result<ApiLocality[]>('cities-tel-en');
		const pick = pickCandidate('TEL AVIV - YAFO', localities, 'exact');
		expect(pick).toMatchObject({ status: 'found', candidate: { id: '1212' } });
	});
});

describe('dedupeById', () => {
	it('keeps the first row per id', () => {
		expect(dedupeById([c('1', 'a'), c('2', 'b'), c('1', 'c')]).map((x) => x.n)).toEqual(['a', 'b']);
	});
});

describe('prefixQueries', () => {
	it('queries as typed, then normalized, then the first typed word', () => {
		expect(prefixQueries(' תל-אביב  יפו ')).toEqual([
			{ prefix: 'תל-אביב יפו', fallback: false },
			{ prefix: 'תל אביב יפו', fallback: false },
			{ prefix: 'תל-אביב', fallback: true },
		]);
	});

	it('keeps quote marks in the typed query', () => {
		expect(prefixQueries('ביה"ס שער').map((q) => q.prefix)).toEqual([
			'ביה"ס שער',
			'ביהס שער',
			'ביה"ס',
		]);
	});

	it('drops duplicate queries', () => {
		expect(prefixQueries('אלעד')).toEqual([{ prefix: 'אלעד', fallback: false }]);
	});
});

describe('resolveByName', () => {
	it('queries the name as typed first', async () => {
		const search = vi.fn(async () => result<ApiLocality[]>('cities-telaviv-he'));
		const pick = await resolveByName('תל  אביב - יפו', search, 'exact');
		expect(search).toHaveBeenCalledWith('תל אביב - יפו');
		expect(search).toHaveBeenCalledTimes(1);
		expect(pick.status).toBe('found');
	});

	it('finds names with quote marks', async () => {
		const school = c('1559', 'ביה"ס שער');
		const search = vi.fn(async (prefix: string) => (prefix.startsWith('ביה"ס') ? [school] : []));
		expect(await resolveByName('ביה"ס שער', search, 'exact')).toEqual({
			status: 'found',
			candidate: school,
		});
	});

	it('tries the normalized name when the typed one misses', async () => {
		const search = vi.fn(async (prefix: string) =>
			prefix === 'תל אביב יפו' ? [c('1212', 'תל אביב - יפו', 'תל אביב יפו')] : [],
		);
		const pick = await resolveByName('תל-אביב יפו', search, 'exact');
		expect(search.mock.calls.map((call) => call[0])).toEqual(['תל-אביב יפו', 'תל אביב יפו']);
		expect(pick).toMatchObject({ status: 'found', candidate: { id: '1212' } });
	});

	it('falls back to the first word and accepts an exact match there', async () => {
		const search = vi.fn(async (prefix: string) =>
			prefix === 'הרצל' ? [c('1', 'הרצל'), c('2', 'הרצליה')] : [],
		);
		const pick = await resolveByName('הרצל  ', search, 'exact');
		expect(pick).toMatchObject({ status: 'found', candidate: { id: '1' } });
	});

	it('does not silently accept a single fallback candidate in exact mode', async () => {
		const search = vi.fn(async (prefix: string) => (prefix === 'בן' ? [c('7', 'בן גוריון')] : []));
		expect(await resolveByName('בן יהודא', search, 'exact')).toEqual({
			status: 'ambiguous',
			candidates: [c('7', 'בן גוריון')],
		});
		expect(await resolveByName('בן יהודא', search, 'first')).toMatchObject({
			status: 'found',
			candidate: { id: '7' },
		});
	});

	it('does not retry a single word', async () => {
		const search = vi.fn(async () => [] as Candidate[]);
		expect(await resolveByName('זזז', search, 'exact')).toEqual({ status: 'notFound' });
		expect(search).toHaveBeenCalledTimes(1);
	});

	it('returns not found after the fallback also misses', async () => {
		const search = vi.fn(async () => [] as Candidate[]);
		expect(await resolveByName('זזז ששש', search, 'exact')).toEqual({ status: 'notFound' });
		expect(search).toHaveBeenCalledTimes(2);
	});

	it('does not call the API for blank text', async () => {
		const search = vi.fn(async () => [] as Candidate[]);
		expect(await resolveByName('  "  ', search, 'exact')).toEqual({ status: 'notFound' });
		expect(search).not.toHaveBeenCalled();
	});
});

describe('ambiguousMessage', () => {
	it('lists candidates with ids', () => {
		expect(ambiguousMessage('Street', 'הרצל', [c('1', 'הרצל'), c('2', 'רוזנבלום הרצל')])).toBe(
			'Street "הרצל" is ambiguous. Candidates: הרצל (id 1), רוזנבלום הרצל (id 2)',
		);
	});

	it('says "has no exact match" for a single candidate', () => {
		expect(ambiguousMessage('Street', 'בן יהודא', [c('7', 'בן גוריון')])).toBe(
			'Street "בן יהודא" has no exact match. Candidates: בן גוריון (id 7)',
		);
	});

	it('lists at most 10', () => {
		const many = Array.from({ length: 12 }, (_, i) => c(String(i), `n${i}`));
		const message = ambiguousMessage('Locality', 'n', many);
		expect(message).toContain('n9 (id 9)');
		expect(message).not.toContain('n10');
		expect(message.endsWith(', ...')).toBe(true);
	});
});
