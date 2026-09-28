# Israel Post zip-code API (verified behaviour)

Verified live on **2026-09-28** with 36 calls against the production gateway.
This is the undocumented backend of <https://doar.israelpost.co.il/locatezip> and
`/addressByZip`. It is not a public API. It can change without notice.

## Transport

| Item | Value |
|---|---|
| Base URL | `https://apimftprd.israelpost.co.il/mypost-zip` |
| Method | `GET` for every endpoint |
| Auth | header `Ocp-Apim-Subscription-Key: 5ccb5b137e7444d885be752eda7f767a` |
| `Authorization` header | Not needed. The site sends `Authorization: Bearer <JC cookie>`, which is `Bearer null` for anonymous visitors. Responses are byte-identical with and without it. |
| Query encoding | UTF-8, URL-encoded (Hebrew values included) |
| Response type | `application/json; charset=utf-8` |

The key is hard-coded in the site's main bundle (`/assets/index-<hash>.js`):
the axios instance uses `baseURL: "https://apimftprd.israelpost.co.il"` and
`headers: {"Ocp-Apim-Subscription-Key": "5ccb5b137e7444d885be752eda7f767a"}`,
and the same value appears as the production `apimKey` config. The bundle
references exactly four `mypost-zip` endpoints: `getcities-lang`,
`GetStreets-lang`, `SearchZip-Lang` and `searchaddressbyzip-lang`.

## Envelope

Every successful call returns HTTP 200:

```json
{ "ReturnCode": 0, "ErrorMessage": null, "Result": ... }
```

Every call observed returned `ReturnCode: 0`, including "not found" cases. Search
misses show up as an empty `Result` array. Zip misses show up inside `Result`
(see `msgtype` below). Keep a check for `ReturnCode !== 0` anyway.

## Errors

| Case | HTTP | Body |
|---|---|---|
| Missing key | 401, `application/json` (no charset) | `{ "statusCode": 401, "message": "Access denied due to missing subscription key. Make sure to include subscription key when making requests to an API." }` |
| Wrong key | 401 | `{ "statusCode": 401, "message": "Access denied due to invalid subscription key. Make sure to provide a valid key for an active subscription." }` |

The 401 is an Azure API Management error. It does **not** use the envelope.

## 1. Localities: `GET /getcities-lang`

| Param | Notes |
|---|---|
| `CityStartsWith` | Prefix of the locality name. Matched against `n` and `syn`. |
| `Lang` | `he` or `en`. Names come back in that language. |

`Result` is an array of:

```json
{"id":"1212","sym":"5000","n":"תל אביב - יפו","syn":"תל אביב יפו","divided":true,"zip":"0000000"}
```

- `id`: `CityID` for the other calls. `sym`: CBS locality code (can be `"0000"`).
- `n`: display name. `syn`: search synonym.
- `zip`: the locality-wide zip, or `"0000000"` when there is none.
- `divided`: the locality is split by street. The site then requires street and house.
- **The same `id` can appear more than once** with different `n` (spelling variants,
  e.g. `אבנת` / `אובנת`, `בית חגלה` / `בית חוגלה`). The site de-duplicates by `id`.
- `divided === (zip === "0000000")` holds for all but 21 of 1545 rows. The exceptions
  are small settlements with `divided:false` and `zip:"0000000"`. They have no zip at all
  (e.g. `אביה`, id 2888).
- No match → `Result: []`.
- Empty `CityStartsWith` → the full list (1545 rows, ~155 KB). The site only queries
  with 2+ characters.

Examples: `תל א` (he) → one row, Tel Aviv 1212. `Tel` (en) → Tel Adashim, Tel Aviv -
Yafo, Tel Hashomer, … `תל עד` → `תל עדשים` id 68, `divided:false`, `zip:"1931500"`.

## 2. Streets: `GET /GetStreets-lang`

| Param | Notes |
|---|---|
| `CityID` | From step 1 |
| `CityName` | Sent empty by the site |
| `SearchMode` | `ID-StartsWith` |
| `StartsWith` | Prefix, matched against `n` **and** `syn` |
| `Lang` | `he` or `en` |

`Result` is an array of `{"id":"91992","sym":"0404","n":"דיזנגוף","syn":"דיזנגוף","cityID":"1212"}`.

- `דיזנגוף` → `דיזנגוף` (91992), `דיזנגוף סנטר`, `כיכר דיזנגוף` (matched via
  `syn` `דיזנגוף ככר`).
- `הרצל` → `הרצל` (104270) and `רוזנבלום הרצל` (matched via `syn` `הרצל רוזנבלום`).
- English names differ: street 91992 is `Meir Dizengoff` in English, so `Dizen`
  (en) returns only `Dizengoff Center`.
- Unknown `CityID` → `Result: []` (no error).

## 3. Zip: `GET /SearchZip-Lang`

Always send `ByMaanimID=true`.

**By address:** `CityID`, `StreetID`, `House`, `Entry` (may be empty), `Lang`.
**By PO box:** `CityID`, `POB`, `Lang`.
**Locality only:** `CityID`, `Lang` (the site's deep-link code sends only the
params it has).

`Result` always has the same full shape:

```json
{"zip":"6439612","cityid":null,"cityname":null,"streetid":null,"streetname":null,
 "msgtype":"address","messageResult":"המיקוד לכתובת הינו: 6439612",
 "pob":null,"houseNum":null,"entrance":null}
```

`msgtype` values: `address`, `POB`, `unitedtown`, `notfound`.

| Case | msgtype | zip | messageResult |
|---|---|---|---|
| Tel Aviv / דיזנגוף (91992) / 100 | `address` | `6439612` | `המיקוד לכתובת הינו: 6439612` |
| Same, `Lang=en` | `address` | `6439612` | `The postal code for the address is: 6439612` (English) |
| Tel Aviv / דיזנגוף / 12 | `address` | `6407101` | |
| Elad (929) / POB 100 | `POB` | `4081002` | `המיקוד עבור ת.ד 100 באלעד הינו:` (zip not in the text). `cityname: "אלעד"` |
| Elad / POB 99999 | `notfound` | `null` | `לא נמצא מיקוד` |
| House 9999 (does not exist) | `unitedtown` | `""` | `המיקוד לכתובת הינו: ` |
| House `12א` or `12a` | `unitedtown` | `""` | letter suffix is **not** accepted (the site allows digits only, max 4) |
| House 100 + `Entry=א`, `ב` or `2` (building without entrances) | `unitedtown` | `""` | a wrong entrance **breaks** a good address |
| Tel Adashim (68), no street | `unitedtown` | `1931500` | locality-wide zip |
| Tel Aviv (1212), no street | `unitedtown` | `""` | |
| אביה (2888, no zip), no street | `unitedtown` | `""` | |

Rules for the client:
- The code is `Result.zip` only when it matches `^\d{7}$`. `""`, `null` and
  `notfound` all mean not found.
- Do not parse `messageResult` for the zip. The PO box text doesn't contain it.
- Send `Entry` only when the user gave one.

### Entrance (`Entry`) format

The locate-zip page sends the value of its entrance field as is. A shared address
component in the same bundle maps a select (`1`→`א` … `10`→`י`, English `A`…)
and sends the **Hebrew letter** (`Entry: "א"`). No address was found within the
call budget where an entrance changes the zip. Behaviour with a real entrance is
unverified. It is verified that any entrance on a building without entrances
returns an empty zip.

## 4. Reverse lookup: `GET /searchaddressbyzip-lang`

Found in the main bundle (`oo.get("/mypost-zip/searchaddressbyzip-lang", {params:{Zip, Lang}})`),
used by `/addressByZip`. **Works.**

| Param | Notes |
|---|---|
| `Zip` | 7 digits |
| `Lang` | `he` or `en` |

`6439612` (he):

```json
{"zip":null,"cityid":"1212","cityname":"תל אביב - יפו","streetid":"91992","streetname":"דיזנגוף",
 "msgtype":"address","messageResult":"תל אביב - יפו, דיזנגוף 100","pob":null,"houseNum":"100","entrance":""}
```

- `Lang=en` → `cityname: "Tel Aviv - Yafo"`, `streetname: "Meir Dizengoff"`,
  `messageResult: "Tel Aviv - Yafo, Meir Dizengoff 100"`.
- Unknown zip `1111111` → `msgtype: "notfound"`, `messageResult: "לא נמצא מיקוד"`.
- A PO box zip (`4081002`) → `notfound`. Reverse lookup covers street addresses only.
- The site also handles `msgtype` `POB` and `unitedtown` for this endpoint, but neither was seen.
- `zip` is always `null` in the result. Adjacent zips map to adjacent house numbers
  (6439613 → Dizengoff 101, 6439614 → Dizengoff 102).

## Fixtures

Pretty-printed response bodies are in `test/fixtures/*.json`: one file per case above.
Raw captures with response headers are in the gitignored `test/fixtures/raw/`.
