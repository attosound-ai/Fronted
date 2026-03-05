/**
 * Local Storage - Abstracción para almacenamiento local
 *
 * Nota: MMKV requiere configuración nativa adicional (prebuild).
 * Esta implementación usa un Map en memoria para desarrollo con Expo Go.
 *
 * Para producción con MMKV real:
 * 1. Ejecuta `npx expo prebuild`
 * 2. Descomenta el import de MMKV abajo
 */

// TODO: Descomentar cuando hagas prebuild:
// import { MMKV } from 'react-native-mmkv';
// export const storage = new MMKV({ id: 'atto-app-storage' });

// Storage en memoria para desarrollo con Expo Go
const memoryStorage = new Map<string, string>();

/**
 * Helper functions para almacenamiento local
 *
 * Principio SOLID:
 * - Single Responsibility: Solo maneja almacenamiento local rápido
 * - Interface Segregation: API simple y específica
 */
export const mmkvStorage = {
  // String
  getString(key: string): string | undefined {
    return memoryStorage.get(key);
  },

  setString(key: string, value: string): void {
    memoryStorage.set(key, value);
  },

  // Number
  getNumber(key: string): number | undefined {
    const value = memoryStorage.get(key);
    return value ? parseFloat(value) : undefined;
  },

  setNumber(key: string, value: number): void {
    memoryStorage.set(key, value.toString());
  },

  // Boolean
  getBoolean(key: string): boolean | undefined {
    const value = memoryStorage.get(key);
    if (value === undefined) return undefined;
    return value === 'true';
  },

  setBoolean(key: string, value: boolean): void {
    memoryStorage.set(key, value.toString());
  },

  // JSON (objetos)
  getObject<T>(key: string): T | null {
    const data = memoryStorage.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  setObject<T>(key: string, value: T): void {
    memoryStorage.set(key, JSON.stringify(value));
  },

  // Utilidades
  delete(key: string): void {
    memoryStorage.delete(key);
  },

  contains(key: string): boolean {
    return memoryStorage.has(key);
  },

  clearAll(): void {
    memoryStorage.clear();
  },

  getAllKeys(): string[] {
    return Array.from(memoryStorage.keys());
  },
};
