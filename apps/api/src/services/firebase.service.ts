import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { getMessaging } from 'firebase-admin/messaging'

export function initFirebase() {
  if (getApps().length > 0) return

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : undefined

  initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : undefined,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    // FIREBASE_PROJECT_ID precisa ser o projeto Firebase que emite os tokens (caroacidades),
    // não o projeto GCP onde a API roda (caroacidadesinteligentes).
    // verifyIdToken valida o claim 'aud' contra este projectId.
    projectId: process.env.FIREBASE_PROJECT_ID,
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

// Notificação push (FCM) ao app móvel do cidadão — req 144/146/147.
// Falhas (token inválido/expirado, app sem permissão) não devem interromper o fluxo principal.
export async function sendPushNotification(fcmToken: string, title: string, body: string, data?: Record<string, string>) {
  try {
    await getMessaging().send({ token: fcmToken, notification: { title, body }, data })
  } catch (err) {
    console.warn('Falha ao enviar push FCM:', err)
  }
}
