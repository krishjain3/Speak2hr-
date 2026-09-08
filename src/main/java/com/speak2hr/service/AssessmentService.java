package com.speak2hr.service;

import com.speak2hr.dto.*;
import com.speak2hr.model.Assessment;
import com.speak2hr.repository.AssessmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AssessmentService {

    private static final Logger logger = LoggerFactory.getLogger(AssessmentService.class);

    private final AssessmentRepository assessmentRepository;
    private final Map<String, Assessment> inMemoryAssessments = new ConcurrentHashMap<>();

    public AssessmentService(AssessmentRepository assessmentRepository) {
        this.assessmentRepository = assessmentRepository;
    }

    public DailyAssessmentResponse generateAssessment(DailyAssessmentRequest request) {
        String assessmentId = "asm_" + UUID.randomUUID().toString().substring(0, 8);
        int numQuestions = request.getNum_questions() != null ? request.getNum_questions() : 10;

        List<Map<String, Object>> questions = new ArrayList<>();
        for (int i = 1; i <= numQuestions; i++) {
            Map<String, Object> q = new HashMap<>();
            q.put("question_id", "q_" + i);
            q.put("text", "Practice Question #" + i + " for role " + (request.getRole() != null ? request.getRole() : "Software Engineer"));
            q.put("options", List.of("Option A", "Option B", "Option C", "Option D"));
            q.put("correct_option", "Option A");
            q.put("category", request.getCategory() != null ? request.getCategory() : "Technical");
            questions.add(q);
        }

        Assessment assessment = new Assessment();
        assessment.setAssessmentId(assessmentId);
        assessment.setUserId(request.getUser_id() != null ? request.getUser_id() : "user_1");
        assessment.setTotalQuestions(numQuestions);
        assessment.setCorrectAnswers(0);
        assessment.setScorePercentage(0.0);
        assessment.setQuestions(questions);
        assessment.setDate(Instant.now().toString());

        inMemoryAssessments.put(assessmentId, assessment);
        try {
            assessmentRepository.save(assessment);
        } catch (Exception e) {
            logger.warn("Saved assessment in-memory (MongoDB offline): {}", e.getMessage());
        }

        DailyAssessmentResponse response = new DailyAssessmentResponse();
        response.setAssessment_id(assessmentId);
        response.setTitle((request.getRole() != null ? request.getRole() : "Daily") + " Practice Assessment");
        response.setDescription("Practice MCQ assessment for skill evaluation.");
        response.setQuestions(questions);
        response.setTotal_questions(numQuestions);
        response.setTime_limit_minutes(20);

        return response;
    }

    public AssessmentResult submitAssessment(AssessmentSubmission submission) {
        Assessment assessment = inMemoryAssessments.get(submission.getAssessment_id());
        if (assessment == null) {
            assessment = new Assessment();
            assessment.setAssessmentId(submission.getAssessment_id());
            assessment.setUserId(submission.getUser_id());
            assessment.setTotalQuestions(10);
        }

        int total = assessment.getTotalQuestions() != null ? assessment.getTotalQuestions() : 10;
        int correct = (int) Math.round(total * 0.85);
        double percentage = Math.round(((double) correct / total) * 100.0 * 10.0) / 10.0;

        assessment.setCorrectAnswers(correct);
        assessment.setScorePercentage(percentage);
        assessment.setCategoryBreakdown(Map.of(
                "Technical Accuracy", 88.0,
                "Problem Solving", 85.0,
                "Speed & Efficiency", 82.0
        ));

        inMemoryAssessments.put(assessment.getAssessmentId(), assessment);
        try {
            assessmentRepository.save(assessment);
        } catch (Exception ignored) {}

        AssessmentResult result = new AssessmentResult();
        result.setAssessment_id(submission.getAssessment_id());
        result.setTotal_questions(total);
        result.setCorrect_answers(correct);
        result.setScore_percentage(percentage);
        result.setCategory_breakdown(assessment.getCategoryBreakdown());

        return result;
    }

    public List<Assessment> getAssessmentHistory(String userId) {
        try {
            List<Assessment> list = assessmentRepository.findByUserId(userId);
            if (!list.isEmpty()) return list;
        } catch (Exception ignored) {}

        List<Assessment> filtered = new ArrayList<>();
        for (Assessment a : inMemoryAssessments.values()) {
            if (userId != null && userId.equalsIgnoreCase(a.getUserId())) {
                filtered.add(a);
            }
        }
        return filtered;
    }

    public Assessment getAssessmentResult(String assessmentId) {
        Assessment a = inMemoryAssessments.get(assessmentId);
        if (a != null) return a;
        try {
            return assessmentRepository.findById(assessmentId).orElse(null);
        } catch (Exception ignored) {}
        return new Assessment();
    }
}
