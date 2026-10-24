// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, $isTextNode, createEditor } from 'lexical'
import { registerPlainText } from '@lexical/plain-text'
import { registerComposerKeymap } from '../src/client/input/editor/keymap.ts'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.useRealTimers() })

function setup() {
  const editor = createEditor({ namespace: 'prediction', onError: (error) => { throw error } })
  const root = document.createElement('div')
  root.contentEditable = 'true'
  document.body.appendChild(root)
  editor.setRootElement(root)
  const removePlainText = registerPlainText(editor)
  const acceptPrediction = vi.fn(() => true)
  const arbitrate = vi.fn((): 'consumed' | 'pass' => 'consumed')
  const removeKeymap = registerComposerKeymap(editor, {
    arbitrate, space: () => false, dismissPopup: () => {}, canSubmit: () => true,
    submit: () => {}, intakeFiles: () => {}, pasteText: () => {}, acceptPrediction,
  })
  cleanups.push(() => { removeKeymap(); removePlainText(); editor.setRootElement(null); root.remove() })
  editor.update(() => { $getRoot().append($createParagraphNode().append($createTextNode('draft'))); $getRoot().selectEnd() }, { discrete: true })
  return { editor, root, arbitrate, acceptPrediction }
}

it('accepts a prediction with Tab only after the completion menu passes', () => {
  const { root, arbitrate, acceptPrediction } = setup()
  fireEvent.keyDown(root, { key: 'Tab' })
  expect(acceptPrediction).not.toHaveBeenCalled()
  arbitrate.mockReturnValue('pass')
  fireEvent.keyDown(root, { key: 'Tab' })
  expect(acceptPrediction).toHaveBeenCalledOnce()
  fireEvent.keyDown(root, { key: 'Tab', shiftKey: true })
  expect(acceptPrediction).toHaveBeenCalledOnce()
  fireEvent.keyDown(root, { key: 'Tab', ctrlKey: true })
  expect(acceptPrediction).toHaveBeenCalledOnce()
})

it('leaves middle-of-draft selections, selected text and read-only editors unchanged', () => {
  const { editor, root, arbitrate, acceptPrediction } = setup()
  arbitrate.mockReturnValue('pass')
  for (const end of [2, 4]) {
    editor.update(() => { const text = $getRoot().getFirstDescendant(); if ($isTextNode(text)) text.select(2, end) }, { discrete: true })
    fireEvent.keyDown(root, { key: 'Tab' })
  }
  editor.update(() => { $getRoot().selectEnd() }, { discrete: true })
  editor.setEditable(false)
  fireEvent.keyDown(root, { key: 'Tab' })
  expect(acceptPrediction).not.toHaveBeenCalled()
})

it('does not accept a suggestion while composing or just after composition ends', () => {
  vi.useFakeTimers()
  const { root, arbitrate, acceptPrediction } = setup()
  arbitrate.mockReturnValue('pass')
  fireEvent.compositionStart(root)
  fireEvent.keyDown(root, { key: 'Tab', isComposing: true })
  fireEvent.compositionEnd(root)
  fireEvent.keyDown(root, { key: 'Tab' })
  expect(acceptPrediction).not.toHaveBeenCalled()
})
