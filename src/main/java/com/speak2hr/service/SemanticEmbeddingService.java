package com.speak2hr.service;

import java.util.List;

/**
 * Standard interface for semantic dense vector embeddings.
 * Guarantees consistent model identifier, version, vector dimension,
 * L2 normalization, and semantic similarity calculation.
 */
public interface SemanticEmbeddingService {

    /**
     * Unique identifier of the embedding model (e.g. "gemini-embedding-2").
     */
    String getModelIdentifier();

    /**
     * Version of the embedding model (e.g. "2.0").
     */
    String getModelVersion();

    /**
     * Vector dimension produced by the model (e.g. 3072).
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
     * Returns 0.0 if vectors are incompatible or of different dimensions.
     */
    double cosineSimilarity(List<Double> v1, List<Double> v2);

    /**
     * Check if a set of chunk embeddings is compatible with this engine.
     */
    default boolean isCompatible(String modelId, String version, int dim) {
        if (modelId == null || version == null) return false;
        String currentClean = getModelIdentifier().replace("models/", "").trim();
        String checkClean = modelId.replace("models/", "").trim();
        return currentClean.equalsIgnoreCase(checkClean)
                && getModelVersion().equalsIgnoreCase(version.trim())
                && getDimension() == dim;
    }
}
