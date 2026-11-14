// @vitest-environment jsdom
/** Applied colors can arrive after the theme snapshot, and stop with the mounted screen. */
import { expect, it, vi } from 'vitest'
import { observeTerminalPalette } from '../src/client/terminal-theme.ts'

it('observes applied palette changes and discards pending updates after disposal', async () => {
  const node = document.createElement('div')
  node.style.backgroundColor = '#fff'
  node.style.color = '#000'
  document.body.append(node)
  const previous = document.body.getAttribute('data-terminal-palette-test')
  const changed = Promise.withResolvers<undefined>()
  const update = vi.fn((background: string, _foreground: string) => {
    if (background === 'rgb(18, 18, 18)') changed.resolve(undefined)
  })
  const stop = observeTerminalPalette(node, update)
  try {
    expect(update).toHaveBeenLastCalledWith('rgb(255, 255, 255)', 'rgb(0, 0, 0)')
    node.style.backgroundColor = '#121212'
    node.style.color = '#fff'
    document.body.setAttribute('data-terminal-palette-test', 'dark')
    await changed.promise
    expect(update).toHaveBeenLastCalledWith('rgb(18, 18, 18)', 'rgb(255, 255, 255)')
    update.mockClear()
    document.body.setAttribute('data-terminal-palette-test', 'queued')
    stop()
    await Promise.resolve()
    expect(update).not.toHaveBeenCalled()
  } finally {
    stop()
    node.remove()
    if (previous === null) document.body.removeAttribute('data-terminal-palette-test')
    else document.body.setAttribute('data-terminal-palette-test', previous)
  }
})


it('releases observation when the initial palette application fails', async () => {
  const node = document.createElement('div')
  document.body.append(node)
  const previous = document.body.getAttribute('data-terminal-palette-test')
  const failure = new Error('palette application failed')
  const update = vi.fn(() => { throw failure })
  try {
    expect(() => observeTerminalPalette(node, update)).toThrow(failure)
    document.body.setAttribute('data-terminal-palette-test', 'after-failure')
    await Promise.resolve()
    expect(update).toHaveBeenCalledOnce()
  } finally {
    node.remove()
    if (previous === null) document.body.removeAttribute('data-terminal-palette-test')
    else document.body.setAttribute('data-terminal-palette-test', previous)
  }
})
