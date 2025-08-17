"use server";

import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL!;
const MAILBOX = process.env.NEXT_PUBLIC_MAILBOX_ADDRESS!;
const START_BLOCK = Number(process.env.MAILBOX_START_BLOCK ?? 0);
const MAX_SPAN = Number(process.env.MAX_LOG_BLOCK_SPAN ?? 30);

const ABI = [
  "event MessageJSON(address indexed from, address indexed to, string schema, string json)",
  "event MessageKV(address indexed from, address indexed to, string schema, string[] fieldKeys, string[] fieldValues)",
];
const iface = new ethers.Interface(ABI);

const provider = new ethers.JsonRpcProvider(RPC_URL);

// format address for topic filtering
function addrTopic(addr: string) {
  return ethers.zeroPadValue(ethers.getAddress(addr), 32);
}

// verify if wallet has ever interacted with MAILBOX
export async function verify(
  wallet: string
): Promise<{ ok: true; isVerified: boolean; level?: string } | { ok: false; error: string }> {
  try {
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return { ok: false, error: "Invalid EVM address" };
    }

    const latest = await provider.getBlockNumber();
    let to = latest;
    const from = START_BLOCK || 0;

    const eventSigs = [
      ethers.id("MessageJSON(address,address,string,string)"),
      ethers.id("MessageKV(address,address,string,string[],string[])"),
    ];

    // scan in chunks, but only ask for logs involving this wallet
    while (to >= from) {
      const span = Math.min(MAX_SPAN, to - from + 1);
      const fromBlock = to - span + 1;

      // logs where wallet is "from"
      const filterFrom = {
        address: MAILBOX,
        fromBlock,
        toBlock: to,
        topics: [eventSigs, addrTopic(wallet)],
      };

      // logs where wallet is "to"
      const filterTo = {
        address: MAILBOX,
        fromBlock,
        toBlock: to,
        topics: [eventSigs, null, addrTopic(wallet)],
      };

      const logsFrom = await provider.getLogs(filterFrom);
      const logsTo = await provider.getLogs(filterTo);
      const logs = [...logsFrom, ...logsTo];

      if (logs.length > 0) {
        try {
          const parsed = iface.parseLog(logs[0]);
          return {
            ok: true,
            isVerified: true,
            level: parsed?.args?.schema || "1",
          };
        } catch {
          return { ok: true, isVerified: true, level: "1" };
        }
      }

      // move backwards
      to = fromBlock - 1;
    }

    return { ok: true, isVerified: false };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Unknown error" };
  }
}
