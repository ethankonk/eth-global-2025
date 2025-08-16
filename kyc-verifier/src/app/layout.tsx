import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';

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
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen p-6 flex flex-col items-center justify-center relative`}
      >
        <h1 className="text-4xl font-bold absolute top-6 left-1/2 -translate-x-1/2 z-50">
          KYC Verifier
        </h1>
        {children}
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
