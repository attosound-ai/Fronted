/** DTO for sending verification OTP to bridge number */
export interface SendVerificationOtpDTO {
  bridgePhone: string;
}

/** DTO for verifying OTP against bridge number */
export interface VerifyArtistOtpDTO {
  bridgePhone: string;
  code: string;
}
