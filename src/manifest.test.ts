import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Manifest V3', () => {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as {
    manifest_version: number
    name: string
    action?: { default_popup?: string }
    options_ui?: { page?: string }
    commands?: Record<string, unknown>
    permissions?: string[]
    host_permissions?: string[]
    background?: unknown
    omnibox?: unknown
    browser_action?: unknown
  }

  it('是窄权限的 Chrome MV3，可打开 Popup', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.name).toBe('门户收录')
    expect(manifest.action?.default_popup).toBe('popup/index.html')
    expect(manifest.options_ui?.page).toBe('options/index.html')
    expect(manifest.commands).toHaveProperty('_execute_action')
    expect([...(manifest.permissions ?? [])].sort()).toEqual([
      'activeTab',
      'scripting',
      'storage',
    ])
    expect(manifest.host_permissions).toEqual(['https://api.github.com/*'])
    expect(manifest.background).toBeUndefined()
    expect(manifest.omnibox).toBeUndefined()
    expect(manifest.browser_action).toBeUndefined()
  })
})
