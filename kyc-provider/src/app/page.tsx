'use client';
import { EthereumSVG } from '@/components/Svg';
import { toCanonicalJson, truncateAddress } from '@/utils';
import { faArrowUpRightFromSquare, faChain, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Field, Label, Radio, RadioGroup } from '@headlessui/react';
import { AuthState, ClientState, useTurnkey, WalletSource } from '@turnkey/react-wallet-kit';
import { useEffect, useMemo, useState } from 'react';
import { sign } from './actions/sign';
import { ENCRYPTION_WALLET_NAME, PARENT_USER_ID } from '@/utils/constants';
import { uint8ArrayFromHexString } from '@turnkey/encoding';
import { encryptSecp256k1, toB64, toUncompressedSecp256k1 } from '@/utils/hpke';
import { TurnkeyError, TurnkeyErrorCodes, v1SignRawPayloadResult } from '@turnkey/sdk-types';
import { Spinner } from '@/components/Spinner';
import { Slide, toast } from 'react-toastify';

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
    createWallet,
    fetchWallets,
    httpClient,
  } = useTurnkey();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const notifySuccess = (message: string) => {
    toast.success(message, {
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

  // these are wallets shown in the UI
  // we filter out the encryption wallet since we don't want the user to see it
  const uiWallets = useMemo(
    () => wallets.filter((w) => (w.walletName ?? '').toLowerCase() !== ENCRYPTION_WALLET_NAME),
    [wallets],
  );

  const allWallets = useMemo(
    () =>
      uiWallets.flatMap((w, i) =>
        w.accounts.map((a) => ({ wallet: w, walletIndex: i, account: a })),
      ),
    [uiWallets],
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

  const ensureEncryptionWalletAndGetKey = async () => {
    const oldEncryptionWallet = wallets.find((w) => w.walletName === ENCRYPTION_WALLET_NAME);

    if (oldEncryptionWallet) {
      // we delete the old wallet
      console.log('Deleting old encryption wallet:', oldEncryptionWallet.walletId);
      await httpClient?.deleteWallets({
        walletIds: [oldEncryptionWallet.walletId],
        deleteWithoutExport: true,
      });
    }

    // create a new wallet to encrypt to
    const encryptionWalletId = await createWallet({
      walletName: 'encryption-wallet',
      accounts: ['ADDRESS_FORMAT_ETHEREUM'],
    });
    if (!encryptionWalletId) {
      throw new Error('Failed to create encryption wallet');
    }

    console.log('encryption wallet created:', encryptionWalletId);

    //console.log('Created new encryption wallet:', encryptionWalletId);
    // await httpClient?.createPolicy({
    //   policyName: `Allow user ${PARENT_USER_ID} to export this key`,
    //   effect: 'EFFECT_ALLOW',
    //   consensus: `approvers.any(user, user.id == '${PARENT_USER_ID}')`,
    //   condition: "activity.type == 'ACTIVITY_TYPE_EXPORT_WALLET'",
    //   notes: 'Policy created to allow parent user to export encryption wallet for KYC',
    // });

    console.log('Created policy to allow export for user:', PARENT_USER_ID);

    const newWallets = await fetchWallets();
    console.log('fetch wallets result: ', newWallets);
    const encryptionWallet = newWallets.find(
      (w) => (w.walletName ?? '').toLowerCase().trim() === ENCRYPTION_WALLET_NAME.toLowerCase(),
    );

    if (!encryptionWallet?.accounts[0]) {
      throw Error('Encryption wallet has no accounts');
    }

    const publicKey = encryptionWallet!.accounts[0].publicKey;
    if (!publicKey) {
      throw Error("Encryption wallet's public key is undefined");
    }

    return { publicKey: toUncompressedSecp256k1(publicKey), walletId: encryptionWalletId };
  };

  const handleOnSubmit = async () => {
    if (!activeAccount) return;

    setIsLoading(true);

    const { publicKey: encryptionPublicKey, walletId: encryptionWalletId } =
      await ensureEncryptionWalletAndGetKey();

    // lightweight nonce
    const nonce = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);

    const payload = {
      type: 'kyc_submission',
      ts: new Date().toISOString(),
      nonce,
      address: activeAccount.address,
      encryptionWalletId,
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

    try {
      const signature = await signMessage({
        message,
        walletAccount: activeAccount,
        addEthereumPrefix: true,
      });

      // envelope = message + signature + signer info
      const envelope = toCanonicalJson({
        schema: 'kyc.v1',
        signer: {
          address: activeAccount.address,
          accountId: activeAccount.walletAccountId,
          addressFormat: activeAccount.addressFormat,
          algo: 'eip191_personal_sign',
        },
        message,
        signature,
      });

      // Encrypt envelope to the secp256k1 recipient key
      const sealed = await encryptSecp256k1({
        recipientPubHexUncompressed: encryptionPublicKey,
        plaintext: new TextEncoder().encode(envelope),
        aad: new TextEncoder().encode('kyc:v1'),
      });
      const sealedB64 = toB64(sealed);

      console.log('sealed b64: ', sealedB64);

      const response = await sign(activeAccount.address, message, signature);
      if (!response.success) {
        console.error('Failed to sign KYC submission');
        notifyError('Failed to sign KYC submission. Please try again.');
        setIsLoading(false);
        return;
      }

      notifySuccess('KYC submission signed successfully!');
    } catch (error) {
      // @ts-expect-error error is probably a TurnkeyError
      if (error.code === TurnkeyErrorCodes.UNKNOWN) {
        return;
      }
      console.error('Error signing KYC submission:', error);
      notifyError('Failed to sign KYC submission. Please try again.');
      return;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
      {clientState === ClientState.Loading || clientState === undefined ? (
        <Spinner className="h-20 w-20" />
      ) : authState === AuthState.Unauthenticated ? (
        <div>
          <Button
            className="absolute w-screen h-screen top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
            onClick={handleLogin}
          >
            Click anywhere to login
          </Button>
        </div>
      ) : (
        <div className="flex gap-10">
          <div className="flex flex-col gap-2 items-center w-full rounded-lg p-6 bg-panel-background-dark">
            <h1 className="w-full text-xl font-medium">Select a wallet to verify</h1>
            <RadioGroup
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              className="flex flex-col gap-2 w-full max-h-96 overflow-y-auto px-2"
            >
              {wallets.map((w) => (
                <div key={w.walletId} className="mb-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-center uppercase text-gray-500">
                      {w.walletName ?? 'Turnkey Wallet'}
                    </p>
                    {w.source === WalletSource.Connected && (
                      <span className="text-primary-text-light flex items-center justify-center dark:text-primary-text-dark border text-[10px] rounded-full h-4 text-center px-1 border-primary-light dark:border-primary-dark bg-primary-light/30 dark:bg-primary-dark/30">
                        connected
                      </span>
                    )}
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
                            const url = `https://etherscan.io/address/${account.address}`;
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
                        <span className="size-2.5 transition rounded-full group-data-checked:bg-primary-dark" />
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
              className="flex items-center justify-center w-full text-sm transition-all text-success-text-dark rounded-lg bg-primary-dark p-2 hover:bg-primary-dark/80"
            >
              <FontAwesomeIcon icon={faChain} className="w-4 h-4 mr-2" />
              Connect External Wallet
            </Button>
          </div>
          <div className="flex p-6 rounded-lg flex-col items-center gap-4 bg-panel-background-dark w-full">
            <h1 className="w-full text-xl font-medium">KYC Information</h1>
            {activeAccount?.address && (
              <div className="flex items-center gap-2 w-full">
                <p>Verifying Address:</p>
                <span className="rounded-full px-1 py-0.5 border text-center bg-primary-dark/20 border-primary-dark">
                  {truncateAddress(activeAccount?.address)}
                </span>
              </div>
            )}
            <FormInput
              label="Name *"
              value={formFields.name}
              onChange={(value) => setFormFields({ ...formFields, name: value })}
            />
            <div className="flex gap-4 w-full">
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
            </div>
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
              disabled={!isFormValid || isLoading}
              className="flex items-center active:scale-95 disabled:active:scale-100 justify-center w-full text-sm transition-all text-success-text-dark rounded-lg bg-success-dark p-2 hover:bg-success-dark/80 disabled:bg-icon-background-dark hover:cursor-pointer"
              onClick={handleOnSubmit}
            >
              {isLoading ? (
                <Spinner />
              ) : formFields.ssn.trim() !== '' ? (
                'Submit Level 2 KYC'
              ) : (
                'Submit KYC'
              )}
            </Button>

            <Button
              className="transition-all active:scale-95 hover:bg-danger-dark/20 p-2 rounded-lg w-full text-sm"
              onClick={async () => await logout()}
            >
              Log out
            </Button>
          </div>
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
