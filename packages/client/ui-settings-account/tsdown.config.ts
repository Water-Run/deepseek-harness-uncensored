import { resolve } from 'node:path'
import { clientBuildValueDefines, repositoryClientBuildEnvironment, resolveClientBuildEnvironment } from '../../../scripts/client-build-environment.ts'
import { clientBundle } from '../tsdown.client.ts'

const bundle = clientBundle(import.meta.dirname, ['lib/types/index.js'])

export default (options: Parameters<typeof bundle>[0]): ReturnType<typeof bundle> => {
  const configs = bundle(options)
  if (options.env?.DSH_BUILD_FACE === 'host' || process.env.DSH_CLIENT_VERSION) return configs

  // Account calls need an inline client version even when only this package is bundled.
  const repository = resolve(import.meta.dirname, '../../..')
  const environment = resolveClientBuildEnvironment(repositoryClientBuildEnvironment(repository))
  const define = clientBuildValueDefines(environment)
  return configs.map(config => ({ ...config, define: { ...config.define, ...define } }))
}
