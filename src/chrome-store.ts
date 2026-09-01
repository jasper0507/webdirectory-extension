import {
  FACTORY_DEFAULT_TAGS,
  type Configuration,
  type ConfigurationStore,
} from './configuration.ts'

const SYNC_KEY = 'settings'
const LOCAL_KEY = 'credential'

export type StorageArea = {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

export type BrowserStorage = {
  local: StorageArea
  sync: StorageArea
}

export function createExtensionStore(): ConfigurationStore {
  return createChromeConfigurationStore({
    local: wrapArea(chrome.storage.local),
    sync: wrapArea(chrome.storage.sync),
  })
}

export function createChromeConfigurationStore(
  storage: BrowserStorage,
): ConfigurationStore {
  return {
    async load() {
      const [syncResult, localResult] = await Promise.all([
        storage.sync.get(SYNC_KEY),
        storage.local.get(LOCAL_KEY),
      ])
      const target = asRecord(syncResult[SYNC_KEY])
      const credential = localResult[LOCAL_KEY]
      return {
        owner: asString(target.owner),
        repo: asString(target.repo),
        defaultTags:
          typeof target.defaultTags === 'string'
            ? target.defaultTags
            : FACTORY_DEFAULT_TAGS,
        credential: asString(credential),
      } satisfies Configuration
    },
    async save(config) {
      await storage.sync.set({
        [SYNC_KEY]: {
          owner: config.owner,
          repo: config.repo,
          defaultTags: config.defaultTags,
        },
      })
      await storage.local.set({
        [LOCAL_KEY]: config.credential,
      })
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function wrapArea(area: chrome.storage.StorageArea): StorageArea {
  return {
    async get(keys) {
      const result =
        keys == null ? await area.get(null) : await area.get(keys)
      return result as Record<string, unknown>
    },
    set(items) {
      return area.set(items)
    },
  }
}
