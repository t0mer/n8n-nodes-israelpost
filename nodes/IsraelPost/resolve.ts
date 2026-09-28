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

/** First word of an already normalized name. */
export function firstWord(normalized: string): string {
	return normalized.split(' ')[0] ?? '';
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

export type Pick<T> =
	| { status: 'found'; candidate: T }
	| { status: 'ambiguous'; candidates: T[] }
	| { status: 'notFound' };

/**
 * Picks one candidate for `text`: an exact normalized match on the name or its
 * synonym, else the only candidate, else (`first` mode) the top one. In `exact`
 * mode several non-matching candidates are ambiguous.
 */
export function pickCandidate<T extends Candidate>(
	text: string,
	candidates: T[],
	mode: NameMatching,
): Pick<T> {
	const unique = dedupeById(candidates);
	if (unique.length === 0) return { status: 'notFound' };
	const wanted = normalizeName(text);
	const exact = unique.find(
		(c) => normalizeName(c.n) === wanted || normalizeName(c.syn ?? '') === wanted,
	);
	if (exact) return { status: 'found', candidate: exact };
	if (unique.length === 1 || mode === 'first') return { status: 'found', candidate: unique[0] };
	return { status: 'ambiguous', candidates: unique };
}

/**
 * Looks `text` up by prefix and picks a candidate. Queries the full normalized
 * text first and, if that returns nothing, the first word once (so `תל אביב`
 * still finds `תל אביב - יפו`).
 */
export async function resolveByName<T extends Candidate>(
	text: string,
	search: (prefix: string) => Promise<T[]>,
	mode: NameMatching,
): Promise<Pick<T>> {
	const normalized = normalizeName(text);
	if (!normalized) return { status: 'notFound' };
	let candidates = await search(normalized);
	const word = firstWord(normalized);
	if (candidates.length === 0 && word && word !== normalized) {
		candidates = await search(word);
	}
	return pickCandidate(text, candidates, mode);
}

/** `Locality "X" is ambiguous. Candidates: A (id 1), B (id 2), ...` */
export function ambiguousMessage(kind: string, text: string, candidates: Candidate[]): string {
	const listed = candidates
		.slice(0, MAX_LISTED_CANDIDATES)
		.map((c) => `${c.n} (id ${c.id})`)
		.join(', ');
	const more = candidates.length > MAX_LISTED_CANDIDATES ? ', ...' : '';
	return `${kind} "${text}" is ambiguous. Candidates: ${listed}${more}`;
}
