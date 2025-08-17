import * as secp from '@noble/secp256k1';
import { v1SignRawPayloadResult } from '@turnkey/sdk-types';

const _TE = new TextEncoder();
const _TD = new TextDecoder();

export const utf8Encode = (s: string) => _TE.encode(s);
export const utf8Decode = (u: Uint8Array) => _TD.decode(u);

const ECIES_INFO_LABEL = 'ecies-secp256k1:aes-gcm:v1';
const ECIES_INFO_BYTES = utf8Encode(ECIES_INFO_LABEL);

const toArrayBuffer = (view: Uint8Array): ArrayBuffer => {
  if (
    view.byteOffset === 0 &&
    view.buffer instanceof ArrayBuffer &&
    view.buffer.byteLength === view.byteLength
  ) {
    return view.buffer;
  }
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
};

const u8 = (ab: ArrayBuffer): Uint8Array => new Uint8Array(ab);

const strip0x = (hex: string) => hex.replace(/^0x/, '');

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(
    strip0x(hex)
      .match(/.{1,2}/g)!
      .map((b) => parseInt(b, 16)),
  );

const bytesFromBase64 = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, 'base64'));

const base64UrlToBase64 = (s: string): string => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
};

const bytesFromBase64Url = (b64url: string): Uint8Array =>
  bytesFromBase64(base64UrlToBase64(b64url));

export const base64UrlFromBytes = (u: Uint8Array): string =>
  base64FromBytes(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey('raw', toArrayBuffer(ikm), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(info) },
    key,
    length * 8,
  );
  return u8(bits);
}

export const base64FromBytes = (u: Uint8Array): string => Buffer.from(u).toString('base64');

export function normalizeSecp256k1Uncompressed(pubHex: string): string {
  const raw = hexToBytes(pubHex);
  if (raw.length === 65 && raw[0] === 0x04) return '0x' + Buffer.from(raw).toString('hex');
  if (raw.length === 33 && (raw[0] === 0x02 || raw[0] === 0x03)) {
    const point = secp.Point.fromHex(raw);
    const uncompressed = point.toRawBytes(false); // 65B, 0x04…
    return '0x' + Buffer.from(uncompressed).toString('hex');
  }
  throw new Error('Unsupported secp256k1 public key format');
}

export async function encryptSecp256k1(params: {
  recipientPubHexUncompressed: string;
  plaintext: Uint8Array;
}): Promise<Uint8Array> {
  const { recipientPubHexUncompressed, plaintext } = params;

  const recipPub = hexToBytes(recipientPubHexUncompressed);
  if (recipPub.length !== 65 || recipPub[0] !== 0x04) {
    throw new Error(
      'Recipient public key must be UNCOMPRESSED secp256k1 (65 bytes, starts with 0x04).',
    );
  }

  // ephemeral keypair
  const ephPriv = secp.utils.randomPrivateKey();
  const ephPubCompressed = secp.getPublicKey(ephPriv, true); // 33B

  // we normalize to 32B key material
  const shared = secp.getSharedSecret(ephPriv, recipPub, true); // includes prefix; take last 32
  const ikmBuf = await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(shared.slice(-32)));
  const ikm = new Uint8Array(ikmBuf);

  const okm = await hkdfSha256(ikm, ephPubCompressed, ECIES_INFO_BYTES, 44);
  const aesKey = okm.slice(0, 32);
  const iv = okm.slice(32, 44); // 12B

  // AES-GCM encrypt
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(aesKey),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const ctBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(plaintext),
  );
  const ciphertext = new Uint8Array(ctBuf);

  const out = new Uint8Array(ephPubCompressed.length + iv.length + ciphertext.length);
  out.set(ephPubCompressed, 0);
  out.set(iv, ephPubCompressed.length);
  out.set(ciphertext, ephPubCompressed.length + iv.length);
  return out;
}

export function pickSchemaFromMessage(message: string, fallback?: string) {
  try {
    const obj = JSON.parse(message);
    return obj?.form?.ssn ? 'kyc-level-2' : 'kyc-level-1';
  } catch {
    return fallback ?? 'kyc-level-1';
  }
}

async function decryptSecp256k1({
  sealed,
  recipientPrivHex,
}: {
  sealed: Uint8Array;
  recipientPrivHex: string;
}): Promise<Uint8Array> {
  if (sealed.length < 33 + 12 + 16) throw new Error('sealed too short');

  const ephPubCompressed = sealed.slice(0, 33);
  const iv = sealed.slice(33, 45);
  const ct = sealed.slice(45);

  const recipPriv = BigInt('0x' + strip0x(recipientPrivHex));
  const ephPoint = secp.Point.fromHex(ephPubCompressed);
  const sharedPoint = ephPoint.multiply(recipPriv);

  // x-coordinate
  const sharedX = sharedPoint.toRawBytes(true).slice(-32);
  const ikm = u8(await crypto.subtle.digest('SHA-256', toArrayBuffer(sharedX)));

  // derive 32B key + 12B IV
  const okm = await hkdfSha256(ikm, ephPubCompressed, ECIES_INFO_BYTES, 44);
  const aesKey = okm.slice(0, 32);
  const derivedIv = okm.slice(32, 44);

  // decrypt
  const k = await crypto.subtle.importKey('raw', toArrayBuffer(aesKey), 'AES-GCM', false, [
    'decrypt',
  ]);
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    k,
    toArrayBuffer(ct),
  );
  return u8(ptBuf);
}

export async function decryptSecp256k1B64({
  sealedB64OrUrl,
  recipientPrivHex,
}: {
  sealedB64OrUrl: string;
  recipientPrivHex: string;
}) {
  const sealed = /[_-]/.test(sealedB64OrUrl)
    ? bytesFromBase64Url(sealedB64OrUrl)
    : bytesFromBase64(sealedB64OrUrl);

  return decryptSecp256k1({ sealed, recipientPrivHex });
}

export function normalizeSignature(signature: v1SignRawPayloadResult): string {
  const { r, s, v } = signature;
  return `0x${r}${s}${v}`;
}
