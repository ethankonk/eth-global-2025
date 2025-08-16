"use client";
import { AuthState, ClientState, useTurnkey } from "@turnkey/react-wallet-kit";
import { use, useEffect } from "react";

export default function Home() {
  const { handleLogin, clientState, authState } = useTurnkey();

   useEffect(() => {
    if (
      authState === AuthState.Unauthenticated &&
      clientState === ClientState.Ready
    ) {
      handleLogin();
    }
  }, [clientState]);

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <h1>Provider A</h1>
      </main>
    </div>
  );
}
