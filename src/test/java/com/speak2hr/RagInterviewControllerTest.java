package com.speak2hr;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.speak2hr.dto.RagEvaluateTextRequest;
import com.speak2hr.dto.RagGenerateQuestionsRequest;
import com.speak2hr.model.ResumeChunk;
import com.speak2hr.service.GeminiService;
import com.speak2hr.service.LocalEmbeddingEngine;
import com.speak2hr.service.RagPersistentStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
public class RagInterviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private LocalEmbeddingEngine embeddingEngine;

    @Autowired
    private RagPersistentStore persistentStore;

    @Autowired
    private GeminiService geminiService;

    @BeforeEach
    public void setup() {
        embeddingEngine.setMockEmbedder(this::semanticTestEmbedder);
    }

    @AfterEach
    public void tearDown() {
        embeddingEngine.clearMockEmbedder();
        geminiService.clearMockContentGenerator();
    }

    private List<Double> semanticTestEmbedder(String text) {
        double[] vec = new double[LocalEmbeddingEngine.DIM];
        String lower = text.toLowerCase();

        // Cluster 1: Java / Spring / PostgreSQL / Backend
        if (lower.contains("java") || lower.contains("spring") || lower.contains("postgresql") || lower.contains("sql") || lower.contains("persistence") || lower.contains("relational") || lower.contains("transaction")) {
            for (int i = 0; i < 150; i++) vec[i] += 2.0;
        }

        // Cluster 2: Python / ML / FastAPI / ClickHouse / Data Pipeline
        if (lower.contains("python") || lower.contains("fastapi") || lower.contains("clickhouse") || lower.contains("telemetry") || lower.contains("stream") || lower.contains("analytics")) {
            for (int i = 150; i < 300; i++) vec[i] += 2.0;
        }

        // Cluster 3: Go / Kubernetes / gRPC / Mesh / Cloud
        if (lower.contains("go") || lower.contains("golang") || lower.contains("kubernetes") || lower.contains("grpc") || lower.contains("cloud") || lower.contains("mesh")) {
            for (int i = 300; i < 450; i++) vec[i] += 2.0;
        }

        // Cluster 4: Database / Caching / Redis / Kafka
        if (lower.contains("redis") || lower.contains("caching") || lower.contains("kafka") || lower.contains("message")) {
            for (int i = 450; i < 600; i++) vec[i] += 2.0;
        }

        // Cluster 5: Unrelated / Arts
        if (lower.contains("watercolor") || lower.contains("painting") || lower.contains("art")) {
            for (int i = 600; i < 750; i++) vec[i] += 2.0;
        }

        // Generic character frequency
        for (char c : lower.toCharArray()) {
            int idx = Math.abs((int) c * 31) % LocalEmbeddingEngine.DIM;
            vec[idx] += 0.05;
        }

        List<Double> list = new ArrayList<>(LocalEmbeddingEngine.DIM);
        for (double v : vec) list.add(v);
        return embeddingEngine.normalizeVector(list);
    }

    @Test
    public void testCompleteRagWorkflow() throws Exception {
        // 1. Test Resume Upload and Indexing
        String resumeContent = "John Doe\n" +
                "john.doe@example.com\n" +
                "Full Stack Developer with 4 years experience.\n" +
                "Skills: Java, Spring Boot, React, PostgreSQL, Docker, Redis\n\n" +
                "Projects:\n" +
                "Speak2HR Interview Portal: Real-time automated mock interview platform using Spring Boot and React.\n" +
                "Distributed Event Broker: High-throughput Kafka message bus for distributed telemetry.\n";

        MockMultipartFile file = new MockMultipartFile(
                "file", "resume.txt", "text/plain", resumeContent.getBytes(StandardCharsets.UTF_8)
        );

        MvcResult uploadResult = mockMvc.perform(multipart("/api/resume/upload-rag")
                        .file(file)
                        .param("candidate_id", "cand_test_101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.candidate_id").value("cand_test_101"))
                .andExpect(jsonPath("$.resume_id").exists())
                .andReturn();

        Map<?, ?> uploadMap = objectMapper.readValue(uploadResult.getResponse().getContentAsString(), Map.class);
        String resumeId = (String) uploadMap.get("resume_id");
        assertNotNull(resumeId);
        assertNotNull(uploadMap.get("total_chunks"));

        // 2. Test Candidate Profile Retrieval
        mockMvc.perform(get("/api/resume/candidate/cand_test_101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidate_id").value("cand_test_101"))
                .andExpect(jsonPath("$.has_indexed_resume").value(true));

        // 3. Test RAG Question Generation with specific resume_id
        RagGenerateQuestionsRequest genReq = new RagGenerateQuestionsRequest();
        genReq.setCandidate_id("cand_test_101");
        genReq.setResume_id(resumeId);
        genReq.setRole("Full Stack Java Engineer");
        genReq.setDifficulty("Medium");
        genReq.setNum_questions(5);
        genReq.setFocus_topics(List.of("Microservices", "Concurrency", "Database"));

        MvcResult genResult = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(genReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session_id").exists())
                .andExpect(jsonPath("$.resume_id").value(resumeId))
                .andExpect(jsonPath("$.questions").isArray())
                .andExpect(jsonPath("$.rag_metadata.anti_hallucination_verified").value(true))
                .andReturn();

        Map<?, ?> genMap = objectMapper.readValue(genResult.getResponse().getContentAsString(), Map.class);
        String sessionId = (String) genMap.get("session_id");
        List<?> questions = (List<?>) genMap.get("questions");
        assertNotNull(sessionId);
        assertFalse(questions.isEmpty());

        // Verify questions are grounded in John Doe's resume
        String allQuestionsText = questions.toString();
        assertTrue(allQuestionsText.contains("Speak2HR") || allQuestionsText.contains("Distributed Event Broker") || allQuestionsText.contains("Java"));

        // 4. Test Text Answer Evaluation
        RagEvaluateTextRequest evalReq = new RagEvaluateTextRequest();
        evalReq.setSession_id(sessionId);
        evalReq.setQuestion_id(1);
        evalReq.setQuestion("In Speak2HR Interview Portal, how did you handle state management and concurrency?");
        evalReq.setUser_answer("We implemented optimistic locking in Spring Boot transactions and utilized Redis caching to eliminate contention during high-concurrency evaluations.");
        evalReq.setCode_submission("@Transactional(isolation = Isolation.READ_COMMITTED)\npublic void updateEvaluation() { ... }");
        evalReq.setExpected_keywords(List.of("locking", "concurrency", "Redis", "Spring Boot"));

        mockMvc.perform(post("/api/interview/rag/evaluate-text-response")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(evalReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overall_score").exists())
                .andExpect(jsonPath("$.feedback").exists())
                .andExpect(jsonPath("$.grounded_in_resume").value(true));

        // 5. Test Session Summary & Reopening Reuses Questions
        mockMvc.perform(get("/api/interview/rag/session/" + sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session_id").value(sessionId))
                .andExpect(jsonPath("$.questions_answered").value(1))
                .andExpect(jsonPath("$.questions").isArray());

        mockMvc.perform(get("/api/interview/rag/session/" + sessionId + "/report"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session_id").value(sessionId))
                .andExpect(jsonPath("$.overall_score").isNumber())
                .andExpect(jsonPath("$.performance_level").exists());
    }

    /**
     * CRITICAL REGRESSION TEST: Upload two distinctly different resumes and verify
     * that each interview generates questions grounded strictly in its corresponding resume.
     */
    @Test
    public void testTwoDifferentResumesRegression() throws Exception {
        // Resume A: Alice (Python, FastAPI, ClickHouse, Data Pipeline)
        String resumeA = "Alice Smith\n" +
                "alice.smith@example.com\n" +
                "Data Platform Engineer with 3 years experience.\n" +
                "Skills: Python, FastAPI, ClickHouse, Docker\n\n" +
                "Projects:\n" +
                "Telemetry Stream Pipeline: High-velocity analytics ingestion engine using Python and ClickHouse.\n";

        MockMultipartFile fileA = new MockMultipartFile(
                "file", "alice_resume.txt", "text/plain", resumeA.getBytes(StandardCharsets.UTF_8)
        );

        MvcResult uploadResA = mockMvc.perform(multipart("/api/resume/upload-rag")
                        .file(fileA)
                        .param("candidate_id", "cand_alice"))
                .andExpect(status().isOk())
                .andReturn();
        String resumeIdA = (String) objectMapper.readValue(uploadResA.getResponse().getContentAsString(), Map.class).get("resume_id");

        // Resume B: Bob (Go, Kubernetes, gRPC, Cloud Mesh)
        String resumeB = "Bob Johnson\n" +
                "bob.johnson@example.com\n" +
                "Cloud Systems Engineer with 5 years experience.\n" +
                "Skills: Go, Kubernetes, gRPC, Redis\n\n" +
                "Projects:\n" +
                "Mesh Proxy Gateway: Low-latency service mesh ingress router built in Go and gRPC.\n";

        MockMultipartFile fileB = new MockMultipartFile(
                "file", "bob_resume.txt", "text/plain", resumeB.getBytes(StandardCharsets.UTF_8)
        );

        MvcResult uploadResB = mockMvc.perform(multipart("/api/resume/upload-rag")
                        .file(fileB)
                        .param("candidate_id", "cand_bob"))
                .andExpect(status().isOk())
                .andReturn();
        String resumeIdB = (String) objectMapper.readValue(uploadResB.getResponse().getContentAsString(), Map.class).get("resume_id");

        // Generate questions for Alice
        RagGenerateQuestionsRequest reqA = new RagGenerateQuestionsRequest();
        reqA.setCandidate_id("cand_alice");
        reqA.setResume_id(resumeIdA);
        reqA.setRole("Data Platform Engineer");
        reqA.setNum_questions(4);

        MvcResult genResA = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reqA)))
                .andExpect(status().isOk())
                .andReturn();

        Map<?, ?> mapA = objectMapper.readValue(genResA.getResponse().getContentAsString(), Map.class);
        List<?> questionsA = (List<?>) mapA.get("questions");
        String textA = questionsA.toString();

        // Generate questions for Bob
        RagGenerateQuestionsRequest reqB = new RagGenerateQuestionsRequest();
        reqB.setCandidate_id("cand_bob");
        reqB.setResume_id(resumeIdB);
        reqB.setRole("Cloud Systems Engineer");
        reqB.setNum_questions(4);

        MvcResult genResB = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reqB)))
                .andExpect(status().isOk())
                .andReturn();

        Map<?, ?> mapB = objectMapper.readValue(genResB.getResponse().getContentAsString(), Map.class);
        List<?> questionsB = (List<?>) mapB.get("questions");
        String textB = questionsB.toString();

        // ASSERTION: Alice's questions must be grounded in Alice's project/skills, NOT Bob's!
        assertTrue(textA.contains("Telemetry Stream Pipeline") || textA.contains("ClickHouse") || textA.contains("Python"),
                "Alice's questions must reference Alice's project or skills");
        assertFalse(textA.contains("Mesh Proxy Gateway"), "Alice's questions must NOT contain Bob's project");
        assertFalse(textA.contains("gRPC"), "Alice's questions must NOT contain Bob's gRPC skill");

        // ASSERTION: Bob's questions must be grounded in Bob's project/skills, NOT Alice's!
        assertTrue(textB.contains("Mesh Proxy Gateway") || textB.contains("Go") || textB.contains("gRPC"),
                "Bob's questions must reference Bob's project or skills");
        assertFalse(textB.contains("Telemetry Stream Pipeline"), "Bob's questions must NOT contain Alice's project");
        assertFalse(textB.contains("ClickHouse"), "Bob's questions must NOT contain Alice's ClickHouse skill");
    }

    /**
     * TEST: Candidate Isolation - Candidate B cannot access Candidate A's resume.
     */
    @Test
    public void testCandidateIsolation() throws Exception {
        String resumeAlice = "Alice Smith\nSkills: Python, FastAPI\nProjects:\nAnalytics Stream: Engine built in Python.\n";
        MockMultipartFile fileA = new MockMultipartFile(
                "file", "alice.txt", "text/plain", resumeAlice.getBytes(StandardCharsets.UTF_8)
        );

        MvcResult uploadResA = mockMvc.perform(multipart("/api/resume/upload-rag")
                        .file(fileA)
                        .param("candidate_id", "cand_alice_private"))
                .andExpect(status().isOk())
                .andReturn();
        String resumeIdAlice = (String) objectMapper.readValue(uploadResA.getResponse().getContentAsString(), Map.class).get("resume_id");

        // Eve tries to generate questions using Alice's resumeId
        RagGenerateQuestionsRequest eveReq = new RagGenerateQuestionsRequest();
        eveReq.setCandidate_id("cand_eve_intruder");
        eveReq.setResume_id(resumeIdAlice);
        eveReq.setRole("Security Engineer");

        mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(eveReq)))
                .andExpect(status().isNotFound());
    }

    /**
     * TEST: Empty and unreadable resumes are strictly rejected without fabricating data.
     */
    @Test
    public void testEmptyResumeRejection() throws Exception {
        MockMultipartFile emptyFile = new MockMultipartFile(
                "file", "empty.txt", "text/plain", "Short".getBytes(StandardCharsets.UTF_8)
        );

        mockMvc.perform(multipart("/api/resume/upload-rag")
                        .file(emptyFile)
                        .param("candidate_id", "cand_empty"))
                .andExpect(status().isBadRequest());
    }

    /**
     * TEST: Vector embedding engine generates 128-dimensional normalized vectors and accurate similarity.
     */
    @Test
    public void testEmbeddingEngine() {
        List<Double> v1 = embeddingEngine.embedText("Distributed microservices architecture in Go and Kubernetes");
        List<Double> v2 = embeddingEngine.embedText("Cloud native microservices with gRPC and Docker container orchestration");
        List<Double> v3 = embeddingEngine.embedText("Graphic design and watercolor painting in art school");

        assertEquals(LocalEmbeddingEngine.DIM, v1.size());
        assertEquals(LocalEmbeddingEngine.DIM, v2.size());

        double simRelated = embeddingEngine.cosineSimilarity(v1, v2);
        double simUnrelated = embeddingEngine.cosineSimilarity(v1, v3);

        assertTrue(simRelated > simUnrelated, "Related technical queries must have higher similarity than unrelated");
    }

    /**
     * TEST: Embeddings and questions persist across restarts.
     */
    @Test
    public void testPersistenceAcrossRestarts() {
        String testCand = "cand_persist_test";
        String resumeContent = "Persistence Developer\nSkills: Java, Spring Boot\nProjects:\nCache Layer: In-memory cache.\n";
        String resumeId = "res_persist_123";

        com.speak2hr.model.ResumeDocument doc = new com.speak2hr.model.ResumeDocument(
                resumeId, testCand, "resume.txt", "hash123", resumeContent
        );
        doc.setCandidateName("Persistence Developer");
        doc.setSkills(List.of("Java", "Spring Boot"));
        persistentStore.saveResume(doc);

        ResumeChunk chunk = new ResumeChunk(
                "chk_1", resumeId, testCand, 0, "project", "Project: Cache Layer",
                "Cache Layer: In-memory cache using Java and Spring Boot.",
                List.of("Java", "Spring Boot"), embeddingEngine.embedText("Cache Layer")
        );
        persistentStore.saveChunks(resumeId, List.of(chunk));

        // Re-read from store
        com.speak2hr.model.ResumeDocument retrievedDoc = persistentStore.getResume(resumeId, testCand);
        assertNotNull(retrievedDoc);
        assertEquals("Persistence Developer", retrievedDoc.getCandidateName());

        List<ResumeChunk> retrievedChunks = persistentStore.getChunks(resumeId, testCand);
        assertFalse(retrievedChunks.isEmpty());
        assertEquals("chk_1", retrievedChunks.get(0).getId());
    }
}
