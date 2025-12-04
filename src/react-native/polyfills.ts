/**
 * React Native Polyfills for @sudobility/contracts
 *
 * IMPORTANT: Import this file BEFORE any other imports in your React Native app entry point.
 *
 * Required peer dependencies for React Native:
 * - react-native-get-random-values (for crypto.getRandomValues)
 * - buffer (for Buffer polyfill)
 * - react-native-url-polyfill (for URL APIs)
 * - text-encoding (for TextEncoder/TextDecoder if needed)
 *
 * Installation:
 * ```bash
 * npm install react-native-get-random-values buffer react-native-url-polyfill text-encoding
 * # or
 * yarn add react-native-get-random-values buffer react-native-url-polyfill text-encoding
 * ```
 *
 * Usage in your app entry point (e.g., index.js or App.tsx):
 * ```typescript
 * // Must be first import!
 * import '@sudobility/contracts/react-native/polyfills';
 *
 * // Then your other imports
 * import { OnchainMailerClient } from '@sudobility/contracts';
 * ```
 */

// Crypto polyfill - must be imported first
import 'react-native-get-random-values';

// URL polyfill for @solana/web3.js
import 'react-native-url-polyfill/auto';

// Buffer polyfill
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// TextEncoder/TextDecoder polyfill (some environments may need this)
if (typeof global.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('text-encoding');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Ensure process exists for some libraries
if (typeof global.process === 'undefined') {
  // @ts-expect-error - Creating minimal process object for compatibility
  global.process = { env: {} };
}

// Export a flag to verify polyfills were loaded
export const POLYFILLS_LOADED = true;

/**
 * Verify that all required polyfills are properly loaded.
 * Call this function to debug polyfill issues.
 */
export function verifyPolyfills(): { success: boolean; missing: string[] } {
  const missing: string[] = [];

  if (typeof global.Buffer === 'undefined') {
    missing.push('Buffer');
  }

  if (typeof global.crypto?.getRandomValues !== 'function') {
    missing.push('crypto.getRandomValues');
  }

  if (typeof global.TextEncoder === 'undefined') {
    missing.push('TextEncoder');
  }

  if (typeof global.TextDecoder === 'undefined') {
    missing.push('TextDecoder');
  }

  if (typeof global.URL === 'undefined') {
    missing.push('URL');
  }

  return {
    success: missing.length === 0,
    missing,
  };
}
