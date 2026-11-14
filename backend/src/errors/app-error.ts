/** An error that is safe to show to the client, with its HTTP status and error code. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

/** The agent (CHIEF) cannot be reached or failed, and there is no fallback for the call. */
export class AgentUnavailableError extends AppError {
  constructor(message = 'CHIEF voice service is unavailable') {
    super(503, 'AGENT_UNAVAILABLE', message);
  }
}
