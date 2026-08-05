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
  if (BLOB_ENABLED) {
    try {
      const blob = await put(`imports/${taskId}/${fileName}`, fileBuffer, {
        access: 'private',
        addRandomSuffix: true,
      })
      console.log('Vercel Blob upload success:', blob.url)
      return { storageKey: `blob:${blob.url}`, blobUrl: blob.url }
    } catch (e) {
      console.warn('Vercel Blob upload failed, falling back:', e)
    }
  }

  if (process.env.VERCEL) {
    const base64 = fileBuffer.toString('base64')
    console.log('Using base64 storage (Blob not available)')
    return { storageKey: `base64:${base64}` }
  }

  ensureLocalDir()
  const safeFileName = `${taskId}-${Date.now()}-${fileName}`
  const filePath = path.join(LOCAL_STORAGE_DIR, safeFileName)
  writeFileSync(filePath, fileBuffer)
  console.log('Using local file storage:', filePath)
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

  if (storageKey.startsWith('blob:')) {
    const blobUrl = storageKey.slice(5)
    console.log('Retrieving from Vercel Blob:', blobUrl)
    const response = await fetch(blobUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to retrieve file from Vercel Blob: ${response.status} ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    console.log(`Retrieved ${arrayBuffer.byteLength} bytes from Blob`)
    return Buffer.from(arrayBuffer)
  }

  throw new Error(`Cannot retrieve file: unknown storage key format: ${storageKey}`)
}
