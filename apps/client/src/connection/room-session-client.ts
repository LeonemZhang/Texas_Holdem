import {
  CreateRoomSessionRequestSchema,
  JoinRoomSessionRequestSchema,
  ResumeRoomSessionRequestSchema,
  RoomSessionResponseSchema,
  type CreateRoomSessionRequest,
  type JoinRoomSessionRequest,
  type ResumeRoomSessionRequest,
  type RoomSessionResponse,
} from '@texas-holdem/protocol';

export type FetchPort = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const defaultFetch: FetchPort = (input, init) => fetch(input, init);

export class RoomSessionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly roomId: string | null = null,
  ) {
    super(message);
    this.name = 'RoomSessionRequestError';
  }
}

export class RoomSessionClient {
  readonly #baseUrl: URL;

  constructor(
    baseUrl: string | URL,
    private readonly fetcher: FetchPort = defaultFetch,
  ) {
    this.#baseUrl = new URL(baseUrl);
  }

  async currentRoomId(): Promise<string> {
    const response = await this.request('/api/rooms/current');
    const value: unknown = await response.json();
    if (
      typeof value !== 'object' ||
      value === null ||
      !('roomId' in value) ||
      typeof value.roomId !== 'string' ||
      !value.roomId.trim()
    ) {
      throw new RoomSessionRequestError('房主返回的房间信息无效', 502);
    }
    return value.roomId;
  }

  async create(input: CreateRoomSessionRequest): Promise<RoomSessionResponse> {
    const body = CreateRoomSessionRequestSchema.parse(input);
    const response = await this.request('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return RoomSessionResponseSchema.parse(await response.json());
  }

  async join(
    roomId: string,
    input: JoinRoomSessionRequest,
  ): Promise<RoomSessionResponse> {
    const body = JoinRoomSessionRequestSchema.parse(input);
    const response = await this.request(
      `/api/rooms/${encodeURIComponent(roomId)}/join`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    return RoomSessionResponseSchema.parse(await response.json());
  }

  async resume(
    roomId: string,
    input: ResumeRoomSessionRequest,
  ): Promise<RoomSessionResponse> {
    const body = ResumeRoomSessionRequestSchema.parse(input);
    const response = await this.request(
      `/api/rooms/${encodeURIComponent(roomId)}/resume`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    return RoomSessionResponseSchema.parse(await response.json());
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const fetcher = this.fetcher;
    const response = await fetcher(new URL(path, this.#baseUrl), init);
    if (response.ok) return response;
    let message = `房主服务请求失败（${response.status}）`;
    let code: string | null = null;
    let roomId: string | null = null;
    try {
      const value: unknown = await response.json();
      if (
        typeof value === 'object' &&
        value !== null &&
        'error' in value &&
        typeof value.error === 'object' &&
        value.error !== null &&
        'message' in value.error &&
        typeof value.error.message === 'string'
      ) {
        message = value.error.message;
      }
      if (
        typeof value === 'object' &&
        value !== null &&
        'error' in value &&
        typeof value.error === 'object' &&
        value.error !== null
      ) {
        if ('code' in value.error && typeof value.error.code === 'string') {
          code = value.error.code;
        }
        if ('roomId' in value.error && typeof value.error.roomId === 'string') {
          roomId = value.error.roomId;
        }
      }
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }
    throw new RoomSessionRequestError(message, response.status, code, roomId);
  }
}
