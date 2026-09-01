export type CurrentPage = {
  url: string
  title: string
  description: string
  favIconUrl: string
}

export type BrowserTab = {
  id?: number
  url?: string
  title?: string
  favIconUrl?: string
}

export type PageBrowser = {
  tabs: {
    query(queryInfo: {
      active: boolean
      currentWindow: boolean
    }): Promise<BrowserTab[]>
  }
  scripting: {
    executeScript(injection: {
      target: { tabId: number }
      func: () => { title: string; description: string }
    }): Promise<Array<{ result?: { title: string; description: string } }>>
  }
}

const EMPTY_PAGE: CurrentPage = {
  url: '',
  title: '',
  description: '',
  favIconUrl: '',
}

export function extractPageMetadataFromPage(): {
  title: string
  description: string
} {
  const content = (selector: string) =>
    document.querySelector(selector)?.getAttribute('content')?.trim() ?? ''
  const title =
    document.title.trim() ||
    document.querySelector('title')?.textContent?.trim() ||
    content('meta[property="og:title"]') ||
    ''
  const description =
    content('meta[name="description"]') ||
    content('meta[property="og:description"]') ||
    ''
  return { title, description }
}

export async function readCurrentPage(
  browser: PageBrowser,
): Promise<CurrentPage> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  })
  const tab = tabs[0]
  if (tab == null || tab.id == null) {
    return EMPTY_PAGE
  }
  const url = tab.url ?? ''
  const favIconUrl = tab.favIconUrl ?? ''
  try {
    const injected = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageMetadataFromPage,
    })
    const result = injected[0]?.result
    return {
      url,
      title: result?.title?.trim() || tab.title?.trim() || '',
      description: result?.description?.trim() ?? '',
      favIconUrl,
    }
  } catch {
    return {
      url,
      title: tab.title?.trim() || '',
      description: '',
      favIconUrl,
    }
  }
}
