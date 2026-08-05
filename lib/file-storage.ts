import { put } from '@vercel/blob'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'

const BLOB_ENABLED = process.env.BLOB_READ_WRITE_TOKEN && process.env.VERCEL
const LOCAL_STORAGE_DIR = path.join(os.tmpdir(), 'v2-imports')

function ensureLocalDir() {
  if (!existsSync(LOCAL_STORAGE_DIR)) {
    mkdirSync(LOCAL_STORAGE_DIR, { recursive: true })
  }
}

export async function storeFile(
  fileBuffer: Buffer,
  fileName: string,
  taskId: string
): Promise<{ storageKey: string; blobUrl?: string }> {
  // 优先使用 Vercel Blob
  if (BLOB_ENABLED) {
    try {
      const blob = await put(`imports/${taskId}/${fileName}`, fileBuffer, {
        access: 'private',
        addRandomSuffix: true,
      })
      return { storageKey: blob.pathname, blobUrl: blob.url }
    } catch (e) {
      console.warn('Vercel Blob upload failed, falling back:', e)
    }
  }

  // Vercel 生产环境：使用 base64 存储（函数间共享通过数据库）
  if (process.env.VERCEL) {
    const base64 = fileBuffer.toString('base64')
    return { storageKey: `base64:${base64}` }
  }

  // 本地开发：写磁盘
  ensureLocalDir()
  const safeFileName = `${taskId}-${Date.now()}-${fileName}`
  const filePath = path.join(LOCAL_STORAGE_DIR, safeFileName)
  writeFileSync(filePath, fileBuffer)
  return { storageKey: `local:${safeFileName}` }
}

export async function retrieveFile(storageKey: string): Promise<Buffer> {
  if (storageKey.startsWith('local:')) {
    const fileName = storageKey.slice(6)
    const filePath = path.join(LOCAL_STORAGE_DIR, fileName)
    if (!existsSync(filePath)) {
      throw new Error(`Local file not found: ${fileName}`)
    }
    return readFileSync(filePath)
  }

  if (storageKey.startsWith('base64:')) {
    const base64 = storageKey.slice(7)
    return Buffer.from(base64, 'base64')
  }

  if (BLOB_ENABLED) {
    const response = await fetch(`${process.env.BLOB_BASE_URL}/${storageKey}`)
    if (!response.ok) {
      throw new Error('Failed to retrieve file from blob storage')
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  throw new Error('Cannot retrieve file: storage not configured')
}
