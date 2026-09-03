import { createExtensionStore } from './chrome-store.ts'
import {
  FACTORY_DEFAULT_TAGS,
  isConfigurationComplete,
} from './configuration.ts'
import { element } from './dom.ts'
import { createGithubContentsGateway } from './github-contents.ts'
import { saveOptions } from './save-options.ts'

const form = element('options-form', HTMLFormElement)
const ownerInput = element('owner', HTMLInputElement)
const repoInput = element('repo', HTMLInputElement)
const credentialInput = element('credential', HTMLInputElement)
const defaultTagsInput = element('default-tags', HTMLInputElement)
const statusEl = element('status', HTMLElement)
const saveButton = element('save', HTMLButtonElement)

const store = createExtensionStore()
const gateway = createGithubContentsGateway(fetch)

void boot()

form.addEventListener('input', syncSave)
form.addEventListener('submit', (event) => {
  event.preventDefault()
  void onSubmit()
})

async function boot(): Promise<void> {
  try {
    const config = await store.load()
    ownerInput.value = config.owner
    repoInput.value = config.repo
    credentialInput.value = config.credential
    defaultTagsInput.value = config.defaultTags
  } catch {
    defaultTagsInput.value = FACTORY_DEFAULT_TAGS
    setStatus('无法读取配置，请重新加载页面', 'error')
  }
  syncSave()
}

async function onSubmit(): Promise<void> {
  saveButton.disabled = true
  setStatus('正在连通…', 'pending')
  try {
    const result = await saveOptions(store, gateway, {
      owner: ownerInput.value,
      repo: repoInput.value,
      credential: credentialInput.value,
      defaultTags: defaultTagsInput.value,
    })
    if (result.ok) {
      setStatus('已保存，连通正常', 'ok')
    } else {
      setStatus(result.error, 'error')
    }
  } catch {
    setStatus('无法保存配置', 'error')
  }
  syncSave()
}

function syncSave(): void {
  saveButton.disabled = !isConfigurationComplete({
    owner: ownerInput.value,
    repo: repoInput.value,
    credential: credentialInput.value,
    defaultTags: defaultTagsInput.value,
  })
}

function setStatus(text: string, state: 'ok' | 'error' | 'pending'): void {
  statusEl.textContent = text
  statusEl.dataset.state = state
}
