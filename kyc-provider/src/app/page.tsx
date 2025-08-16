'use client';
import { EthereumSVG } from '@/components/Svg';
import { toCanonicalJson, truncateAddress } from '@/utils';
import { faArrowUpRightFromSquare, faChain, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Field, Label, Radio, RadioGroup } from '@headlessui/react';
import {
  AuthState,
  ClientState,
  useTurnkey,
  Wallet,
  WalletAccount,
} from '@turnkey/react-wallet-kit';
import { useEffect, useMemo, useState } from 'react';
import { sign } from './actions/sign';
import { v1SignRawPayloadResult } from '@turnkey/sdk-types';

export default function Home() {
  const {
    handleLogin,
    clientState,
    authState,
    wallets,
    logout,
    createWalletAccounts,
    handleLinkExternalWallet,
    signMessage,
  } = useTurnkey();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [providerIcon, setProviderIcon] = useState<string | undefined>(undefined);

  const [isFormValid, setIsFormValid] = useState(false);

  const [formFields, setFormFields] = useState({
    name: '',
    ssn: '',
    homeAddress: '',
    country: '',
    state: '',
    city: '',
  });

  const allWallets = useMemo(
    () =>
      wallets.flatMap((w, i) => w.accounts.map((a) => ({ wallet: w, walletIndex: i, account: a }))),
    [wallets],
  );

  const selected = useMemo(
    () => allWallets.find((x) => x.account.walletAccountId === selectedAccountId),
    [allWallets, selectedAccountId],
  );

  const activeWallet = selected?.wallet;
  const activeAccount = selected?.account;

  useEffect(() => {
    const validateForm = (): boolean => {
      return (
        formFields.name.trim() !== '' &&
        formFields.homeAddress.trim() !== '' &&
        formFields.country.trim() !== '' &&
        formFields.state.trim() !== '' &&
        formFields.city.trim() !== ''
      );
    };
    setIsFormValid(validateForm());
  }, [formFields]);

  useEffect(() => {
    if (authState === AuthState.Unauthenticated && clientState === ClientState.Ready) {
      handleLogin();
    }
  }, [clientState]);

  // default to the very first account across all wallets
  useEffect(() => {
    if (!selectedAccountId && allWallets.length > 0) {
      setSelectedAccountId(allWallets[0].account.walletAccountId);
    }
  }, [allWallets, selectedAccountId]);

  const handleOnSubmit = async () => {
    if (!activeAccount) return;

    // lightweight nonce
    const nonce = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);

    const payload = {
      type: 'kyc_submission',
      ts: new Date().toISOString(),
      nonce,
      address: activeAccount.address,
      form: {
        name: formFields.name,
        ssn: formFields.ssn,
        homeAddress: formFields.homeAddress,
        country: formFields.country,
        state: formFields.state,
        city: formFields.city,
      },
    };

    const message = toCanonicalJson(payload);

    const signature = await signMessage({
      message,
      walletAccount: activeAccount,
      addEthereumPrefix: true,
    });

    const response = await sign(activeAccount.address, message, signature);

  };

  return (
    <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
      {authState === AuthState.Unauthenticated ? (
        <div>
          <button onClick={handleLogin}>Click anywhere to login</button>
        </div>
      ) : (
        <div className="flex p-6 rounded-lg flex-col items-center gap-4 bg-panel-background-dark">
          <div className="flex flex-col gap-2 items-center justify-between w-full ">
            <RadioGroup
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              className="flex flex-col gap-2 w-full max-h-52 overflow-y-auto"
            >
              {wallets.map((w, wi) => (
                <div key={w.walletId} className="mb-2 space-y-1.5">
                  <div className="text-xs uppercase text-gray-500 mb-1">
                    {w.walletName ?? 'Turnkey Wallet'}
                  </div>

                  {w.accounts.map((account) => (
                    <Field
                      key={account.walletAccountId}
                      className="flex items-center justify-between bg-background-light dark:bg-background-dark rounded-lg p-2"
                    >
                      <Label className="rounded-full w-full flex text-center items-center gap-3 cursor-pointer">
                        <EthereumSVG className="w-5 h-5" />
                        <Button
                          onClick={async () => {
                            await navigator.clipboard.writeText(account.address);
                          }}
                          className="hover:cursor-pointer group transition-all p-1 rounded-lg"
                        >
                          <div className="relative inline-flex items-center group">
                            <div className="absolute -top-4 -translate-y-full left-1/2 z-50 -translate-x-1/2 mt-2 flex flex-col items-center w-full opacity-0 delay-500 group-active:delay-25 group-active:duration-0 group-active:opacity-100 transition-opacity pointer-events-none group-active:pointer-events-auto">
                              <div className="relative">
                                <p className="rounded-lg text-center bg-icon-background-dark text-icon-text-dark px-1 py-1 text-xs shadow-lg break-words">
                                  Copied
                                </p>
                                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-icon-background-dark z-[51]" />
                              </div>
                            </div>
                            <p className="group-active:scale-95 transition-all">
                              {truncateAddress(account.address)}
                            </p>
                          </div>
                        </Button>

                        <Button
                          className="hover:cursor-pointer"
                          onClick={() => {
                            const url =
                              account.addressFormat === 'ADDRESS_FORMAT_ETHEREUM'
                                ? `https://etherscan.io/address/${account.address}`
                                : `https://solscan.io/account/${account.address}`;
                            window.open(url, '_blank');
                          }}
                        >
                          <FontAwesomeIcon
                            icon={faArrowUpRightFromSquare}
                            className="text-icon-text-light dark:text-icon-text-dark text-sm"
                          />
                        </Button>
                      </Label>

                      <Radio
                        value={account.walletAccountId}
                        className="outline-none group flex size-4 items-center justify-center rounded-full border bg-white"
                      >
                        <span className="size-2.5 transition rounded-full group-data-checked:bg-primary-light dark:group-data-checked:bg-primary-dark" />
                      </Radio>
                    </Field>
                  ))}
                </div>
              ))}
            </RadioGroup>

            <Button
              onClick={async () => {
                await createWalletAccounts({
                  walletId: activeWallet?.walletId || '',
                  accounts: ['ADDRESS_FORMAT_ETHEREUM'],
                });
              }}
              className="flex items-center justify-center w-full text-sm transition-all text-success-text-dark rounded-lg bg-success-dark p-2 hover:bg-success-dark/80"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4 mr-2" />
              Create Ethereum Account
            </Button>
            <Button
              onClick={async () => {
                await handleLinkExternalWallet();
              }}
              className="flex items-center justify-center w-full text-sm transition-all text-success-text-dark rounded-lg bg-primary-dark p-2 hover:bg-success-dark/80"
            >
              <FontAwesomeIcon icon={faChain} className="w-4 h-4 mr-2" />
              Connect External Wallet
            </Button>
          </div>
          <FormInput
            label="Name *"
            value={formFields.name}
            onChange={(value) => setFormFields({ ...formFields, name: value })}
          />
          <FormInput
            label="Home Address *"
            value={formFields.homeAddress}
            onChange={(value) => setFormFields({ ...formFields, homeAddress: value })}
          />
          <FormInput
            label="Country *"
            value={formFields.country}
            onChange={(value) => setFormFields({ ...formFields, country: value })}
          />
          <div className="flex gap-4 w-full">
            <FormInput
              label="State *"
              value={formFields.state}
              onChange={(value) => setFormFields({ ...formFields, state: value })}
            />
            <FormInput
              label="City *"
              value={formFields.city}
              onChange={(value) => setFormFields({ ...formFields, city: value })}
            />
          </div>
          <hr className="border-icon-background-dark w-full" />
          <h1 className="text-left w-full text-sm">Level 2 Verification (optional)</h1>
          <FormInput
            label="SSN"
            value={formFields.ssn}
            onChange={(value) => setFormFields({ ...formFields, ssn: value })}
          />
          <Button
            disabled={!isFormValid}
            className="flex items-center justify-center w-full text-sm transition-all text-success-text-dark rounded-lg bg-success-dark p-2 hover:bg-success-dark/80 disabled:bg-icon-background-dark hover:cursor-pointer"
            onClick={handleOnSubmit}
          >
            {formFields.ssn.trim() !== '' ? 'Submit Level 2 KYC' : 'Submit KYC'}
          </Button>

          <Button onClick={async () => await logout()}>Log out</Button>
        </div>
      )}
    </main>
  );
}

function FormInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="w-full">
      <label className="text-sm">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-icon-background-dark rounded px-2 py-1 w-full"
      />
    </div>
  );
}
function signJson(address: string, message: string, signature: v1SignRawPayloadResult) {
  throw new Error('Function not implemented.');
}

