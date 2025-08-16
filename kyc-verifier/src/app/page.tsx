'use client';
import { useState } from 'react';

export default function Home() {
  const [address, setAddress] = useState<string>('');
  const [isVerified, setIsVerified] = useState<boolean | undefined>(undefined);

  const isValidAddress = (addr: string) => {
    // Basic validation for Ethereum address format
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  return (
    <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
      <div className="w-full flex flex-col gap-3">
        <input
          type="text"
          className="border border-icon-background-dark rounded-md px-4 py-2 w-96"
          placeholder="Enter your wallet address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        {isVerified === true ? (
          <p className="text-success-dark text-center">Address has undergone KYC!</p>
        ) : isVerified === false ? (
          <p className="text-danger-dark text-center">Address has not undergone KYC.</p>
        ) : null}
      </div>
    </main>
  );
}
