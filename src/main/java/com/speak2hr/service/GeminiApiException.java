package com.speak2hr.service;

/**
 * Exception thrown when Gemini API call fails due to invalid keys, rate limits, quota exhaustion, or network errors.
 */
public class GeminiApiException extends RuntimeException {
    private final int statusCode;

    public GeminiApiException(String message) {
        super(message);
        this.statusCode = 502;
    }

    public GeminiApiException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public GeminiApiException(String message, Throwable cause) {
        super(message, cause);
        this.statusCode = 502;
    }

    public int getStatusCode() {
        return statusCode;
    }
}
