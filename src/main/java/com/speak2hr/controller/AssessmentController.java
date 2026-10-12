package com.speak2hr.controller;

import com.speak2hr.dto.*;
import com.speak2hr.model.Assessment;
import com.speak2hr.service.AssessmentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/assessment")
public class AssessmentController {

    private final AssessmentService assessmentService;

    public AssessmentController(AssessmentService assessmentService) {
        this.assessmentService = assessmentService;
    }

    @PostMapping("/generate")
    public ResponseEntity<DailyAssessmentResponse> generateAssessment(@RequestBody DailyAssessmentRequest request) {
        return ResponseEntity.ok(assessmentService.generateAssessment(request));
    }

    @PostMapping("/submit")
    public ResponseEntity<AssessmentResult> submitAssessment(@RequestBody AssessmentSubmission submission) {
        return ResponseEntity.ok(assessmentService.submitAssessment(submission));
    }

    @GetMapping("/history/{user_id}")
    public ResponseEntity<List<Assessment>> getAssessmentHistory(@PathVariable("user_id") String userId) {
        return ResponseEntity.ok(assessmentService.getAssessmentHistory(userId));
    }

    @GetMapping("/result/{assessment_id}")
    public ResponseEntity<Assessment> getAssessmentResult(@PathVariable("assessment_id") String assessmentId) {
        return ResponseEntity.ok(assessmentService.getAssessmentResult(assessmentId));
    }
}
