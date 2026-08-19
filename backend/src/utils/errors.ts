export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (resource: string) =>
  new AppError(404, `${resource} nicht gefunden`);

export const badRequest = (msg: string) => new AppError(400, msg);

export const forbidden = () => new AppError(403, 'Keine Berechtigung');

export const conflict = (msg: string) => new AppError(409, msg);
