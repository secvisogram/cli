import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url))
const fixture = (/** @type {string} */ name) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

/**
 * Runs the CLI as a real child process (bin/cli.js executes top-level code
 * and calls `process.exit`, so it can't be exercised via a plain import) and
 * returns its stdout/stderr/exit code instead of throwing on a non-zero
 * exit code.
 *
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 */
async function runCli(args, options) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [cliPath, ...args], {
      cwd: options?.cwd,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (/** @type {any} */ err) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.code,
    }
  }
}

describe('render', () => {
  it('renders a valid CSAF 2.0 document to stdout as HTML', async () => {
    const { stdout, stderr, exitCode } = await runCli([
      'render',
      fixture('valid-2.0.json'),
    ])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('<!DOCTYPE html>')
    expect(stdout).toContain('Test Advisory 2.0')
    expect(stdout).toContain('ACME-2024-001')
  })

  it('renders a valid CSAF 2.1 document to stdout as HTML', async () => {
    const { stdout, stderr, exitCode } = await runCli([
      'render',
      fixture('valid-2.1.json'),
    ])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('<!DOCTYPE html>')
    expect(stdout).toContain('Test Advisory 2.1')
    expect(stdout).toContain('ACME-2024-002')
  })

  it('strips a UTF-8 byte-order-mark before parsing the input as JSON', async () => {
    const { stdout, stderr, exitCode } = await runCli([
      'render',
      fixture('valid-2.0-bom.json'),
    ])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('Test Advisory 2.0')
  })

  it('renders markdown fields in a CSAF 2.1 document as HTML, not raw markdown syntax', async () => {
    const { stdout, stderr, exitCode } = await runCli([
      'render',
      fixture('valid-2.1-with-markdown.json'),
    ])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('<strong>Important</strong>')
    expect(stdout).not.toContain('**Important**')
  })

  describe('with --output/-o', () => {
    /** @type {string} */
    let outDir

    beforeEach(async () => {
      outDir = await mkdtemp(join(tmpdir(), 'secvisogram-cli-test-'))
    })

    afterEach(async () => {
      await rm(outDir, { recursive: true, force: true })
    })

    it('writes the rendered HTML to the given file instead of stdout', async () => {
      const outPath = join(outDir, 'out.html')
      const { stdout, stderr, exitCode } = await runCli([
        'render',
        fixture('valid-2.0.json'),
        '-o',
        outPath,
      ])
      expect(exitCode).toBe(0)
      expect(stderr).toBe('')
      expect(stdout).toBe('')

      const html = await readFile(outPath, 'utf8')
      expect(html).toContain('Test Advisory 2.0')
    })

    it('supports the long-form --output flag', async () => {
      const outPath = join(outDir, 'out.html')
      const { exitCode } = await runCli([
        'render',
        fixture('valid-2.0.json'),
        '--output',
        outPath,
      ])
      expect(exitCode).toBe(0)
      const html = await readFile(outPath, 'utf8')
      expect(html).toContain('Test Advisory 2.0')
    })
  })

  it('exits with a clean error message when the input file does not exist', async () => {
    const { stdout, stderr, exitCode } = await runCli([
      'render',
      fixture('does-not-exist.json'),
    ])
    expect(exitCode).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('error: input file not found')
  })

  it('exits with a clean error message when the input is not valid JSON', async () => {
    const { stderr, exitCode } = await runCli([
      'render',
      fixture('invalid.json'),
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('error: invalid JSON')
  })

  it('exits with a clean error message for an unsupported csaf_version', async () => {
    const { stderr, exitCode } = await runCli([
      'render',
      fixture('unsupported-version.json'),
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      'error: unsupported or missing csaf_version: "1.0"',
    )
  })

  it('exits with a clean error message when the input is valid JSON but not an object (e.g. null)', async () => {
    const { stdout, stderr, exitCode } = await runCli([
      'render',
      fixture('null-input.json'),
    ])
    expect(exitCode).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('error: invalid CSAF document')
    expect(stderr).toContain('got null')
  })

  it('handles an output path that happens to be identical to the "render" command name', async () => {
    // Regression test: the top-level dispatcher used to strip *every*
    // argv entry equal to the command token ("render"), not just the
    // command token itself, so `-o render` would lose its value. Uses a
    // bare relative filename (run with cwd set to a scratch dir) to
    // reproduce the exact string collision, rather than a path that merely
    // ends with "render".
    const outDir = await mkdtemp(join(tmpdir(), 'secvisogram-cli-test-'))
    try {
      const { stderr, exitCode } = await runCli(
        ['render', fixture('valid-2.0.json'), '-o', 'render'],
        { cwd: outDir },
      )
      expect(exitCode).toBe(0)
      expect(stderr).toBe('')
      const html = await readFile(join(outDir, 'render'), 'utf8')
      expect(html).toContain('Test Advisory 2.0')
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  it('exits with a clean error message for an unrecognised flag, instead of a raw stack trace', async () => {
    const { stderr, exitCode } = await runCli([
      'render',
      fixture('valid-2.0.json'),
      '--outptu',
      'out.html',
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('error:')
    // A raw Node stack trace would include a "TypeError [ERR_..." style
    // header and "file://" stack frames - neither should appear.
    expect(stderr).not.toContain('file://')
    expect(stderr).not.toMatch(/^\w*Error/m)
  })

  it('prints usage and exits with an error when no input file is given', async () => {
    const { stderr, exitCode } = await runCli(['render'])
    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      'error: missing required argument <input-file.json>',
    )
  })
})

describe('unknown commands', () => {
  it('prints an error and usage when no command is given', async () => {
    const { stderr, exitCode } = await runCli([])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('error: missing command')
  })

  it('prints an error and usage for an unrecognised command', async () => {
    const { stderr, exitCode } = await runCli(['not-a-real-command'])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('unknown command: not-a-real-command')
  })
})

describe('--help/-h', () => {
  it('prints usage and exits 0 when given with no command', async () => {
    const { stdout, stderr, exitCode } = await runCli(['--help'])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('usage:')
    expect(stdout).toContain('render')
  })

  it('supports the short flag -h', async () => {
    const { stdout, exitCode } = await runCli(['-h'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('usage:')
  })

  it('prints usage and exits 0 when given after the render command', async () => {
    const { stdout, stderr, exitCode } = await runCli(['render', '--help'])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('usage:')
  })
})

describe('--version/-v', () => {
  it('prints the installed package version and exits 0', async () => {
    const packageJson = JSON.parse(
      await readFile(
        fileURLToPath(new URL('../package.json', import.meta.url)),
        'utf8',
      ),
    )
    const { stdout, stderr, exitCode } = await runCli(['--version'])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout.trim()).toBe(packageJson.version)
  })

  it('supports the short flag -v', async () => {
    const { stdout, exitCode } = await runCli(['-v'])
    expect(exitCode).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
