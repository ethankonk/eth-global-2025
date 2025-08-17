// crypto/ecies-secp256k1.ts
import * as secp from '@noble/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

const hexToBytes = (h: string) =>
  Uint8Array.from(
    (h.startsWith('0x') ? h.slice(2) : h).match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
  );
const toHex = (u8: Uint8Array) =>
  Array.from(u8)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
const fromUtf8 = (s: string) => new TextEncoder().encode(s);

// BufferSource helpers for WebCrypto
function u8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
const optAB = (u?: Uint8Array) => (u ? u8ToArrayBuffer(u) : undefined);

// HKDF-SHA256 -> ArrayBuffer-friendly
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', u8ToArrayBuffer(ikm), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: u8ToArrayBuffer(salt), info: u8ToArrayBuffer(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// Normalize to UNCOMPRESSED secp256k1 pubkey hex (0x04 + 64 bytes)
export function normalizeSecp256k1Uncompressed(pubHex: string): string {
  const raw = hexToBytes(pubHex);
  if (raw.length === 65 && raw[0] === 0x04) return '0x' + toHex(raw);
  if (raw.length === 33 && (raw[0] === 0x02 || raw[0] === 0x03)) {
    const point = secp.Point.fromHex(raw);
    const uncompressed = point.toRawBytes(false); // 65B, 0x04…
    return '0x' + toHex(uncompressed);
  }
  throw new Error('Unsupported secp256k1 public key format (need uncompressed or compressed).');
}

// ECIES (secp256k1 ECDH + HKDF-SHA256 + AES-GCM)
export async function encryptSecp256k1({
  recipientPubHexUncompressed, // 0x04 + 64 bytes
  plaintext, // Uint8Array
  aad, // optional Uint8Array
}: {
  recipientPubHexUncompressed: string;
  plaintext: Uint8Array;
  aad?: Uint8Array;
}): Promise<Uint8Array> {
  const recipPub = hexToBytes(recipientPubHexUncompressed);
  if (recipPub.length !== 65 || recipPub[0] !== 0x04) {
    throw new Error(
      'Recipient public key must be UNCOMPRESSED secp256k1 (65 bytes, starts with 0x04).',
    );
  }

  // 1) Ephemeral keypair
  const ephPriv = secp.utils.randomPrivateKey();
  const ephPubCompressed = secp.getPublicKey(ephPriv, true); // 33B

  // 2) ECDH -> normalize to 32B key material
  const shared = secp.getSharedSecret(ephPriv, recipPub, true); // noble may include prefix; use last 32B
  const ikmBuf = await crypto.subtle.digest('SHA-256', u8ToArrayBuffer(shared.slice(-32)));
  const ikm = new Uint8Array(ikmBuf);

  // 3) HKDF -> 32B AES key + 12B IV (salt binds to eph pub)
  const info = fromUtf8('ecies-secp256k1:aes-gcm:v1');
  const okm = await hkdf(ikm, ephPubCompressed, info, 44);
  const aesKey = okm.slice(0, 32);
  const iv = okm.slice(32, 44);

  // 4) AES-GCM encrypt
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    u8ToArrayBuffer(aesKey),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: u8ToArrayBuffer(iv), additionalData: optAB(aad) },
    cryptoKey,
    u8ToArrayBuffer(plaintext),
  );
  const ciphertext = new Uint8Array(ctBuf);

  // 5) Output: ephPubCompressed || iv || ciphertext
  const out = new Uint8Array(ephPubCompressed.length + iv.length + ciphertext.length);
  out.set(ephPubCompressed, 0);
  out.set(iv, ephPubCompressed.length);
  out.set(ciphertext, ephPubCompressed.length + iv.length);
  return out;
}

// small util
export const toB64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));

export function toUncompressedSecp256k1(pubHex: string): string {
  const raw = hexToBytes(pubHex);
  // already uncompressed (0x04 … 64-byte coords)
  if (raw.length === 65 && raw[0] === 0x04) return '0x' + bytesToHex(raw);
  // compressed (0x02/0x03 … 32-byte X)
  if (raw.length === 33 && (raw[0] === 0x02 || raw[0] === 0x03)) {
    const point = secp.Point.fromHex(raw); // parse compressed
    const uncompressed = point.toRawBytes(false); // 65 bytes, starts 0x04
    return '0x' + bytesToHex(uncompressed);
  }
  throw new Error('Invalid secp256k1 public key format');
}
