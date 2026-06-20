import type { HarnessProvider, JsonValue } from "./raw-event-store.js";

export interface AppendNormalizedEventInput {
  schema_version: "bmh.event.v1";
  event_id: string;
  idempotency_key: string;
  provider: HarnessProvider;
  provider_event_type: string;
  event_type: string;
  occurred_at: string;
  observed_at: string;
  sequence?: number;
  source: {
    transport: string;
    adapter_version?: string;
    host?: string;
    process_id?: number;
  };
  workspace?: {
    id?: string;
    root?: string;
    repo_url?: string;
    git_sha?: string;
    branch?: string;
  };
  run: {
    run_id: string;
    trial_id?: string;
    session_id?: string;
    turn_id?: string;
    parent_event_id?: string | null;
  };
  actor?: {
    type: string;
    name?: string;
    user_id?: string | null;
  };
  action: {
    name?: string;
    category?: string;
    status: string;
  };
  payload: JsonValue;
  raw_ref: {
    raw_event_id: string;
    payload_hash: string;
  };
  quality: {
    identity?: string;
    timestamp?: string;
    ordering?: string;
    payload_completeness?: string;
  };
  security?: {
    redaction_applied?: boolean;
    secret_scan_status?: string;
  };
}

export type NormalizedStoredEvent = AppendNormalizedEventInput;

export interface NormalizedEventListFilter {
  provider?: HarnessProvider;
  run_id?: string;
  trial_id?: string;
  raw_event_id?: string;
}

export interface NormalizedEventStore {
  append(input: AppendNormalizedEventInput): Promise<NormalizedStoredEvent>;
  count(): Promise<number>;
  findById(eventId: string): Promise<NormalizedStoredEvent | undefined>;
  findByIdempotencyKey(provider: HarnessProvider, idempotencyKey: string): Promise<NormalizedStoredEvent | undefined>;
  list(filter?: NormalizedEventListFilter): Promise<NormalizedStoredEvent[]>;
}
