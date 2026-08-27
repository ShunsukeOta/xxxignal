import type { Env } from '../env'
import { AppError } from './http'

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function encryptionKey(env: Env) {
  const raw = env.X_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) throw new AppError(503, 'x_encryption_not_configured', 'X Token暗号化キーが設定されていません。')
  let bytes: Uint8Array
  try { bytes = fromBase64(raw) } catch { throw new AppError(503, 'x_encryption_key_invalid', 'X Token暗号化キーが不正です。') }
  if (bytes.byteLength !== 32) throw new AppError(503, 'x_encryption_key_invalid', 'X Token暗号化キーは32byteのBase64で設定してください。')
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(env: Env, value: string) {
  const key = await encryptionKey(env)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value))
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`
}

export async function decryptSecret(env: Env, value: string) {
  const [version, ivEncoded, bodyEncoded] = value.split('.')
  if (version !== 'v1' || !ivEncoded || !bodyEncoded) throw new AppError(500, 'encrypted_secret_invalid', '暗号化データを復号できません。')
  const key = await encryptionKey(env)
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivEncoded) }, key, fromBase64(bodyEncoded))
    return new TextDecoder().decode(decrypted)
  } catch {
    throw new AppError(500, 'encrypted_secret_invalid', '暗号化データを復号できません。')
  }
}

export function randomUrlSafe(bytes = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}
