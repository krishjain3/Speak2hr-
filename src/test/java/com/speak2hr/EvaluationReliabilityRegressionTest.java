package com.speak2hr;

import com.speak2hr.dto.*;
import com.speak2hr.service.AssessmentService;
import com.speak2hr.service.InterviewService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
public class EvaluationReliabilityRegressionTest {

    @Autowired
    private AssessmentService assessmentService;

    @Autowired
    private InterviewService interviewService;

    @Test
    public void testAssessmentScoresActualAnswersAndRejectsEmptyAnswers() {
        DailyAssessmentRequest req = new DailyAssessmentRequest();
        req.setRole("Software Engineer");
        req.setNum_questions(5);
        req.setUser_id("user_test_eval");

        DailyAssessmentResponse generated = assessmentService.generateAssessment(req);
        assertNotNull(generated.getAssessment_id());
        assertEquals(5, generated.getTotal_questions());

        // 1. Submit empty answers -> must be 0.0%, NOT 85.0%
        AssessmentSubmission emptySubmission = new AssessmentSubmission();
        emptySubmission.setAssessment_id(generated.getAssessment_id());
        emptySubmission.setUser_id("user_test_eval");
        emptySubmission.setAnswers(Map.of());

        AssessmentResult emptyResult = assessmentService.submitAssessment(emptySubmission);
        assertEquals(0, emptyResult.getCorrect_answers(), "Empty answers should yield 0 correct");
        assertEquals(0.0, emptyResult.getScore_percentage(), "Empty answers should yield 0.0% score");

        // 2. Submit all correct answers (Option A is default correct in mock generator)
        Map<String, Object> correctAnswers = new HashMap<>();
        for (int i = 1; i <= 5; i++) {
            correctAnswers.put("q_" + i, "Option A");
        }
        AssessmentSubmission perfectSubmission = new AssessmentSubmission();
        perfectSubmission.setAssessment_id(generated.getAssessment_id());
        perfectSubmission.setUser_id("user_test_eval");
        perfectSubmission.setAnswers(correctAnswers);

        AssessmentResult perfectResult = assessmentService.submitAssessment(perfectSubmission);
        assertEquals(5, perfectResult.getCorrect_answers(), "All matching answers should yield 5 correct");
        assertEquals(100.0, perfectResult.getScore_percentage(), "All matching answers should yield 100.0% score");
    }

    @Test
    public void testInterviewEvaluationMissingMediaYieldsZeroAndNoAnswer() {
        String sessionId = "sess_test_missing_media";
        Map<String, Object> eval = interviewService.evaluateResponse(
                sessionId,
                "q_1",
                "Describe polymorphism.",
                "1",
                "Basic",
                "technical",
                "easy",
                1.0,
                "[]",
                null,
                null
        );

        assertEquals(0.0, eval.get("overall_score"), "Missing audio/video should score 0.0");
        assertEquals("NO_ANSWER", eval.get("evaluation_status"), "Status should indicate NO_ANSWER");
        assertEquals(false, eval.get("is_fallback"));
    }

    @Test
    public void testSessionEvaluationsDeduplicateRepeatedSubmissions() {
        String sessionId = "sess_test_dedup";

        interviewService.evaluateResponse(
                sessionId,
                "q_dup_1",
                "Explain dependency injection.",
                "1",
                "Basic",
                "technical",
                "easy",
                1.0,
                "[]",
                null,
                null
        );

        // Submit same question again
        interviewService.evaluateResponse(
                sessionId,
                "q_dup_1",
                "Explain dependency injection.",
                "1",
                "Basic",
                "technical",
                "easy",
                1.0,
                "[]",
                null,
                null
        );

        Map<String, Object> summary = interviewService.getSessionSummary(sessionId);
        assertEquals(1, summary.get("total_questions_evaluated"), "Repeated submission for same questionId should replace, not duplicate");
    }

    @Test
    public void testGenerateReportCreatesReportWithActualSessionScore() {
        String sessionId = "sess_test_report_gen";

        interviewService.evaluateResponse(
                sessionId,
                "q_1",
                "What is an index in a database?",
                "1",
                "Basic",
                "technical",
                "easy",
                1.0,
                "[]",
                null,
                null
        );

        ReportRequest req = new ReportRequest();
        req.setSession_id(sessionId);
        req.setCandidate_name("Alice Candidate");
        req.setEmail("alice@example.com");

        Map<String, Object> reportResult = interviewService.generateReport(req);
        assertTrue((Boolean) reportResult.get("success"));
        assertNotNull(reportResult.get("filename"));

        byte[] pdfData = interviewService.downloadReport((String) reportResult.get("filename"));
        assertNotNull(pdfData);
        assertTrue(pdfData.length > 0, "PDF file must not be empty");
    }
}
