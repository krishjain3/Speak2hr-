package com.speak2hr.controller;

import com.speak2hr.service.RagResumeService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/resume")
public class RagResumeController {

    private final RagResumeService ragResumeService;

    public RagResumeController(RagResumeService ragResumeService) {
        this.ragResumeService = ragResumeService;
    }

    @PostMapping(value = "/upload-rag", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> uploadResumeRag(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "candidate_id", required = false, defaultValue = "default_candidate") String candidateId
    ) {
        return ResponseEntity.ok(ragResumeService.uploadAndIndexResume(file, candidateId));
    }

    @GetMapping("/candidate/{candidateId}")
    public ResponseEntity<Map<String, Object>> getCandidateProfile(@PathVariable("candidateId") String candidateId) {
        return ResponseEntity.ok(ragResumeService.getCandidateProfile(candidateId));
    }

    @GetMapping("/resumes/{candidateId}")
    public ResponseEntity<Map<String, Object>> getCandidateResumes(@PathVariable("candidateId") String candidateId) {
        return ResponseEntity.ok(ragResumeService.getCandidateProfile(candidateId));
    }
}
