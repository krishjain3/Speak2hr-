package com.speak2hr;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.speak2hr.dto.RagGenerateQuestionsRequest;
import com.speak2hr.model.ResumeChunk;
import com.speak2hr.model.ResumeDocument;
import com.speak2hr.service.*;
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
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class RagGroundednessRegressionTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RagInterviewService ragInterviewService;

    @Autowired
    private LocalEmbeddingEngine embeddingEngine;

    @Autowired
    private RagPersistentStore persistentStore;

    @Autowired
    private GeminiService geminiService;

    @BeforeEach
    public void setup() {
        // Set deterministic semantic mock embedder for tests to avoid external API calls and charges
        embeddingEngine.setMockEmbedder(this::semanticTestEmbedder);
    }

    @AfterEach
    public void tearDown() {
        embeddingEngine.clearMockEmbedder();
        geminiService.clearMockContentGenerator();
    }

    /**
     * Deterministic test semantic embedder creating dense 768-dimensional normalized vectors
     * with known semantic clusters (Java/backend vs Python/ML vs Cloud/Go vs Fine arts).
     */
    private List<Double> semanticTestEmbedder(String text) {
        double[] vec = new double[LocalEmbeddingEngine.DIM];
        String lower = text.toLowerCase();

        // Cluster 1: Java / Spring / PostgreSQL / Backend
        if (lower.contains("java") || lower.contains("spring") || lower.contains("postgresql") || lower.contains("sql") || lower.contains("persistence") || lower.contains("relational") || lower.contains("transaction")) {
            for (int i = 0; i < 150; i++) vec[i] += 2.0;
        }

        // Cluster 2: Python / ML / TensorFlow / PyTorch / Analytics / Classification
        if (lower.contains("python") || lower.contains("tensorflow") || lower.contains("pytorch") || lower.contains("classifier") || lower.contains("analytics") || lower.contains("stream")) {
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

        // Generic token perturbation
        for (char c : lower.toCharArray()) {
            int idx = Math.abs((int) c * 31) % LocalEmbeddingEngine.DIM;
            vec[idx] += 0.05;
        }

        List<Double> list = new ArrayList<>(LocalEmbeddingEngine.DIM);
        for (double v : vec) list.add(v);
        return embeddingEngine.normalizeVector(list);
    }

    // ------------------------------------------------------------------------
    // TEST A — Two Different Resumes (Cross-Attribution Prevention)
    // ------------------------------------------------------------------------
    @Test
    public void testA_TwoDifferentResumes() throws Exception {
        // Resume A: Alice (Java, Spring Boot, PostgreSQL)
        String resumeA = "Alice Smith\n" +
                "alice@example.com\n" +
                "Skills: Java, Spring Boot, PostgreSQL\n" +
                "Projects:\n" +
                "Payment Engine: Transaction processing service built with Java, Spring Boot, and PostgreSQL.\n";

        MockMultipartFile fileA = new MockMultipartFile("file", "alice.txt", "text/plain", resumeA.getBytes(StandardCharsets.UTF_8));
        MvcResult resA = mockMvc.perform(multipart("/api/resume/upload-rag").file(fileA).param("candidate_id", "cand_alice_test_a"))
                .andExpect(status().isOk()).andReturn();
        String resumeIdA = (String) objectMapper.readValue(resA.getResponse().getContentAsString(), Map.class).get("resume_id");

        // Resume B: Bob (Python, TensorFlow, Image Classification)
        String resumeB = "Bob Miller\n" +
                "bob@example.com\n" +
                "Skills: Python, TensorFlow\n" +
                "Projects:\n" +
                "Image Classifier: Deep convolutional network for real-time image classification in Python and TensorFlow.\n";

        MockMultipartFile fileB = new MockMultipartFile("file", "bob.txt", "text/plain", resumeB.getBytes(StandardCharsets.UTF_8));
        MvcResult resB = mockMvc.perform(multipart("/api/resume/upload-rag").file(fileB).param("candidate_id", "cand_bob_test_a"))
                .andExpect(status().isOk()).andReturn();
        String resumeIdB = (String) objectMapper.readValue(resB.getResponse().getContentAsString(), Map.class).get("resume_id");

        // Generate for Alice
        RagGenerateQuestionsRequest reqA = new RagGenerateQuestionsRequest();
        reqA.setCandidate_id("cand_alice_test_a");
        reqA.setResume_id(resumeIdA);
        reqA.setRole("Backend Engineer");
        reqA.setNum_questions(3);

        MvcResult genA = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(reqA)))
                .andExpect(status().isOk()).andReturn();
        String textA = genA.getResponse().getContentAsString();

        // Generate for Bob
        RagGenerateQuestionsRequest reqB = new RagGenerateQuestionsRequest();
        reqB.setCandidate_id("cand_bob_test_a");
        reqB.setResume_id(resumeIdB);
        reqB.setRole("ML Engineer");
        reqB.setNum_questions(3);

        MvcResult genB = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(reqB)))
                .andExpect(status().isOk()).andReturn();
        String textB = genB.getResponse().getContentAsString();

        // Assert Alice's questions have Alice's technologies and NEVER Bob's
        assertTrue(textA.contains("Payment Engine") || textA.contains("Spring Boot") || textA.contains("Java"));
        assertFalse(textA.contains("Image Classifier"), "Alice's questions must not mention Bob's project");
        assertFalse(textA.contains("TensorFlow"), "Alice's questions must not mention Bob's TensorFlow skill");

        // Assert Bob's questions have Bob's technologies and NEVER Alice's
        assertTrue(textB.contains("Image Classifier") || textB.contains("TensorFlow") || textB.contains("Python"));
        assertFalse(textB.contains("Payment Engine"), "Bob's questions must not mention Alice's project");
        assertFalse(textB.contains("Spring Boot"), "Bob's questions must not mention Alice's Spring Boot skill");
    }

    // ------------------------------------------------------------------------
    // TEST B — Same Candidate, Two Resumes
    // ------------------------------------------------------------------------
    @Test
    public void testB_SameCandidateTwoResumes() throws Exception {
        String candidateId = "cand_multi_resume_same_user";

        // Upload Resume 1: Go & gRPC
        String resume1 = "Candidate Dual\nSkills: Go, gRPC\nProjects:\nGateway Router: High-performance reverse proxy in Go and gRPC.\n";
        MockMultipartFile file1 = new MockMultipartFile("file", "resume_v1.txt", "text/plain", resume1.getBytes(StandardCharsets.UTF_8));
        MvcResult res1 = mockMvc.perform(multipart("/api/resume/upload-rag").file(file1).param("candidate_id", candidateId))
                .andExpect(status().isOk()).andReturn();
        String resumeId1 = (String) objectMapper.readValue(res1.getResponse().getContentAsString(), Map.class).get("resume_id");

        // Upload Resume 2: Python & FastAPI
        String resume2 = "Candidate Dual\nSkills: Python, FastAPI\nProjects:\nAsync Ingestion: Real-time event receiver built using Python and FastAPI.\n";
        MockMultipartFile file2 = new MockMultipartFile("file", "resume_v2.txt", "text/plain", resume2.getBytes(StandardCharsets.UTF_8));
        MvcResult res2 = mockMvc.perform(multipart("/api/resume/upload-rag").file(file2).param("candidate_id", candidateId))
                .andExpect(status().isOk()).andReturn();
        String resumeId2 = (String) objectMapper.readValue(res2.getResponse().getContentAsString(), Map.class).get("resume_id");

        assertNotEquals(resumeId1, resumeId2, "Resumes must have distinct IDs");

        // Request questions specifying resumeId1
        RagGenerateQuestionsRequest req1 = new RagGenerateQuestionsRequest();
        req1.setCandidate_id(candidateId);
        req1.setResume_id(resumeId1);
        req1.setNum_questions(3);

        MvcResult genRes1 = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req1)))
                .andExpect(status().isOk()).andReturn();
        String text1 = genRes1.getResponse().getContentAsString();

        // Request questions specifying resumeId2
        RagGenerateQuestionsRequest req2 = new RagGenerateQuestionsRequest();
        req2.setCandidate_id(candidateId);
        req2.setResume_id(resumeId2);
        req2.setNum_questions(3);

        MvcResult genRes2 = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req2)))
                .andExpect(status().isOk()).andReturn();
        String text2 = genRes2.getResponse().getContentAsString();

        // Verification: resumeId1 produces Go questions, not FastAPI
        assertTrue(text1.contains("Gateway Router") || text1.contains("Go") || text1.contains("gRPC"));
        assertFalse(text1.contains("Async Ingestion"));
        assertFalse(text1.contains("FastAPI"));

        // Verification: resumeId2 produces FastAPI questions, not Go
        assertTrue(text2.contains("Async Ingestion") || text2.contains("FastAPI") || text2.contains("Python"));
        assertFalse(text2.contains("Gateway Router"));
        assertFalse(text2.contains("gRPC"));
    }

    // ------------------------------------------------------------------------
    // TEST C — Unsupported Implementation Claims (Redis Claim Rejected)
    // ------------------------------------------------------------------------
    @Test
    public void testC_UnsupportedImplementationClaims() {
        ResumeDocument doc = new ResumeDocument("res_c", "cand_c", "resume.txt", "hash_c",
                "David\nSkills: Java, Spring Boot, PostgreSQL\nProjects:\nOrder Portal: Web portal built using Java, Spring Boot, and PostgreSQL.");
        doc.setSkills(List.of("Java", "Spring Boot", "PostgreSQL"));

        ResumeChunk chunk = new ResumeChunk("chk_c", "res_c", "cand_c", 0, "project", "Project: Order Portal", "Order Portal",
                "Order Portal: Web portal built using Java, Spring Boot, and PostgreSQL.", List.of("Java", "Spring Boot", "PostgreSQL"),
                Collections.emptyList(), "gemini-text-embedding-004", "1.0");

        // Question falsely claims Redis caching was implemented in Order Portal
        RagInterviewService.QuestionItem invalidQuestion = new RagInterviewService.QuestionItem(
                "In Order Portal, how did you implement Redis caching to optimize database queries?",
                "Order Portal",
                "Web portal built using Java, Spring Boot, and PostgreSQL.",
                "project_deep_dive", "medium", List.of("Redis", "caching"), ""
        );

        StringBuilder rejectionReason = new StringBuilder();
        boolean isValid = ragInterviewService.validateQuestion(invalidQuestion, doc, List.of(chunk), rejectionReason);

        assertFalse(isValid, "Question attributing unmentioned Redis to Order Portal must be rejected");
        assertTrue(rejectionReason.toString().contains("redis") || rejectionReason.toString().contains("not attributed"),
                "Rejection reason must explicitly cite ungrounded technology: " + rejectionReason);
    }

    // ------------------------------------------------------------------------
    // TEST D — Wrong Project Attribution (Cross-Project Contamination)
    // ------------------------------------------------------------------------
    @Test
    public void testD_WrongProjectAttribution() {
        String resumeText = "Emma\nSkills: Java, Spring Boot, Python, Kafka\n" +
                "Projects:\n" +
                "Project Alpha: Order REST API built using Java and Spring Boot.\n" +
                "Project Beta: Real-time stream processor built using Python and Kafka.\n";

        ResumeDocument doc = new ResumeDocument("res_d", "cand_d", "resume.txt", "hash_d", resumeText);
        doc.setSkills(List.of("Java", "Spring Boot", "Python", "Kafka"));
        doc.setProjects(List.of(
                Map.of("name", "Project Alpha", "description", "Order REST API built using Java and Spring Boot."),
                Map.of("name", "Project Beta", "description", "Real-time stream processor built using Python and Kafka.")
        ));

        ResumeChunk chunkAlpha = new ResumeChunk("chk_d1", "res_d", "cand_d", 0, "project", "Project: Project Alpha", "Project Alpha",
                "Project Alpha: Order REST API built using Java and Spring Boot.", List.of("Java", "Spring Boot"),
                Collections.emptyList(), "gemini-text-embedding-004", "1.0");

        ResumeChunk chunkBeta = new ResumeChunk("chk_d2", "res_d", "cand_d", 1, "project", "Project: Project Beta", "Project Beta",
                "Project Beta: Real-time stream processor built using Python and Kafka.", List.of("Python", "Kafka"),
                Collections.emptyList(), "gemini-text-embedding-004", "1.0");

        // Question transfers Kafka from Project Beta to Project Alpha!
        RagInterviewService.QuestionItem crossContaminatedQ = new RagInterviewService.QuestionItem(
                "In Project Alpha, how did you configure the Kafka message consumer to handle data streams?",
                "Project Alpha",
                "Order REST API built using Java and Spring Boot.",
                "project_deep_dive", "medium", List.of("Kafka"), ""
        );

        StringBuilder rejectionReason = new StringBuilder();
        boolean isValid = ragInterviewService.validateQuestion(crossContaminatedQ, doc, List.of(chunkAlpha, chunkBeta), rejectionReason);

        assertFalse(isValid, "Question attributing Kafka to Project Alpha must be rejected");
        assertTrue(rejectionReason.toString().contains("kafka") || rejectionReason.toString().contains("falsely attributed"),
                "Rejection reason must flag cross-project contamination: " + rejectionReason);
    }

    // ------------------------------------------------------------------------
    // TEST E — Invalid Gemini Output (Malformed JSON, Missing Fields)
    // ------------------------------------------------------------------------
    @Test
    public void testE_InvalidGeminiOutput() throws Exception {
        String candId = "cand_invalid_gemini";
        String resume = "Frank\nSkills: Java, Docker\nProjects:\nDocker Service: Container deployment in Java and Docker.\n";
        MockMultipartFile file = new MockMultipartFile("file", "frank.txt", "text/plain", resume.getBytes(StandardCharsets.UTF_8));
        MvcResult uploadRes = mockMvc.perform(multipart("/api/resume/upload-rag").file(file).param("candidate_id", candId))
                .andExpect(status().isOk()).andReturn();
        String resumeId = (String) objectMapper.readValue(uploadRes.getResponse().getContentAsString(), Map.class).get("resume_id");

        // Case 1: Malformed JSON from Gemini
        geminiService.setMockContentGenerator(prompt -> "```json\n{ this is corrupted json [broken\n```");

        RagGenerateQuestionsRequest req = new RagGenerateQuestionsRequest();
        req.setCandidate_id(candId);
        req.setResume_id(resumeId);
        req.setNum_questions(2);

        // System must gracefully fallback to deterministic grounded questions without crashing
        MvcResult result = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk()).andReturn();

        Map<?, ?> resp = objectMapper.readValue(result.getResponse().getContentAsString(), Map.class);
        List<?> questions = (List<?>) resp.get("questions");
        assertFalse(questions.isEmpty(), "System must safely fallback to grounded questions when Gemini outputs invalid JSON");

        // Case 2: Gemini returns duplicate questions
        geminiService.setMockContentGenerator(prompt -> "```json\n[\n" +
                "  {\"question\": \"In Docker Service, how did you configure the Docker container?\", \"project_or_context\": \"Docker Service\", \"supporting_evidence\": \"Container deployment in Java and Docker.\", \"category\": \"technical\", \"difficulty\": \"medium\", \"expected_keywords\": [\"Docker\"]},\n" +
                "  {\"question\": \"In Docker Service, how did you configure the Docker container?\", \"project_or_context\": \"Docker Service\", \"supporting_evidence\": \"Container deployment in Java and Docker.\", \"category\": \"technical\", \"difficulty\": \"medium\", \"expected_keywords\": [\"Docker\"]}\n" +
                "]\n```");

        MvcResult dedupResult = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk()).andReturn();

        Map<?, ?> dedupResp = objectMapper.readValue(dedupResult.getResponse().getContentAsString(), Map.class);
        List<?> dedupQuestions = (List<?>) dedupResp.get("questions");
        assertEquals(1, dedupQuestions.size(), "Duplicate questions must be deduplicated to 1 question");
    }

    // ------------------------------------------------------------------------
    // TEST F — API Failure (Simulation of Rate Limit / Quota / Network Error)
    // ------------------------------------------------------------------------
    @Test
    public void testF_ApiFailure() {
        // Simulate Gemini API rate limit or quota exhaustion
        geminiService.setMockContentGenerator(prompt -> {
            throw new GeminiApiException("HTTP 429: Resource has been exhausted (quota exceeded)", 429);
        });

        // Verify that GeminiService throws explicit GeminiApiException rather than returning fake canned strings
        GeminiApiException ex = assertThrows(GeminiApiException.class, () -> {
            geminiService.generateContent("Evaluate this candidate answer");
        });

        assertEquals(429, ex.getStatusCode());
        assertTrue(ex.getMessage().contains("429") || ex.getMessage().contains("quota"));
    }

    // ------------------------------------------------------------------------
    // TEST G — Honest Verification Status (anti_hallucination_verified)
    // ------------------------------------------------------------------------
    @Test
    public void testG_HonestVerificationStatus() throws Exception {
        String candId = "cand_honest_verify";
        String resume = "Grace\nSkills: Python\nProjects:\nCLI Tool: Command line tool built in Python.\n";
        MockMultipartFile file = new MockMultipartFile("file", "grace.txt", "text/plain", resume.getBytes(StandardCharsets.UTF_8));
        MvcResult uploadRes = mockMvc.perform(multipart("/api/resume/upload-rag").file(file).param("candidate_id", candId))
                .andExpect(status().isOk()).andReturn();
        String resumeId = (String) objectMapper.readValue(uploadRes.getResponse().getContentAsString(), Map.class).get("resume_id");

        RagGenerateQuestionsRequest req = new RagGenerateQuestionsRequest();
        req.setCandidate_id(candId);
        req.setResume_id(resumeId);
        req.setNum_questions(2);

        MvcResult result = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk()).andReturn();

        Map<?, ?> resp = objectMapper.readValue(result.getResponse().getContentAsString(), Map.class);
        List<?> questions = (List<?>) resp.get("questions");
        assertFalse(questions.isEmpty());

        for (Object qObj : questions) {
            Map<?, ?> qMap = (Map<?, ?>) qObj;
            Map<?, ?> ragCtx = (Map<?, ?>) qMap.get("rag_context");
            assertNotNull(ragCtx);
            assertEquals(true, ragCtx.get("anti_hallucination_verified"), "Verified question must have anti_hallucination_verified = true");
            assertEquals("VERIFIED", ragCtx.get("validation_status"));
        }

        Map<?, ?> meta = (Map<?, ?>) resp.get("rag_metadata");
        assertEquals(true, meta.get("anti_hallucination_verified"));
    }

    // ------------------------------------------------------------------------
    // TEST H — Semantic Retrieval (Cosine Similarity in Vector Space)
    // ------------------------------------------------------------------------
    @Test
    public void testH_SemanticRetrieval() {
        // Query about database storage
        String query = "PostgreSQL relational persistence storage";

        // Passage 1 uses semantically related wording without exact token overlap
        String passage1 = "Transaction processing and relational table schema with SQL persistence.";

        // Passage 2 is completely unrelated in domain
        String passage2 = "Watercolor portrait sketching and fine arts exhibition.";

        List<Double> qVec = embeddingEngine.embedText(query);
        List<Double> p1Vec = embeddingEngine.embedText(passage1);
        List<Double> p2Vec = embeddingEngine.embedText(passage2);

        assertEquals(LocalEmbeddingEngine.DIM, qVec.size());
        assertEquals(LocalEmbeddingEngine.DIM, p1Vec.size());
        assertEquals(LocalEmbeddingEngine.DIM, p2Vec.size());

        double simRelated = embeddingEngine.cosineSimilarity(qVec, p1Vec);
        double simUnrelated = embeddingEngine.cosineSimilarity(qVec, p2Vec);

        assertTrue(simRelated > simUnrelated,
                "Semantically related passage must have significantly higher similarity (" + simRelated + ") than unrelated (" + simUnrelated + ")");
        assertTrue(simRelated > 0.60, "Related semantic similarity should be strong");
        assertTrue(simUnrelated < 0.35, "Unrelated semantic similarity should be low");
    }
}
