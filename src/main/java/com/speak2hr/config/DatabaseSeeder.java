package com.speak2hr.config;

import com.speak2hr.model.User;
import com.speak2hr.model.VideoSession;
import com.speak2hr.repository.UserRepository;
import com.speak2hr.repository.VideoSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.List;

@Configuration
public class DatabaseSeeder {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseSeeder.class);

    @Bean
    public CommandLineRunner initDatabase(
            UserRepository userRepository,
            VideoSessionRepository videoSessionRepository,
            PasswordEncoder passwordEncoder
    ) {
        return args -> {
            try {
                logger.info("Initializing Speak2HR Database Seeder...");

                // 1. Admin User
                if (userRepository.findByEmail("admin@company.com").isEmpty()) {
                    User admin = new User("admin-1", "Admin User", "admin@company.com", passwordEncoder.encode("admin123"), "admin");
                    admin.setStatus("active");
                    admin.setRegisteredDate(Instant.now().toString());
                    admin.setLastLogin(Instant.now().toString());
                    userRepository.save(admin);
                    logger.info("Seeded Admin User: admin@company.com");
                }

                // 2. HR Managers
                if (userRepository.findByEmail("hr@speak2hr.com").isEmpty()) {
                    User hr1 = new User("hr_1", "Sarah Johnson", "hr@speak2hr.com", passwordEncoder.encode("password123"), "hr");
                    hr1.setDesignation("Senior Technical Recruiter");
                    hr1.setDepartment("Engineering Hiring");
                    hr1.setSpecialization(List.of("Backend Engineering", "Java", "Spring Boot", "Microservices"));
                    hr1.setLanguages(List.of("English", "Hindi"));
                    hr1.setBio("Passionate recruiter with 7+ years of experience helping candidates find their dream jobs.");
                    hr1.setWorkingHours("9:00 AM - 6:00 PM");
                    hr1.setLocation("San Francisco, CA (Remote)");
                    hr1.setRating(4.8);
                    hr1.setAvatar("https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150");
                    hr1.setStatus("approved");
                    hr1.setRegisteredDate(Instant.now().toString());
                    userRepository.save(hr1);

                    User hr2 = new User("hr_2", "David Miller", "david.miller@speak2hr.com", passwordEncoder.encode("password123"), "hr");
                    hr2.setDesignation("Technical Talent Partner");
                    hr2.setDepartment("Frontend & Design");
                    hr2.setSpecialization(List.of("Frontend Development", "React", "Vue", "UX/UI Design", "TypeScript"));
                    hr2.setLanguages(List.of("English", "Spanish"));
                    hr2.setBio("Recruiter focused on pixel-perfect frontend engineering and product design.");
                    hr2.setWorkingHours("10:00 AM - 7:00 PM");
                    hr2.setLocation("New York, NY");
                    hr2.setRating(4.9);
                    hr2.setAvatar("https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150");
                    hr2.setStatus("approved");
                    hr2.setRegisteredDate(Instant.now().toString());
                    userRepository.save(hr2);

                    logger.info("Seeded HR Managers (hr_1, hr_2)");
                }

                // 3. Candidates
                if (userRepository.findByEmail("candidate@speak2hr.com").isEmpty()) {
                    User cand1 = new User("cand_1", "John Doe", "candidate@speak2hr.com", passwordEncoder.encode("password123"), "candidate");
                    cand1.setTargetRole("Software Engineer");
                    cand1.setSkills(List.of("Python", "React", "SQL", "Java"));
                    cand1.setExperienceYears(3);
                    cand1.setStatus("active");
                    cand1.setRegisteredDate(Instant.now().toString());
                    cand1.setOverallScore(86.5);
                    cand1.setTechnicalScore(88.0);
                    cand1.setCommunicationScore(85.0);
                    userRepository.save(cand1);

                    User cand2 = new User("cand_2", "Jane Smith", "jane.smith@speak2hr.com", passwordEncoder.encode("password123"), "candidate");
                    cand2.setTargetRole("Senior Backend Engineer");
                    cand2.setSkills(List.of("Java", "Spring Boot", "MySQL", "Microservices"));
                    cand2.setExperienceYears(5);
                    cand2.setStatus("active");
                    cand2.setRegisteredDate(Instant.now().toString());
                    cand2.setOverallScore(91.0);
                    cand2.setTechnicalScore(93.5);
                    cand2.setCommunicationScore(88.5);
                    userRepository.save(cand2);

                    User cand3 = new User("cand_3", "Alex Jones", "alex.jones@speak2hr.com", passwordEncoder.encode("password123"), "candidate");
                    cand3.setTargetRole("Frontend Developer");
                    cand3.setSkills(List.of("JavaScript", "HTML", "CSS", "React", "Figma"));
                    cand3.setExperienceYears(2);
                    cand3.setStatus("active");
                    cand3.setRegisteredDate(Instant.now().toString());
                    cand3.setOverallScore(84.0);
                    cand3.setTechnicalScore(85.0);
                    cand3.setCommunicationScore(83.0);
                    userRepository.save(cand3);

                    logger.info("Seeded Sample Candidates (cand_1, cand_2, cand_3)");
                }

                // 4. Sample Video Sessions / Slots
                if (videoSessionRepository.count() == 0) {
                    VideoSession slot1 = new VideoSession();
                    slot1.setId("slot-sample-1");
                    slot1.setHrId("hr_1");
                    slot1.setHrName("Sarah Johnson");
                    slot1.setHrEmail("hr@speak2hr.com");
                    slot1.setDate("2026-09-12");
                    slot1.setTime("10:00 AM");
                    slot1.setDuration(30);
                    slot1.setStatus("available");
                    slot1.setVideoLink("https://meet.speak2hr.com/room/slot-sample-1");
                    videoSessionRepository.save(slot1);

                    VideoSession slot2 = new VideoSession();
                    slot2.setId("slot-sample-2");
                    slot2.setHrId("hr_2");
                    slot2.setHrName("David Miller");
                    slot2.setHrEmail("david.miller@speak2hr.com");
                    slot2.setDate("2026-09-12");
                    slot2.setTime("02:00 PM");
                    slot2.setDuration(30);
                    slot2.setStatus("available");
                    slot2.setVideoLink("https://meet.speak2hr.com/room/slot-sample-2");
                    videoSessionRepository.save(slot2);

                    logger.info("Seeded Sample Interview Slots");
                }

            } catch (Exception e) {
                logger.warn("DatabaseSeeder exception (MongoDB may be offline or starting up): {}", e.getMessage());
            }
        };
    }
}
