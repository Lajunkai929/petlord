import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { StoredGenerationProviderConfiguration } from "./providers/types";
import { DesignError } from "@petlord/design-core/errors";

export const workspaceEntityTypes = ["project", "identity", "style", "template"] as const;
export type WorkspaceEntityType = typeof workspaceEntityTypes[number];

interface EntityRow {
  entity_id: string;
  data_json: string;
}

export interface WorkspaceSnapshot<T> { data: T; revision: number }
export interface DesignReceipt<T = unknown> { requestHash: string; response: T }
export interface EntityCommand<T> {
  type: WorkspaceEntityType;
  id: string;
  expectedRevision: number | null;
  data: T | null;
  requestId?: string;
  requestHash?: string;
}

interface StateRow {
  data_json: string;
}

interface AgentEventRow extends StateRow {
  event_id: string;
}

interface ProviderRow extends StateRow {
  provider_id: string;
}

export class SqliteStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS workspace_entities (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      );
      CREATE INDEX IF NOT EXISTS workspace_entities_updated_idx
        ON workspace_entities(entity_type, updated_at DESC);

      CREATE TABLE IF NOT EXISTS workspace_state (
        state_key TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generation_jobs (
        job_id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generation_providers (
        provider_id TEXT PRIMARY KEY,
        provider_type TEXT NOT NULL,
        capability TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS generation_providers_capability_idx
        ON generation_providers(capability, created_at ASC);

      CREATE TABLE IF NOT EXISTS media_assets (
        media_id TEXT PRIMARY KEY,
        uri TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS external_event_inbox (
        event_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        event_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        occurred_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        acknowledged_at TEXT,
        opened_at TEXT
      );
      CREATE INDEX IF NOT EXISTS external_event_inbox_received_idx
        ON external_event_inbox(received_at DESC);
      CREATE INDEX IF NOT EXISTS external_event_inbox_unread_idx
        ON external_event_inbox(acknowledged_at, received_at DESC);

      CREATE TABLE IF NOT EXISTS workspace_sequence (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        revision INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS design_requests (
        request_id TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    const columns = this.database.prepare("PRAGMA table_info(workspace_entities)").all();
    if (!columns.some(column => column.name === "revision")) {
      this.database.exec("ALTER TABLE workspace_entities ADD COLUMN revision INTEGER NOT NULL DEFAULT 0");
    }
    this.database.exec("INSERT OR IGNORE INTO workspace_sequence(singleton, revision) SELECT 1, COALESCE(MAX(revision), 0) FROM workspace_entities");
  }

  listEntities<T>(type: WorkspaceEntityType): T[] {
    const rows = this.database.prepare(`
      SELECT entity_id, data_json FROM workspace_entities
      WHERE entity_type = ? ORDER BY updated_at DESC
    `).all(type) as unknown as EntityRow[];
    return rows.map((row) => JSON.parse(row.data_json) as T);
  }

  private transaction<T>(run: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private nextRevision(): number {
    const row = this.database.prepare("UPDATE workspace_sequence SET revision = revision + 1 WHERE singleton = 1 RETURNING revision").get()!;
    return Number(row.revision);
  }

  private writeEntity(type: WorkspaceEntityType, id: string, data: unknown, revision: number) {
    const timestamp = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO workspace_entities(entity_type, entity_id, data_json, created_at, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at,
        revision = excluded.revision
    `).run(type, id, JSON.stringify(data), timestamp, timestamp, revision);
  }

  upsertEntity(type: WorkspaceEntityType, id: string, data: unknown) {
    this.transaction(() => this.writeEntity(type, id, data, this.nextRevision()));
  }

  deleteEntity(type: WorkspaceEntityType, id: string) {
    this.transaction(() => {
      const deleted = this.database.prepare("DELETE FROM workspace_entities WHERE entity_type = ? AND entity_id = ?").run(type, id);
      if (deleted.changes) this.nextRevision();
    });
  }

  getEntitySnapshot<T>(type: WorkspaceEntityType, id: string): WorkspaceSnapshot<T> | undefined {
    const row = this.database.prepare("SELECT data_json, revision FROM workspace_entities WHERE entity_type = ? AND entity_id = ?").get(type, id);
    return row ? { data: JSON.parse(String(row.data_json)) as T, revision: Number(row.revision) } : undefined;
  }

  listEntitySnapshots<T>(type: WorkspaceEntityType): WorkspaceSnapshot<T>[] {
    return this.database.prepare("SELECT data_json, revision FROM workspace_entities WHERE entity_type = ? ORDER BY updated_at DESC").all(type)
      .map(row => ({ data: JSON.parse(String(row.data_json)) as T, revision: Number(row.revision) }));
  }

  getDesignReceipt<T = unknown>(requestId: string): DesignReceipt<T> | undefined {
    const row = this.database.prepare("SELECT request_hash, response_json FROM design_requests WHERE request_id = ?").get(requestId);
    return row ? { requestHash: String(row.request_hash), response: JSON.parse(String(row.response_json)) as T } : undefined;
  }

  saveDesignReceipt(requestId: string, requestHash: string, response: unknown): void {
    this.database.prepare("INSERT INTO design_requests(request_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?)")
      .run(requestId, requestHash, JSON.stringify(response), new Date().toISOString());
  }

  commitDesignOperation<R>(requestId: string, requestHash: string, operation: () => R): R {
    return this.transaction(() => {
      const receipt = this.getDesignReceipt<R>(requestId);
      if (receipt) {
        if (receipt.requestHash !== requestHash) throw new DesignError("REQUEST_ID_REUSED", "Request id was reused with different input.");
        return receipt.response;
      }
      const response = operation();
      this.saveDesignReceipt(requestId, requestHash, response);
      return response;
    });
  }

  commitEntityCommand<T, R>(command: EntityCommand<T>, response: (snapshot: WorkspaceSnapshot<T | null>) => R): R {
    return this.transaction(() => {
      if (command.requestId) {
        const receipt = this.getDesignReceipt<R>(command.requestId);
        if (receipt) {
          if (receipt.requestHash !== command.requestHash) throw new DesignError("REQUEST_ID_REUSED", "Request id was reused with different input.");
          return receipt.response;
        }
      }
      const current = this.getEntitySnapshot<T>(command.type, command.id);
      if ((current?.revision ?? null) !== command.expectedRevision) {
        throw new DesignError("REVISION_CONFLICT", "Workspace revision changed; read the latest entity before editing.", { expectedRevision: command.expectedRevision, actualRevision: current?.revision ?? null });
      }
      const revision = this.nextRevision();
      if (command.data === null) this.database.prepare("DELETE FROM workspace_entities WHERE entity_type = ? AND entity_id = ?").run(command.type, command.id);
      else this.writeEntity(command.type, command.id, command.data, revision);
      const result = response({ data: command.data, revision });
      if (command.requestId) {
        if (!command.requestHash) throw new DesignError("INVALID_INPUT", "A command receipt requires an input hash.");
        this.saveDesignReceipt(command.requestId, command.requestHash, result);
      }
      return result;
    });
  }

  getState<T>(key: string): T | undefined {
    const row = this.database.prepare("SELECT data_json FROM workspace_state WHERE state_key = ?").get(key) as unknown as StateRow | undefined;
    return row ? JSON.parse(row.data_json) as T : undefined;
  }

  setState(key: string, data: unknown) {
    const timestamp = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO workspace_state(state_key, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(state_key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(data), timestamp);
  }

  deleteState(key: string) {
    this.database.prepare("DELETE FROM workspace_state WHERE state_key = ?").run(key);
  }

  listGenerationJobs<T>(): T[] {
    const rows = this.database.prepare("SELECT data_json FROM generation_jobs ORDER BY created_at DESC").all() as unknown as StateRow[];
    return rows.map((row) => JSON.parse(row.data_json) as T);
  }

  upsertGenerationJob(job: { id: string; createdAt: string; updatedAt: string }): void {
    this.database.prepare(`INSERT INTO generation_jobs(job_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
      .run(job.id, JSON.stringify(job), job.createdAt, job.updatedAt);
  }

  replaceGenerationJobs<T extends { id: string; createdAt: string; updatedAt: string }>(jobs: T[]) {
    const remove = this.database.prepare("DELETE FROM generation_jobs");
    const insert = this.database.prepare(`
      INSERT INTO generation_jobs(job_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?)
    `);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      remove.run();
      for (const job of jobs) insert.run(job.id, JSON.stringify(job), job.createdAt, job.updatedAt);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listGenerationProviders(): StoredGenerationProviderConfiguration[] {
    const rows = this.database.prepare(`
      SELECT provider_id, data_json FROM generation_providers ORDER BY created_at ASC
    `).all() as unknown as ProviderRow[];
    return rows.map((row) => JSON.parse(row.data_json) as StoredGenerationProviderConfiguration);
  }

  getGenerationProvider(id: string): StoredGenerationProviderConfiguration | undefined {
    const row = this.database.prepare("SELECT data_json FROM generation_providers WHERE provider_id = ?")
      .get(id) as unknown as StateRow | undefined;
    return row ? JSON.parse(row.data_json) as StoredGenerationProviderConfiguration : undefined;
  }

  upsertGenerationProvider(configuration: StoredGenerationProviderConfiguration) {
    this.database.prepare(`
      INSERT INTO generation_providers(provider_id, provider_type, capability, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        provider_type = excluded.provider_type,
        capability = excluded.capability,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(
      configuration.id,
      configuration.type,
      configuration.capability,
      JSON.stringify(configuration),
      configuration.createdAt,
      configuration.updatedAt,
    );
  }

  deleteGenerationProvider(id: string) {
    this.database.prepare("DELETE FROM generation_providers WHERE provider_id = ?").run(id);
  }

  upsertMedia(input: { id: string; uri: string; mimeType: string; [key: string]: unknown }) {
    const timestamp = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO media_assets(media_id, uri, mime_type, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET
        uri = excluded.uri,
        mime_type = excluded.mime_type,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(input.id, input.uri, input.mimeType, JSON.stringify(input), timestamp, timestamp);
  }

  listMedia<T>(): T[] {
    const rows = this.database.prepare("SELECT data_json FROM media_assets ORDER BY created_at DESC").all() as unknown as StateRow[];
    return rows.map((row) => JSON.parse(row.data_json) as T);
  }

  upsertAgentEvent<T extends {
    id: string;
    source: string;
    type: string;
    sessionId: string;
    dedupeKey: string;
    occurredAt: string;
    receivedAt: string;
    acknowledgedAt?: string;
    openedAt?: string;
  }>(event: T): T {
    const existing = this.database.prepare("SELECT event_id, data_json FROM external_event_inbox WHERE dedupe_key = ?")
      .get(event.dedupeKey) as unknown as AgentEventRow | undefined;
    if (existing) return JSON.parse(existing.data_json) as T;
    this.database.prepare(`
      INSERT INTO external_event_inbox(
        event_id, source, event_type, session_id, dedupe_key, occurred_at, received_at,
        data_json, acknowledged_at, opened_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.source,
      event.type,
      event.sessionId,
      event.dedupeKey,
      event.occurredAt,
      event.receivedAt,
      JSON.stringify(event),
      event.acknowledgedAt ?? null,
      event.openedAt ?? null,
    );
    return event;
  }

  listAgentEvents<T>(input: { unreadOnly?: boolean; limit?: number } = {}): T[] {
    const limit = Math.max(1, Math.min(500, input.limit ?? 100));
    const rows = this.database.prepare(`
      SELECT data_json FROM external_event_inbox
      ${input.unreadOnly ? "WHERE acknowledged_at IS NULL" : ""}
      ORDER BY received_at DESC LIMIT ?
    `).all(limit) as unknown as StateRow[];
    return rows.map((row) => JSON.parse(row.data_json) as T);
  }

  acknowledgeAgentEvent<T extends { acknowledgedAt?: string; openedAt?: string }>(id: string, opened: boolean): T | undefined {
    const row = this.database.prepare("SELECT data_json FROM external_event_inbox WHERE event_id = ?").get(id) as unknown as StateRow | undefined;
    if (!row) return undefined;
    const current = JSON.parse(row.data_json) as T;
    const timestamp = new Date().toISOString();
    const updated = { ...current, acknowledgedAt: current.acknowledgedAt ?? timestamp, openedAt: opened ? current.openedAt ?? timestamp : current.openedAt };
    this.database.prepare(`
      UPDATE external_event_inbox
      SET data_json = ?, acknowledged_at = ?, opened_at = ?
      WHERE event_id = ?
    `).run(JSON.stringify(updated), updated.acknowledgedAt, updated.openedAt ?? null, id);
    return updated;
  }

  close() {
    this.database.close();
  }
}
