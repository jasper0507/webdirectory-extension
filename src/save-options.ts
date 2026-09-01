import {
  isConfigurationComplete,
  type Configuration,
  type ConfigurationStore,
} from './configuration.ts'
import {
  probePortalSource,
  type ContentsGateway,
  type PortalSourceProbe,
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
  gateway: ContentsGateway,
  draft: Configuration,
): Promise<SaveOptionsResult> {
  const config = trimConfiguration(draft)
  if (!isConfigurationComplete(config)) {
    return { ok: false, error: '请填写所有者、仓库和凭证' }
  }
  const probe = await probePortalSource(gateway, config)
  if (!probe.ok) {
    return { ok: false, error: probeError(probe) }
  }
  try {
    await store.save(config)
  } catch {
    return { ok: false, error: '无法保存配置' }
  }
  return { ok: true }
}

function probeError(probe: Extract<PortalSourceProbe, { ok: false }>): string {
  switch (probe.reason) {
    case 'unauthorized':
      return '凭证无效或没有仓库权限'
    case 'not-found':
      return '找不到仓库或门户源'
    case 'network':
      return '无法连接 GitHub'
    default:
      return '连通失败'
  }
}
