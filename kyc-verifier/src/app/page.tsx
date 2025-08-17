'use client';
import { useState } from 'react';
import { verify } from './actions/verify';

export default function Home() {
  const [address, setAddress] = useState<string>('');
  const [isVerified, setIsVerified] = useState<boolean | undefined>(undefined);
  const [level, setLevel] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const isValidAddress = (addr: string) => {
    // Basic validation for Ethereum address format
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  const handleVerify = async () => {
    if (!isValidAddress(address)) {
      setError('Invalid address format');
      return;
    }

    setIsLoading(true);
    setError(undefined);
    
    try {
      const result = await verify(address);
      
      if (result.ok) {
        setIsVerified(result.isVerified);
        setLevel(result.level);
      } else {
        setError(result.error);
        setIsVerified(undefined);
        setLevel(undefined);
      }
    } catch (err) {
      setError('Failed to verify address');
      setIsVerified(undefined);
      setLevel(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
      <div className="w-full flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            className="border border-icon-background-dark rounded-md px-4 py-2 w-96"
            placeholder="Enter wallet address (0x...)"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setIsVerified(undefined);
              setLevel(undefined);
              setError(undefined);
            }}
          />
          <button
            onClick={handleVerify}
            disabled={!address || isLoading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Verifying...' : 'Verify'}
          </button>
        </div>
        
        {error && (
          <p className="text-red-600 text-center">{error}</p>
        )}
        
        {isVerified === true && (
          <div className="text-green-600 text-center">
            <p>Address has undergone KYC!</p>
            {level && <p className="text-sm">Level: {level}</p>}
          </div>
        )}
        
        {isVerified === false && (
          <p className="text-red-600 text-center">Address has not undergone KYC.</p>
        )}
      </div>
    </main>
  );
}
