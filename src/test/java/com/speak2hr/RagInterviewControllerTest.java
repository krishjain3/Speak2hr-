package com.speak2hr;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.speak2hr.dto.RagEvaluateTextRequest;
import com.speak2hr.dto.RagGenerateQuestionsRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
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
                .andReturn();

        Map<?, ?> uploadMap = objectMapper.readValue(uploadResult.getResponse().getContentAsString(), Map.class);
        assertNotNull(uploadMap.get("total_chunks"));

        // 2. Test Candidate Profile Retrieval
        mockMvc.perform(get("/api/resume/candidate/cand_test_101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidate_id").value("cand_test_101"))
                .andExpect(jsonPath("$.has_indexed_resume").value(true));

        // 3. Test RAG Question Generation
        RagGenerateQuestionsRequest genReq = new RagGenerateQuestionsRequest();
        genReq.setCandidate_id("cand_test_101");
        genReq.setRole("Full Stack Java Engineer");
        genReq.setDifficulty("Medium");
        genReq.setNum_questions(5);
        genReq.setFocus_topics(List.of("Microservices", "Concurrency", "Database"));

        MvcResult genResult = mockMvc.perform(post("/api/interview/rag/generate-questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(genReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session_id").exists())
                .andExpect(jsonPath("$.questions").isArray())
                .andExpect(jsonPath("$.rag_metadata.anti_hallucination_verified").value(true))
                .andReturn();

        Map<?, ?> genMap = objectMapper.readValue(genResult.getResponse().getContentAsString(), Map.class);
        String sessionId = (String) genMap.get("session_id");
        List<?> questions = (List<?>) genMap.get("questions");
        assertNotNull(sessionId);
        assertFalse(questions.isEmpty());

        // 4. Test Text Answer Evaluation
        RagEvaluateTextRequest evalReq = new RagEvaluateTextRequest();
        evalReq.setSession_id(sessionId);
        evalReq.setQuestion_id(1);
        evalReq.setQuestion("In Speak2HR Interview Portal, how did you handle state management and concurrency?");
        evalReq.setUser_answer("We implemented optimistic locking in Spring Boot JPA transactions and utilized Redis caching to eliminate contention during high-concurrency interview evaluations.");
        evalReq.setCode_submission("@Transactional(isolation = Isolation.READ_COMMITTED)\npublic void updateEvaluation() { ... }");
        evalReq.setExpected_keywords(List.of("locking", "concurrency", "Redis", "Spring Boot"));

        MvcResult evalResult = mockMvc.perform(post("/api/interview/rag/evaluate-text-response")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(evalReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overall_score").exists())
                .andExpect(jsonPath("$.feedback").exists())
                .andExpect(jsonPath("$.grounded_in_resume").value(true))
                .andReturn();

        // 5. Test Session Summary & Final Report
        mockMvc.perform(get("/api/interview/rag/session/" + sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session_id").value(sessionId))
                .andExpect(jsonPath("$.questions_answered").value(1));

        mockMvc.perform(get("/api/interview/rag/session/" + sessionId + "/report"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session_id").value(sessionId))
                .andExpect(jsonPath("$.overall_score").isNumber())
                .andExpect(jsonPath("$.performance_level").exists());
    }
}
