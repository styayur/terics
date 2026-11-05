import type { GoogleCalendarClient, GoogleCalendarEvent, GoogleCalendarInfo } from "./planner";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MAX_RETRIES = 3;

function encode(value: string): string {
  return encodeURIComponent(value);
}

export class GoogleCalendarRestClient implements GoogleCalendarClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const response = await this.fetchImpl(`${CALENDAR_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        return this.request<T>(path, init, attempt + 1);
      }
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Google Calendar API HTTP ${response.status}${text ? `：${text.slice(0, 300)}` : ""}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async listCalendars(): Promise<GoogleCalendarInfo[]> {
    const calendars: GoogleCalendarInfo[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ maxResults: "250", minAccessRole: "writer" });
      if (pageToken) query.set("pageToken", pageToken);
      const page = await this.request<{
        items?: GoogleCalendarInfo[];
        nextPageToken?: string;
      }>(`/users/me/calendarList?${query.toString()}`);
      calendars.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return calendars;
  }

  async createCalendar(summary: string, timeZone = "Asia/Shanghai"): Promise<GoogleCalendarInfo> {
    return this.request<GoogleCalendarInfo>("/calendars", {
      method: "POST",
      body: JSON.stringify({ summary, timeZone }),
    });
  }

  async listManagedEvents(calendarId: string, termId: string): Promise<GoogleCalendarEvent[]> {
    const events: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        maxResults: "2500",
        singleEvents: "true",
        showDeleted: "false",
        privateExtendedProperty: "terics_source=terics",
      });
      query.append("privateExtendedProperty", `terics_term_id=${termId}`);
      if (pageToken) query.set("pageToken", pageToken);
      const page = await this.request<{
        items?: GoogleCalendarEvent[];
        nextPageToken?: string;
      }>(`/calendars/${encode(calendarId)}/events?${query.toString()}`);
      events.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return events.filter((event) => {
      const properties = event.extendedProperties?.private;
      return properties?.terics_source === "terics" && properties.terics_term_id === termId;
    });
  }

  async insertEvent(calendarId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(`/calendars/${encode(calendarId)}/events?sendUpdates=none`, {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  async patchEvent(calendarId: string, eventId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(`/calendars/${encode(calendarId)}/events/${encode(eventId)}?sendUpdates=none`, {
      method: "PATCH",
      body: JSON.stringify(event),
    });
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request<void>(`/calendars/${encode(calendarId)}/events/${encode(eventId)}?sendUpdates=none`, {
      method: "DELETE",
    });
  }
}
