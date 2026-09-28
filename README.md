# n8n-nodes-israelpost

An [n8n](https://n8n.io/) community node that finds Israeli postal codes (מיקוד) from a street
address or a PO box. It also works the other way, finding the address of a zip code, and it can
search localities and streets. It uses the same backend as the Israel Post
[locate-zip page](https://doar.israelpost.co.il/locatezip).

> [!WARNING]
> **Unofficial.** This package is not affiliated with, endorsed by or supported by Israel Post.
> It calls the undocumented backend that the Israel Post website uses from the browser. There is
> no SLA, and the endpoints or the key can change or stop working without notice. Keep batch
> volumes reasonable: the node sends requests one at a time, caches lookups within an
> execution, and has a delay option for large batches.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Name matching](#name-matching) · [Batches](#batches) · [Errors](#errors) · [License](#license)

## Installation

**In n8n (recommended):** go to **Settings → Community Nodes → Install**, enter
`@t0mer/n8n-nodes-israelpost` and confirm.

**Manually** (self-hosted), in your n8n user folder (usually `~/.n8n`):

```bash
npm install @t0mer/n8n-nodes-israelpost
```

Then restart n8n. See the n8n
[community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
for details.

## Credentials

Create an **Israel Post API** credential. The defaults work as they are:

| Field | Default | Notes |
|---|---|---|
| Subscription Key | the public key of the Israel Post website | Sent as the `Ocp-Apim-Subscription-Key` header |
| Base URL | `https://apimftprd.israelpost.co.il/mypost-zip` | Change only if Israel Post moves the API |

The key isn't a secret: the Israel Post website ships it in its JavaScript, and every visitor's
browser sends it. It is stored in a credential, not hard-coded, so you can replace it without
waiting for a new release if Israel Post rotates it.

**If requests start failing with "Israel Post rejected the subscription key" (HTTP 401):**

1. Open <https://doar.israelpost.co.il/locatezip> and your browser's developer tools
   (**Network** tab).
2. Look up any address.
3. Click a request to `apimftprd.israelpost.co.il` and copy the `Ocp-Apim-Subscription-Key`
   request header.
4. Paste it into the credential's **Subscription Key**.

## Operations

| Resource | Operation | What it does |
|---|---|---|
| Zip Code | **Find by Address** (default) | Locality + street + house number (+ entrance) → zip code |
| Zip Code | **Find by PO Box** | Locality + PO box number → zip code |
| Locality | **Search** | Localities whose name starts with the search text |
| Street | **Search** | Streets of a locality whose name starts with the search text |
| Address | **Find by Zip** | Zip code → locality, street, house number and entrance |

The node can also be used as a tool by AI agents.

### Zip Code › Find by Address

| Parameter | Notes |
|---|---|
| Locality | **By Name** (default: what workflows usually have), **From List** (searchable) or **By ID** |
| Street | Same three modes. Leave it empty to get the zip of a locality that has a single one. |
| House Number | Required when a street is set. Digits only: Israel Post rejects letter suffixes such as `12א`. |
| Entrance | Optional (כניסה), usually a Hebrew letter. Leave it empty unless the building has entrances, because an entrance the building doesn't have makes Israel Post return no zip. |

Input `תל אביב - יפו` / `דיזנגוף` / `100`:

```json
{
  "found": true,
  "zip": "6439612",
  "source": "address",
  "locality": { "id": "1212", "name": "תל אביב - יפו", "code": "5000" },
  "street": { "id": "91992", "name": "דיזנגוף", "code": "0404" },
  "house": "100",
  "entrance": "",
  "message": "המיקוד לכתובת הינו: 6439612"
}
```

`source` shows where the zip came from:

- `address`: the full address.
- `locality`: the locality has a single zip. This happens when no street was given. It also
  happens when the street wasn't found in such a locality, and then a `note` explains the fallback.
- `pobox`: a PO box.

`code` is the CBS locality or street code (סמל יישוב / סמל רחוב). A locality or street given by
ID has `name` and `code` set to `null`, because no name lookup was made.

Small localities often have one zip code for the whole place. Input `תל עדשים`, no street:

```json
{ "found": true, "zip": "1931500", "source": "locality", "locality": { "id": "68", "name": "תל עדשים", "code": "0103" }, "street": null, "house": "", "entrance": "", "message": null }
```

### Zip Code › Find by PO Box

Input `אלעד` / `100`:

```json
{
  "found": true,
  "zip": "4081002",
  "source": "pobox",
  "locality": { "id": "929", "name": "אלעד", "code": "1309" },
  "poBox": "100",
  "message": "המיקוד עבור ת.ד 100 באלעד הינו:"
}
```

### Locality › Search

Returns one item per locality: `{ id, name, synonym, code, localityZip, divided }`.
`localityZip` is the zip of the whole locality, or `null` when the zip depends on the street.
Use **Return All** or **Limit**.

```json
{ "id": "68", "name": "Tel Adashim", "synonym": "Tel Adashim", "code": "0103", "localityZip": "1931500", "divided": false }
```

### Street › Search

Takes a Locality (any mode) and returns one item per street:
`{ id, name, synonym, code, localityId }`.

### Address › Find by Zip

Input `6439612` (spaces and dashes are ignored):

```json
{
  "found": true,
  "zip": "6439612",
  "locality": { "id": "1212", "name": "תל אביב - יפו", "code": null },
  "street": { "id": "91992", "name": "דיזנגוף", "code": null },
  "house": "100",
  "entrance": "",
  "message": "תל אביב - יפו, דיזנגוף 100"
}
```

PO box zip codes have no street address, so Israel Post reports them as not found.

### Options

| Option | Default | Operations | Meaning |
|---|---|---|---|
| Language | Hebrew | all | `he` or `en`. Names and messages come back in this language, and names you search for are matched in it. English names can differ from a transliteration: street 91992 is `Meir Dizengoff`. |
| Name Matching | Exact | Find by Address / PO Box | See [Name matching](#name-matching) |
| On Not Found | Error | Find operations | **Error** fails the item. **Return Empty** outputs it with `found: false` and `zip: null`. |
| Include Raw Response | off | Find operations | Adds `raw` with the unmodified Israel Post results |
| Delay Between Items (Ms) | 0 | Find operations | Waits before each item after the first |
| Put Output in Field | empty | Find operations | Keeps the input item and puts the result under this field, e.g. `postal` |

## Name matching

Localities and streets given **By Name** are looked up by prefix and then matched after
normalization. Normalization:

- removes niqqud and quote marks (`"` `'` `״` `׳` `“` `”`)
- turns dashes, including the Hebrew maqaf, into spaces
- collapses whitespace
- lowercases English

So `תל-אביב - יפו`, `תל אביב יפו` and `תל אביב - יפו` all match Tel Aviv. Spelling variants are
**not** unified: `קריית` and `קרית` are different names.

The node searches Israel Post with the name as you typed it, then with the normalized name, and
finally with the first word only, as typed and normalized (so `תל אביב העיר` still reaches `תל אביב - יפו`). It stops at the
first search that returns results, then picks one:

1. an exact normalized match on the name or its synonym, if there is one
2. otherwise the only result, if there is exactly one, unless it came from the first-word search
3. otherwise:
   - **Exact** (default) fails and lists the candidates, e.g.
     `Street "דיזנגו" is ambiguous. Candidates: דיזנגוף (id 91992), דיזנגוף סנטר (id 113842), …`.
     A single first-word result is reported the same way (`… has no exact match. Candidates: …`),
     because a typo like `בן יהודא` shouldn't silently become `בן גוריון`.
   - **First Result** takes the top result

Use **By ID** (or **From List**) when you already know the Israel Post ID. Use Locality or
Street **Search** to find an ID.

## Batches

- **Cache:** within one execution, each locality and street name is looked up once. So 500
  addresses in the same city send one locality lookup, one lookup per distinct street, and one
  zip lookup per address.
- **Requests are sequential.** Use **Delay Between Items** to slow large batches down further.
- Turn on **Continue On Fail** (node settings) so that one bad address doesn't stop the batch.
  The failing item comes out as `{ "error": "…" }`, paired with its input item.
- **Retries:** HTTP 429 and 5xx responses are retried twice, after 1 s and then 3 s.

## Errors

| Error | Meaning |
|---|---|
| `Israel Post rejected the subscription key` | The key has changed. See [Credentials](#credentials). |
| `Locality "X" is ambiguous. Candidates: …` | Several matches, or only a first-word match (`has no exact match`). Use a fuller name, By ID, or Name Matching = First Result. |
| `Locality "X" has no single zip code, a street is required` | The locality is split by street |
| `Locality "X" has no zip code` | A few small localities have no zip code at all (follows On Not Found) |
| `No zip code found for …` | Israel Post has no zip for this input (e.g. a house number that doesn't exist, or a wrong entrance) |
| `Unexpected response from Israel Post (the site may have changed)` | The backend changed. Please open an issue. |

## Development

```bash
npm install
npm run build
npm run lint
npm test          # unit tests with recorded API responses, no network
npm run smoke     # opt-in: 8 live calls against the real backend
```

`docs/API.md` documents the backend as verified on 2026-09-28.

## License

[MIT](LICENSE)
