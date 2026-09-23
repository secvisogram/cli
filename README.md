# @secvisogram/cli

A command-line interface for rendering [CSAF](https://oasis-open.github.io/csaf-documentation/)
(Common Security Advisory Framework) documents (versions 2.0 and 2.1) to
HTML, without needing the [Secvisogram](https://github.com/secvisogram/secvisogram)
web app - see [issue #606](https://github.com/secvisogram/secvisogram/issues/606).

It uses [`@secvisogram/html-template`](https://github.com/secvisogram/html-template)
for the actual rendering, and is a thin wrapper around it.

> [!NOTE]
> This package is not yet published to npm. Until it is, `npm install` only
> works from a checkout that also has a sibling `../html-template` checkout
> present (see [Development](#development)) - `@secvisogram/html-template`
> is currently referenced via a `file:../html-template` dependency, not a
> published version.

## Installation

```sh
npm install -g @secvisogram/cli
```

## Usage

```sh
secvisogram-render render <input-file.json> [-o <output-file.html>]
secvisogram-render --help
secvisogram-render --version
```

- `<input-file.json>` - path to a CSAF 2.0 or 2.1 JSON document.
- `--output, -o <output-file.html>` - path to write the rendered HTML to.
  If omitted, the HTML is written to stdout instead.
- `--help, -h` - print usage information. Works both on its own
  (`secvisogram-render --help`) and after a command
  (`secvisogram-render render --help`).
- `--version, -v` - print the installed version of `@secvisogram/cli`.

### Examples

Render to stdout:

```sh
secvisogram-render render advisory.json
```

Render to a file:

```sh
secvisogram-render render advisory.json -o advisory.html
```

The CSAF version (`2.0` or `2.1`) is read from the document's
`document.csaf_version` field; there's no separate flag to select it.
Any other value (or a missing field) is rejected with an error.

The output is a single, self-contained HTML file/string - all CSS is
inlined into `<style>` tags, so it works fully offline and can be opened
directly from disk (`file://...`) without any other files alongside it.

## Exit codes

The CLI exits with `1` and prints a message prefixed with `error:` to
stderr (instead of a raw stack trace) for:

- a missing or unreadable input file
- invalid JSON in the input file (a leading UTF-8 byte-order-mark, if
  present, is stripped automatically before parsing)
- an unsupported or missing `document.csaf_version`
- a failure while writing the output file
- an unknown or missing command

On success, it exits with `0`.

## Known limitations

- Only the two bundled templates (for CSAF 2.0 and 2.1) can be used;
  there's currently no way to supply a custom template (tracked as a
  follow-up to [issue #606](https://github.com/secvisogram/secvisogram/issues/606),
  which originally requested this).

## Development

This package depends on [`@secvisogram/html-template`](https://github.com/secvisogram/html-template)
via a local `file:../html-template` path (see the note above), so it
currently needs to be checked out as a sibling directory:

```sh
git clone https://github.com/secvisogram/html-template ../html-template
git clone https://github.com/secvisogram/cli
cd cli
npm install
npm test   # type-check, prettier --check, and run the test suite
```
