/** Bounded messages between the Host and its private QuickJS Worker. @module */
import { z } from 'zod'

/** Runtime bounds shared with one interpreter instance. */
export const ptcLimits = z.object({
  memoryBytes: z.number().int().positive(), stackBytes: z.number().int().positive(),
  maxMessageBytes: z.number().int().positive(), maxOutputBytes: z.number().int().positive(),
  maxPendingCalls: z.number().int().positive(),
})

/** Initial data contains source and declarations, never Host functions or credentials. */
export const ptcBoot = z.object({
  program: z.string(), limits: ptcLimits,
  namespaces: z.array(z.object({ global: z.string(), members: z.array(z.string()),
    errorClass: z.object({ name: z.string(), memberNameProperty: z.string() }).optional() })),
})

/** Private worker emissions are validated before any binding is invoked. */
export const ptcEmission = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('received'), id: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('call'), id: z.number().int().positive(), index: z.number().int().nonnegative(), args: z.string() }).strict(),
  z.object({ kind: z.literal('log'), id: z.number().int().positive(), text: z.string() }).strict(),
  z.object({ kind: z.literal('done'), value: z.string().optional(),
    error: z.object({ kind: z.enum(['exception', 'invalid-output', 'output-limit', 'protocol']), message: z.string() }).strict().optional() }).strict(),
])

/** Private Host replies contain a bounded JSON value or one binding rejection. */
export const ptcReply = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reply'), id: z.number().int().positive(), ok: z.boolean(), text: z.string() }).strict(),
  z.object({ kind: z.literal('log-received'), id: z.number().int().positive() }).strict(),
])

/** Resolved interpreter initialization payload. */
export type PtcBoot = z.infer<typeof ptcBoot>
