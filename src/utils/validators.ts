/**
 * Validators - Funciones puras de validación
 *
 * Principio SOLID:
 * - Single Responsibility: Solo validan datos
 * - Funciones puras: sin side effects
 */

/**
 * Valida formato de email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valida longitud mínima de contraseña
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

/**
 * Valida que la contraseña sea fuerte
 */
export function isStrongPassword(password: string): boolean {
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);

  return hasMinLength && hasUpperCase && hasLowerCase && hasNumber;
}

/**
 * Valida formato de username
 */
export function isValidUsername(username: string): boolean {
  // Solo letras, números, puntos y guiones bajos, 3-30 caracteres
  const usernameRegex = /^[a-zA-Z0-9._]{3,30}$/;
  return usernameRegex.test(username);
}

/**
 * Valida que un string no esté vacío
 */
export function isNotEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Valida longitud de texto
 */
export function isWithinLength(value: string, min: number, max: number): boolean {
  const length = value.trim().length;
  return length >= min && length <= max;
}

/**
 * Valida formato de número de teléfono (solo dígitos, 7-15)
 */
export function isValidPhoneNumber(phone: string): boolean {
  const digitsOnly = phone.replaceAll(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Valida código OTP (exactamente 6 dígitos)
 */
export function isValidOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Valida número de interno (alfanumérico con guiones, 4-20 chars)
 */
export function isValidInmateNumber(inmateNumber: string): boolean {
  return /^[A-Za-z0-9-]{4,20}$/.test(inmateNumber.trim());
}

/**
 * Validates "YYYY-MM-DD" format and that the date is real
 */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Returns true if age calculated from "YYYY-MM-DD" is >= minAge
 */
export function isMinimumAge(dateStr: string, minAge: number = 18): boolean {
  if (!isValidDate(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) {
    age--;
  }
  return age >= minAge;
}
