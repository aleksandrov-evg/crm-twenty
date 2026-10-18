import { type DataSource } from 'typeorm';
import { z } from 'zod';

import { isValidTimeZone } from '../domain/is-valid-time-zone';
import { CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { type DiscoveredYandexCalendar } from '../transport/discover-yandex-calendars';
import { isYandexCalDavTarget } from '../transport/yandex-caldav-target';

type ConnectionScope = { workspaceId: string; id: string };

export type CalendarConnection = ConnectionScope & {
  username: string;
  calendarUrl: string;
  displayName: string;
  timezone: string;
  reports: string[];
  state:
    | 'PREVIEW'
    | 'ACTIVE'
    | 'PAUSED'
    | 'AUTH_REQUIRED'
    | 'ERROR'
    | 'DISCONNECTED';
  configurationVersion: number;
  credentialVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

const PUBLIC_COLUMNS =
  '"id", "workspaceId", "username", "calendarUrl", "displayName", "timezone", "reports", "state", "configurationVersion", "credentialVersion", "createdAt", "updatedAt"';
const previewSchema = z.object({
  workspaceId: z.uuid(),
  id: z.uuid(),
  username: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !/[:\r\n]/.test(value)),
  appPassword: z.string().min(1).max(4096),
  timezone: z.string().refine(isValidTimeZone),
  calendar: z.object({
    url: z.string().refine(isYandexCalDavTarget),
    displayName: z.string(),
    reports: z.array(z.string()).max(100),
    writeAccess: z.literal('unverified'),
  }),
});

export class CalendarConnectionStore {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cipher: CalendarCredentialCipher | null = null,
  ) {}

  async createPreview(
    input: ConnectionScope & {
      username: string;
      appPassword: string;
      timezone: string;
      calendar: DiscoveredYandexCalendar;
    },
  ): Promise<CalendarConnection> {
    const parsed = previewSchema.safeParse(input);
    if (!parsed.success) throw new Error('CALENDAR_CONNECTION_INVALID');
    const value = parsed.data;
    const reports = [...new Set(value.calendar.reports)].sort();
    const context = {
      workspaceId: value.workspaceId,
      connectionId: value.id,
      username: value.username,
    };
    const envelope = this.requireCipher().seal(context, value.appPassword);
    const rows = await this.dataSource.query<CalendarConnection[]>(
      `INSERT INTO "calendar_sync"."calendarConnection"
        ("id", "workspaceId", "username", "calendarUrl", "displayName", "timezone", "reports", "encryptedAppPassword")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT ("id") DO NOTHING RETURNING ${PUBLIC_COLUMNS}`,
      [
        value.id,
        value.workspaceId,
        value.username,
        value.calendar.url,
        value.calendar.displayName,
        value.timezone,
        JSON.stringify(reports),
        envelope,
      ],
    );
    if (rows.length > 0) return rows[0];

    const existing = await this.get(value);
    const credentials = await this.readCredentialsForDiscovery(value);
    if (
      !existing ||
      !credentials ||
      existing.username !== value.username ||
      existing.calendarUrl !== value.calendar.url ||
      existing.displayName !== value.calendar.displayName ||
      existing.timezone !== value.timezone ||
      JSON.stringify(existing.reports) !== JSON.stringify(reports) ||
      credentials.appPassword !== value.appPassword
    ) {
      throw new Error('CALENDAR_CONNECTION_IDEMPOTENCY_CONFLICT');
    }
    return existing;
  }

  async get(scope: ConnectionScope): Promise<CalendarConnection | null> {
    const rows = await this.dataSource.query<CalendarConnection[]>(
      `SELECT ${PUBLIC_COLUMNS} FROM "calendar_sync"."calendarConnection" WHERE "workspaceId" = $1 AND "id" = $2`,
      [scope.workspaceId, scope.id],
    );
    return rows[0] ?? null;
  }

  async readCredentialsForDiscovery(
    scope: ConnectionScope,
  ): Promise<{ username: string; appPassword: string } | null> {
    const rows = await this.dataSource.query<
      Array<{ username: string; encryptedAppPassword: string }>
    >(
      `SELECT "username", "encryptedAppPassword" FROM "calendar_sync"."calendarConnection"
       WHERE "workspaceId" = $1 AND "id" = $2 AND "state" <> 'DISCONNECTED'`,
      [scope.workspaceId, scope.id],
    );
    if (rows.length === 0) return null;
    return {
      username: rows[0].username,
      appPassword: this.requireCipher().open(
        {
          workspaceId: scope.workspaceId,
          connectionId: scope.id,
          username: rows[0].username,
        },
        rows[0].encryptedAppPassword,
      ),
    };
  }

  async pause(
    scope: ConnectionScope,
    expectedVersion: number,
  ): Promise<CalendarConnection | null> {
    return this.changeState(scope, expectedVersion, 'PAUSED');
  }

  async disconnect(
    scope: ConnectionScope,
    expectedVersion: number,
  ): Promise<CalendarConnection | null> {
    return this.changeState(scope, expectedVersion, 'DISCONNECTED');
  }

  async replacePassword(
    scope: ConnectionScope,
    expectedVersion: number,
    appPassword: string,
  ): Promise<CalendarConnection | null> {
    const current = await this.get(scope);
    if (
      !current ||
      current.state === 'DISCONNECTED' ||
      current.configurationVersion !== expectedVersion
    )
      return null;
    const envelope = this.requireCipher().seal(
      {
        workspaceId: scope.workspaceId,
        connectionId: scope.id,
        username: current.username,
      },
      appPassword,
    );
    const rows = await this.dataSource.query<CalendarConnection[]>(
      `WITH updated AS (
        UPDATE "calendar_sync"."calendarConnection"
        SET "encryptedAppPassword" = $4, "state" = 'PREVIEW', "configurationVersion" = "configurationVersion" + 1,
          "credentialVersion" = "credentialVersion" + 1, "updatedAt" = now()
        WHERE "workspaceId" = $1 AND "id" = $2 AND "configurationVersion" = $3 AND "state" <> 'DISCONNECTED'
        RETURNING ${PUBLIC_COLUMNS}
      ) SELECT * FROM updated`,
      [scope.workspaceId, scope.id, expectedVersion, envelope],
    );
    return rows[0] ?? null;
  }

  private requireCipher(): CalendarCredentialCipher {
    if (!this.cipher) throw new Error('CALENDAR_CREDENTIAL_CIPHER_REQUIRED');
    return this.cipher;
  }

  private async changeState(
    scope: ConnectionScope,
    expectedVersion: number,
    state: 'PAUSED' | 'DISCONNECTED',
  ): Promise<CalendarConnection | null> {
    const rows = await this.dataSource.query<CalendarConnection[]>(
      `WITH updated AS (
        UPDATE "calendar_sync"."calendarConnection"
        SET "state" = $4, "configurationVersion" = "configurationVersion" + 1,
          "encryptedAppPassword" = CASE WHEN $4 = 'DISCONNECTED' THEN NULL ELSE "encryptedAppPassword" END,
          "updatedAt" = now()
        WHERE "workspaceId" = $1 AND "id" = $2 AND "configurationVersion" = $3 AND "state" <> 'DISCONNECTED'
        RETURNING ${PUBLIC_COLUMNS}
      ) SELECT * FROM updated`,
      [scope.workspaceId, scope.id, expectedVersion, state],
    );
    return rows[0] ?? null;
  }
}
