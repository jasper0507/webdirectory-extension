import {
  findBoundEntry,
  normalizeTag,
  type Catalog,
  type TagSummary,
} from './catalog.ts'
import {
  type CommitResult,
  type PortalFailureKind,
  type PortalSourceIntent,
  type ReadPortalSourceResult,
} from './commit-portal-source.ts'
import { parseDefaultTags } from './configuration.ts'
import type { CurrentPage } from './page.ts'

export type PortalTarget = {
  owner: string
  repo: string
}

export type CaptureEffect =
  | { kind: 'load-configuration' }
  | { kind: 'load-opening-context'; target: PortalTarget }
  | { kind: 'reload-portal-source'; target: PortalTarget }
  | {
      kind: 'write-portal-source'
      target: PortalTarget
      intent: PortalSourceIntent
    }
  | { kind: 'open-options' }
  | { kind: 'reload-popup' }

export type CaptureOutcome =
  | {
      kind: 'configuration-loaded'
      result:
        | { kind: 'incomplete' }
        | {
            kind: 'complete'
            target: PortalTarget
            defaultTags: string
          }
    }
  | { kind: 'configuration-load-failed' }
  | {
      kind: 'opening-context-loaded'
      page: CurrentPage
      portalSource: ReadPortalSourceResult
    }
  | { kind: 'opening-context-load-failed' }
  | { kind: 'portal-source-reloaded'; portalSource: ReadPortalSourceResult }
  | { kind: 'portal-source-reload-failed' }
  | { kind: 'portal-source-written'; result: CommitResult }
  | { kind: 'portal-source-write-failed' }

export type CaptureMessage =
  | {
      kind: 'edit'
      field: 'title' | 'url' | 'description'
      value: string
    }
  | { kind: 'field-invalid'; field: 'title' | 'url' }
  | { kind: 'show-description' }
  | { kind: 'toggle-tag-menu' }
  | { kind: 'dismiss-tag-menu' }
  | { kind: 'cancel-tag-menu' }
  | { kind: 'show-tag-creation' }
  | { kind: 'edit-new-tag'; value: string }
  | { kind: 'confirm-new-tag' }
  | { kind: 'select-tag'; name: string }
  | { kind: 'remove-tag'; name: string }
  | { kind: 'save' }
  | { kind: 'delete' }
  | { kind: 'recover' }
  | { kind: 'effect-finished'; outcome: CaptureOutcome }

export type FocusTarget =
  | 'description'
  | 'first-tag-choice-or-create'
  | 'new-tag'
  | 'tag-add'
  | 'title'
  | 'url'

type FieldView = {
  value: string
  error: string
  customValidity: string
}

type StatusView = {
  text: string
  state: 'ok' | 'error' | 'pending' | 'success'
  actionLabel: '去选项' | '重试' | ''
}

export type CaptureView =
  | { screen: 'blank' }
  | {
      screen: 'gate'
      message: string
      actionLabel: '去选项' | '重试'
    }
  | {
      screen: 'capture'
      busy: boolean
      mode: '收录' | '改写'
      faviconUrl: string
      title: FieldView
      url: FieldView
      description: {
        value: string
        summary: string
        expanded: boolean
      }
      tags: {
        selected: readonly string[]
        choices: readonly TagSummary[]
        menu: 'closed' | 'choices' | 'create'
        newName: string
        error: string
        newNameError: string
      }
      save: {
        label: '保存' | '恢复'
        disabled: boolean
      }
      delete: {
        visible: boolean
        disabled: boolean
      }
      status: StatusView
    }

export type CaptureOutput = {
  view: CaptureView
  effect?: CaptureEffect
  focus?: FocusTarget
  reportValidity?: true
}

export type CaptureSession = {
  dispatch(message: CaptureMessage): CaptureOutput
}

type Recovery =
  | 'open-options'
  | 'reload-popup'
  | 'retry-read'
  | 'retry-save'
  | 'retry-delete'
  | null

type Pending =
  | 'load-configuration'
  | 'load-opening-context'
  | 'reload-portal-source'
  | 'write-portal-source'
  | null

type WriteContext = {
  action: 'save' | 'delete'
  updating: boolean
  restoring: boolean
}

type TagState = {
  selected: string[]
  catalog: TagSummary[]
  prefill: boolean
  menu: 'closed' | 'choices' | 'create'
  newName: string
  error: string
  newNameError: string
}

type State = {
  screen: 'blank' | 'gate' | 'capture'
  gateMessage: string
  target: PortalTarget | null
  pending: Pending
  writeContext: WriteContext | null
  recovery: Recovery
  busy: boolean
  catalogReady: boolean
  openingUrl: string
  boundUrl: string | null
  deleted: boolean
  faviconUrl: string
  title: FieldView
  url: FieldView
  description: string
  descriptionExpanded: boolean
  tags: TagState
  status: Omit<StatusView, 'actionLabel'>
}

const emptyField = (): FieldView => ({
  value: '',
  error: '',
  customValidity: '',
})

function initialState(): State {
  return {
    screen: 'blank',
    gateMessage: '',
    target: null,
    pending: 'load-configuration',
    writeContext: null,
    recovery: null,
    busy: false,
    catalogReady: false,
    openingUrl: '',
    boundUrl: null,
    deleted: false,
    faviconUrl: '',
    title: emptyField(),
    url: emptyField(),
    description: '',
    descriptionExpanded: false,
    tags: createTagState([], [], false),
    status: { text: '', state: 'ok' },
  }
}

export function startCaptureSession(): {
  session: CaptureSession
  output: CaptureOutput
} {
  const state = initialState()
  const session = createSession(state)
  return {
    session,
    output: makeOutput(state, { kind: 'load-configuration' }),
  }
}

function createSession(state: State): CaptureSession {
  return {
    dispatch(message) {
      if (message.kind === 'effect-finished') {
        return finishEffect(state, message.outcome)
      }
      if (state.pending) return makeOutput(state)

      switch (message.kind) {
        case 'edit':
          return editDraft(state, message.field, message.value)
        case 'field-invalid':
          state[message.field].error =
            message.field === 'title'
              ? '错误：请输入标题'
              : '错误：请输入 http(s) 地址'
          return makeOutput(state)
        case 'show-description':
          state.descriptionExpanded = true
          return makeOutput(state, undefined, 'description')
        case 'toggle-tag-menu':
          if (state.tags.menu === 'closed') {
            consumePrefill(state.tags)
            setTagMenu(state.tags, 'choices')
            return makeOutput(state, undefined, 'first-tag-choice-or-create')
          }
          setTagMenu(state.tags, 'closed')
          return makeOutput(state)
        case 'dismiss-tag-menu':
          setTagMenu(state.tags, 'closed')
          return makeOutput(state)
        case 'cancel-tag-menu':
          if (state.tags.menu === 'closed') return makeOutput(state)
          setTagMenu(state.tags, 'closed')
          return makeOutput(state, undefined, 'tag-add')
        case 'show-tag-creation':
          consumePrefill(state.tags)
          setTagMenu(state.tags, 'create')
          return makeOutput(state, undefined, 'new-tag')
        case 'edit-new-tag':
          state.tags.newName = message.value
          state.tags.newNameError = ''
          return makeOutput(state)
        case 'confirm-new-tag':
          return confirmNewTag(state)
        case 'select-tag':
          addTag(state.tags, message.name)
          setTagMenu(state.tags, 'closed')
          return makeOutput(state, undefined, 'tag-add')
        case 'remove-tag':
          consumePrefill(state.tags)
          state.tags.selected = state.tags.selected.filter(
            (name) => name !== message.name,
          )
          if (state.tags.selected.length === 0) {
            state.tags.error = '错误：至少保留一个标签'
            return makeOutput(state, undefined, 'tag-add')
          }
          return makeOutput(state)
        case 'save':
          return beginSave(state)
        case 'delete':
          return beginDelete(state)
        case 'recover':
          return recover(state)
      }
    },
  }
}

function editDraft(
  state: State,
  field: 'title' | 'url' | 'description',
  value: string,
): CaptureOutput {
  if (field === 'description') {
    state.description = value
  } else {
    state[field].value = value
    state[field].error = ''
    state[field].customValidity = ''
  }
  return makeOutput(state)
}

function confirmNewTag(state: State): CaptureOutput {
  if (!normalizeTag(state.tags.newName)) {
    state.tags.newNameError = '错误：请输入标签名字'
    return makeOutput(state, undefined, 'new-tag')
  }
  addTag(state.tags, state.tags.newName)
  setTagMenu(state.tags, 'closed')
  return makeOutput(state, undefined, 'tag-add')
}

function beginSave(state: State): CaptureOutput {
  if (!state.catalogReady || state.tags.selected.length === 0) {
    return makeOutput(state)
  }

  state.title.customValidity = state.title.value.trim() ? '' : '请输入标题'
  state.url.customValidity = isHttpUrl(state.url.value)
    ? ''
    : '请输入 http(s) 地址'
  if (state.title.customValidity || state.url.customValidity) {
    return makeOutput(state, undefined, undefined, true)
  }

  const description = state.description.trim()
  const draft = {
    title: state.title.value,
    url: state.url.value,
    tags: [...state.tags.selected],
    ...(description ? { description } : {}),
  }
  const updating = state.boundUrl !== null
  const intent: PortalSourceIntent = state.boundUrl
    ? { kind: 'update', boundUrl: state.boundUrl, draft }
    : { kind: 'capture', draft }
  return beginWrite(state, intent, {
    action: 'save',
    updating,
    restoring: state.deleted,
  })
}

function beginDelete(state: State): CaptureOutput {
  if (!state.catalogReady || state.boundUrl === null) return makeOutput(state)
  return beginWrite(
    state,
    { kind: 'delete', boundUrl: state.boundUrl },
    { action: 'delete', updating: false, restoring: false },
  )
}

function beginWrite(
  state: State,
  intent: PortalSourceIntent,
  context: WriteContext,
): CaptureOutput {
  const target = requireTarget(state)
  state.busy = true
  state.pending = 'write-portal-source'
  state.writeContext = context
  state.recovery = null
  setStatus(
    state,
    context.action === 'delete'
      ? '正在删除…'
      : context.restoring
        ? '正在恢复…'
        : '正在写入门户源…',
    'pending',
  )
  return makeOutput(state, {
    kind: 'write-portal-source',
    target,
    intent,
  })
}

function recover(state: State): CaptureOutput {
  switch (state.recovery) {
    case 'open-options':
      return makeOutput(state, { kind: 'open-options' })
    case 'reload-popup':
      return makeOutput(state, { kind: 'reload-popup' })
    case 'retry-read': {
      const target = requireTarget(state)
      state.busy = true
      state.pending = 'reload-portal-source'
      state.recovery = null
      setStatus(state, '正在重新读取门户源…', 'pending')
      return makeOutput(state, { kind: 'reload-portal-source', target })
    }
    case 'retry-save':
      return beginSave(state)
    case 'retry-delete':
      return beginDelete(state)
    default:
      return makeOutput(state)
  }
}

function finishEffect(state: State, outcome: CaptureOutcome): CaptureOutput {
  const expected = expectedPending(outcome)
  if (state.pending !== expected) {
    throw new TypeError(`unexpected ${outcome.kind} outcome`)
  }
  state.pending = null

  switch (outcome.kind) {
    case 'configuration-loaded':
      return finishConfiguration(state, outcome.result)
    case 'configuration-load-failed':
      state.screen = 'gate'
      state.gateMessage = '无法读取配置，请重试。'
      state.recovery = 'reload-popup'
      return makeOutput(state)
    case 'opening-context-loaded':
      return finishOpeningContext(state, outcome.page, outcome.portalSource)
    case 'opening-context-load-failed':
      state.busy = false
      showReadError(state, '无法读取当前页或门户源', 'retry')
      return makeOutput(state)
    case 'portal-source-reloaded':
      state.busy = false
      if (!outcome.portalSource.ok) {
        showReadError(
          state,
          outcome.portalSource.error,
          outcome.portalSource.kind,
        )
        return makeOutput(state)
      }
      bindCatalog(state, outcome.portalSource.catalog)
      setStatus(state, '门户源已读取', 'ok')
      return makeOutput(state)
    case 'portal-source-reload-failed':
      state.busy = false
      showReadError(state, '无法读取门户源', 'retry')
      return makeOutput(state)
    case 'portal-source-written':
      return finishWrite(state, outcome.result)
    case 'portal-source-write-failed':
      return finishWriteFailure(state, '写入失败', 'retry')
  }
}

function finishConfiguration(
  state: State,
  result: Extract<CaptureOutcome, { kind: 'configuration-loaded' }>['result'],
): CaptureOutput {
  if (result.kind === 'incomplete') {
    state.screen = 'gate'
    state.gateMessage = '先在选项里填写仓库和凭证，才能把当前页写进门户源。'
    state.recovery = 'open-options'
    return makeOutput(state)
  }

  state.screen = 'capture'
  state.target = { ...result.target }
  state.tags = createTagState(parseDefaultTags(result.defaultTags), [], true)
  state.busy = true
  state.pending = 'load-opening-context'
  setStatus(state, '正在读取当前页与门户源…', 'pending')
  return makeOutput(state, {
    kind: 'load-opening-context',
    target: requireTarget(state),
  })
}

function finishOpeningContext(
  state: State,
  page: CurrentPage,
  portalSource: ReadPortalSourceResult,
): CaptureOutput {
  state.busy = false
  state.openingUrl = page.url
  state.title.value = page.title
  state.url.value = page.url
  state.description = page.description
  state.faviconUrl = page.favIconUrl

  if (!portalSource.ok) {
    showReadError(state, portalSource.error, portalSource.kind)
    return makeOutput(state)
  }
  bindCatalog(state, portalSource.catalog)
  setStatus(state, '门户源已读取', 'ok')
  return makeOutput(state)
}

function finishWrite(state: State, result: CommitResult): CaptureOutput {
  if (!result.ok) return finishWriteFailure(state, result.error, result.kind)

  const context = requireWriteContext(state)
  state.busy = false
  state.writeContext = null
  state.recovery = null
  if (context.action === 'delete') {
    state.boundUrl = null
    state.deleted = true
    setStatus(state, '已从门户源删除，可恢复', 'success')
  } else {
    state.boundUrl = result.url
    state.deleted = false
    state.tags.prefill = false
    setStatus(
      state,
      context.updating
        ? '已改写到门户源'
        : context.restoring
          ? '已恢复到门户源'
          : '已收录到门户源',
      'success',
    )
  }
  return makeOutput(state)
}

function finishWriteFailure(
  state: State,
  error: string,
  kind: PortalFailureKind,
): CaptureOutput {
  const context = requireWriteContext(state)
  state.busy = false
  state.writeContext = null
  state.recovery = null

  if (kind === 'title') {
    state.title.error = `错误：${error}，请修改标题`
    setStatus(state, '未写入，请修改标题', 'error')
    return makeOutput(state, undefined, 'title')
  }
  if (kind === 'url') {
    state.url.error = `错误：${error}，请修改 URL`
    setStatus(state, '未写入，请修改 URL', 'error')
    return makeOutput(state, undefined, 'url')
  }
  if (kind === 'tags') {
    state.tags.error = `错误：${error}`
    setStatus(state, '未写入，请添加标签', 'error')
    return makeOutput(state, undefined, 'tag-add')
  }
  if (kind === 'source') {
    setStatus(state, `错误：${error}，请先修复 public/portal.json`, 'error')
    return makeOutput(state)
  }

  state.recovery =
    kind === 'settings'
      ? 'open-options'
      : context.action === 'delete'
        ? 'retry-delete'
        : 'retry-save'
  setStatus(state, `错误：${error}`, 'error')
  return makeOutput(state)
}

function bindCatalog(state: State, catalog: Catalog): void {
  const bound = findBoundEntry(catalog, state.openingUrl)
  state.catalogReady = true
  state.tags.catalog = [...catalog.tags]
  if (!bound) return

  state.boundUrl = bound.url
  state.deleted = false
  state.title = { value: bound.title, error: '', customValidity: '' }
  state.url = { value: bound.url, error: '', customValidity: '' }
  state.description = bound.description ?? ''
  state.tags = createTagState(bound.tags, catalog.tags, false)
}

function showReadError(
  state: State,
  error: string,
  kind: PortalFailureKind,
): void {
  state.catalogReady = false
  if (kind === 'source') {
    state.recovery = null
    setStatus(state, `错误：${error}，请先修复 public/portal.json`, 'error')
    return
  }
  state.recovery = kind === 'settings' ? 'open-options' : 'retry-read'
  setStatus(state, `错误：${error}`, 'error')
}

function setStatus(
  state: State,
  text: string,
  status: State['status']['state'],
): void {
  state.status = { text, state: status }
}

function makeOutput(
  state: State,
  effect?: CaptureEffect,
  focus?: FocusTarget,
  reportValidity?: true,
): CaptureOutput {
  const output: CaptureOutput = { view: makeView(state) }
  if (effect) output.effect = effect
  if (focus) output.focus = focus
  if (reportValidity) output.reportValidity = true
  return output
}

function makeView(state: State): CaptureView {
  if (state.screen === 'blank') return { screen: 'blank' }
  if (state.screen === 'gate') {
    return {
      screen: 'gate',
      message: state.gateMessage,
      actionLabel: state.recovery === 'reload-popup' ? '重试' : '去选项',
    }
  }

  return {
    screen: 'capture',
    busy: state.busy,
    mode: state.boundUrl === null ? '收录' : '改写',
    faviconUrl: state.faviconUrl,
    title: { ...state.title },
    url: { ...state.url },
    description: {
      value: state.description,
      summary: state.description || '添加描述',
      expanded: state.descriptionExpanded,
    },
    tags: {
      selected: [...state.tags.selected],
      choices: availableTags(state.tags).map((tag) => ({ ...tag })),
      menu: state.tags.menu,
      newName: state.tags.newName,
      error: state.tags.error,
      newNameError: state.tags.newNameError,
    },
    save: {
      label: state.deleted ? '恢复' : '保存',
      disabled:
        !state.catalogReady || state.busy || state.tags.selected.length === 0,
    },
    delete: {
      visible: state.boundUrl !== null,
      disabled: !state.catalogReady || state.busy,
    },
    status: {
      ...state.status,
      actionLabel:
        state.recovery === 'open-options'
          ? '去选项'
          : state.recovery
            ? '重试'
            : '',
    },
  }
}

function createTagState(
  selected: readonly string[],
  catalog: readonly TagSummary[],
  prefill: boolean,
): TagState {
  return {
    selected: uniqueTags(selected),
    catalog: [...catalog],
    prefill,
    menu: 'closed',
    newName: '',
    error: '',
    newNameError: '',
  }
}

function setTagMenu(
  tags: TagState,
  menu: 'closed' | 'choices' | 'create',
): void {
  tags.menu = menu
  if (menu !== 'create') tags.newName = ''
}

function addTag(tags: TagState, rawName: string): void {
  const name = normalizeTag(rawName)
  if (!name) return
  consumePrefill(tags)
  if (!tags.selected.includes(name)) tags.selected.push(name)
  tags.error = ''
}

function consumePrefill(tags: TagState): void {
  if (!tags.prefill) return
  tags.selected = []
  tags.prefill = false
}

function uniqueTags(raw: readonly string[]): string[] {
  const tags: string[] = []
  for (const value of raw) {
    const name = normalizeTag(value)
    if (name && !tags.includes(name)) tags.push(name)
  }
  return tags
}

function availableTags(tags: TagState): TagSummary[] {
  const selected = new Set(tags.selected)
  return tags.catalog
    .filter((tag) => !selected.has(tag.name))
    .sort((a, b) => b.count - a.count)
}

function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function requireTarget(state: State): PortalTarget {
  if (!state.target) throw new TypeError('capture session has no portal target')
  return { ...state.target }
}

function requireWriteContext(state: State): WriteContext {
  if (!state.writeContext) throw new TypeError('capture session has no write context')
  return state.writeContext
}

function expectedPending(outcome: CaptureOutcome): Exclude<Pending, null> {
  switch (outcome.kind) {
    case 'configuration-loaded':
    case 'configuration-load-failed':
      return 'load-configuration'
    case 'opening-context-loaded':
    case 'opening-context-load-failed':
      return 'load-opening-context'
    case 'portal-source-reloaded':
    case 'portal-source-reload-failed':
      return 'reload-portal-source'
    case 'portal-source-written':
    case 'portal-source-write-failed':
      return 'write-portal-source'
  }
}
