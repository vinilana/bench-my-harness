export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type HarnessProvider = "codex" | "claude_code";

export interface AppendRawHookEventInput {
  provider: HarnessProvider;
  run_id: string;
  trial_id: string;
  payload: JsonValue;
  observed_at?: string;
}

export interface RawHookEvent {
  raw_event_id: string;
  provider: HarnessProvider;
  run_id: string;
  trial_id: string;
  payload: JsonValue;
  payload_hash: string;
  observed_at: string;
  duplicate_count: number;
}

export interface RawEventStore {
  append(input: AppendRawHookEventInput): Promise<RawHookEvent>;
  count(): Promise<number>;
  findById(rawEventId: string): Promise<RawHookEvent | undefined>;
}
