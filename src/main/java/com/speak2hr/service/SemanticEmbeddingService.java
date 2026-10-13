package com.speak2hr.service;

import java.util.List;

/**
 * Standard interface for semantic dense vector embeddings.
 * Guarantees consistent model identifier, version, vector dimension,
 * L2 normalization, and semantic similarity calculation.
 */
public interface SemanticEmbeddingService {

    /**
     * Unique identifier of the embedding model (e.g. "gemini-text-embedding-004").
     */
    String getModelIdentifier();

    /**
     * Version of the embedding model (e.g. "1.0").
     */
    String getModelVersion();

    /**
     * Vector dimension produced by the model (e.g. 768).
     */
    int getDimension();

    /**
     * Generate an L2-normalized dense semantic vector from input text.
     */
    List<Double> embedText(String text);

    /**
     * Generate L2-normalized dense semantic vectors for a batch of texts.
     */
    List<List<Double>> embedBatch(List<String> texts);

    /**
     * Compute cosine similarity between two normalized semantic vectors.
     */
    double cosineSimilarity(List<Double> v1, List<Double> v2);

    /**
     * Check if a set of chunk embeddings is compatible with this engine.
     */
    default boolean isCompatible(String modelId, String version, int dim) {
        return getModelIdentifier().equalsIgnoreCase(modelId)
                && getModelVersion().equalsIgnoreCase(version)
                && getDimension() == dim;
    }
}
