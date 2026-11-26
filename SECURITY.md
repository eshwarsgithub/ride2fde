# Security policy

## Reporting a vulnerability

Please **report security problems privately**, not in a public issue.

Use GitHub's private reporting: go to the **Security** tab of this repository and choose
**Report a vulnerability**
([direct link](https://github.com/eshwarsgithub/ride2fde/security/advisories/new)). Only the maintainer can see it.

Please include:

- what the problem is and where (a file, an endpoint, a page),
- the steps to reproduce it,
- what an attacker could do with it.

This is a volunteer community project, so there is no formal response time, but the maintainer will do their best to
acknowledge a report within a week and to keep you updated.

## What is covered

The latest code on `main` and the live site at <https://ride2fde.pages.dev>. Examples of things we want to hear
about: a way to read or change other people's data that the app doesn't intend to allow, injection or cross-site
scripting through names, contact details or the API, or secrets exposed in the repository.

## Known design trade-offs (not vulnerabilities)

These are documented limitations, so reports about them alone aren't needed:

- **There is no login.** Everything people add, including the contact details they choose to share, is returned by
  the public API and visible to anyone who has the link. The app only *displays* contact options on matching people.
  See [Contacts and privacy](README.md#contacts-and-privacy).
- **Search text and route points go to public OpenStreetMap services** (Photon for search, OSRM for routes)
  straight from the browser. No keys are involved.

## Please don't

- Run load tests, scans or automated attacks against the live site.
- Submit real or fake entries to the live site to "test" something. Use a local copy
  ([how](CONTRIBUTING.md#getting-set-up)).
- Access, change or delete data that isn't yours.

If you find a problem while following these rules, thank you, and you will be credited in the fix if you'd like to be.
