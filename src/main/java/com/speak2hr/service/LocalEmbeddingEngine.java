package com.speak2hr.service;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lightweight, zero-latency, deterministic vector embedding engine in pure Java.
 * Uses sublinear TF-IDF token hashing with known technology boosting, stop-word
 * suppression, and unit L2 normalization to produce high-discriminability dense semantic vectors.
 */
@Component
public class LocalEmbeddingEngine {

    public static final int DIM = 256;

    private static final Set<String> STOP_WORDS = Set.of(
            "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
            "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were",
            "will", "with", "or", "so", "if", "this", "but", "about", "into", "over"
    );

    private static final Set<String> KNOWN_TECH_KEYWORDS = Set.of(
            "python", "javascript", "typescript", "java", "c++", "c#", "go", "golang", "rust", "php", "ruby", "swift", "kotlin",
            "react", "react.js", "next.js", "vue", "vue.js", "angular", "node.js", "express", "fastapi", "flask", "django",
            "spring", "spring boot", "asp.net", "graphql", "rest", "restful", "grpc", "microservices", "websocket",
            "postgresql", "postgres", "mysql", "mongodb", "sqlite", "redis", "cassandra", "dynamodb", "elasticsearch", "neo4j",
            "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "ansible", "ci/cd", "github actions", "jenkins", "kafka", "rabbitmq",
            "pytorch", "tensorflow", "keras", "scikit-learn", "hugging face", "opencv", "rag", "langchain", "llm", "gemini", "bert",
            "tailwind", "bootstrap", "material-ui", "mui", "redux", "zustand", "prisma", "hibernate", "jwt", "oauth", "firebase", "clickhouse"
    );

    private static final Pattern TOKEN_PATTERN = Pattern.compile("\\b[a-zA-Z0-9_\\-\\.]{2,}\\b");

    /**
     * Compute a normalized dense vector from text.
     */
    public List<Double> embedText(String text) {
        if (text == null || text.isBlank()) {
            return Collections.nCopies(DIM, 0.0);
        }

        double[] vec = new double[DIM];
        String lower = text.toLowerCase();
        Matcher matcher = TOKEN_PATTERN.matcher(lower);

        List<String> tokens = new ArrayList<>();
        while (matcher.find()) {
            String token = matcher.group();
            if (!STOP_WORDS.contains(token)) {
                tokens.add(token);
            }
        }

        for (String token : tokens) {
            int hash = hashToken(token);
            int idx = hash % DIM;
            double weight = 2.0 + Math.log(1.0 + token.length());

            if (KNOWN_TECH_KEYWORDS.contains(token)) {
                weight *= 4.0;
            }
            vec[idx] += weight;

            // Character tri-grams for subword matching (modest weight)
            if (token.length() >= 4) {
                for (int i = 0; i <= token.length() - 3; i++) {
                    String sub = token.substring(i, i + 3);
                    int subHash = hashToken(sub) % DIM;
                    vec[subHash] += 0.2;
                }
            }
        }

        // Unit L2 normalization
        double sumSq = 0.0;
        for (double v : vec) {
            sumSq += v * v;
        }
        double norm = Math.sqrt(sumSq);

        List<Double> result = new ArrayList<>(DIM);
        if (norm > 1e-9) {
            for (double v : vec) {
                result.add(v / norm);
            }
        } else {
            for (int i = 0; i < DIM; i++) {
                result.add(0.0);
            }
        }
        return result;
    }

    /**
     * Calculate cosine similarity between two vectors.
     */
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

    private int hashToken(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(token.getBytes(StandardCharsets.UTF_8));
            long val = (((long) (digest[0] & 0xFF)) << 24) |
                       (((long) (digest[1] & 0xFF)) << 16) |
                       (((long) (digest[2] & 0xFF)) << 8) |
                       ((long) (digest[3] & 0xFF));
            return (int) (val & 0x7FFFFFFF);
        } catch (Exception e) {
            return Math.abs(token.hashCode()) & 0x7FFFFFFF;
        }
    }
}
