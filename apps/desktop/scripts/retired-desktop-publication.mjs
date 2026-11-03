/** Local diagnostic shared by retired upstream publishing commands. */

/** Report the replacement destination without reading configuration or making a request. */
export function rejectLegacyDesktopPublication() {
  process.stderr.write('DSHU does not use the upstream COS uploader. Upstream publication, retention and rollback commands are retired. Use reviewed artifacts in Water-Run/deepseek-harness-uncensored GitHub Releases.\n')
  process.exitCode = 1
}
