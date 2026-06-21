export interface HookEventCounterPort {
  count(input: { readonly spoolPath: string }): Promise<number>;
}
