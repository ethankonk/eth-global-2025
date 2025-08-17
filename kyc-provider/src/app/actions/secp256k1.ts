import * as secp from '@noble/secp256k1';

const u8 = (a: ArrayBuffer) => new Uint8Array(a);
const toAB = (u: Uint8Array) =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

const fromB64 = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'));
const fromB64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return fromB64(b64);
};

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  // @ts-ignore - in Node 18+, global crypto.subtle is available
  const key = await crypto.subtle.importKey('raw', toAB(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toAB(salt), info: toAB(info) },
    key,
    length * 8,
  );
  return u8(bits);
}

const INFO = new TextEncoder().encode('ecies-secp256k1:aes-gcm:v1');

/**
 * Decrypt ECIES sealed data: [ ephPub(33) || iv(12) || ciphertext ]
 */
export async function decryptSecp256k1({
  sealed, // Uint8Array
  recipientPrivHex, // 0x... or hex (32B)
  aad, // optional Uint8Array (must match what client used)
}: {
  sealed: Uint8Array;
  recipientPrivHex: string;
  aad?: Uint8Array;
}): Promise<Uint8Array> {
  if (sealed.length < 33 + 12 + 16) throw new Error('sealed too short');
  const ephPubCompressed = sealed.slice(0, 33);
  const iv = sealed.slice(33, 45);
  const ct = sealed.slice(45);

  // ECDH: shared = (recipientPriv * ephPub)
  const recipPriv = BigInt('0x' + recipientPrivHex.replace(/^0x/, ''));
  const ephPoint = secp.Point.fromHex(ephPubCompressed);
  const sharedPoint = ephPoint.multiply(recipPriv);
  // use x-coordinate -> 32B, then SHA-256 normalize
  const sharedX = sharedPoint.toRawBytes(true).slice(-32);
  // @ts-ignore
  const ikmBuf = await crypto.subtle.digest('SHA-256', toAB(sharedX));
  const ikm = u8(ikmBuf);

  // HKDF -> 32B key + 12B IV
  const okm = await hkdf(ikm, ephPubCompressed, INFO, 44);
  const aesKey = okm.slice(0, 32);
  const derivedIv = okm.slice(32, 44); // should equal 'iv'; we bind iv via HKDF salt, but we still use passed IV.

  // AES-GCM decrypt
  // @ts-ignore
  const k = await crypto.subtle.importKey('raw', toAB(aesKey), 'AES-GCM', false, ['decrypt']);
  // @ts-ignore
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toAB(iv), additionalData: aad ? toAB(aad) : undefined },
    k,
    toAB(ct),
  );
  return u8(ptBuf);
}

// convenience for base64/base64url
export async function decryptSecp256k1B64({
  sealedB64OrUrl,
  recipientPrivHex,
  aadText,
}: {
  sealedB64OrUrl: string; // base64 or base64url
  recipientPrivHex: string; // hex
  aadText?: string; // must match client AAD (e.g., "kyc:v1")
}) {
  const sealed = /[_-]/.test(sealedB64OrUrl) ? fromB64Url(sealedB64OrUrl) : fromB64(sealedB64OrUrl);
  return decryptSecp256k1({
    sealed,
    recipientPrivHex,
    aad: aadText ? new TextEncoder().encode(aadText) : undefined,
  });
}
