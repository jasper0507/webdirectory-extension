import { describe, expect, it } from 'vitest'
import { parsePortalSource, type BookmarkEntry } from './catalog.ts'
import {
  startCaptureSession,
  type CaptureOutput,
  type CaptureSession,
  type CaptureView,
} from './capture-session.ts'
import type { ReadPortalSourceResult } from './commit-portal-source.ts'
import { samplePortalSource } from './portal-fixture.ts'

const target = { owner: 'acme', repo: 'portal' }
const page = {
  url: 'https://page.example/',
  title: '当前页',
  description: '页面描述',
  favIconUrl: 'https://page.example/favicon.ico',
}

type CaptureScreen = Extract<CaptureView, { screen: 'capture' }>

function view(output: CaptureOutput): CaptureScreen {
  if (output.view.screen !== 'capture') throw new Error('expected capture screen')
  return output.view
}

function portalSource(entries: Array<Partial<BookmarkEntry>> = []): ReadPortalSourceResult {
  const parsed = parsePortalSource(
    samplePortalSource(
      entries.map((entry, index) => ({
        title: entry.title ?? `条目 ${String(index + 1)}`,
        url: entry.url ?? `https://example.com/${String(index + 1)}`,
        tags: entry.tags ?? ['文档'],
        ...(entry.description ? { description: entry.description } : {}),
      })),
    ),
  )
  if (!parsed.ok) throw new Error('invalid portal fixture')
  return { ok: true, catalog: parsed.catalog }
}

function configured(defaultTags = '其他'): {
  session: CaptureSession
  output: CaptureOutput
} {
  const started = startCaptureSession()
  expect(started.output.effect).toEqual({ kind: 'load-configuration' })
  const output = started.session.dispatch({
    kind: 'effect-finished',
    outcome: {
      kind: 'configuration-loaded',
      result: { kind: 'complete', target, defaultTags },
    },
  })
  expect(output.effect).toEqual({ kind: 'load-opening-context', target })
  return { session: started.session, output }
}

function opened(
  entries: Array<Partial<BookmarkEntry>> = [],
  defaultTags = '其他',
): { session: CaptureSession; output: CaptureOutput } {
  const ready = configured(defaultTags)
  return {
    session: ready.session,
    output: ready.session.dispatch({
      kind: 'effect-finished',
      outcome: {
        kind: 'opening-context-loaded',
        page,
        portalSource: portalSource(entries),
      },
    }),
  }
}

describe('收录窗会话', () => {
  it('配置缺失或读取失败时只给出对应恢复动作', () => {
    const incomplete = startCaptureSession()
    let output = incomplete.session.dispatch({
      kind: 'effect-finished',
      outcome: {
        kind: 'configuration-loaded',
        result: { kind: 'incomplete' },
      },
    })
    expect(output.view).toEqual({
      screen: 'gate',
      message: '先在选项里填写仓库和凭证，才能把当前页写进门户源。',
      actionLabel: '去选项',
    })
    output = incomplete.session.dispatch({ kind: 'recover' })
    expect(output.effect).toEqual({ kind: 'open-options' })

    const failed = startCaptureSession()
    output = failed.session.dispatch({
      kind: 'effect-finished',
      outcome: { kind: 'configuration-load-failed' },
    })
    expect(output.view).toEqual({
      screen: 'gate',
      message: '无法读取配置，请重试。',
      actionLabel: '重试',
    })
    expect(failed.session.dispatch({ kind: 'recover' }).effect).toEqual({
      kind: 'reload-popup',
    })
  })

  it('新收录用当前页与默认标签；第一次打开标签菜单会消费整组预填', () => {
    const { session, output } = opened(
      [
        { title: '工具', url: 'https://tool.example/', tags: ['工具'] },
        { title: '参考', url: 'https://ref.example/', tags: ['工具', '参考'] },
      ],
      '其他，阅读',
    )
    expect(view(output)).toMatchObject({
      mode: '收录',
      title: { value: '当前页' },
      description: { value: '页面描述', summary: '页面描述' },
      tags: { selected: ['其他', '阅读'] },
      save: { label: '保存', disabled: false },
      delete: { visible: false },
    })

    const menu = session.dispatch({ kind: 'toggle-tag-menu' })
    expect(view(menu).tags).toMatchObject({
      selected: [],
      menu: 'choices',
      choices: [
        { name: '工具', count: 2 },
        { name: '参考', count: 1 },
      ],
    })
    expect(menu.focus).toBe('first-tag-choice-or-create')
    expect(view(menu).save.disabled).toBe(true)

    const selected = session.dispatch({ kind: 'select-tag', name: '工具' })
    expect(view(selected).tags).toMatchObject({
      selected: ['工具'],
      menu: 'closed',
    })
    expect(selected.focus).toBe('tag-add')
  })

  it('标签新建会规范化去重，移除最后一个标签会给出可见错误', () => {
    const { session } = opened([], '')
    session.dispatch({ kind: 'show-tag-creation' })
    session.dispatch({ kind: 'edit-new-tag', value: '  文档  ' })
    let output = session.dispatch({ kind: 'confirm-new-tag' })
    expect(view(output).tags.selected).toEqual(['文档'])

    session.dispatch({ kind: 'show-tag-creation' })
    session.dispatch({ kind: 'edit-new-tag', value: '文档' })
    output = session.dispatch({ kind: 'confirm-new-tag' })
    expect(view(output).tags.selected).toEqual(['文档'])

    output = session.dispatch({ kind: 'remove-tag', name: '文档' })
    expect(view(output).tags.error).toBe('错误：至少保留一个标签')
    expect(output.focus).toBe('tag-add')
  })

  it('绑定条目决定改写槽，用户编辑 URL 不改变绑定', () => {
    const { session, output } = opened([
      {
        title: '已收录',
        url: page.url,
        tags: ['文档'],
        description: '门户描述',
      },
    ])
    expect(view(output)).toMatchObject({
      mode: '改写',
      title: { value: '已收录' },
      description: { value: '门户描述' },
      delete: { visible: true },
    })

    session.dispatch({ kind: 'edit', field: 'url', value: 'https://new.example/' })
    const saving = session.dispatch({ kind: 'save' })
    expect(saving.effect).toEqual({
      kind: 'write-portal-source',
      target,
      intent: {
        kind: 'update',
        boundUrl: page.url,
        draft: {
          title: '已收录',
          url: 'https://new.example/',
          tags: ['文档'],
          description: '门户描述',
        },
      },
    })
  })

  it('删除后保留草稿，恢复使用收录意图', () => {
    const { session } = opened([
      { title: '已收录', url: page.url, tags: ['文档'] },
    ])
    let output = session.dispatch({ kind: 'delete' })
    expect(output.effect).toMatchObject({
      kind: 'write-portal-source',
      intent: { kind: 'delete', boundUrl: page.url },
    })
    output = session.dispatch({
      kind: 'effect-finished',
      outcome: {
        kind: 'portal-source-written',
        result: { ok: true, url: page.url },
      },
    })
    expect(view(output)).toMatchObject({
      mode: '收录',
      title: { value: '已收录' },
      save: { label: '恢复' },
      delete: { visible: false },
      status: { text: '已从门户源删除，可恢复', state: 'success' },
    })

    output = session.dispatch({ kind: 'save' })
    expect(output.effect).toMatchObject({
      kind: 'write-portal-source',
      intent: { kind: 'capture', draft: { title: '已收录' } },
    })
    output = session.dispatch({
      kind: 'effect-finished',
      outcome: {
        kind: 'portal-source-written',
        result: { ok: true, url: page.url },
      },
    })
    expect(view(output)).toMatchObject({
      mode: '改写',
      save: { label: '保存' },
      status: { text: '已恢复到门户源', state: 'success' },
    })
  })

  it('读取失败后只重读门户源；未绑定时保留用户草稿', () => {
    const ready = configured()
    let output = ready.session.dispatch({
      kind: 'effect-finished',
      outcome: {
        kind: 'opening-context-loaded',
        page,
        portalSource: { ok: false, kind: 'retry', error: '无法连接 GitHub' },
      },
    })
    expect(view(output).status).toMatchObject({
      text: '错误：无法连接 GitHub',
      actionLabel: '重试',
    })
    ready.session.dispatch({
      kind: 'edit',
      field: 'title',
      value: '用户修改的标题',
    })
    output = ready.session.dispatch({ kind: 'recover' })
    expect(output.effect).toEqual({ kind: 'reload-portal-source', target })

    output = ready.session.dispatch({
      kind: 'effect-finished',
      outcome: {
        kind: 'portal-source-reloaded',
        portalSource: portalSource(),
      },
    })
    expect(view(output).title.value).toBe('用户修改的标题')
    expect(view(output).status.text).toBe('门户源已读取')
  })

  it('写入失败后的重试根据当前草稿重新计算', () => {
    const { session } = opened()
    session.dispatch({ kind: 'save' })
    let output = session.dispatch({
      kind: 'effect-finished',
      outcome: {
        kind: 'portal-source-written',
        result: { ok: false, kind: 'retry', error: '写入失败' },
      },
    })
    expect(view(output).status.actionLabel).toBe('重试')

    session.dispatch({
      kind: 'edit',
      field: 'title',
      value: '重试前修改',
    })
    output = session.dispatch({ kind: 'recover' })
    expect(output.effect).toMatchObject({
      kind: 'write-portal-source',
      intent: { kind: 'capture', draft: { title: '重试前修改' } },
    })
  })

  it.each([
    {
      kind: 'title' as const,
      error: '标题与其它书签重复',
      fieldError: '错误：标题与其它书签重复，请修改标题',
      status: '未写入，请修改标题',
      focus: 'title',
      action: '',
    },
    {
      kind: 'url' as const,
      error: '地址与其它书签重复',
      fieldError: '错误：地址与其它书签重复，请修改 URL',
      status: '未写入，请修改 URL',
      focus: 'url',
      action: '',
    },
    {
      kind: 'tags' as const,
      error: '必须至少有一个标签',
      fieldError: '错误：必须至少有一个标签',
      status: '未写入，请添加标签',
      focus: 'tag-add',
      action: '',
    },
    {
      kind: 'source' as const,
      error: '门户源无效',
      fieldError: '',
      status: '错误：门户源无效，请先修复 public/portal.json',
      focus: undefined,
      action: '',
    },
    {
      kind: 'settings' as const,
      error: '凭证无效或没有仓库权限',
      fieldError: '',
      status: '错误：凭证无效或没有仓库权限',
      focus: undefined,
      action: '去选项',
    },
  ])('把 $kind 写入失败投影到可见恢复状态', (failure) => {
    const { session } = opened()
    session.dispatch({ kind: 'save' })
    const output = session.dispatch({
      kind: 'effect-finished',
      outcome: {
        kind: 'portal-source-written',
        result: { ok: false, kind: failure.kind, error: failure.error },
      },
    })
    const capture = view(output)
    const fieldError =
      failure.kind === 'title'
        ? capture.title.error
        : failure.kind === 'url'
          ? capture.url.error
          : failure.kind === 'tags'
            ? capture.tags.error
            : ''
    expect(fieldError).toBe(failure.fieldError)
    expect(capture.status).toMatchObject({
      text: failure.status,
      actionLabel: failure.action,
    })
    expect(output.focus).toBe(failure.focus)
  })

  it('语义校验请求原生报告，busy 忽略用户消息，错误 outcome 立即失败', () => {
    const { session } = opened()
    session.dispatch({ kind: 'edit', field: 'title', value: '   ' })
    session.dispatch({ kind: 'edit', field: 'url', value: 'ftp://example.com/' })
    let output = session.dispatch({ kind: 'save' })
    expect(output.effect).toBeUndefined()
    expect(output.reportValidity).toBe(true)
    expect(view(output).title.customValidity).toBe('请输入标题')
    expect(view(output).url.customValidity).toBe('请输入 http(s) 地址')

    output = session.dispatch({ kind: 'field-invalid', field: 'title' })
    expect(view(output).title.error).toBe('错误：请输入标题')

    session.dispatch({ kind: 'edit', field: 'title', value: '有效标题' })
    session.dispatch({ kind: 'edit', field: 'url', value: 'https://valid.example/' })
    output = session.dispatch({ kind: 'save' })
    expect(view(output).busy).toBe(true)
    const ignored = session.dispatch({
      kind: 'edit',
      field: 'title',
      value: '不应生效',
    })
    expect(view(ignored).title.value).toBe('有效标题')
    expect(() =>
      session.dispatch({
        kind: 'effect-finished',
        outcome: { kind: 'portal-source-reload-failed' },
      }),
    ).toThrow('unexpected portal-source-reload-failed outcome')
  })
})
