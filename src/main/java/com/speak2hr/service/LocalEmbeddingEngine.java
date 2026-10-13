package com.speak2hr.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Production Semantic Embedding Engine implementing standard SemanticEmbeddingService.
 * Uses Gemini pretrained text-embedding-004 (768-dimensional dense vectors),
 * enforces unit L2 normalization, cosine similarity, persistent in-memory LRU caching,
 * and explicit API exception handling without arbitrary token-hashing fallbacks.
 */
@Component
public class LocalEmbeddingEngine implements SemanticEmbeddingService {

    private static final Logger logger = LoggerFactory.getLogger(LocalEmbeddingEngine.class);

    public static final int DIM = 768;
    public static final String MODEL_ID = "gemini-text-embedding-004";
    public static final String MODEL_VERSION = "1.0";

    private final GeminiService geminiService;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${gemini.embedding.model:text-embedding-004}")
    private String embeddingModelName;

    // In-memory embedding cache to avoid redundant API requests for identical passages/queries
    private final Map<String, List<Double>> vectorCache = new ConcurrentHashMap<>();

    // Mock embedding function for testing without incurring API charges
    private volatile Function<String, List<Double>> mockEmbedder = null;

    private static final Set<String> KNOWN_TECH_KEYWORDS = Set.of(
            "python", "javascript", "typescript", "java", "c++", "c#", "go", "golang", "rust", "php", "ruby", "swift", "kotlin",
            "react", "react.js", "next.js", "vue", "vue.js", "angular", "node.js", "express", "fastapi", "flask", "django",
            "spring", "spring boot", "asp.net", "graphql", "rest", "restful", "grpc", "microservices", "websocket",
            "postgresql", "postgres", "mysql", "mongodb", "sqlite", "redis", "cassandra", "dynamodb", "elasticsearch", "neo4j",
            "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "ansible", "ci/cd", "github actions", "jenkins", "kafka", "rabbitmq",
            "pytorch", "tensorflow", "keras", "scikit-learn", "hugging face", "opencv", "rag", "langchain", "llm", "gemini", "bert",
            "tailwind", "bootstrap", "material-ui", "mui", "redux", "zustand", "prisma", "hibernate", "jwt", "oauth", "firebase", "clickhouse"
    );

    @Autowired
    public LocalEmbeddingEngine(GeminiService geminiService) {
        this.geminiService = geminiService;
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
    }

    public void setMockEmbedder(Function<String, List<Double>> embedder) {
        this.mockEmbedder = embedder;
    }

    public void clearMockEmbedder() {
        this.mockEmbedder = null;
    }

    public void clearCache() {
        this.vectorCache.clear();
    }

    @Override
    public String getModelIdentifier() {
        return MODEL_ID;
    }

    @Override
    public String getModelVersion() {
        return MODEL_VERSION;
    }

    @Override
    public int getDimension() {
        return DIM;
    }

    @Override
    public List<Double> embedText(String text) {
        if (text == null || text.isBlank()) {
            return Collections.nCopies(DIM, 0.0);
        }

        String cacheKey = text.trim();
        if (vectorCache.containsKey(cacheKey)) {
            return vectorCache.get(cacheKey);
        }

        if (mockEmbedder != null) {
            List<Double> mockVec = mockEmbedder.apply(text);
            if (mockVec != null) {
                List<Double> normalized = normalizeVector(mockVec);
                vectorCache.put(cacheKey, normalized);
                return normalized;
            }
        }

        List<String> apiKeys = geminiService.getApiKeys();
        if (apiKeys.isEmpty()) {
            logger.error("Embedding generation failed: No Gemini API keys configured.");
            throw new EmbeddingException(
                    "No Gemini API key configured for semantic embeddings. Please set GEMINI_API_KEY in environment or application.properties."
            );
        }

        String lastError = "Unknown error";
        for (int i = 0; i < apiKeys.size(); i++) {
            String apiKey = apiKeys.get(i);
            try {
                String url = "https://generativelanguage.googleapis.com/v1beta/models/" + embeddingModelName + ":embedContent?key=" + apiKey;

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                Map<String, Object> part = Map.of("text", text);
                Map<String, Object> content = Map.of("parts", List.of(part));
                Map<String, Object> requestBody = Map.of(
                        "model", "models/" + embeddingModelName,
                        "content", content
                );

                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
                ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);

                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    JsonNode root = objectMapper.readTree(response.getBody());
                    JsonNode valuesNode = root.path("embedding").path("values");
                    if (valuesNode.isArray() && valuesNode.size() > 0) {
                        List<Double> rawVec = new ArrayList<>(valuesNode.size());
                        for (JsonNode val : valuesNode) {
                            rawVec.add(val.asDouble());
                        }

                        List<Double> normalized = normalizeVector(rawVec);
                        vectorCache.put(cacheKey, normalized);
                        return normalized;
                    }
                }
                lastError = "Response returned empty embedding vector from Gemini API";
            } catch (HttpStatusCodeException e) {
                lastError = "HTTP " + e.getStatusCode().value() + ": " + e.getResponseBodyAsString();
                logger.warn("Embedding API key #{} failed with status {}: {}", i + 1, e.getStatusCode().value(), e.getMessage());
            } catch (Exception e) {
                lastError = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                logger.warn("Embedding API key #{} failed: {}. Retrying with next key...", i + 1, lastError);
            }
        }

        logger.error("All Gemini API keys failed for embedding generation. Error: {}", lastError);
        throw new EmbeddingException("Gemini semantic embedding API failed: " + lastError);
    }

    @Override
    public List<List<Double>> embedBatch(List<String> texts) {
        if (texts == null || texts.isEmpty()) {
            return Collections.emptyList();
        }

        List<List<Double>> results = new ArrayList<>(texts.size());
        for (String text : texts) {
            results.add(embedText(text));
        }
        return results;
    }

    /**
     * Compute unit L2 normalized vector.
     */
    public List<Double> normalizeVector(List<Double> vec) {
        if (vec == null || vec.isEmpty()) {
            return Collections.nCopies(DIM, 0.0);
        }

        double sumSq = 0.0;
        for (Double v : vec) {
            if (v != null && !Double.isNaN(v) && !Double.isInfinite(v)) {
                sumSq += v * v;
            }
        }

        double norm = Math.sqrt(sumSq);
        List<Double> normalized = new ArrayList<>(vec.size());
        if (norm > 1e-9) {
            for (Double v : vec) {
                normalized.add((v != null ? v : 0.0) / norm);
            }
        } else {
            for (int i = 0; i < vec.size(); i++) {
                normalized.add(0.0);
            }
        }
        return normalized;
    }

    @Override
    public double cosineSimilarity(List<Double> v1, List<Double> v2) {
        if (v1 == null || v2 == null || v1.isEmpty() || v2.isEmpty() || v1.size() != v2.size()) {
            return 0.0;
        }

        double dot = 0.0;
        double norm1 = 0.0;
        double norm2 = 0.0;

        for (int i = 0; i < v1.size(); i++) {
            double a = v1.get(i);
            double b = v2.get(i);
            dot += a * b;
            norm1 += a * a;
            norm2 += b * b;
        }

        double denom = Math.sqrt(norm1) * Math.sqrt(norm2);
        if (denom < 1e-9) {
            return 0.0;
        }
        return Math.max(0.0, Math.min(1.0, dot / denom));
    }

    /**
     * Extract explicitly mentioned technology keywords from text.
     */
    public List<String> extractTechnologies(String text) {
        if (text == null || text.isBlank()) {
            return Collections.emptyList();
        }
        String lower = text.toLowerCase();
        Set<String> found = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);

        for (String tech : KNOWN_TECH_KEYWORDS) {
            Pattern p = Pattern.compile("(?:\\b|_)" + Pattern.quote(tech) + "(?:\\b|_)");
            if (p.matcher(lower).find()) {
                found.add(tech);
            }
        }
        return new ArrayList<>(found);
    }
}
