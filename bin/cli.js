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
const argv = process.argv.slice(2).filter((a) => a !== cmd)

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
  process.exit(1)
} else {
  console.error(`unknown command: ${cmd}`)
  renderHelp()
  process.exit(1)
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
  const args = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: {
        type: 'string',
        short: 'o',
      },
    },
  })
  const inputPath = args.positionals[0]
  const outputPath = args.values.output

  if (!inputPath) {
    console.error('error: missing required argument <input-file.json>')
    renderHelp()
    process.exit(1)
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
    process.exit(1)
  }

  // Strip a leading UTF-8 byte-order-mark (BOM), if present, so JSON.parse
  // doesn't choke on it.
  const withoutBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw

  let csafDoc
  try {
    csafDoc = JSON.parse(withoutBom)
  } catch (/** @type {any} */ err) {
    console.error(`error: invalid JSON in ${inputPath}: ${err.message}`)
    process.exit(1)
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
      process.exit(1)
    }
  } catch (/** @type {any} */ err) {
    console.error(`error: failed to render document: ${err.message}`)
    process.exit(1)
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
    process.exit(1)
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
