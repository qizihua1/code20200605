import { put } from '@vercel/blob'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'

const STORAGE_ENABLED = process.env.BLOB_READ_WRITE_TOKEN && process.env.VERCEL
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
  if (STORAGE_ENABLED) {
    try {
      const blob = await put(`imports/${taskId}/${fileName}`, fileBuffer, {
        access: 'private',
        addRandomSuffix: true,
      })
      return { storageKey: blob.pathname, blobUrl: blob.url }
    } catch (e) {
      console.warn('Vercel Blob upload failed, falling back to local:', e)
    }
  }

  // Local fallback: write to disk
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

  if (STORAGE_ENABLED) {
    const response = await fetch(`${process.env.BLOB_BASE_URL}/${storageKey}`)
    if (!response.ok) {
      throw new Error('Failed to retrieve file from blob storage')
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  throw new Error('Cannot retrieve file: storage not configured')
}
