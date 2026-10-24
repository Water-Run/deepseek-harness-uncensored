// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { en } from '../src/client/locales.ts'
import {
  ReverseMaterials, SecurityMaterials, WritingMaterials, type ModeMaterialsProps,
} from '../src/client/ModeMaterials.tsx'
import type { MaterialsState } from '../src/client/contract.ts'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {
  CaseCollectionView, DossierCaseView, DossierInventory, StoryListing,
} from '@deepseek-ai/dsh-api-mode-dossiers/types'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const t = makeTranslate(en)

const EMPTY: CaseCollectionView = { cases: [], broken: [] }
const NO_MATERIALS: StoryListing = { entries: [], unregistered: [], selected: [] }

function unusedHook(): never {
  throw new Error('this surface does not read that global source')
}

/** Inventory with the given collections, in the order the Host reports them. */
function inventory(overrides: Partial<DossierInventory> = {}): DossierInventory {
  return {
    workspace: { workspaceId: 'w1', title: 'Novel', path: '/work/novel' },
    security: EMPTY,
    reverse: EMPTY,
    writing: NO_MATERIALS,
    tools: [],
    ...overrides,
  }
}

/** One case document the Host would return. */
function caseView(overrides: Partial<DossierCaseView> = {}): DossierCaseView {
  return {
    slug: 'acme',
    kind: 'security',
    version: 'v1',
    extraKeys: [],
    document: {
      version: 1,
      kind: 'security',
      slug: 'acme',
      objective: 'Assess acme',
      createdAt: 'c',
      updatedAt: 'u',
      targets: [{ id: 'T-0001', value: '10.0.0.5', label: 'web01', note: '', addedAt: 'a' }],
      evidence: [],
      findings: [],
      notes: [],
    },
    ...overrides,
  }
}

interface Surface {
  readonly props: ModeMaterialsProps
  readonly operations: Record<string, ReturnType<typeof vi.fn>>
}

/** Build one panel's props with the actions a test asserts on. */
function surface(modeId: string | undefined, loaded: DossierInventory | undefined, workspaceId = 'w1'): Surface {
  const store = createSnapshotStore<MaterialsState>({
    workspaceId, phase: 'ready', inventory: loaded, error: undefined,
  })
  const operations = {
    load: vi.fn(async () => {}),
    readCase: vi.fn(async () => caseView()),
    mutateCase: vi.fn(async () => caseView()),
    createCase: vi.fn(async () => caseView()),
    renderReport: vi.fn(async () => ({ markdown: '# report' })),
    readStory: vi.fn(async () => ({
      path: 'story/style/voice.md', title: 'Voice', section: 'style' as const, version: 'v1', markdown: 'line one',
    })),
    writeStory: vi.fn(async () => ({
      path: 'story/style/voice.md', title: 'Voice', section: 'style' as const, version: 'v2', markdown: 'line one',
    })),
    createStory: vi.fn(async () => ({
      path: 'story/style/new.md', title: 'New', section: 'style' as const, version: 'v1', markdown: '',
    })),
    adoptStory: vi.fn(async () => inventory()),
    removeStory: vi.fn(async () => ({ selected: [] })),
    selectStory: vi.fn(async () => ({ selected: [] })),
    inspectSample: vi.fn(async () => ({
      path: 'samples/toy.bin', bytes: 4, sha256: 'abc123', magic: '7f 45', formats: ['elf'],
      entropy: 1.5, strings: ['ELF'], stringsTruncated: false,
    })),
    createWorkspace: vi.fn(async () => 'w2'),
    pickDirectory: vi.fn(async () => '/work/other'),
  }
  const workspaceSnapshot: WorkspaceSnapshot = {
    items: [{ workspaceId: 'w1', path: '/work/novel', title: 'Novel', sessionIds: [], createdAt: 'c', updatedAt: 'u' }],
    archivedSessionIds: [],
    pinnedSessionIds: [],
    state: 'ready',
    phase: 'ready',
    error: null,
  }
  const props: ModeMaterialsProps = {
    modeId,
    ...operations,
    useMaterials: bindSnapshotSelector(store),
    useWorkspaces: selector => selector(workspaceSnapshot),
    usePanelInfo: unusedHook,
    useSessions: unusedHook,
    useSessionStatus: unusedHook,
    useSessionRetainInfo: unusedHook,
    useResource: unusedHook,
    ...allowAllAccess,
    t,
  }
  return { props, operations }
}

it('renders only the panel of the selected mode', () => {
  const loaded = inventory({ security: { cases: [{ slug: 'acme', kind: 'security', objective: 'Assess', createdAt: 'c', updatedAt: 'u', targets: 1, evidence: 0, findings: 0, notes: 0, extraKeys: [] }], broken: [] } })
  const { props } = surface('reverse', loaded)
  const { container } = render(<SecurityMaterials {...props} />)
  expect(container.textContent).toBe('')
})

it('lists workspaces and cases, then opens one ledger', async () => {
  const loaded = inventory({
    security: {
      cases: [{ slug: 'acme', kind: 'security', objective: 'Assess acme', createdAt: 'c', updatedAt: 'u', targets: 1, evidence: 0, findings: 0, notes: 0, extraKeys: [] }],
      broken: [],
    },
  })
  const { props, operations } = surface('security', loaded)
  render(<SecurityMaterials {...props} />)
  expect(screen.getByText('Novel')).toBeTruthy()
  expect(screen.getByText('/work/novel')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Assess acme/ }))
  await waitFor(() => { expect(operations.readCase).toHaveBeenCalledWith({ workspaceId: 'w1', kind: 'security', slug: 'acme' }) })
  expect(await screen.findByText('10.0.0.5')).toBeTruthy()
  expect(screen.getByDisplayValue('Assess acme')).toBeTruthy()
})

it('reports a corrupt ledger beside the usable ones', () => {
  const loaded = inventory({
    security: { cases: [], broken: [{ slug: 'bad', problem: { code: 'corrupt', detail: 'not valid JSON' } }] },
  })
  const { props } = surface('security', loaded)
  render(<SecurityMaterials {...props} />)
  expect(screen.getByRole('alert').textContent).toContain('bad')
  expect(screen.getByRole('alert').textContent).toContain(en['problem.corrupt'])
})

it('says what deletion of a writing record keeps', async () => {
  const listing: StoryListing = {
    entries: [{
      path: 'story/style/voice.md', title: 'Voice', section: 'style', selected: true, registered: true, missing: false, bytes: 12,
    }],
    unregistered: [],
    selected: ['story/style/voice.md'],
  }
  const { props, operations } = surface('writing', inventory({ writing: listing }))
  render(<WritingMaterials {...props} />)
  const row = document.querySelector<HTMLElement>('[data-material-path="story/style/voice.md"]')
  if (row === null) throw new Error('material row missing')
  fireEvent.click(within(row).getByRole('button', { name: en.delete }))
  expect(await screen.findByText(en['writing.deleteTitle'])).toBeTruthy()
  expect(screen.getByText(en['writing.deleteBody'].replace('{path}', 'story/style/voice.md'))).toBeTruthy()
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: en.delete }))
  await waitFor(() => { expect(operations.removeStory).toHaveBeenCalledWith({ workspaceId: 'w1', path: 'story/style/voice.md' }) })
})

it('keeps typed text when the save conflicts', async () => {
  const listing: StoryListing = {
    entries: [{
      path: 'story/style/voice.md', title: 'Voice', section: 'style', selected: false, registered: true, missing: false, bytes: 12,
    }],
    unregistered: [],
    selected: [],
  }
  const { props, operations } = surface('writing', inventory({ writing: listing }))
  operations.writeStory?.mockRejectedValue(Object.assign(new Error('changed'), { code: 'mode-dossier/conflict' }))
  render(<WritingMaterials {...props} />)
  const row = document.querySelector<HTMLElement>('[data-material-path="story/style/voice.md"]')
  if (row === null) throw new Error('material row missing')
  fireEvent.click(within(row).getByRole('button', { name: en.edit }))
  const editor = await screen.findByDisplayValue('line one')
  fireEvent.change(editor, { target: { value: 'my new line' } })
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  // The panel and the dialog both report the conflict; the typed text stays.
  expect((await screen.findAllByText(en.conflict)).length).toBeGreaterThan(0)
  expect(screen.getByDisplayValue('my new line')).toBeTruthy()
})

it('toggles the writing selection through the Host', async () => {
  const listing: StoryListing = {
    entries: [{
      path: 'story/style/voice.md', title: 'Voice', section: 'style', selected: true, registered: true, missing: false, bytes: 12,
    }],
    unregistered: [],
    selected: ['story/style/voice.md'],
  }
  const { props, operations } = surface('writing', inventory({ writing: listing }))
  render(<WritingMaterials {...props} />)
  fireEvent.click(screen.getByRole('checkbox', { name: en['writing.select'] }))
  await waitFor(() => {
    expect(operations.selectStory).toHaveBeenCalledWith({ workspaceId: 'w1', selected: [] })
  })
})

it('reports unconnected reverse tools and inventories a sample', async () => {
  const loaded = inventory({
    tools: [
      { id: 'ghidra-mcp', name: 'Ghidra (GhidraMCP)', kind: 'external', available: false, detail: 'No Ghidra connector is configured for this Host.' },
    ],
  })
  const { props, operations } = surface('reverse', loaded)
  render(<ReverseMaterials {...props} />)
  expect(screen.getByText(en['reverse.toolUnavailable'])).toBeTruthy()
  fireEvent.change(screen.getByLabelText(en['reverse.samplePath']), { target: { value: 'samples/toy.bin' } })
  fireEvent.click(screen.getByRole('button', { name: en['reverse.inspect'] }))
  await waitFor(() => { expect(operations.inspectSample).toHaveBeenCalledWith({ workspaceId: 'w1', path: 'samples/toy.bin' }) })
  expect(await screen.findByText('abc123')).toBeTruthy()
  expect(screen.getByText('elf')).toBeTruthy()
})
