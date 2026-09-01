import * as esbuild from 'esbuild'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')

const icons = spawnSync(process.execPath, [join(ROOT, 'scripts/make-icons.mjs')], {
  stdio: 'inherit',
})
if (icons.status !== 0) {
  process.exit(icons.status ?? 1)
}

const options = {
  absWorkingDir: ROOT,
  entryPoints: {
    popup: 'src/popup.ts',
    options: 'src/options.ts',
  },
  bundle: true,
  outdir: 'build',
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
} else {
  await esbuild.build(options)
}
