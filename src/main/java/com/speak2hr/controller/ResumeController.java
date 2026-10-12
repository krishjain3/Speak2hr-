package com.speak2hr.controller;

import com.speak2hr.dto.*;
import com.speak2hr.service.ResumeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class ResumeController {

    private final ResumeService resumeService;

    public ResumeController(ResumeService resumeService) {
        this.resumeService = resumeService;
    }

    @PostMapping("/resume/upload")
    public ResponseEntity<Map<String, Object>> uploadResume(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(resumeService.uploadAndParseResume(file));
    }

    @PostMapping("/job/match")
    public ResponseEntity<JobMatchResponse> matchJob(@RequestBody JobMatchRequest request) {
        return ResponseEntity.ok(resumeService.matchJob(request));
    }

    @PostMapping("/skill-gap/analyze")
    public ResponseEntity<SkillGapResponse> analyzeSkillGap(@RequestBody SkillGapRequest request) {
        return ResponseEntity.ok(resumeService.analyzeSkillGap(request));
    }
}
