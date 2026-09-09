import CryptoJS from 'crypto-js';

/**
 * AES 복호화 (SFM_API와 동일한 방식) - CryptoJS.AES.encrypt(text, passphrase)가 만드는
 * OpenSSL 호환 salted 포맷을 그대로 복호화한다. package.json에 crypto-js가 명시된
 * 이유도 이 포맷을 맞추기 위해서다.
 */
export function decrypt(encrypted: string, aesKey: string): string {
  return CryptoJS.AES.decrypt(encrypted, aesKey).toString(CryptoJS.enc.Utf8);
}
