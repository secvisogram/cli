#!/usr/bin/env node

import {
  enrichDocumentV2_0,
  enrichDocumentV2_1,
  HTMLTemplate2_0,
  HTMLTemplate2_1,
  renderMarkdown,
} from '@secvisogram/html-template'
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const args = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
})

const [cmd] = args.positionals
// Pass through everything after the command token, unmodified. We can't
// just filter process.argv.slice(2) for values equal to `cmd` (as before) -
// that would also strip any option *value* that happens to equal the
// command name, e.g. `render -o render` would lose the "render" value for
// `-o`. Since `cmd` is always args.positionals[0], and parseArgs guarantees
// positionals appear in argv in the same relative order they were given,
// the command token is simply the first occurrence of `cmd` in argv.
const cmdIndex = process.argv.slice(2).indexOf(cmd)
const argv = process.argv.slice(2).filter((_, i) => i !== cmdIndex)

if (args.values.version) {
  console.log(await readOwnVersion())
} else if (args.values.help) {
  // Checked before dispatching to a subcommand, so `--help`/`-h` works the
  // same whether given as `secvisogram-render --help` or
  // `secvisogram-render render --help`.
  renderHelp()
} else if (cmd === 'render') {
  await render(argv)
} else if (!cmd) {
  console.error('error: missing command')
  renderHelp()
  process.exitCode = 1
} else {
  console.error(`unknown command: ${cmd}`)
  renderHelp()
  process.exitCode = 1
}

/**
 * Reads this package's own version from its package.json, since a plain
 * JSON import would need import attribute syntax that isn't available
 * consistently across the Node versions this CLI supports.
 */
async function readOwnVersion() {
  const packageJsonPath = fileURLToPath(
    new URL('../package.json', import.meta.url),
  )
  const raw = await readFile(packageJsonPath, 'utf8')
  return /** @type {{ version: string }} */ (JSON.parse(raw)).version
}

/**
 * @param {string[]} argv
 */
async function render(argv) {
  let args
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        output: {
          type: 'string',
          short: 'o',
        },
      },
    })
  } catch (/** @type {any} */ err) {
    console.error(`error: ${err.message}`)
    renderHelp()
    process.exitCode = 1
    return
  }
  const inputPath = args.positionals[0]
  const outputPath = args.values.output

  if (!inputPath) {
    console.error('error: missing required argument <input-file.json>')
    renderHelp()
    process.exitCode = 1
    return
  }

  let raw
  try {
    raw = await readFile(inputPath, 'utf8')
  } catch (/** @type {any} */ err) {
    if (err.code === 'ENOENT') {
      console.error(`error: input file not found: ${inputPath}`)
    } else {
      console.error(
        `error: could not read input file: ${inputPath}\n${err.message}`,
      )
    }
    process.exitCode = 1
    return
  }

  // Strip a leading UTF-8 byte-order-mark (BOM), if present, so JSON.parse
  // doesn't choke on it.
  const withoutBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw

  let csafDoc
  try {
    csafDoc = JSON.parse(withoutBom)
  } catch (/** @type {any} */ err) {
    console.error(`error: invalid JSON in ${inputPath}: ${err.message}`)
    process.exitCode = 1
    return
  }

  // JSON.parse accepts any JSON value at the top level (e.g. `null`, `42`,
  // `"a string"`, `[1, 2, 3]`), not just objects, so this must be checked
  // explicitly - a CSAF document has to be an object to have a
  // `.document.csaf_version` field at all.
  if (
    typeof csafDoc !== 'object' ||
    csafDoc === null ||
    Array.isArray(csafDoc)
  ) {
    console.error(
      `error: invalid CSAF document in ${inputPath}: expected a JSON object at the top level, got ${
        csafDoc === null
          ? 'null'
          : Array.isArray(csafDoc)
            ? 'an array'
            : typeof csafDoc
      }`,
    )
    process.exitCode = 1
    return
  }

  const version = csafDoc.document?.csaf_version
  let html

  try {
    if (version === '2.0') {
      const { document: enrichedDoc } = enrichDocumentV2_0(csafDoc)
      const parsedDoc = renderMarkdown(enrichedDoc)
      html = HTMLTemplate2_0({ document: parsedDoc })
    } else if (version === '2.1') {
      const { document: enrichedDoc } = enrichDocumentV2_1(csafDoc)
      const parsedDoc = renderMarkdown(enrichedDoc)
      html = HTMLTemplate2_1({ document: parsedDoc })
    } else {
      console.error(
        `error: unsupported or missing csaf_version: ${JSON.stringify(version)}. Expected "2.0" or "2.1".`,
      )
      process.exitCode = 1
      return
    }
  } catch (/** @type {any} */ err) {
    console.error(`error: failed to render document: ${err.message}`)
    process.exitCode = 1
    return
  }

  try {
    if (outputPath) {
      await writeFile(outputPath, html, 'utf8')
    } else {
      process.stdout.write(html)
    }
  } catch (/** @type {any} */ err) {
    console.error(
      `error: could not write output file: ${outputPath}\n${err.message}`,
    )
    process.exitCode = 1
    return
  }
}

function renderHelp() {
  const bin = basename(process.argv[1])
  console.log(`
usage: ${bin} <command> [options]

commands:
    render [-o <output-file.html>] <input-file.json>
        Render a CSAF 2.0 or 2.1 JSON document to HTML.

        <input-file.json>
            Path to the CSAF JSON file

        --output, -o <output-file.html>
            Path to write the HTML output (default: stdout)

options:
    --help, -h
        Show this help message

    --version, -v
        Show the installed version of ${bin}
`)
}
