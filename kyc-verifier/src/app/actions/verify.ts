'use server';

import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL!;
const MAILBOX = process.env.NEXT_PUBLIC_MAILBOX_ADDRESS!;
const TRUSTED_WALLET = process.env.TRUSTED_WALLET!;
const provider = new ethers.JsonRpcProvider(RPC_URL);

export async function verify(
  wallet: string,
): Promise<{ ok: true; isVerified: boolean; level?: string } | { ok: false; error: string }> {
  try {
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return { ok: false, error: 'Invalid EVM address' };
    }

    const contract = new ethers.Contract(
      MAILBOX,
      ['event MessageJSON(address indexed from, address indexed to, string schema, string json)'],
      provider,
    );

    const latest = await provider.getBlockNumber();
    const fromBlock = latest - 4000;

    // Check in chunks of 30 blocks to stay within limits
    for (let toBlock = latest; toBlock >= fromBlock; toBlock -= 30) {
      const chunkFromBlock = Math.max(fromBlock, toBlock - 29);

      try {
        const allEvents = await contract.queryFilter(
          contract.filters.MessageJSON(),
          chunkFromBlock,
          toBlock,
        );

        if (allEvents.length > 0) {
          // Check if any events match our wallet

          const matchingEvents = allEvents
            .filter((event): event is ethers.EventLog => 'args' in event)
            .filter(
              (event) =>
                event.args.to.toLowerCase() === wallet.toLowerCase() &&
                event.args.from.toLowerCase() === TRUSTED_WALLET.toLowerCase(),
            );

          if (matchingEvents.length > 0) {
            const event = matchingEvents[0];

            return {
              ok: true,
              isVerified: true,
              level: event.args.schema || 'unknown',
            };
          }
        }
      } catch (chunkError: any) {
        console.warn(`Error in chunk ${chunkFromBlock}-${toBlock}:`, chunkError?.message);
      }
    }

    console.log('No matching events found in any chunk');
    return { ok: true, isVerified: false };
  } catch (e: any) {
    console.error('Error:', e?.message);
    return { ok: false, error: 'Check failed' };
  }
}
