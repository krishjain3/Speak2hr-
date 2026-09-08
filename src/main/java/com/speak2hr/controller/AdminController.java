package com.speak2hr.controller;

import com.speak2hr.model.User;
import com.speak2hr.service.AdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(adminService.getAllUsers());
    }

    @PutMapping("/users/{user_id}")
    public ResponseEntity<User> updateUser(@PathVariable("user_id") String userId, @RequestBody Map<String, Object> updates) {
        return ResponseEntity.ok(adminService.updateUser(userId, updates));
    }

    @DeleteMapping("/users/{user_id}")
    public ResponseEntity<Map<String, Object>> deleteUser(@PathVariable("user_id") String userId) {
        return ResponseEntity.ok(adminService.deleteUser(userId));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getSystemStats() {
        return ResponseEntity.ok(adminService.getSystemStats());
    }

    @GetMapping("/hr-pending")
    public ResponseEntity<List<User>> getPendingHRRequests() {
        return ResponseEntity.ok(adminService.getPendingHRs());
    }

    @PostMapping("/hr-approve/{user_id}")
    public ResponseEntity<Map<String, Object>> approveHR(@PathVariable("user_id") String userId) {
        return ResponseEntity.ok(adminService.approveHR(userId));
    }

    @PostMapping("/hr-reject/{user_id}")
    public ResponseEntity<Map<String, Object>> rejectHR(@PathVariable("user_id") String userId) {
        return ResponseEntity.ok(adminService.rejectHR(userId));
    }

    @GetMapping("/settings")
    public ResponseEntity<Map<String, Object>> getSettings() {
        return ResponseEntity.ok(Map.of(
                "siteName", "Speak2HR",
                "allowRegistration", true,
                "hrAutoApproval", false,
                "emailNotifications", true,
                "maintenanceMode", false,
                "maxInterviewDuration", 60,
                "assessmentPassScore", 70
        ));
    }

    @PutMapping("/settings")
    public ResponseEntity<Map<String, Object>> updateSettings(@RequestBody Map<String, Object> settings) {
        return ResponseEntity.ok(settings);
    }
}
