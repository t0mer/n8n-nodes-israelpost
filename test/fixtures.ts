// Phase 0 captures of the live API (see docs/API.md), keyed by file name.
import addressByZip6439612 from './fixtures/address-by-zip-6439612.json';
import addressByZip6439612En from './fixtures/address-by-zip-6439612-en.json';
import addressByZipNotfound from './fixtures/address-by-zip-notfound.json';
import citiesEladHe from './fixtures/cities-elad-he.json';
import citiesLocalityZip from './fixtures/cities-locality-zip.json';
import citiesNomatch from './fixtures/cities-nomatch.json';
import citiesTelEn from './fixtures/cities-tel-en.json';
import citiesTelavivHe from './fixtures/cities-telaviv-he.json';
import errMissingKey from './fixtures/err-missing-key.json';
import errWrongKey from './fixtures/err-wrong-key.json';
import streetsBadCityid from './fixtures/streets-bad-cityid.json';
import streetsDizengoff from './fixtures/streets-dizengoff.json';
import streetsDizengoffEn from './fixtures/streets-dizengoff-en.json';
import streetsHerzl from './fixtures/streets-herzl.json';
import zipAddressDizengoff100 from './fixtures/zip-address-dizengoff-100.json';
import zipAddressDizengoff100En from './fixtures/zip-address-dizengoff-100-en.json';
import zipAddressDizengoff100EntryAlef from './fixtures/zip-address-dizengoff-100-entry-alef.json';
import zipAddressDizengoff100EntryNum from './fixtures/zip-address-dizengoff-100-entry-num.json';
import zipAddressHouse12 from './fixtures/zip-address-house-12.json';
import zipAddressHouse12HeLetter from './fixtures/zip-address-house-12-he-letter.json';
import zipAddressHouse12a from './fixtures/zip-address-house-12a.json';
import zipAddressHouse9999 from './fixtures/zip-address-house-9999.json';
import zipLocalityOnlyAviyaNozip from './fixtures/zip-locality-only-aviya-nozip.json';
import zipLocalityOnlyTeladashim from './fixtures/zip-locality-only-teladashim.json';
import zipLocalityOnlyTelaviv from './fixtures/zip-locality-only-telaviv.json';
import zipPobElad100 from './fixtures/zip-pob-elad-100.json';
import zipPobNotfound from './fixtures/zip-pob-notfound.json';

export const FIXTURES = {
	'address-by-zip-6439612': addressByZip6439612,
	'address-by-zip-6439612-en': addressByZip6439612En,
	'address-by-zip-notfound': addressByZipNotfound,
	'cities-elad-he': citiesEladHe,
	'cities-locality-zip': citiesLocalityZip,
	'cities-nomatch': citiesNomatch,
	'cities-tel-en': citiesTelEn,
	'cities-telaviv-he': citiesTelavivHe,
	'err-missing-key': errMissingKey,
	'err-wrong-key': errWrongKey,
	'streets-bad-cityid': streetsBadCityid,
	'streets-dizengoff': streetsDizengoff,
	'streets-dizengoff-en': streetsDizengoffEn,
	'streets-herzl': streetsHerzl,
	'zip-address-dizengoff-100': zipAddressDizengoff100,
	'zip-address-dizengoff-100-en': zipAddressDizengoff100En,
	'zip-address-dizengoff-100-entry-alef': zipAddressDizengoff100EntryAlef,
	'zip-address-dizengoff-100-entry-num': zipAddressDizengoff100EntryNum,
	'zip-address-house-12': zipAddressHouse12,
	'zip-address-house-12-he-letter': zipAddressHouse12HeLetter,
	'zip-address-house-12a': zipAddressHouse12a,
	'zip-address-house-9999': zipAddressHouse9999,
	'zip-locality-only-aviya-nozip': zipLocalityOnlyAviyaNozip,
	'zip-locality-only-teladashim': zipLocalityOnlyTeladashim,
	'zip-locality-only-telaviv': zipLocalityOnlyTelaviv,
	'zip-pob-elad-100': zipPobElad100,
	'zip-pob-notfound': zipPobNotfound,
} as const;

export type FixtureName = keyof typeof FIXTURES;
