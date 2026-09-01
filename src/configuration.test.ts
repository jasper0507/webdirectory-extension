import { describe, expect, it } from 'vitest'
import {
  emptyConfiguration,
  FACTORY_DEFAULT_TAGS,
  isConfigurationComplete,
  parseDefaultTags,
} from './configuration.ts'

describe('配置', () => {
  it('出厂默认标签为「其他」', () => {
    expect(FACTORY_DEFAULT_TAGS).toBe('其他')
    expect(emptyConfiguration()).toEqual({
      owner: '',
      repo: '',
      credential: '',
      defaultTags: '其他',
    })
  })

  it('owner、仓库和凭证都有内容才算配好', () => {
    const complete = {
      owner: 'acme',
      repo: 'webdirectory',
      credential: 'pat_xxx',
      defaultTags: '其他',
    }
    expect(isConfigurationComplete(complete)).toBe(true)
    expect(isConfigurationComplete({ ...complete, owner: '' })).toBe(false)
    expect(isConfigurationComplete({ ...complete, repo: '  ' })).toBe(false)
    expect(isConfigurationComplete({ ...complete, credential: '' })).toBe(false)
  })

  it('默认标签可用中英文逗号分开，空白忽略', () => {
    expect(parseDefaultTags('其他')).toEqual(['其他'])
    expect(parseDefaultTags('阅读, 工具，笔记')).toEqual(['阅读', '工具', '笔记'])
    expect(parseDefaultTags('  ,， ')).toEqual([])
    expect(parseDefaultTags('')).toEqual([])
  })
})
