/** What the server says about the bridge number of an account. Types only. */
export interface BridgeNumberResult {
  bridgeNumber: string | null;
  /**
   * 'provisioning': a number is on its way. 'unavailable': there will be none
   * (the account is not a creator, or its plan has no bridge number).
   */
  status: 'assigned' | 'provisioning' | 'failed' | 'unavailable';
}
