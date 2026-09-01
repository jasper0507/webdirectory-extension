export type Configuration = {
  owner: string
  repo: string
  credential: string
  defaultTags: string
}

export type ConfigurationStore = {
  load(): Promise<Configuration>
  save(config: Configuration): Promise<void>
}

export const FACTORY_DEFAULT_TAGS = '其他'

export function emptyConfiguration(): Configuration {
  return {
    owner: '',
    repo: '',
    credential: '',
    defaultTags: FACTORY_DEFAULT_TAGS,
  }
}

export function isConfigurationComplete(config: Configuration): boolean {
  return (
    config.owner.trim().length > 0 &&
    config.repo.trim().length > 0 &&
    config.credential.trim().length > 0
  )
}

export function parseDefaultTags(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}
