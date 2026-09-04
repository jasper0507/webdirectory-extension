import { createExtensionStore } from './chrome-store.ts'
import {
  startCaptureSession,
  type CaptureEffect,
  type CaptureMessage,
  type CaptureOutcome,
  type CaptureOutput,
  type CaptureView,
  type FocusTarget,
} from './capture-session.ts'
import {
  commitPortalSource,
  readPortalSource,
} from './portal-source.ts'
import { isConfigurationComplete } from './configuration.ts'
import { element } from './dom.ts'
import { createGithubContentsGateway } from './github-contents.ts'
import { readCurrentPage } from './page.ts'

const gate = element('gate', HTMLElement)
const gateMessage = element('gate-message', HTMLElement)
const goOptions = element('go-options', HTMLButtonElement)
const capture = element('capture', HTMLFormElement)
const captureGrid = element('capture-grid', HTMLElement)
const modeEl = element('mode', HTMLElement)
const tagColumn = element('tag-column', HTMLElement)
const tagsEl = element('tags', HTMLUListElement)
const tagAdd = element('tag-add', HTMLButtonElement)
const tagMenu = element('tag-menu', HTMLElement)
const tagChoices = element('tag-choices', HTMLUListElement)
const tagCreateOpen = element('tag-create-open', HTMLButtonElement)
const tagCreate = element('tag-create', HTMLElement)
const tagCreateName = element('tag-create-name', HTMLInputElement)
const tagCreateError = element('tag-create-error', HTMLElement)
const tagCreateConfirm = element('tag-create-confirm', HTMLButtonElement)
const tagError = element('tag-error', HTMLElement)
const faviconSlot = element('favicon-slot', HTMLElement)
const titleInput = element('title', HTMLInputElement)
const titleError = element('title-error', HTMLElement)
const descLine = element('desc-line', HTMLButtonElement)
const descriptionInput = element('description', HTMLTextAreaElement)
const urlInput = element('url', HTMLInputElement)
const urlError = element('url-error', HTMLElement)
const deleteButton = element('delete', HTMLButtonElement)
const saveButton = element('save', HTMLButtonElement)
const statusEl = element('status', HTMLElement)
const statusMessage = element('status-message', HTMLElement)
const statusAction = element('status-action', HTMLButtonElement)

const store = createExtensionStore()
const gateway = createGithubContentsGateway(fetch)
const { session, output: initialOutput } = startCaptureSession()

let credential = ''
let renderedFaviconUrl = ''
let failedFaviconUrl = ''

goOptions.addEventListener('click', () => {
  dispatch({ kind: 'recover' })
})

statusAction.addEventListener('click', () => {
  dispatch({ kind: 'recover' })
})

capture.addEventListener('submit', (event) => {
  event.preventDefault()
  dispatch({ kind: 'save' })
})

titleInput.addEventListener('input', () => {
  dispatch({ kind: 'edit', field: 'title', value: titleInput.value })
})

urlInput.addEventListener('input', () => {
  dispatch({ kind: 'edit', field: 'url', value: urlInput.value })
})

descriptionInput.addEventListener('input', () => {
  dispatch({
    kind: 'edit',
    field: 'description',
    value: descriptionInput.value,
  })
})

titleInput.addEventListener('invalid', () => {
  dispatch({ kind: 'field-invalid', field: 'title' })
})

urlInput.addEventListener('invalid', () => {
  dispatch({ kind: 'field-invalid', field: 'url' })
})

deleteButton.addEventListener('click', () => {
  dispatch({ kind: 'delete' })
})

descLine.addEventListener('click', () => {
  dispatch({ kind: 'show-description' })
})

tagAdd.addEventListener('click', () => {
  dispatch({ kind: 'toggle-tag-menu' })
})

tagCreateOpen.addEventListener('click', () => {
  dispatch({ kind: 'show-tag-creation' })
})

tagCreateConfirm.addEventListener('click', () => {
  dispatch({ kind: 'confirm-new-tag' })
})

tagCreateName.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  event.preventDefault()
  dispatch({ kind: 'confirm-new-tag' })
})

tagCreateName.addEventListener('input', () => {
  dispatch({ kind: 'edit-new-tag', value: tagCreateName.value })
})

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Node) || tagColumn.contains(event.target)) return
  dispatch({ kind: 'dismiss-tag-menu' })
})

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || tagMenu.hidden) return
  event.preventDefault()
  dispatch({ kind: 'cancel-tag-menu' })
})

present(initialOutput)

function dispatch(message: CaptureMessage): void {
  present(session.dispatch(message))
}

function present(output: CaptureOutput): void {
  render(output.view)
  if (output.reportValidity) capture.reportValidity()
  if (output.focus) focus(output.focus)
  if (output.effect) void execute(output.effect)
}

async function execute(effect: CaptureEffect): Promise<void> {
  const outcome = await runEffect(effect)
  if (outcome) dispatch({ kind: 'effect-finished', outcome })
}

async function runEffect(effect: CaptureEffect): Promise<CaptureOutcome | undefined> {
  switch (effect.kind) {
    case 'load-configuration':
      try {
        const config = await store.load()
        if (!isConfigurationComplete(config)) {
          credential = ''
          return {
            kind: 'configuration-loaded',
            result: { kind: 'incomplete' },
          }
        }
        credential = config.credential
        return {
          kind: 'configuration-loaded',
          result: {
            kind: 'complete',
            target: { owner: config.owner, repo: config.repo },
            defaultTags: config.defaultTags,
          },
        }
      } catch {
        credential = ''
        return { kind: 'configuration-load-failed' }
      }

    case 'load-opening-context':
      try {
        const repo = { ...effect.target, credential }
        const [page, portalSource] = await Promise.all([
          readCurrentPage({
            tabs: chrome.tabs,
            scripting: chrome.scripting,
          }),
          readPortalSource(gateway, repo),
        ])
        return { kind: 'opening-context-loaded', page, portalSource }
      } catch {
        return { kind: 'opening-context-load-failed' }
      }

    case 'reload-portal-source':
      try {
        return {
          kind: 'portal-source-reloaded',
          portalSource: await readPortalSource(gateway, {
            ...effect.target,
            credential,
          }),
        }
      } catch {
        return { kind: 'portal-source-reload-failed' }
      }

    case 'write-portal-source':
      try {
        return {
          kind: 'portal-source-written',
          result: await commitPortalSource(
            gateway,
            { ...effect.target, credential },
            effect.intent,
          ),
        }
      } catch {
        return { kind: 'portal-source-write-failed' }
      }

    case 'open-options':
      chrome.runtime.openOptionsPage()
      return
    case 'reload-popup':
      location.reload()
      return
  }
}

function render(view: CaptureView): void {
  gate.hidden = view.screen !== 'gate'
  capture.hidden = view.screen !== 'capture'
  if (view.screen === 'blank') return
  if (view.screen === 'gate') {
    gateMessage.textContent = view.message
    goOptions.textContent = view.actionLabel
    return
  }

  captureGrid.setAttribute('aria-busy', String(view.busy))
  captureGrid.inert = view.busy
  modeEl.textContent = view.mode
  renderFavicon(view.faviconUrl)
  renderField(titleInput, titleError, view.title)
  renderField(urlInput, urlError, view.url)
  setValue(descriptionInput, view.description.value)
  descLine.textContent = view.description.summary
  descLine.hidden = view.description.expanded
  descriptionInput.hidden = !view.description.expanded
  renderTags(view)
  saveButton.textContent = view.save.label
  saveButton.disabled = view.save.disabled
  deleteButton.hidden = !view.delete.visible
  deleteButton.disabled = view.delete.disabled
  statusMessage.textContent = view.status.text
  statusEl.dataset.state = view.status.state
  statusAction.textContent = view.status.actionLabel
  statusAction.hidden = view.status.actionLabel === ''
}

function renderField(
  input: HTMLInputElement,
  message: HTMLElement,
  field: { value: string; error: string; customValidity: string },
): void {
  setValue(input, field.value)
  input.setCustomValidity(field.customValidity)
  renderError(input, message, field.error)
}

function renderTags(view: Extract<CaptureView, { screen: 'capture' }>): void {
  tagsEl.replaceChildren()
  for (const name of view.tags.selected) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    const removeMark = document.createElement('span')
    button.type = 'button'
    button.className = 'tag'
    button.setAttribute('aria-label', `去掉 ${name}`)
    removeMark.className = 'tag-remove'
    removeMark.setAttribute('aria-hidden', 'true')
    button.append(name, removeMark)
    button.addEventListener('click', () => {
      dispatch({ kind: 'remove-tag', name })
    })
    item.append(button)
    tagsEl.append(item)
  }

  tagChoices.replaceChildren()
  for (const tag of view.tags.choices) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tag-choice'
    button.textContent = tag.name
    button.addEventListener('click', () => {
      dispatch({ kind: 'select-tag', name: tag.name })
    })
    item.append(button)
    tagChoices.append(item)
  }

  const menu = view.tags.menu
  tagMenu.hidden = menu === 'closed'
  tagChoices.hidden = menu !== 'choices'
  tagCreateOpen.hidden = menu !== 'choices'
  tagCreate.hidden = menu !== 'create'
  tagAdd.setAttribute('aria-expanded', menu === 'closed' ? 'false' : 'true')
  setValue(tagCreateName, view.tags.newName)
  renderError(tagCreateName, tagCreateError, view.tags.newNameError)
  tagError.textContent = view.tags.error
  tagError.hidden = view.tags.error === ''
}

function renderError(
  input: HTMLInputElement,
  message: HTMLElement,
  error: string,
): void {
  input.toggleAttribute('aria-invalid', error !== '')
  message.textContent = error
  message.hidden = error === ''
}

function setValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  if (input.value !== value) input.value = value
}

function renderFavicon(url: string): void {
  if (url === renderedFaviconUrl) return
  renderedFaviconUrl = url
  faviconSlot.replaceChildren()
  if (!url || url === failedFaviconUrl) {
    faviconSlot.hidden = true
    return
  }

  const icon = document.createElement('img')
  icon.alt = ''
  icon.src = url
  icon.addEventListener('error', () => {
    failedFaviconUrl = url
    icon.remove()
    faviconSlot.hidden = true
  })
  faviconSlot.hidden = false
  faviconSlot.append(icon)
}

function focus(target: FocusTarget): void {
  const elementByTarget: Record<Exclude<FocusTarget, 'first-tag-choice-or-create'>, HTMLElement> = {
    description: descriptionInput,
    'new-tag': tagCreateName,
    'tag-add': tagAdd,
    title: titleInput,
    url: urlInput,
  }
  if (target === 'first-tag-choice-or-create') {
    ;(tagChoices.querySelector('button') ?? tagCreateOpen).focus()
    return
  }
  elementByTarget[target].focus()
}
