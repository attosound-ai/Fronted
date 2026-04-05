import * as SecureStore from 'expo-secure-store';
import type { TokenPair, User } from '@/types';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';

// Per-account keys (suffixed by userId)
const ACTIVE_ACCOUNT_KEY = 'active_account_id';
const LINKED_ACCOUNT_IDS_KEY = 'linked_account_ids';
const tokenKeyFor = (id: number) => `auth_token_${id}`;
const refreshKeyFor = (id: number) => `refresh_token_${id}`;
const userKeyFor = (id: number) => `user_data_${id}`;

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
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },

  async removeToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },

  // Refresh token
  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },

  async removeRefreshToken(): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },

  // User data (JSON serializado)
  async getUser<T>(): Promise<T | null> {
    try {
      const data = await SecureStore.getItemAsync(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  async setUser<T>(user: T): Promise<void> {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  async removeUser(): Promise<void> {
    await SecureStore.deleteItemAsync(USER_KEY);
  },

  // Limpiar todo
  async clearAll(): Promise<void> {
    await Promise.all([this.removeToken(), this.removeRefreshToken(), this.removeUser()]);
  },
};

// ── Per-account storage helpers ──

export async function getAccountIds(): Promise<number[]> {
  try {
    const raw = await SecureStore.getItemAsync(LINKED_ACCOUNT_IDS_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export async function setAccountIds(ids: number[]): Promise<void> {
  await SecureStore.setItemAsync(LINKED_ACCOUNT_IDS_KEY, JSON.stringify(ids));
}

export async function getActiveAccountId(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(ACTIVE_ACCOUNT_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export async function setActiveAccountId(id: number): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_ACCOUNT_KEY, String(id));
}

export async function getAccountTokens(id: number): Promise<TokenPair | null> {
  try {
    const raw = await SecureStore.getItemAsync(tokenKeyFor(id));
    const refresh = await SecureStore.getItemAsync(refreshKeyFor(id));
    if (!raw || !refresh) return null;
    return { accessToken: raw, refreshToken: refresh, expiresIn: 0 };
  } catch {
    return null;
  }
}

export async function setAccountTokens(id: number, tokens: TokenPair): Promise<void> {
  await SecureStore.setItemAsync(tokenKeyFor(id), tokens.accessToken);
  await SecureStore.setItemAsync(refreshKeyFor(id), tokens.refreshToken);
}

export async function getAccountUser(id: number): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(userKeyFor(id));
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export async function setAccountUser(id: number, user: User): Promise<void> {
  await SecureStore.setItemAsync(userKeyFor(id), JSON.stringify(user));
}

export async function clearAccount(id: number): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(tokenKeyFor(id)),
    SecureStore.deleteItemAsync(refreshKeyFor(id)),
    SecureStore.deleteItemAsync(userKeyFor(id)),
  ]);
}

export async function clearAllAccountData(): Promise<void> {
  const ids = await getAccountIds();
  await Promise.all(ids.map(clearAccount));
  await SecureStore.deleteItemAsync(LINKED_ACCOUNT_IDS_KEY);
  await SecureStore.deleteItemAsync(ACTIVE_ACCOUNT_KEY);
}
