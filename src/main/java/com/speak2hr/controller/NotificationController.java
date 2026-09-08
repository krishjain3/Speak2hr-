package com.speak2hr.controller;

import com.speak2hr.model.Notification;
import com.speak2hr.service.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping("/{user_id}")
    public ResponseEntity<List<Notification>> getNotifications(@PathVariable("user_id") String userId) {
        return ResponseEntity.ok(notificationService.getNotificationsForUser(userId));
    }

    @PostMapping("/read/{notification_id}")
    public ResponseEntity<Map<String, Object>> markAsRead(@PathVariable("notification_id") String notificationId) {
        return ResponseEntity.ok(notificationService.markAsRead(notificationId));
    }
}
