import {
  isConfigurationComplete,
  type Configuration,
  type ConfigurationStore,
} from './configuration.ts'
import {
  describeContentsFailure,
  probePortalSource,
  type ContentsReader,
} from './github-contents.ts'

export type { ConfigurationStore }

export type SaveOptionsResult = { ok: true } | { ok: false; error: string }

function trimConfiguration(config: Configuration): Configuration {
  return {
    owner: config.owner.trim(),
    repo: config.repo.trim(),
    credential: config.credential.trim(),
    defaultTags: config.defaultTags.trim(),
  }
}

export async function saveOptions(
  store: ConfigurationStore,
  gateway: ContentsReader,
  draft: Configuration,
): Promise<SaveOptionsResult> {
  const config = trimConfiguration(draft)
  if (!isConfigurationComplete(config)) {
    return { ok: false, error: '请填写所有者、仓库和凭证' }
  }
  const probe = await probePortalSource(gateway, config)
  if (!probe.ok) {
    return { ok: false, error: describeContentsFailure(probe.reason, '连通失败') }
  }
  try {
    await store.save(config)
  } catch {
    return { ok: false, error: '无法保存配置' }
  }
  return { ok: true }
}
