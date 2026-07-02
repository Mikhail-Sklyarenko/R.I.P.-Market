import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { TronWeb } from 'tronweb';

const TRON_COIN_TYPE = 195;

function tronAddressFromPrivateKeyHex(privateKeyHex: string): string {
  const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
  const address = tronWeb.address.fromPrivateKey(privateKeyHex);
  if (!address) {
    throw new Error('Failed to derive tron address from private key');
  }
  return address;
}

function tronAddressFromPublicKey(publicKey: Uint8Array): string {
  const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
  const addressBytes = tronWeb.utils.crypto.computeAddress(publicKey);
  const addressHex = tronWeb.utils.code.byteArray2hexStr(addressBytes);
  return tronWeb.address.fromHex(addressHex);
}

export function deriveTronAddressFromSeed(
  seed: Uint8Array,
  walletIndex: number,
): string {
  if (walletIndex < 0 || !Number.isInteger(walletIndex)) {
    throw new Error('walletIndex must be a non-negative integer');
  }

  const root = HDKey.fromMasterSeed(seed);
  const path = `m/44'/${TRON_COIN_TYPE}'/0'/0/${walletIndex}`;
  const child = root.derive(path);
  if (!child.privateKey) {
    throw new Error('Failed to derive private key');
  }

  return tronAddressFromPrivateKeyHex(
    Buffer.from(child.privateKey).toString('hex'),
  );
}

export function deriveTronAddressFromMnemonic(
  mnemonic: string,
  walletIndex: number,
): string {
  const seed = mnemonicToSeedSync(mnemonic);
  return deriveTronAddressFromSeed(seed, walletIndex);
}

export function deriveTronAddressFromXpub(xpub: string, walletIndex: number): string {
  const account = HDKey.fromExtendedKey(xpub);
  const child = account.deriveChild(walletIndex);
  if (!child.publicKey) {
    throw new Error('Failed to derive public key from xpub');
  }
  return tronAddressFromPublicKey(child.publicKey);
}

export function deriveTronPrivateKeyFromMnemonic(
  mnemonic: string,
  walletIndex: number,
): string {
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const path = `m/44'/${TRON_COIN_TYPE}'/0'/0/${walletIndex}`;
  const child = root.derive(path);
  if (!child.privateKey) {
    throw new Error('Failed to derive private key');
  }
  return Buffer.from(child.privateKey).toString('hex');
}

export function isValidTronAddress(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}
