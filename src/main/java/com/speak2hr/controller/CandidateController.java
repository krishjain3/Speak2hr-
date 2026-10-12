package com.speak2hr.controller;

import com.speak2hr.model.ActivityLog;
import com.speak2hr.model.User;
import com.speak2hr.repository.ActivityLogRepository;
import com.speak2hr.repository.UserRepository;
import com.speak2hr.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
public class CandidateController {

    private final UserRepository userRepository;
    private final ActivityLogRepository activityLogRepository;
    private final AuthService authService;

    public CandidateController(UserRepository userRepository, ActivityLogRepository activityLogRepository, AuthService authService) {
        this.userRepository = userRepository;
        this.activityLogRepository = activityLogRepository;
        this.authService = authService;
    }

    @GetMapping("/candidates")
    public ResponseEntity<List<User>> getAllCandidates() {
        return ResponseEntity.ok(authService.getUsersByRole("candidate"));
    }

    @GetMapping("/candidates/{id}")
    public ResponseEntity<User> getCandidateById(@PathVariable("id") String id) {
        List<User> list = authService.getUsersByRole("candidate");
        for (User u : list) {
            if (id.equalsIgnoreCase(u.getId())) return ResponseEntity.ok(u);
        }
        try {
            User candidate = userRepository.findById(id).orElse(null);
            if (candidate != null) return ResponseEntity.ok(candidate);
        } catch (Exception ignored) {}

        throw new RuntimeException("Candidate not found: " + id);
    }

    @PutMapping("/candidates/{id}")
    public ResponseEntity<User> updateCandidateProfile(@PathVariable("id") String id, @RequestBody Map<String, Object> updates) {
        User candidate = getCandidateById(id).getBody();
        if (updates.containsKey("name")) candidate.setName((String) updates.get("name"));
        if (updates.containsKey("phone")) candidate.setPhone((String) updates.get("phone"));
        if (updates.containsKey("targetRole")) candidate.setTargetRole((String) updates.get("targetRole"));
        if (updates.containsKey("target_role")) candidate.setTargetRole((String) updates.get("target_role"));

        try {
            userRepository.save(candidate);
        } catch (Exception ignored) {}

        return ResponseEntity.ok(candidate);
    }

    @PutMapping("/candidates/{id}/status")
    public ResponseEntity<User> updateCandidateStatus(@PathVariable("id") String id, @RequestBody Map<String, Object> request) {
        User candidate = getCandidateById(id).getBody();
        if (request.containsKey("status")) candidate.setStatus((String) request.get("status"));
        try {
            userRepository.save(candidate);
        } catch (Exception ignored) {}
        return ResponseEntity.ok(candidate);
    }

    @GetMapping("/candidates/activities/{user_id}")
    public ResponseEntity<Map<String, Object>> getCandidateActivities(@PathVariable("user_id") String userId) {
        List<ActivityLog> logs = new ArrayList<>();
        try {
            logs = activityLogRepository.findByUserId(userId);
        } catch (Exception ignored) {}

        if (logs.isEmpty()) {
            logs = List.of(
                    new ActivityLog("act_1", userId, "Completed Practice MCQ Assessment", "2026-09-08 10:00:00"),
                    new ActivityLog("act_2", userId, "Uploaded Resume for Profile Analysis", "2026-09-07 14:30:00")
            );
        }
        return ResponseEntity.ok(Map.of("activities", logs));
    }

    @GetMapping("/candidates/dashboard/{user_id}")
    public ResponseEntity<Map<String, Object>> getCandidateDashboard(@PathVariable("user_id") String userId) {
        User candidate = null;
        try {
            candidate = getCandidateById(userId).getBody();
        } catch (Exception ignored) {}

        Map<String, Object> data = new HashMap<>();
        data.put("user_id", userId);
        data.put("candidate", candidate);
        data.put("overall_score", candidate != null && candidate.getOverallScore() != null ? candidate.getOverallScore() : 86.5);
        data.put("technical_score", candidate != null && candidate.getTechnicalScore() != null ? candidate.getTechnicalScore() : 88.0);
        data.put("communication_score", candidate != null && candidate.getCommunicationScore() != null ? candidate.getCommunicationScore() : 85.0);
        data.put("interviews_completed", 3);
        data.put("upcoming_interviews", 1);
        data.put("skill_gap_status", "Low Risk (88% Match)");
        return ResponseEntity.ok(data);
    }

    @GetMapping("/candidates/{user_id}/reports")
    public ResponseEntity<List<Map<String, Object>>> getCandidateReports(@PathVariable("user_id") String userId) {
        List<Map<String, Object>> reports = List.of(
                Map.of("report_id", "rep_1", "title", "Mock Interview Assessment", "score", 86.5, "date", "2026-09-05", "download_url", "/api/interview/download-report/report_sample.pdf"),
                Map.of("report_id", "rep_2", "title", "Technical Skill Evaluation", "score", 89.0, "date", "2026-09-02", "download_url", "/api/interview/download-report/report_sample.pdf")
        );
        return ResponseEntity.ok(reports);
    }

    @GetMapping("/hrs")
    public ResponseEntity<List<User>> getAllHRs() {
        return ResponseEntity.ok(authService.getUsersByRole("hr"));
    }

    @PutMapping("/hr/profile/{hr_id}")
    public ResponseEntity<User> updateHRProfile(@PathVariable("hr_id") String hrId, @RequestBody Map<String, Object> request) {
        User hr = null;
        for (User u : authService.getUsersByRole("hr")) {
            if (hrId.equalsIgnoreCase(u.getId())) {
                hr = u;
                break;
            }
        }
        if (hr == null) {
            try {
                hr = userRepository.findById(hrId).orElse(null);
            } catch (Exception ignored) {}
        }
        if (hr == null) {
            throw new RuntimeException("HR not found: " + hrId);
        }

        if (request.containsKey("name")) hr.setName((String) request.get("name"));
        if (request.containsKey("bio")) hr.setBio((String) request.get("bio"));
        if (request.containsKey("designation")) hr.setDesignation((String) request.get("designation"));
        if (request.containsKey("department")) hr.setDepartment((String) request.get("department"));

        try {
            userRepository.save(hr);
        } catch (Exception ignored) {}

        return ResponseEntity.ok(hr);
    }

    @GetMapping("/hr/stats")
    public ResponseEntity<Map<String, Object>> getHRStats() {
        long candidatesCount = authService.getUsersByRole("candidate").size();
        return ResponseEntity.ok(Map.of(
                "total_candidates", candidatesCount,
                "upcoming_interviews", 4,
                "evaluations_pending", 2,
                "evaluations_completed", 12,
                "hired_candidates", 5
        ));
    }
}
