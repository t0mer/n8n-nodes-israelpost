import type { Candidate, NameMatching } from './types';

const MAX_LISTED_CANDIDATES = 10;

/**
 * Normalizes a locality or street name for comparison: niqqud and quote marks
 * removed, dashes (incl. the Hebrew maqaf) turned into spaces, whitespace
 * collapsed, English lowercased. Spelling variants such as קריית / קרית are
 * deliberately left alone.
 */
export function normalizeName(text: string): string {
	return text
		.replace(/[-‐‑‒–—―־]/g, ' ')
		.replace(/[֑-ׇ]/g, '')
		.replace(/["'`״׳“”„‘’‚]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * Prefixes to query, in order: the name as typed (whitespace collapsed; the API
 * matches names with their quote marks and dashes), the normalized name, and
 * the first typed word as the fallback.
 */
export function prefixQueries(text: string): { prefix: string; fallback: boolean }[] {
	const typed = text.replace(/\s+/g, ' ').trim();
	const queries = [
		{ prefix: typed, fallback: false },
		{ prefix: normalizeName(text), fallback: false },
		{ prefix: typed.split(' ')[0], fallback: true },
	];
	const seen = new Set<string>();
	return queries.filter(({ prefix }) => {
		if (!prefix || seen.has(prefix)) return false;
		seen.add(prefix);
		return true;
	});
}

/** Keeps the first row per id: the API lists spelling variants of one locality under one id. */
export function dedupeById<T extends Candidate>(candidates: T[]): T[] {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		if (seen.has(candidate.id)) return false;
		seen.add(candidate.id);
		return true;
	});
}

export type PickResult<T> =
	| { status: 'found'; candidate: T }
	| { status: 'ambiguous'; candidates: T[] }
	| { status: 'notFound' };

/**
 * Picks one candidate for `text`: an exact normalized match on the name or its
 * synonym, else the only candidate, else (`first` mode) the top one. In `exact`
 * mode several non-matching candidates are ambiguous, and so is a single
 * candidate found only by the first-word fallback (it may be a different name).
 */
export function pickCandidate<T extends Candidate>(
	text: string,
	candidates: T[],
	mode: NameMatching,
	fromFallback = false,
): PickResult<T> {
	const unique = dedupeById(candidates);
	if (unique.length === 0) return { status: 'notFound' };
	const wanted = normalizeName(text);
	const exact = unique.find(
		(c) => normalizeName(c.n) === wanted || normalizeName(c.syn ?? '') === wanted,
	);
	if (exact) return { status: 'found', candidate: exact };
	if (mode === 'first' || (unique.length === 1 && !fromFallback)) {
		return { status: 'found', candidate: unique[0] };
	}
	return { status: 'ambiguous', candidates: unique };
}

/**
 * Looks `text` up by prefix (see `prefixQueries`) and picks a candidate from
 * the first query that returns any.
 */
export async function resolveByName<T extends Candidate>(
	text: string,
	search: (prefix: string) => Promise<T[]>,
	mode: NameMatching,
): Promise<PickResult<T>> {
	if (!normalizeName(text)) return { status: 'notFound' };
	for (const { prefix, fallback } of prefixQueries(text)) {
		const candidates = await search(prefix);
		if (candidates.length > 0) return pickCandidate(text, candidates, mode, fallback);
	}
	return { status: 'notFound' };
}

/** `Locality "X" is ambiguous. Candidates: A (id 1), B (id 2), ...` (or "has no exact match" for one) */
export function ambiguousMessage(kind: string, text: string, candidates: Candidate[]): string {
	const listed = candidates
		.slice(0, MAX_LISTED_CANDIDATES)
		.map((c) => `${c.n} (id ${c.id})`)
		.join(', ');
	const more = candidates.length > MAX_LISTED_CANDIDATES ? ', ...' : '';
	const problem = candidates.length > 1 ? 'is ambiguous' : 'has no exact match';
	return `${kind} "${text}" ${problem}. Candidates: ${listed}${more}`;
}
