'use server';

import * as secp from '@noble/secp256k1';
import { ethers, HDNodeWallet } from 'ethers';
import { Turnkey } from '@turnkey/sdk-server';
import { TurnkeySigner } from '@turnkey/ethers';
import { webcrypto as crypto } from 'node:crypto';
import { decryptExportBundle, generateP256KeyPair } from '@turnkey/crypto';
import { v1SignRawPayloadResult } from '@turnkey/sdk-types';

// ========= Mailbox ABI =========
const MAILBOX_ABI = [
  'function sendJson(address to, string calldata schema, string calldata json) external',
  'function sendKV(address to, string calldata schema, string[] calldata fieldKeys, string[] calldata fieldValues) external',
  'event MessageJSON(address indexed from, address indexed to, string schema, string json)',
  'event MessageKV(address indexed from, address indexed to, string schema, string[] calldata fieldKeys, string[] calldata fieldValues)',
];

// ========= Types =========
type Envelope = {
  signer: {
    address: string;
    accountId?: string;
    addressFormat?: string;
    algo?: string; // "eip191_personal_sign"
  };
  message: string; // canonical JSON the user signed
  signature: v1SignRawPayloadResult; // hex or { r, s, v }
};

const toAB = (u: Uint8Array) =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const u8 = (ab: ArrayBuffer) => new Uint8Array(ab);
const fromB64 = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'));
const fromB64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return fromB64(b64);
};
const INFO = new TextEncoder().encode('ecies-secp256k1:aes-gcm:v1');

function normalizeSignature(signature: v1SignRawPayloadResult): string {
  const { r, s, v } = signature;
  return `0x${r}${s}${v}`;
}

function pickSchemaFromMessage(message: string, fallback?: string) {
  try {
    const obj = JSON.parse(message);
    return obj?.form?.ssn ? 'kyc-level-2' : 'kyc-level-1';
  } catch {
    return fallback ?? 'kyc-level-1';
  }
}

// ========= HKDF (SHA-256) =========
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', toAB(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toAB(salt), info: toAB(info) },
    key,
    length * 8,
  );
  return u8(bits);
}

// ========= ECIES decrypt (secp256k1) =========
// sealed layout: ephPub(33) || iv(12) || ciphertext
async function decryptSecp256k1({
  sealed,
  recipientPrivHex,
}: {
  sealed: Uint8Array;
  recipientPrivHex: string; // 0x.. or hex
}): Promise<Uint8Array> {
  if (sealed.length < 33 + 12 + 16) throw new Error('sealed too short');
  const ephPubCompressed = sealed.slice(0, 33);
  const iv = sealed.slice(33, 45);
  const ct = sealed.slice(45);

  const recipPriv = BigInt('0x' + recipientPrivHex.replace(/^0x/, ''));
  const ephPoint = secp.Point.fromHex(ephPubCompressed);
  const sharedPoint = ephPoint.multiply(recipPriv);

  // x-coordinate (32B), normalize with SHA-256
  const sharedX = sharedPoint.toRawBytes(true).slice(-32);
  const ikmBuf = await crypto.subtle.digest('SHA-256', toAB(sharedX));
  const ikm = u8(ikmBuf);

  // derive 32B key + 12B IV (bind to eph pub via salt)
  const okm = await hkdf(ikm, ephPubCompressed, INFO, 44);
  const aesKey = okm.slice(0, 32);
  const derivedIv = okm.slice(32, 44); // should match 'iv' from sender

  // decrypt
  const k = await crypto.subtle.importKey('raw', toAB(aesKey), 'AES-GCM', false, ['decrypt']);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toAB(iv) }, k, toAB(ct));
  return u8(ptBuf);
}

async function decryptSecp256k1B64({
  sealedB64OrUrl,
  recipientPrivHex,
  aadText,
}: {
  sealedB64OrUrl: string;
  recipientPrivHex: string;
  aadText?: string;
}) {
  const sealed = /[_-]/.test(sealedB64OrUrl) ? fromB64Url(sealedB64OrUrl) : fromB64(sealedB64OrUrl);
  return decryptSecp256k1({
    sealed,
    recipientPrivHex,
  });
}

export async function sign({
  to,
  sealed,
  encryptionWalletId,
  organizationId,
}: {
  to: string;
  sealed: string; // base64 or base64url
  encryptionWalletId: string;
  organizationId: string;
}) {
  const tk = new Turnkey({
    apiBaseUrl: 'https://api.turnkey.com',
    apiPublicKey: process.env.API_PUBLIC_KEY!,
    apiPrivateKey: process.env.API_PRIVATE_KEY!,
    defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID!,
  });
  const client = tk.apiClient();

  const { publicKeyUncompressed: targetPublicKey, privateKey: embeddedKey } = generateP256KeyPair();

  const resp = await client.exportWallet({
    organizationId: organizationId,
    walletId: encryptionWalletId,
    targetPublicKey,
  });
  const exportBundle = resp.activity.result.exportWalletResult?.exportBundle;
  if (!exportBundle || !embeddedKey) throw new Error('Export bundle or embedded key missing');

  const mnemonicRaw = await decryptExportBundle({
    exportBundle,
    embeddedKey,
    organizationId: organizationId,
    returnMnemonic: true,
  });

  // `decryptExportBundle` returns the phrase (string or string[]). Normalize to a single space-joined string.
  const phrase = Array.isArray(mnemonicRaw) ? mnemonicRaw.join(' ') : String(mnemonicRaw).trim();

  const encWallet = HDNodeWallet.fromPhrase(phrase);
  const recipientPrivHex = encWallet.privateKey;

  // 3) Decrypt the sealed envelope using the derived private key
  const pt = await decryptSecp256k1B64({
    sealedB64OrUrl: sealed,
    recipientPrivHex,
  });

  // 4) Parse + verify the user signature (EIP-191 over envelope.message)
  const envelope = JSON.parse(new TextDecoder().decode(pt)) as Envelope;
  if (!envelope?.message || !envelope?.signature || !envelope?.signer?.address) {
    throw new Error('Decrypted envelope missing required fields');
  }
  const sigHex = normalizeSignature(envelope.signature);
  const recovered = ethers.verifyMessage(envelope.message, sigHex);
  if (recovered.toLowerCase() !== envelope.signer.address.toLowerCase()) {
    throw new Error('Invalid signature: recovered address does not match signer.address');
  }

  // 5) Choose schema, send the JSON message on-chain
  const schema = pickSchemaFromMessage(envelope.message);

  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_CHAIN_RPC);

  const tkSigner = new TurnkeySigner({
    client,
    organizationId: organizationId,
    signWith: process.env.SIGN_WITH!, // Turnkey keyId used to sign the tx
  }).connect(provider);

  const mailbox = new ethers.Contract(
    process.env.MAILBOX_CONTRACT_ADDRESS!,
    ['function sendJson(address to, string calldata schema, string calldata json) external'],
    tkSigner,
  );

  const tx = await mailbox.sendJson(to, schema, sigHex);
  const receipt = await tx.wait();

  return {
    success: true,
    schema,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
  };
}
