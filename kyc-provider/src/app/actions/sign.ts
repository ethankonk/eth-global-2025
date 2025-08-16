'use server';
import { ethers, JsonRpcProvider } from 'ethers';
import { Turnkey } from '@turnkey/sdk-server';
import { TurnkeySigner } from '@turnkey/ethers';

// Mailbox contract ABI - only the functions we need
const MAILBOX_ABI = [
  'function sendJson(address to, string calldata schema, string calldata json) external',
  'function sendKV(address to, string calldata schema, string[] calldata fieldKeys, string[] calldata fieldValues) external',
  'event MessageJSON(address indexed from, address indexed to, string schema, string json)',
  'event MessageKV(address indexed from, address indexed to, string schema, string[] fieldKeys, string[] fieldValues)',
];

export async function sign(
  to: string,
  kycData: {
    name: string;
    homeAddress: string;
    country: string;
    state: string;
    city: string;
    ssn?: string;
  },
) {
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
    const kycJson = JSON.stringify(kycData);
    const schema = kycData.ssn ? 'kyc-level-2' : 'kyc-level-1';

    const tx = await mailboxContract.sendJson(to, schema, kycJson);

    console.log('Transaction sent:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.transactionHash);

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

// Alternative function using the KV format
export async function signKV(
  to: string,
  kycData: {
    name: string;
    homeAddress: string;
    country: string;
    state: string;
    city: string;
    ssn?: string;
    signedInfo: string;
  },
) {
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

  const mailboxContract = new ethers.Contract(
    process.env.MAILBOX_CONTRACT_ADDRESS!,
    MAILBOX_ABI,
    connectedSigner,
  );

  try {
    // Prepare key-value arrays
    const fieldKeys = ['kycProviderName', 'signedInfo'];
    const fieldValues = ['KYC Provider', kycData.signedInfo];

    // Add SSN if provided (Level 2 KYC)
    if (kycData.ssn) {
      fieldKeys.push('ssn');
      fieldValues.push(kycData.ssn);
    }

    const schema = kycData.ssn ? 'kyc-level-2' : 'kyc-level-1';

    const tx = await mailboxContract.sendKV(to, schema, fieldKeys, fieldValues);

    console.log('Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.transactionHash);

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
