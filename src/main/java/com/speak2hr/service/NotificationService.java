package com.speak2hr.service;

import com.speak2hr.model.Notification;
import com.speak2hr.repository.NotificationRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;

    public NotificationService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    public List<Notification> getNotificationsForUser(String userId) {
        List<Notification> list = notificationRepository.findByUserIdOrderByTimestampDesc(userId);
        if (list.isEmpty()) {
            // Seed a welcome notification if empty
            Notification welcome = new Notification(
                    "noti_" + UUID.randomUUID().toString().substring(0, 8),
                    userId,
                    "Welcome to Speak2HR Platform!",
                    Instant.now().toString(),
                    0
            );
            notificationRepository.save(welcome);
            return List.of(welcome);
        }
        return list;
    }

    public Map<String, Object> markAsRead(String notificationId) {
        Optional<Notification> opt = notificationRepository.findById(notificationId);
        if (opt.isPresent()) {
            Notification n = opt.get();
            n.setIsRead(1);
            notificationRepository.save(n);
        }
        return Map.of("success", true, "notification_id", notificationId);
    }
}
