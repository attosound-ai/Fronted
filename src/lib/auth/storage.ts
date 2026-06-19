import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
import type { TokenPair, User } from '@/types';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';
/**
 * Raw plaintext password stashed during the in-progress signup wizard so
 * it survives app kill / cold start in the window between the password
 * step and successful complete. Cleared on `signupComplete` success.
 *
 * Security: stored in iOS Keychain / Android Keystore (encrypted at rest
 * with hardware-backed keys), the same protection bracket as the JWT
 * tokens. The alternative — re-prompting for password on every cold
 * resume of the wizard — was rejected as a poor UX cliff after a Network
 * Error during OTP verify, which is the exact failure mode this guards
 * against.
 */
const SIGNUP_PASSWORD_KEY = 'signup_pending_password';

// Per-account keys (suffixed by userId)
const ACTIVE_ACCOUNT_KEY = 'active_account_id';
const LINKED_ACCOUNT_IDS_KEY = 'linked_account_ids';
const tokenKeyFor = (id: number) => `auth_token_${id}`;
const refreshKeyFor = (id: number) => `refresh_token_${id}`;
const userKeyFor = (id: number) => `user_data_${id}`;

// Sentinel written once the one-time accessibility migration has completed
// (see migrateKeychainAccessibility). Stored under the same policy so it is
// itself readable while locked.
const KEYCHAIN_MIGRATION_KEY = 'keychain_policy_v1';

/**
 * Keychain accessibility policy for ALL auth material.
 *
 * `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`:
 *  - **Background-readable**: once the user has unlocked the device a
 *    single time since boot, the item can be read even while the screen is
 *    locked. This is REQUIRED for VoIP: an incoming call wakes the app in
 *    the background with the screen locked, and the Twilio Voice SDK must
 *    read the auth token to fetch a voice token and connect. The iOS
 *    default (`WHEN_UNLOCKED`) throws `errSecInteractionNotAllowed`
 *    ("User interaction is not allowed") in that state — the root cause of
 *    silently-dropped incoming calls and the FrontBoard `0xBAADCA11`
 *    watchdog kills (app launched by VoIP push but unable to set up the
 *    call before iOS's deadline).
 *  - **`THIS_DEVICE_ONLY`**: credentials never migrate to a new device via
 *    an iCloud / encrypted backup restore — correct hygiene for bearer
 *    tokens (a restored device must re-authenticate).
 *
 * Centralised here as the single source of truth: every write goes through
 * `secureSet`, so a newly-added key can never silently regress to the
 * lock-only default.
 */
const KEYCHAIN_POLICY: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Log SecureStore read failures to Sentry instead of swallowing silently. */
function reportKeychainError(key: string, error: unknown): void {
  Sentry.captureException(error, {
    tags: { subsystem: 'secure_store', key },
    level: 'warning',
  });
}

// ── Low-level secure storage primitives (single choke point) ──
//
// Every credential read/write/delete funnels through these three helpers so
// the keychain policy and the error reporting are applied uniformly and can
// never be forgotten at a call site (DRY + SRP).

/** Write a value under the project-wide keychain accessibility policy. */
async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, KEYCHAIN_POLICY);
}

/** Read a value, reporting (but not throwing on) keychain failures. */
async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    reportKeychainError(key, error);
    return null;
  }
}

/** Delete a value. Best-effort; never throws. */
async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    reportKeychainError(key, error);
  }
}

/**
 * AuthStorage - Almacenamiento seguro de datos de autenticación
 *
 * Principio SOLID:
 * - Single Responsibility: Solo maneja almacenamiento de auth
 * - Interface Segregation: Métodos específicos para cada tipo de dato
 */
export const authStorage = {
  // Token de acceso
  async getToken(): Promise<string | null> {
    return secureGet(TOKEN_KEY);
  },

  async setToken(token: string): Promise<void> {
    await secureSet(TOKEN_KEY, token);
  },

  async removeToken(): Promise<void> {
    await secureDelete(TOKEN_KEY);
  },

  // Refresh token
  async getRefreshToken(): Promise<string | null> {
    return secureGet(REFRESH_TOKEN_KEY);
  },

  async setRefreshToken(token: string): Promise<void> {
    await secureSet(REFRESH_TOKEN_KEY, token);
  },

  async removeRefreshToken(): Promise<void> {
    await secureDelete(REFRESH_TOKEN_KEY);
  },

  // User data (JSON serializado)
  async getUser<T>(): Promise<T | null> {
    const data = await secureGet(USER_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch (error) {
      reportKeychainError(USER_KEY, error);
      return null;
    }
  },

  async setUser<T>(user: T): Promise<void> {
    await secureSet(USER_KEY, JSON.stringify(user));
  },

  async removeUser(): Promise<void> {
    await secureDelete(USER_KEY);
  },

  // ── In-progress signup password (encrypted, cleared on complete) ──

  async getSignupPassword(): Promise<string | null> {
    return secureGet(SIGNUP_PASSWORD_KEY);
  },

  async setSignupPassword(password: string): Promise<void> {
    await secureSet(SIGNUP_PASSWORD_KEY, password);
  },

  async removeSignupPassword(): Promise<void> {
    await secureDelete(SIGNUP_PASSWORD_KEY);
  },

  // Limpiar todo
  async clearAll(): Promise<void> {
    await Promise.all([this.removeToken(), this.removeRefreshToken(), this.removeUser()]);
  },
};

// ── Per-account storage helpers ──

export async function getAccountIds(): Promise<number[]> {
  const raw = await secureGet(LINKED_ACCOUNT_IDS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

export async function setAccountIds(ids: number[]): Promise<void> {
  await secureSet(LINKED_ACCOUNT_IDS_KEY, JSON.stringify(ids));
}

export async function getActiveAccountId(): Promise<number | null> {
  const raw = await secureGet(ACTIVE_ACCOUNT_KEY);
  return raw ? Number(raw) : null;
}

export async function setActiveAccountId(id: number): Promise<void> {
  await secureSet(ACTIVE_ACCOUNT_KEY, String(id));
}

export async function getAccountTokens(id: number): Promise<TokenPair | null> {
  const raw = await secureGet(tokenKeyFor(id));
  const refresh = await secureGet(refreshKeyFor(id));
  if (!raw || !refresh) return null;
  return { accessToken: raw, refreshToken: refresh, expiresIn: 0 };
}

export async function setAccountTokens(id: number, tokens: TokenPair): Promise<void> {
  await secureSet(tokenKeyFor(id), tokens.accessToken);
  await secureSet(refreshKeyFor(id), tokens.refreshToken);
}

export async function getAccountUser(id: number): Promise<User | null> {
  const raw = await secureGet(userKeyFor(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function setAccountUser(id: number, user: User): Promise<void> {
  await secureSet(userKeyFor(id), JSON.stringify(user));
}

export async function clearAccount(id: number): Promise<void> {
  await Promise.all([
    secureDelete(tokenKeyFor(id)),
    secureDelete(refreshKeyFor(id)),
    secureDelete(userKeyFor(id)),
  ]);
}

export async function clearAllAccountData(): Promise<void> {
  const ids = await getAccountIds();
  await Promise.all(ids.map(clearAccount));
  await secureDelete(LINKED_ACCOUNT_IDS_KEY);
  await secureDelete(ACTIVE_ACCOUNT_KEY);
}

// ── One-time keychain accessibility migration ──

/**
 * Re-write every existing credential under the current `KEYCHAIN_POLICY`.
 *
 * Why this is required (and not just changing the write option):
 * `expo-secure-store`'s native `set` issues `SecItemAdd`, and for an
 * already-existing key falls back to `SecItemUpdate` with ONLY the value —
 * it never updates `kSecAttrAccessible`. So items first written under the
 * old default (`WHEN_UNLOCKED`) keep that accessibility forever, even after
 * we start passing the new option. The only way to change it is to delete
 * the item and add it fresh, which is exactly what this does.
 *
 * Safety / robustness:
 *  - Runs in the foreground (called from session bootstrap), where the old
 *    `WHEN_UNLOCKED` items are still readable.
 *  - Idempotent: a sentinel is written last; once present the work is
 *    skipped. If interrupted mid-run the sentinel is never set, so the next
 *    launch simply re-runs the whole (cheap, idempotent) pass.
 *  - Per-key try/catch: a single failed key degrades to "re-login on next
 *    use" (authStore already treats a missing token as logged-out) rather
 *    than aborting the migration for the others.
 *  - Never throws: callers can `void migrateKeychainAccessibility()` or
 *    await it without guarding.
 */
export async function migrateKeychainAccessibility(): Promise<void> {
  try {
    const alreadyMigrated = await secureGet(KEYCHAIN_MIGRATION_KEY);
    if (alreadyMigrated === 'done') return;

    const ids = await getAccountIds();
    const keys = [
      TOKEN_KEY,
      REFRESH_TOKEN_KEY,
      USER_KEY,
      SIGNUP_PASSWORD_KEY,
      LINKED_ACCOUNT_IDS_KEY,
      ACTIVE_ACCOUNT_KEY,
      ...ids.flatMap((id) => [tokenKeyFor(id), refreshKeyFor(id), userKeyFor(id)]),
    ];

    for (const key of keys) {
      try {
        const value = await SecureStore.getItemAsync(key);
        if (value == null) continue; // nothing stored under this key
        // delete + re-add so SecItemAdd applies the new kSecAttrAccessible
        await SecureStore.deleteItemAsync(key);
        await SecureStore.setItemAsync(key, value, KEYCHAIN_POLICY);
      } catch (error) {
        // Leave this key as-is; worst case is a re-login for that account.
        reportKeychainError(key, error);
      }
    }

    await secureSet(KEYCHAIN_MIGRATION_KEY, 'done');
  } catch (error) {
    // Migration is best-effort hardening — never block app startup on it.
    reportKeychainError(KEYCHAIN_MIGRATION_KEY, error);
  }
}
