export const sampleIdentity = {
  wordmark: '试厅',
  monument: ['甲', '乙'],
  eyebrow: 'BIBLIOTHECA',
  stampEn: 'SEVEN SHELVES',
  convergence: '七卷同归',
  whisper: ['第一行', '第二行'],
  placeholder: '键入书签或站点...',
  colophonLeft: 'LEFT',
  colophonRight: 'RIGHT',
}

export function samplePortalSource(
  bookmarks: unknown[],
  identity: unknown = sampleIdentity,
): string {
  return JSON.stringify({ identity, bookmarks })
}
