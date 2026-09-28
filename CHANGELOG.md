# Changelog

## 2026.9.0

First release.

- **Zip Code › Find by Address:** locality, street, house number and entrance → 7-digit zip code.
  Falls back to the locality-wide zip for localities that have one.
- **Zip Code › Find by PO Box:** locality and PO box number → zip code.
- **Address › Find by Zip:** zip code → locality, street, house number and entrance.
- **Locality › Search** and **Street › Search:** prefix search with readable output keys.
- Locality and Street pickers work By Name, From List (searchable) or By ID.
- Name matching normalizes quote marks, dashes, niqqud and case. Exact mode lists the
  candidates when a name is ambiguous.
- Options:
  - Language (he / en)
  - Name Matching
  - On Not Found (error or empty result)
  - Include Raw Response
  - Delay Between Items
  - Put Output in Field
- Per-execution lookup cache, retries on 429 / 5xx, a clear error when the subscription key is
  rejected, and Continue On Fail support.
- Israel Post API credential, prefilled with the public key of the Israel Post website.
