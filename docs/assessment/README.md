# The assessment brief

[`brief.md`](brief.md) is the assessment as it was handed over — the requirements
and the rubric, verbatim, unedited.

It is committed for one reason: so that every claim in this repository can be
checked against the thing it claims to satisfy. A design decision is only
defensible next to the requirement it answers, and "the brief asked for this" is
not verifiable when the brief lives in an email.

Where the implementation departs from it, the deviation is named and argued in
the root [`README.md`](../../README.md) rather than left for a reader to notice.
There are two, and both come from the same place: the brief asks the store to
hold `jobs[]` *and* says it "must NOT duplicate server state", which cannot both
be honoured literally.

## What the brief settles

Questions that would otherwise be guesses, answered by the document itself:

| Question | The brief |
|---|---|
| Which country is this for? | Never stated. But `Address` is enumerated as Street, City, **State**, **ZipCode**, Latitude, Longitude (§3.1) and repeated in SQL as `state, zip_code` (§4.1). That is a US address, and there is no `Country` field in either list. |
| Internationalisation? | Not mentioned. No locale, no currency, no time zone requirement anywhere in the document. |
| Which invoice currency? | Not specified. `USD` is this implementation's choice, and `Money` carries an ISO-4217 code as data rather than assuming one. |
| Jest or Vitest? | §5.1 is titled "Jest" but requires `expectTypeOf` "(from `vitest`)". Resolved as Vitest only — see the root README. |
