import { defineConfig } from 'tsdown'

/** Each public entry bundles its implementation without requiring unpublished chunks. */
export default defineConfig(['index', 'protected'].map(entry => ({
  entry: [`lib/types/${entry}.js`],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  outputOptions: { inlineDynamicImports: true },
})))
