'use client';

import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import {
  CreateSubOrgParams,
  TurnkeyProvider,
  TurnkeyProviderConfig,
} from '@turnkey/react-wallet-kit';
import '@turnkey/react-wallet-kit/dist/styles.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { Slide, toast, ToastContainer } from 'react-toastify';
import { TurnkeyError, TurnkeyErrorCodes } from '@turnkey/sdk-types';
import { Button } from '@headlessui/react';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const createSuborgParams: CreateSubOrgParams = {
    customWallet: {
      walletName: 'Wallet 1',
      walletAccounts: [
        {
          addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
          curve: 'CURVE_SECP256K1',
          pathFormat: 'PATH_FORMAT_BIP32',
          path: "m/44'/60'/0'/0/0",
        },
      ],
    },
  };

  const config: TurnkeyProviderConfig = {
    organizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID!,
    authProxyConfigId: process.env.NEXT_PUBLIC_AUTH_PROXY_ID!,
    auth: {
      methods: {
        emailOtpAuthEnabled: true,
        smsOtpAuthEnabled: false,
        passkeyAuthEnabled: true,
        walletAuthEnabled: true,
        googleOauthEnabled: true,
        appleOauthEnabled: false,
        facebookOauthEnabled: false,
      },
      oauthConfig: {
        googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        facebookClientId: process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID,
        appleClientId: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
        oauthRedirectUri: process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI,
        openOauthInPage: true,
      },
      methodOrder: ['socials', 'email', 'sms', 'passkey', 'wallet'],
      autoRefreshSession: true,
      createSuborgParams: {
        emailOtpAuth: createSuborgParams,
        smsOtpAuth: createSuborgParams,
        passkeyAuth: createSuborgParams,
        walletAuth: createSuborgParams,
        oauth: createSuborgParams,
      },
    },
    ui: {
      darkMode: true,
    },
    walletConfig: {
      features: {
        connecting: true,
      },
      chains: {
        ethereum: {
          native: true,
          walletConnectNamespaces: ['eip155:1'],
        },
        solana: {
          native: false,
        },
      },
      walletConnect: {
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
        appMetadata: {
          name: 'Turnkey Wallet',
          description: 'A wallet for Turnkey',
          url: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_URL!,
          icons: ['/favicon.svg'],
        },
      },
    },
  };

  const notifyError = (message: string) => {
    toast.error(message, {
      position: 'bottom-right',
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: false,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'dark',
      transition: Slide,
    });
  };

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen p-6 flex flex-col items-center justify-center relative`}
      >
        <TurnkeyProvider
          callbacks={{
            onError: (error) => {
              console.error('Turnkey Error:', error.code);
              switch (error.code) {
                case TurnkeyErrorCodes.UNKNOWN:
                  notifyError('Failed to sign message. Signatures exhausted.');
                  break;
                default:
                  notifyError('Turnkey Error: ' + error.message);
                  break;
              }
            },
          }}
          config={config}
        >
          {children}
        </TurnkeyProvider>
        <ToastContainer
          position="bottom-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick={false}
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
          transition={Slide}
          className={'relative z-50'}
        />
        <footer className="flex gap-[24px] flex-wrap items-center justify-center absolute z-50 bottom-2 left-1/2 -translate-x-1/2">
          <p className="text-neutral-300 flex items-center gap-2">
            Made with Zyns, Celsius, and no time
            <FontAwesomeIcon icon={faHeart} className="text-red-500 text-base w-5 h-5" />
          </p>
        </footer>
      </body>
    </html>
  );
}
