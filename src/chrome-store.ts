import {
  FACTORY_DEFAULT_TAGS,
  type Configuration,
  type ConfigurationStore,
} from './configuration.ts'

const SETTINGS_KEY = 'settings'
const LEGACY_CREDENTIAL_KEY = 'credential'

export type StorageArea = {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

export function createExtensionStore(): ConfigurationStore {
  return createChromeConfigurationStore(
    wrapArea(chrome.storage.local),
    wrapArea(chrome.storage.sync),
  )
}

export function createChromeConfigurationStore(
  storage: StorageArea,
  legacyStorage?: StorageArea,
): ConfigurationStore {
  return {
    async load() {
      const result = await storage.get([SETTINGS_KEY, LEGACY_CREDENTIAL_KEY])
      if (Object.hasOwn(result, SETTINGS_KEY)) {
        if (Object.hasOwn(result, LEGACY_CREDENTIAL_KEY)) {
          await storage.remove(LEGACY_CREDENTIAL_KEY)
        }
        return readConfiguration(asRecord(result[SETTINGS_KEY]))
      }

      const legacy = legacyStorage ? await legacyStorage.get(SETTINGS_KEY) : {}
      if (
        Object.hasOwn(legacy, SETTINGS_KEY) ||
        Object.hasOwn(result, LEGACY_CREDENTIAL_KEY)
      ) {
        const config = readConfiguration(
          asRecord(legacy[SETTINGS_KEY]),
          result[LEGACY_CREDENTIAL_KEY],
        )
        await storage.set({ [SETTINGS_KEY]: config })
        await storage.remove(LEGACY_CREDENTIAL_KEY)
        return config
      }
      return readConfiguration({})
    },
    async save(config) {
      await storage.set({
        [SETTINGS_KEY]: config,
      })
    },
  }
}

function readConfiguration(
  settings: Record<string, unknown>,
  credential: unknown = settings.credential,
): Configuration {
  return {
    owner: asString(settings.owner),
    repo: asString(settings.repo),
    defaultTags:
      typeof settings.defaultTags === 'string'
        ? settings.defaultTags
        : FACTORY_DEFAULT_TAGS,
    credential: asString(credential),
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
    remove(keys) {
      return area.remove(keys)
    },
  }
}
