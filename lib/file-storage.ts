import { put } from '@vercel/blob'

const STORAGE_ENABLED = process.env.BLOB_READ_WRITE_TOKEN && process.env.VERCEL

export async function storeFile(
  fileBuffer: Buffer,
  fileName: string,
  taskId: string
): Promise<{ storageKey: string; blobUrl?: string }> {
  if (STORAGE_ENABLED) {
    const blob = await put(`imports/${taskId}/${fileName}`, fileBuffer, {
      access: 'private',
      addRandomSuffix: true,
    })
    return { storageKey: blob.pathname, blobUrl: blob.url }
  }

  const base64 = fileBuffer.toString('base64')
  return { storageKey: `base64:${Buffer.from(base64).toString('base64')}` }
}

export async function retrieveFile(storageKey: string): Promise<Buffer> {
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
