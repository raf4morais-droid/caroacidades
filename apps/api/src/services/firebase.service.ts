import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'

export function initFirebase() {
  if (getApps().length > 0) return

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : undefined

  initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : undefined,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  })
}

export async function setUserPerfil(uid: string, perfil: string) {
  await getAuth().setCustomUserClaims(uid, { perfil })
}

export async function getSignedUrl(storagePath: string, expiresMs = 3_600_000): Promise<string> {
  const bucket = getStorage().bucket()
  const file = bucket.file(storagePath)
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresMs,
  })
  return url
}

export async function deleteFile(storagePath: string) {
  const bucket = getStorage().bucket()
  await bucket.file(storagePath).delete({ ignoreNotFound: true })
}
