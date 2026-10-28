/** Optional structured file mutations using the filesystem provider's policy and freshness checks. @module */
import type { Context } from '@deepseek-ai/cordis'
import { FsError, type FsTarget, type FsVersion } from '@deepseek-ai/dsh-fs'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type { FsEscalationArgs, FsSandboxController } from './sandbox.ts'
import { sessionResolveOptions } from './session-cwd.ts'
import { remediateFsError } from './error.ts'

async function sourceVersion(ctx: Context, target: FsTarget, exec: ToolExecution): Promise<{ version: FsVersion }> {
  const intent = await ctx.waterfall('fs/edit-intent', target, exec, () => undefined)
  if (intent !== undefined) return intent
  const info = await ctx.fs.stat(target, exec.signal)
  if (info === undefined) throw new FsError('Source file does not exist.', 'FS_NOT_FOUND')
  return { version: info.version }
}

function requirePath(path: string): void {
  if (path.trim().length === 0) throw new Error('File paths must not be empty.')
}

/**
 * Register optional regular-file operations; native execution remains owned by ctx.fs.
 * @param ctx - Required filesystem and tool services, scoped to this plugin.
 * @param sandbox - Shared per-call permission resolver; target policy remains mandatory beneath it.
 */
export function applyFileOperations(ctx: Context, sandbox: FsSandboxController): void {
  const escalation = sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}
  ctx.tools.register(defineTool({
    name: 'remove_file',
    description: 'Delete one regular file after inspecting it. Does not remove directories or symbolic-link entries. Deletion is permanent.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Path of the regular file to delete.' },
      ...escalation,
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `Removed file: ${value.path}` }],
      presentationMeta: (_args, value) => ({ path: value.path, operation: 'remove' }),
    },
    async execute(args: FsEscalationArgs & { file_path: string }, exec) {
      requirePath(args.file_path)
      const policy = await sandbox.resolvePolicy('remove_file', args, exec)
      const target = await ctx.fs.resolve(args.file_path, await sessionResolveOptions(ctx, exec))
      try { await ctx.fs.removeFile(target, await sourceVersion(ctx, target, exec), exec.signal, policy) }
      catch (error) { throw remediateFsError(sandbox.mapError(error, policy), target.displayPath) }
      ctx.emit('fs/observed', target, { kind: 'absent' }, exec)
      return { path: target.displayPath }
    },
    presentCall: args => ({ card: 'generic', title: `Remove ${args.file_path}`, kind: 'other', locations: [{ path: args.file_path }] }),
  }))
  ctx.tools.register(defineTool({
    name: 'rename_file',
    description: 'Move one inspected regular file to an absent path on the same filesystem. Never overwrites or creates parent directories. Does not move directories or symbolic-link entries. If interrupted after destination creation, inspect both paths before retrying.',
    parameters: {
      source_path: { type: 'string', required: true, description: 'Regular file to move.' },
      destination_path: { type: 'string', required: true, description: 'Absent destination path in an existing directory on the same filesystem.' },
      ...escalation,
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        source: { type: 'string', required: true }, destination: { type: 'string', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: `Renamed file: ${value.source} -> ${value.destination}` }],
      presentationMeta: (_args, value) => ({ ...value, operation: 'rename' }),
    },
    async execute(args: FsEscalationArgs & { source_path: string; destination_path: string }, exec) {
      requirePath(args.source_path); requirePath(args.destination_path)
      const policy = await sandbox.resolvePolicy('rename_file', args, exec)
      const options = await sessionResolveOptions(ctx, exec)
      const source = await ctx.fs.resolve(args.source_path, options)
      const destination = await ctx.fs.resolve(args.destination_path, options)
      try { await ctx.fs.renameFile(source, destination, await sourceVersion(ctx, source, exec), exec.signal, policy) }
      catch (error) { throw remediateFsError(sandbox.mapError(error, policy), source.displayPath) }
      ctx.emit('fs/observed', source, { kind: 'absent' }, exec)
      return { source: source.displayPath, destination: destination.displayPath }
    },
    presentCall: args => ({ card: 'generic', title: `Rename ${args.source_path}`, kind: 'other',
      locations: [{ path: args.source_path }, { path: args.destination_path }], rawInput: args }),
  }))
}
