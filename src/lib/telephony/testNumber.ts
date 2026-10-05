/**
 * Twilio's magic test numbers (+1 500 555 xxxx) are what signup assigns while
 * telephony runs in TWILIO_DEV_MODE. They look like real numbers but can never
 * receive a call, so the app has to say so (David, Oct 4 2026).
 */
export function isTestBridgeNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return national.startsWith('500555');
}
