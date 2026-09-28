// Opt-in live smoke test against the real Israel Post backend (not run in CI).
//
//   npm run smoke
//   ISRAELPOST_KEY=<key> ISRAELPOST_BASE_URL=<url> npm run smoke   # override the defaults
//
// Runs the Phase 0 core lookups (8 calls, 600 ms apart) and asserts the expected results.

const BASE_URL = (
	process.env.ISRAELPOST_BASE_URL || 'https://apimftprd.israelpost.co.il/mypost-zip'
).replace(/\/+$/, '');
const KEY = process.env.ISRAELPOST_KEY || '5ccb5b137e7444d885be752eda7f767a';
const PAUSE_MS = 600;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path, params) {
	const url = `${BASE_URL}${path}?${new URLSearchParams(params)}`;
	const response = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': KEY } });
	const body = await response.json().catch(() => null);
	if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
	if (body?.ReturnCode !== 0) throw new Error(`${path}: ReturnCode ${body?.ReturnCode}`);
	await sleep(PAUSE_MS);
	return body.Result;
}

const checks = [
	[
		'locality תל א → Tel Aviv 1212',
		async () =>
			(await get('/getcities-lang', { CityStartsWith: 'תל א', Lang: 'he' })).some(
				(c) => c.id === '1212',
			),
	],
	[
		'normalized locality prefix תל אביב יפו → 1212',
		async () =>
			(await get('/getcities-lang', { CityStartsWith: 'תל אביב יפו', Lang: 'he' })).some(
				(c) => c.id === '1212',
			),
	],
	[
		'lowercase English prefix tel aviv → 1212',
		async () =>
			(await get('/getcities-lang', { CityStartsWith: 'tel aviv', Lang: 'en' })).some(
				(c) => c.id === '1212',
			),
	],
	[
		'street דיזנגוף in Tel Aviv → 91992',
		async () =>
			(
				await get('/GetStreets-lang', {
					CityID: '1212',
					CityName: '',
					SearchMode: 'ID-StartsWith',
					StartsWith: 'דיזנגוף',
					Lang: 'he',
				})
			).some((s) => s.id === '91992'),
	],
	[
		'Tel Aviv / Dizengoff / 100 → 6439612',
		async () =>
			(
				await get('/SearchZip-Lang', {
					CityID: '1212',
					StreetID: '91992',
					House: '100',
					Lang: 'he',
					ByMaanimID: 'true',
				})
			).zip === '6439612',
	],
	[
		'locality אלעד → 929',
		async () =>
			(await get('/getcities-lang', { CityStartsWith: 'אלעד', Lang: 'he' })).some(
				(c) => c.id === '929',
			),
	],
	[
		'Elad / PO box 100 → 4081002',
		async () =>
			(await get('/SearchZip-Lang', { CityID: '929', POB: '100', Lang: 'he', ByMaanimID: 'true' }))
				.zip === '4081002',
	],
	[
		'zip 6439612 → Dizengoff 100',
		async () => {
			const result = await get('/searchaddressbyzip-lang', { Zip: '6439612', Lang: 'he' });
			return result.streetid === '91992' && result.houseNum === '100';
		},
	],
];

let failed = 0;
for (const [name, check] of checks) {
	try {
		const passed = await check();
		if (!passed) failed++;
		console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
	} catch (error) {
		failed++;
		console.log(`FAIL  ${name}: ${error.message}`);
	}
}
console.log(
	failed ? `\n${failed} of ${checks.length} checks failed` : `\nAll ${checks.length} checks passed`,
);
process.exitCode = failed ? 1 : 0;
