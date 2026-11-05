// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TargetProtectionSettingsState } from '@deepseek-ai/dsh-target-protection/settings'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, expect, it, vi } from 'vitest'
import type {} from '../src/client/index.ts'
import { TargetProtectionSection } from '../src/client/TargetProtectionSection.tsx'
import { TargetSettingsController, type TargetSettingsRemote } from '../src/client/target-protection-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function snapshot(revision = 4): TargetProtectionSettingsState {
  return { snapshot: { revision, preferences: { mainlandEnabled: false, rules: [] } },
    protection: { state: 'disabled', revision, capabilities: [] }, country: null }
}

function mount(remote: Pick<TargetSettingsRemote, 'get' | 'configure'> & Partial<Pick<TargetSettingsRemote, 'updateCountry'>>) {
  const controller = new TargetSettingsController({ updateCountry: async () => ({ ok: true, value: snapshot() }), ...remote })
  const unused = (): never => { throw new Error('Unused settings hook') }
  const screenHandle = render(<TargetProtectionSection modeId="security" t={makeTranslate(en)} {...allowAllAccess}
    useTargetSettings={bindSnapshotSelector(controller.state)} load={controller.load} save={controller.save}
    updateCountry={controller.updateCountry}
    usePanelInfo={unused} useSessions={unused} useSessionStatus={unused} useSessionRetainInfo={unused}
    useWorkspaces={unused} useResource={unused} useContextMenu={unused} />)
  return { controller, ...screenHandle }
}

it('shows how to enable the optional protection profile when its endpoint is absent', async () => {
  const configure = vi.fn<TargetSettingsRemote['configure']>()
  mount({
    get: async () => ({ ok: false, error: new RemoteError('gateway/invocation-unavailable', 'unavailable', { endpoint: 'fixture' }) }),
    configure,
  })
  expect(await screen.findByText(en['target.failure.notMounted'])).toBeTruthy()
  expect(screen.queryByRole('button', { name: en['target.save'] })).toBeNull()
  expect(configure).not.toHaveBeenCalled()
})

it('stages aliases with the original revision and preserves edits on a conflict', async () => {
  let revision = 4
  const configure = vi.fn<TargetSettingsRemote['configure']>(async () => ({
    ok: false, error: new RemoteError('target-protection/conflict', 'stale', {}),
  }))
  mount({ get: async () => ({ ok: true, value: snapshot(revision) }), configure })
  fireEvent.click(await screen.findByRole('button', { name: en['target.add'] }))
  const form = within(screen.getByRole('dialog', { name: en['target.add'] }))
  fireEvent.change(form.getByLabelText(en['target.name']), { target: { value: 'Production web' } })
  fireEvent.change(form.getByLabelText(en['target.address']), { target: { value: 'prod.example.test' } })
  fireEvent.click(form.getByRole('button', { name: en['target.addAlias'] }))
  fireEvent.change(form.getAllByLabelText(en['target.address'])[1]!, { target: { value: '127.0.0.1' } })
  fireEvent.change(form.getAllByLabelText(en['target.port'])[1]!, { target: { value: '443' } })
  fireEvent.click(form.getByRole('button', { name: en['target.apply'] }))
  expect(configure).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en['target.save'] }))
  expect(await screen.findByText(en['target.failure.conflict'])).toBeTruthy()
  const ruleId = configure.mock.calls[0]?.[0].preferences.rules[0]?.id
  expect(ruleId).toEqual(expect.any(String))
  expect(configure).toHaveBeenCalledWith({ expectedRevision: 4, preferences: { mainlandEnabled: false, rules: [{
    id: ruleId, enabled: true, name: 'Production web', environment: 'production', protection: 'full',
    kind: 'server', match: 'host', address: 'prod.example.test', aliases: [{ match: 'host', address: '127.0.0.1', port: 443 }],
  }] } })
  expect(screen.getByText('Production web')).toBeTruthy()
  revision = 5
  fireEvent.click(screen.getByRole('button', { name: en['target.refresh'] }))
  await screen.findByText('Rule revision 5')
  expect(screen.getByText('Production web')).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: en['target.save'] }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: en['target.discard'] }))
  await screen.findByText(en['target.empty'])
  expect(screen.queryByText('Production web')).toBeNull()
})

it('does not publish a save reply from a departed connection', async () => {
  const oldSave = Promise.withResolvers<RemoteResult<TargetProtectionSettingsState>>()
  const controller = new TargetSettingsController({ get: async () => ({ ok: true, value: snapshot(1) }),
    configure: () => oldSave.promise, updateCountry: async () => ({ ok: true, value: snapshot() }) })
  const pending = controller.save({ expectedRevision: 4, preferences: { mainlandEnabled: true, rules: [] } })
  controller.reset()
  await waitFor(() => { expect(controller.state.getSnapshot().value?.snapshot.revision).toBe(1) })
  oldSave.resolve({ ok: true, value: snapshot(5) })
  expect(await pending).toBe(false)
  expect(controller.state.getSnapshot()).toMatchObject({ generation: 1, saving: false, saved: false })
  expect(controller.state.getSnapshot().value?.snapshot.revision).toBe(1)
})

it('shows an update failure without clearing the country status or the rule draft', async () => {
  const value = { ...snapshot(), countryUpdateAvailable: true as const }
  const updateCountry = vi.fn<TargetSettingsRemote['updateCountry']>(async () => ({ ok: false,
    error: new RemoteError('target-protection/country-update-failed', 'invalid', {}) }))
  mount({ get: async () => ({ ok: true, value }), configure: vi.fn(), updateCountry })
  fireEvent.click(await screen.findByRole('switch', { name: en['target.mainland'] }))
  fireEvent.click(screen.getByRole('button', { name: en['target.countryUpdate'] }))
  expect(await screen.findByText(en['target.failure.countryUpdate'])).toBeTruthy()
  expect(screen.getByText(en['target.unsaved'])).toBeTruthy()
  expect(screen.getByText('Rule revision 4')).toBeTruthy()
  expect(updateCountry).toHaveBeenCalledOnce()
})

it('keeps an old draft visible and blocks saving it to another connection with the same rule revision', async () => {
  const configure = vi.fn<TargetSettingsRemote['configure']>()
  const { controller } = mount({ get: async () => ({ ok: true, value: snapshot() }), configure })
  fireEvent.click(await screen.findByRole('switch', { name: en['target.mainland'] }))
  expect(screen.getByText(en['target.unsaved'])).toBeTruthy()
  await act(async () => { controller.reset() })
  expect(await screen.findByText(en['target.connectionChanged'])).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: en['target.save'] }).disabled).toBe(true)
  expect(configure).not.toHaveBeenCalled()
})
