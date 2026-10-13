package com.speak2hr.service;

/**
 * Exception thrown when semantic embedding generation or retrieval fails.
 */
public class EmbeddingException extends RuntimeException {
    public EmbeddingException(String message) {
        super(message);
    }

    public EmbeddingException(String message, Throwable cause) {
        super(message, cause);
    }
}
