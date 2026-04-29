// src/utils/AppError.ts
export class AppError extends Error {
  constructor(public message: string, public statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}
