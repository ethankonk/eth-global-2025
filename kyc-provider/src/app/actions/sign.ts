'use server';
import { ethers, hashMessage, JsonRpcProvider, recoverAddress, Signature } from 'ethers';
import { Turnkey } from '@turnkey/sdk-server';
import { TurnkeySigner } from '@turnkey/ethers';
import type { v1SignRawPayloadResult } from '@turnkey/sdk-types';
// Mailbox contract ABI - only the functions we need
const MAILBOX_ABI = [
  'function sendJson(address to, string calldata schema, string calldata json) external',
  'function sendKV(address to, string calldata schema, string[] calldata fieldKeys, string[] calldata fieldValues) external',
  'event MessageJSON(address indexed from, address indexed to, string schema, string json)',
  'event MessageKV(address indexed from, address indexed to, string schema, string[] fieldKeys, string[] fieldValues)',
];

export async function sign(to: string, payload: string, signedPayload: v1SignRawPayloadResult) {
  const { r, s, v } = signedPayload;
  const signature = `0x${r}${s}${v}`;
  const hashedMessage = hashMessage(payload);

  if (to.toLowerCase() !== recoverAddress(hashedMessage, signature).toLowerCase()) {
    throw new Error('Invalid signature: Address does not match the signer');
  }
  const provider = new JsonRpcProvider(process.env.NEXT_PUBLIC_CHAIN_RPC);
  const TurnkeyServerClient = new Turnkey({
    apiBaseUrl: 'https://api.turnkey.com',
    apiPublicKey: process.env.API_PUBLIC_KEY!,
    apiPrivateKey: process.env.API_PRIVATE_KEY!,
    defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID!,
  });

  const client = TurnkeyServerClient.apiClient();

  const turnkeySigner = new TurnkeySigner({
    client: client,
    organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
    signWith: process.env.SIGN_WITH!,
  });

  const connectedSigner = turnkeySigner.connect(provider);

  // Connect to the Mailbox contract
  const mailboxContract = new ethers.Contract(
    process.env.MAILBOX_CONTRACT_ADDRESS!, // Add this to your .env
    MAILBOX_ABI,
    connectedSigner,
  );

  try {
    // Option 1: Send as JSON
    const kycData = JSON.parse(payload);
    const schema = kycData.form.ssn ? 'kyc-level-2' : 'kyc-level-1';

    const tx = await mailboxContract.sendJson(to, schema, signature);



    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error('Error sending KYC message:', error);
    throw error;
  }
}

