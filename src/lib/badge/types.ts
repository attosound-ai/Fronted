export interface BadgeCounter {
  set(count: number): Promise<boolean>;
  get(): Promise<number>;
}

export interface UnreadSource {
  readonly key: string;
  getCount(): Promise<number> | number;
}
