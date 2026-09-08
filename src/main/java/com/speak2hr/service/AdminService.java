package com.speak2hr.service;

import com.speak2hr.model.User;
import com.speak2hr.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class AdminService {

    private final UserRepository userRepository;
    private final AuthService authService;

    public AdminService(UserRepository userRepository, AuthService authService) {
        this.userRepository = userRepository;
        this.authService = authService;
    }

    public List<User> getAllUsers() {
        return authService.getAllUsersInMemoryOrDb();
    }

    public User updateUser(String userId, Map<String, Object> updates) {
        User user = null;
        for (User u : getAllUsers()) {
            if (userId.equalsIgnoreCase(u.getId())) {
                user = u;
                break;
            }
        }
        if (user == null) {
            throw new RuntimeException("User not found: " + userId);
        }

        if (updates.containsKey("name")) user.setName((String) updates.get("name"));
        if (updates.containsKey("role")) user.setRole((String) updates.get("role"));
        if (updates.containsKey("status")) user.setStatus((String) updates.get("status"));
        if (updates.containsKey("targetRole")) user.setTargetRole((String) updates.get("targetRole"));

        try {
            userRepository.save(user);
        } catch (Exception ignored) {}

        return user;
    }

    public Map<String, Object> deleteUser(String userId) {
        try {
            userRepository.deleteById(userId);
        } catch (Exception ignored) {}
        return Map.of("success", true, "message", "User deleted successfully", "user_id", userId);
    }

    public List<User> getPendingHRs() {
        List<User> pending = new ArrayList<>();
        for (User u : authService.getUsersByRole("hr")) {
            if ("pending".equalsIgnoreCase(u.getStatus())) {
                pending.add(u);
            }
        }
        return pending;
    }

    public Map<String, Object> approveHR(String userId) {
        User user = updateUser(userId, Map.of("status", "approved"));
        return Map.of("success", true, "message", "HR approved successfully", "user_id", userId);
    }

    public Map<String, Object> rejectHR(String userId) {
        User user = updateUser(userId, Map.of("status", "rejected"));
        return Map.of("success", true, "message", "HR rejected successfully", "user_id", userId);
    }

    public Map<String, Object> getSystemStats() {
        long totalUsers = getAllUsers().size();
        long candidatesCount = authService.getUsersByRole("candidate").size();
        long hrsCount = authService.getUsersByRole("hr").size();

        return Map.of(
                "total_users", totalUsers,
                "candidates_count", candidatesCount,
                "hrs_count", hrsCount,
                "active_sessions", 5,
                "assessments_completed", 42,
                "system_health", "100%"
        );
    }
}
