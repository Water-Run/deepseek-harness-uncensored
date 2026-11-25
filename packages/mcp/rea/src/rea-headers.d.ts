// Public fields read from the fixed-header decoders in the pinned rea-agents package.
declare module 'rea-agents/dist/domain/elfFixedHeader.js' {
  export function readElfFixedHeader(bytes: Buffer):
    | { ok: true; value: { machine: number; architecture: string | null } }
    | { ok: false; error: string }
}
declare module 'rea-agents/dist/domain/peCoffHeader.js' {
  export function readPeCoffHeader(bytes: Buffer): { ok: true; value: { machine: number } } | { ok: false; error: { message: string } }
}
declare module 'rea-agents/dist/domain/peMachine.js' {
  export function decodePeMachine(machine: number): { architecture: string; nativeOsOverride: boolean } | undefined
}
