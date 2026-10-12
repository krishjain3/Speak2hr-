package com.speak2hr.controller;

import com.speak2hr.dto.RagEvaluateTextRequest;
import com.speak2hr.dto.RagGenerateQuestionsRequest;
import com.speak2hr.service.RagInterviewService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/interview/rag")
public class RagInterviewController {

    private final RagInterviewService ragInterviewService;

    public RagInterviewController(RagInterviewService ragInterviewService) {
        this.ragInterviewService = ragInterviewService;
    }

    @PostMapping("/generate-questions")
    public ResponseEntity<Map<String, Object>> generateQuestions(@RequestBody RagGenerateQuestionsRequest request) {
        return ResponseEntity.ok(ragInterviewService.generateQuestions(request));
    }

    @GetMapping("/session/{sessionId}")
    public ResponseEntity<Map<String, Object>> getSessionSummary(@PathVariable("sessionId") String sessionId) {
        return ResponseEntity.ok(ragInterviewService.getSessionSummary(sessionId));
    }

    @PostMapping("/evaluate-text-response")
    public ResponseEntity<Map<String, Object>> evaluateTextResponse(@RequestBody RagEvaluateTextRequest request) {
        return ResponseEntity.ok(ragInterviewService.evaluateTextResponse(request));
    }

    @GetMapping("/session/{sessionId}/report")
    public ResponseEntity<Map<String, Object>> getSessionReport(@PathVariable("sessionId") String sessionId) {
        return ResponseEntity.ok(ragInterviewService.getSessionReport(sessionId));
    }
}
