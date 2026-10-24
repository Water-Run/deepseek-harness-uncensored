import { expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { predictionContext, predictionInstruction, predictionSurface } from '../src/prediction.ts'
import { sideIdentity } from '../src/aside-context.ts'

const parent = SessionId('parent')
const side = sideIdentity(parent)

it('uses a different instruction for the main composer, a side question, and a by-the-way question', () => {
  expect(predictionSurface(parent, undefined, '继续写')).toBe('main')
  expect(predictionSurface(side, parent, '这个结论')).toBe('side')
  expect(predictionSurface(parent, undefined, '/btw ')).toBe('btw')
  expect(predictionInstruction('btw')).toContain('进度如何')
  expect(predictionInstruction('main')).not.toContain('进度如何')
  expect(predictionContext('btw', [], parent, 'running')).toBe('Interaction status: running')
  expect(predictionContext('side', [], parent, 'idle')).not.toContain('Interaction status')
})
