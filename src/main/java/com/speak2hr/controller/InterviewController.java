package com.speak2hr.controller;

import com.speak2hr.dto.InterviewQuestionRequest;
import com.speak2hr.dto.InterviewQuestionsResponse;
import com.speak2hr.dto.ReportRequest;
import com.speak2hr.service.InterviewService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/interview")
public class InterviewController {

    private final InterviewService interviewService;

    public InterviewController(InterviewService interviewService) {
        this.interviewService = interviewService;
    }

    @PostMapping("/generate-questions")
    public ResponseEntity<InterviewQuestionsResponse> generateQuestions(@RequestBody InterviewQuestionRequest request) {
        return ResponseEntity.ok(interviewService.generateQuestions(request));
    }

    @PostMapping(value = "/evaluate-response", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> evaluateResponse(
            @RequestParam("session_id") String sessionId,
            @RequestParam("question_id") String questionId,
            @RequestParam("question") String question,
            @RequestParam(value = "level", required = false) String level,
            @RequestParam(value = "level_name", required = false) String levelName,
            @RequestParam(value = "category", required = false) String category,
            @RequestParam(value = "difficulty", required = false) String difficulty,
            @RequestParam(value = "weight", required = false, defaultValue = "1.0") Double weight,
            @RequestParam(value = "expected_keywords", required = false, defaultValue = "[]") String expectedKeywords,
            @RequestParam(value = "video_file", required = false) MultipartFile videoFile,
            @RequestParam(value = "audio_file", required = false) MultipartFile audioFile
    ) {
        return ResponseEntity.ok(interviewService.evaluateResponse(
                sessionId, questionId, question, level, levelName, category, difficulty, weight, expectedKeywords, videoFile, audioFile
        ));
    }

    @GetMapping("/session/{session_id}")
    public ResponseEntity<Map<String, Object>> getSessionSummary(@PathVariable("session_id") String sessionId) {
        return ResponseEntity.ok(interviewService.getSessionSummary(sessionId));
    }

    @PostMapping("/generate-report")
    public ResponseEntity<Map<String, Object>> generateReport(@RequestBody ReportRequest request) {
        return ResponseEntity.ok(interviewService.generateReport(request));
    }

    @GetMapping("/download-report/{filename}")
    public ResponseEntity<byte[]> downloadReport(@PathVariable("filename") String filename) {
        byte[] pdfBytes = interviewService.downloadReport(filename);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(pdfBytes);
    }
}
