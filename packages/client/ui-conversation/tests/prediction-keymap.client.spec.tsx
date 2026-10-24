// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { createEditor } from 'lexical'
import { registerPlainText } from '@lexical/plain-text'
import { registerComposerKeymap } from '../src/client/input/editor/keymap.ts'

it('accepts a prediction with Tab only after the completion menu passes', () => {
  const editor = createEditor({ namespace: 'prediction', onError: (error) => { throw error } })
  const root = document.createElement('div')
  root.contentEditable = 'true'
  document.body.appendChild(root)
  editor.setRootElement(root)
  registerPlainText(editor)
  const acceptPrediction = vi.fn(() => true)
  const arbitrate = vi.fn(() => 'consumed' as const)
  registerComposerKeymap(editor, {
    arbitrate, space: () => false, dismissPopup: () => {}, canSubmit: () => true,
    submit: () => {}, intakeFiles: () => {}, pasteText: () => {}, acceptPrediction,
  })
  fireEvent.keyDown(root, { key: 'Tab' })
  expect(acceptPrediction).not.toHaveBeenCalled()
  arbitrate.mockReturnValue('pass')
  fireEvent.keyDown(root, { key: 'Tab' })
  expect(acceptPrediction).toHaveBeenCalledOnce()
  fireEvent.keyDown(root, { key: 'Tab', shiftKey: true })
  expect(acceptPrediction).toHaveBeenCalledOnce()
})
