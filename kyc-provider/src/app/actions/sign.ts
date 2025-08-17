'use server';

import { ethers, HDNodeWallet } from 'ethers';
import { Turnkey } from '@turnkey/sdk-server';
import { TurnkeySigner } from '@turnkey/ethers';
import { decryptExportBundle, generateP256KeyPair } from '@turnkey/crypto';
import { v1SignRawPayloadResult } from '@turnkey/sdk-types';
import {
  decryptSecp256k1B64,
  normalizeSignature,
  pickSchemaFromMessage,
  utf8Decode,
} from '@/utils/crypto';

type Envelope = {
  signer: {
    address: string;
    accountId?: string;
    addressFormat?: string;
    algo?: string;
  };
  message: string;
  signature: v1SignRawPayloadResult;
};

export async function sign({
  to,
  sealed,
  encryptionWalletId,
  organizationId,
}: {
  to: string;
  sealed: string;
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
    organizationId,
    walletId: encryptionWalletId,
    targetPublicKey,
  });
  const exportBundle = resp.activity.result.exportWalletResult?.exportBundle;
  if (!exportBundle || !embeddedKey) throw new Error('Export bundle or embedded key missing');

  const mnemonicRaw = await decryptExportBundle({
    exportBundle,
    embeddedKey,
    organizationId,
    returnMnemonic: true,
  });

  // normalize mnemonic to a single string
  const phrase = Array.isArray(mnemonicRaw) ? mnemonicRaw.join(' ') : String(mnemonicRaw).trim();

  const encWallet = HDNodeWallet.fromPhrase(phrase);
  const recipientPrivHex = encWallet.privateKey;

  // decrypt the sealed envelope using the derived private key
  const pt = await decryptSecp256k1B64({
    sealedB64OrUrl: sealed,
    recipientPrivHex,
  });

  // parse and verify the user signature
  const envelope = JSON.parse(utf8Decode(pt)) as Envelope;
  if (!envelope?.message || !envelope?.signature || !envelope?.signer?.address) {
    throw new Error('Decrypted envelope missing required fields');
  }
  const sigHex = normalizeSignature(envelope.signature);
  const recovered = ethers.verifyMessage(envelope.message, sigHex);
  if (recovered.toLowerCase() !== envelope.signer.address.toLowerCase()) {
    throw new Error('Invalid signature: recovered address does not match signer.address');
  }

  // we pick out the schema
  const schema = pickSchemaFromMessage(envelope.message);

  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_CHAIN_RPC);

  const tkSigner = new TurnkeySigner({
    client,
    organizationId,
    signWith: process.env.SIGN_WITH!,
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
