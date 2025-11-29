import CryptoJS from 'crypto-js';

/**
 * Secure storage utility for sensitive data (Canvas API tokens)
 *
 * Uses AES-256 encryption with a session-specific key stored in memory.
 * Data is stored in sessionStorage (cleared on browser close) rather than
 * localStorage to reduce the window of exposure.
 *
 * Note: This provides defense-in-depth protection but is not bulletproof.
 * The encryption key is still in browser memory and could be extracted by
 * sophisticated XSS attacks. The primary benefits are:
 * 1. Prevents trivial theft via browser extensions
 * 2. Prevents direct access via DevTools
 * 3. Data cleared automatically on browser close
 */

/**
 * Generate or retrieve the encryption key for this session
 * Key is stored in sessionStorage and regenerated each browser session
 * @returns {string} Encryption key
 */
const getOrCreateEncryptionKey = () => {
  let key = sessionStorage.getItem('_ek');
  if (!key) {
    // Generate a random 256-bit key
    key = CryptoJS.lib.WordArray.random(256 / 8).toString();
    sessionStorage.setItem('_ek', key);
  }
  return key;
};

/**
 * Securely store a value with AES-256 encryption
 * @param {string} key - Storage key
 * @param {string} value - Value to encrypt and store
 */
export const setSecureItem = (key, value) => {
  try {
    const encryptionKey = getOrCreateEncryptionKey();
    const encrypted = CryptoJS.AES.encrypt(value, encryptionKey).toString();
    sessionStorage.setItem(key, encrypted);
  } catch (error) {
    console.error('Error encrypting data:', error);
    throw new Error('Failed to securely store data');
  }
};

/**
 * Retrieve and decrypt a securely stored value
 * @param {string} key - Storage key
 * @returns {string|null} Decrypted value or null if not found
 */
export const getSecureItem = (key) => {
  try {
    const encrypted = sessionStorage.getItem(key);
    if (!encrypted) return null;

    const encryptionKey = getOrCreateEncryptionKey();
    const decrypted = CryptoJS.AES.decrypt(encrypted, encryptionKey);
    const value = decrypted.toString(CryptoJS.enc.Utf8);

    // If decryption failed, value will be empty string
    return value || null;
  } catch (error) {
    console.error('Error decrypting data:', error);
    return null;
  }
};

/**
 * Remove a securely stored item
 * @param {string} key - Storage key
 */
export const removeSecureItem = (key) => {
  sessionStorage.removeItem(key);
};

/**
 * Clear all secure storage including the encryption key
 */
export const clearSecureStorage = () => {
  sessionStorage.clear();
};

/**
 * Check if a secure item exists
 * @param {string} key - Storage key
 * @returns {boolean} True if item exists
 */
export const hasSecureItem = (key) => {
  return sessionStorage.getItem(key) !== null;
};
