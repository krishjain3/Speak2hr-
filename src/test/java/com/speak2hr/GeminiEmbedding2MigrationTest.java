package com.speak2hr;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.speak2hr.model.ResumeChunk;
import com.speak2hr.model.ResumeDocument;
import com.speak2hr.service.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
public class GeminiEmbedding2MigrationTest {

    @Autowired
    private LocalEmbeddingEngine embeddingEngine;

    @Autowired
    private RagResumeService ragResumeService;

    @Autowired
    private RagPersistentStore persistentStore;

    @Autowired
    private GeminiService geminiService;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    public void setup() {
        embeddingEngine.setMockEmbedder(this::mockGeminiEmbedding2);
    }

    @AfterEach
    public void tearDown() {
        embeddingEngine.clearMockEmbedder();
        geminiService.clearMockContentGenerator();
    }

    /**
     * Mock embedder producing 3072-dimensional normalized vectors matching gemini-embedding-2.
     */
    private List<Double> mockGeminiEmbedding2(String text) {
        double[] vec = new double[LocalEmbeddingEngine.DIM];
        String lower = text != null ? text.toLowerCase() : "";

        if (lower.contains("java") || lower.contains("spring") || lower.contains("postgresql")) {
            for (int i = 0; i < 500; i++) vec[i] += 2.0;
        }
        if (lower.contains("python") || lower.contains("fastapi") || lower.contains("ml")) {
            for (int i = 500; i < 1000; i++) vec[i] += 2.0;
        }

        for (char c : lower.toCharArray()) {
            int idx = Math.abs((int) c * 31) % LocalEmbeddingEngine.DIM;
            vec[idx] += 0.05;
        }

        List<Double> list = new ArrayList<>(LocalEmbeddingEngine.DIM);
        for (double v : vec) list.add(v);
        return embeddingEngine.normalizeVector(list);
    }

    // ------------------------------------------------------------------------
    // 1. Model Configuration & Dimensions
    // ------------------------------------------------------------------------
    @Test
    public void testModelIdentifierAndDimensions() {
        assertEquals("gemini-embedding-2", embeddingEngine.getModelIdentifier());
        assertEquals("2.0", embeddingEngine.getModelVersion());
        assertEquals(3072, embeddingEngine.getDimension());
        assertEquals(3072, LocalEmbeddingEngine.DIM);

        List<Double> vec = embeddingEngine.embedText("Cloud native architecture");
        assertNotNull(vec);
        assertEquals(3072, vec.size(), "Output vector dimension must strictly be 3072");

        // Verify L2 normalization: sum of squares should be ~ 1.0
        double sumSq = 0.0;
        for (double v : vec) sumSq += v * v;
        assertEquals(1.0, sumSq, 1e-4, "Vector must be unit L2 normalized");
    }

    // ------------------------------------------------------------------------
    // 2. Embedding Response Parsing (Single & Batch JSON formats)
    // ------------------------------------------------------------------------
    @Test
    public void testResponseParsingSingleAndBatch() {
        // Standard single embedContent format
        List<Double> testValues = new ArrayList<>(Collections.nCopies(3072, 0.0125));
        Map<String, Object> singleResponse = Map.of(
                "embedding", Map.of("values", testValues)
        );
        String singleJson;
        try {
            singleJson = objectMapper.writeValueAsString(singleResponse);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        List<Double> parsedSingle = embeddingEngine.parseEmbeddingResponse(singleJson);
        assertNotNull(parsedSingle);
        assertEquals(3072, parsedSingle.size());
        assertEquals(0.0125, parsedSingle.get(0), 1e-6);

        // Batch embedContent format
        Map<String, Object> batchResponse = Map.of(
                "embeddings", List.of(Map.of("values", testValues))
        );
        String batchJson;
        try {
            batchJson = objectMapper.writeValueAsString(batchResponse);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        List<Double> parsedBatch = embeddingEngine.parseEmbeddingResponse(batchJson);
        assertNotNull(parsedBatch);
        assertEquals(3072, parsedBatch.size());
    }

    // ------------------------------------------------------------------------
    // 3. Incompatible Vectors & Cosine Similarity Safeguards
    // ------------------------------------------------------------------------
    @Test
    public void testCompatibilityCheckAndCosineSimilaritySafeguards() {
        // Old model: text-embedding-004 (768 dimensions)
        assertFalse(embeddingEngine.isCompatible("gemini-text-embedding-004", "1.0", 768),
                "Old text-embedding-004 model must be rejected as incompatible");
        assertFalse(embeddingEngine.isCompatible("models/text-embedding-004", "1.0", 768));
        assertFalse(embeddingEngine.isCompatible("gemini-embedding-2", "2.0", 768),
                "Mismatched dimensions (768 vs 3072) must be rejected");

        // Current model: gemini-embedding-2 (3072 dimensions)
        assertTrue(embeddingEngine.isCompatible("gemini-embedding-2", "2.0", 3072));
        assertTrue(embeddingEngine.isCompatible("models/gemini-embedding-2", "2.0", 3072));

        // Cosine similarity safety:
        // Attempting to compare an old 768-dim vector with a 3072-dim vector
        List<Double> old768Vec = Collections.nCopies(768, 0.05);
        List<Double> new3072Vec = Collections.nCopies(3072, 0.02);

        double crossSim = embeddingEngine.cosineSimilarity(old768Vec, new3072Vec);
        assertEquals(0.0, crossSim, "Cosine similarity between vectors of different dimensions must return 0.0");

        double oldWithOld = embeddingEngine.cosineSimilarity(old768Vec, old768Vec);
        assertEquals(0.0, oldWithOld, "Vectors not matching engine's 3072 dimension must return 0.0");

        // Compatible 3072 vectors
        List<Double> vA = embeddingEngine.embedText("Spring Boot and PostgreSQL microservices");
        List<Double> vB = embeddingEngine.embedText("Spring Boot and PostgreSQL database transactions");
        double validSim = embeddingEngine.cosineSimilarity(vA, vB);
        assertTrue(validSim > 0.8, "Compatible vectors must produce valid cosine similarity");
    }

    // ------------------------------------------------------------------------
    // 4. Safe Re-Embedding Migration of Stored Resumes
    // ------------------------------------------------------------------------
    @Test
    public void testReembedOutdatedResumeChunks() {
        String testCand = "cand_migration_test";
        String resumeId = "res_outdated_old";
        String text = "Senior Java Engineer with Spring Boot and PostgreSQL expertise.";

        ResumeDocument oldDoc = new ResumeDocument(resumeId, testCand, "resume.txt", "hash_old", text);
        oldDoc.setEmbeddingModel("gemini-text-embedding-004");
        oldDoc.setEmbeddingVersion("1.0");
        oldDoc.setEmbeddingDim(768);
        oldDoc.setSkills(List.of("Java", "Spring Boot"));
        persistentStore.saveResume(oldDoc);

        // Store chunk with old 768-dim embedding
        ResumeChunk oldChunk = new ResumeChunk(
                "chk_old_1", resumeId, testCand, 0, "project", "Project Overview",
                "Payment Microservice",
                "Built microservice using Spring Boot and PostgreSQL",
                List.of("Java", "Spring Boot"),
                Collections.nCopies(768, 0.02),
                "gemini-text-embedding-004", "1.0", 768
        );
        persistentStore.saveChunks(resumeId, List.of(oldChunk));

        // Verify initial stored state is outdated
        List<ResumeChunk> storedBefore = persistentStore.getChunks(resumeId, testCand);
        assertEquals(768, storedBefore.get(0).getEmbeddingDim());
        assertEquals("gemini-text-embedding-004", storedBefore.get(0).getEmbeddingModel());

        // Perform migration
        List<ResumeChunk> migrated = ragResumeService.getChunksAndMigrateIfOutdated(resumeId, testCand);
        assertNotNull(migrated);
        assertEquals(1, migrated.size());

        ResumeChunk newChunk = migrated.get(0);
        assertEquals("gemini-embedding-2", newChunk.getEmbeddingModel(), "Model must be updated to gemini-embedding-2");
        assertEquals("2.0", newChunk.getEmbeddingVersion());
        assertEquals(3072, newChunk.getEmbeddingDim(), "Dimension must be updated to 3072");
        assertEquals(3072, newChunk.getEmbedding().size(), "Embedding vector size must be 3072");

        // Verify document in store was updated
        ResumeDocument updatedDoc = persistentStore.getResume(resumeId, testCand);
        assertEquals("gemini-embedding-2", updatedDoc.getEmbeddingModel());
        assertEquals("2.0", updatedDoc.getEmbeddingVersion());
        assertEquals(3072, updatedDoc.getEmbeddingDim());
    }

    // ------------------------------------------------------------------------
    // 5. Migration Failure Safety: Preserves Original Data Without Corrupting
    // ------------------------------------------------------------------------
    @Test
    public void testMigrationFailurePreservesOriginalData() {
        String testCand = "cand_safe_failure_test";
        String resumeId = "res_fail_safe";
        String text = "DevOps Engineer with Kubernetes and Terraform experience.";

        ResumeDocument doc = new ResumeDocument(resumeId, testCand, "resume.txt", "hash_fail_safe", text);
        doc.setEmbeddingModel("gemini-text-embedding-004");
        doc.setEmbeddingVersion("1.0");
        doc.setEmbeddingDim(768);
        persistentStore.saveResume(doc);

        ResumeChunk chunk = new ResumeChunk(
                "chk_safe_1", resumeId, testCand, 0, "experience", "DevOps Experience",
                "Cloud Infrastructure",
                "Managed Kubernetes clusters and Terraform infrastructure",
                List.of("Kubernetes", "Terraform"),
                Collections.nCopies(768, 0.03),
                "gemini-text-embedding-004", "1.0", 768
        );
        persistentStore.saveChunks(resumeId, List.of(chunk));

        // Configure mock embedder to throw failure
        embeddingEngine.setMockEmbedder(t -> {
            throw new EmbeddingException("Simulated API quota exceeded during migration");
        });

        // Migration must throw EmbeddingException
        assertThrows(EmbeddingException.class, () -> {
            ragResumeService.getChunksAndMigrateIfOutdated(resumeId, testCand);
        });

        // CRITICAL CHECK: Original chunks and resume document must remain completely intact!
        List<ResumeChunk> preservedChunks = persistentStore.getChunks(resumeId, testCand);
        assertFalse(preservedChunks.isEmpty(), "Original chunks must NOT be deleted on migration failure");
        assertEquals(768, preservedChunks.get(0).getEmbeddingDim(), "Original chunks must retain original dimension");
        assertEquals("gemini-text-embedding-004", preservedChunks.get(0).getEmbeddingModel());

        ResumeDocument preservedDoc = persistentStore.getResume(resumeId, testCand);
        assertEquals("gemini-text-embedding-004", preservedDoc.getEmbeddingModel(),
                "Document must retain original model when migration fails");
    }

    // ------------------------------------------------------------------------
    // 6. Persistence Across Restarts with New Embeddings
    // ------------------------------------------------------------------------
    @Test
    public void testPersistenceAcrossRestartsWithNewEmbeddings() {
        String testCand = "cand_restart_test";
        String resumeId = "res_restart_3072";

        ResumeDocument doc = new ResumeDocument(resumeId, testCand, "resume.txt", "hash_restart", "Resume Content");
        doc.setEmbeddingModel("gemini-embedding-2");
        doc.setEmbeddingVersion("2.0");
        doc.setEmbeddingDim(3072);
        persistentStore.saveResume(doc);

        List<Double> vec = embeddingEngine.embedText("Full Stack Developer");
        ResumeChunk chunk = new ResumeChunk(
                "chk_rest_1", resumeId, testCand, 0, "project", "Projects",
                "React Portal",
                "Full Stack Developer building React and Spring Boot apps",
                List.of("React", "Spring Boot"), vec,
                "gemini-embedding-2", "2.0", 3072
        );
        persistentStore.saveChunks(resumeId, List.of(chunk));

        // Re-read from store simulating backend restart
        ResumeDocument loadedDoc = persistentStore.getResume(resumeId, testCand);
        assertNotNull(loadedDoc);
        assertEquals(3072, loadedDoc.getEmbeddingDim());

        List<ResumeChunk> loadedChunks = persistentStore.getChunks(resumeId, testCand);
        assertEquals(1, loadedChunks.size());
        assertEquals(3072, loadedChunks.get(0).getEmbedding().size());
        assertEquals("gemini-embedding-2", loadedChunks.get(0).getEmbeddingModel());
    }

    // ------------------------------------------------------------------------
    // 7. API Failure Handling: No Fallback to Hash/Random Vectors
    // ------------------------------------------------------------------------
    @Test
    public void testApiFailureDoesNotReturnFabricatedVectors() {
        embeddingEngine.clearMockEmbedder();

        // When no mock is active and no key is configured in tests, embedding throws EmbeddingException
        assertThrows(EmbeddingException.class, () -> {
            embeddingEngine.embedText("Should fail when no API keys are configured");
        }, "Must throw EmbeddingException on API error without falling back to random/hashed vectors");
    }
}
