import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'icons')
const PAPER = [0xee, 0xf0, 0xf2]
const GOLD = [0xa8, 0x7b, 0x3f]

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const label = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([label, data])))
  return Buffer.concat([length, label, data, crc])
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size)
      const i = row + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function ring(x, y, size) {
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const radius = size * 0.31
  const stroke = Math.max(1.05, size * 0.09)
  const distance = Math.hypot(x - cx, y - cy)
  const edge = Math.abs(distance - radius)
  const t = Math.min(1, Math.max(0, (stroke / 2 + 0.65 - edge) / 1.1))
  return [
    Math.round(PAPER[0] + (GOLD[0] - PAPER[0]) * t),
    Math.round(PAPER[1] + (GOLD[1] - PAPER[1]) * t),
    Math.round(PAPER[2] + (GOLD[2] - PAPER[2]) * t),
    255,
  ]
}

mkdirSync(OUT, { recursive: true })
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(OUT, `ring-${size}.png`), png(size, ring))
}
