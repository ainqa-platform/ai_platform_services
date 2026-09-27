import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export class ApiError extends Error {
  statusCode: number;
  errorCode?: string;
  details?: any;

  constructor(
    statusCode: number,
    message: string,
    errorCode?: string,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.name = "ApiError";
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the full error stack trace for debugging
  logger.error("Error occurred:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ...(err instanceof ApiError
      ? { statusCode: err.statusCode, errorCode: err.errorCode }
      : {}),
  });

  if (err instanceof ApiError) {
    const response: any = {
      status: "error",
      message: err.message,
      ...(err.errorCode && { errorCode: err.errorCode }),
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    };

    if (err.details) {
      response.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // Handle unexpected errors
  return res.status(500).json({
    status: "error",
    message: "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};
