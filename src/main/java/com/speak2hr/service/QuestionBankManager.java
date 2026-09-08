package com.speak2hr.service;

import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class QuestionBankManager {

    private final GeminiService geminiService;

    private static final Map<String, List<Map<String, Object>>> PRESET_QUESTION_BANK = new HashMap<>();

    static {
        // Preset default question templates per role
        PRESET_QUESTION_BANK.put("java_developer", List.of(
            Map.of("id", "q1", "question", "Explain the concepts of Object-Oriented Programming (OOP) in Java.", "level", "1", "level_name", "Technical Basic", "category", "OOP", "difficulty", "easy", "weight", 1.0, "expected_keywords", List.of("Encapsulation", "Inheritance", "Polymorphism", "Abstraction")),
            Map.of("id", "q2", "question", "How does Garbage Collection work in Java and what are different GC algorithms?", "level", "2", "level_name", "Technical Intermediate", "category", "JVM", "difficulty", "medium", "weight", 1.2, "expected_keywords", List.of("Heap", "Garbage Collector", "G1", "ZGC", "Mark and Sweep")),
            Map.of("id", "q3", "question", "What is Dependency Injection in Spring Boot and how does `@Autowired` work?", "level", "2", "level_name", "Spring Framework", "category", "Spring Boot", "difficulty", "medium", "weight", 1.2, "expected_keywords", List.of("Inversion of Control", "Bean", "Autowired", "ApplicationContext")),
            Map.of("id", "q4", "question", "How do you handle multithreading and concurrency in Java?", "level", "3", "level_name", "Advanced Architecture", "category", "Multithreading", "difficulty", "hard", "weight", 1.5, "expected_keywords", List.of("ExecutorService", "Synchronization", "Volatile", "CompletableFuture"))
        ));

        PRESET_QUESTION_BANK.put("frontend_developer", List.of(
            Map.of("id", "q1", "question", "What is the Virtual DOM in React and how does reconciliation work?", "level", "1", "level_name", "Technical Basic", "category", "React", "difficulty", "easy", "weight", 1.0, "expected_keywords", List.of("Virtual DOM", "Diffing", "Reconciliation", "Props")),
            Map.of("id", "q2", "question", "Explain the difference between state management using Redux, Context API, and Zustand.", "level", "2", "level_name", "State Management", "category", "React State", "difficulty", "medium", "weight", 1.2, "expected_keywords", List.of("Context API", "Redux", "Store", "Actions", "Reducers")),
            Map.of("id", "q3", "question", "How do you optimize page load performance in a modern React web app?", "level", "3", "level_name", "Performance", "category", "Web Performance", "difficulty", "hard", "weight", 1.5, "expected_keywords", List.of("Code Splitting", "Lazy Loading", "Memoization", "Bundle Size"))
        ));

        PRESET_QUESTION_BANK.put("backend_developer", List.of(
            Map.of("id", "q1", "question", "What is RESTful API design and how do HTTP status codes indicate success/failure?", "level", "1", "level_name", "Technical Basic", "category", "REST API", "difficulty", "easy", "weight", 1.0, "expected_keywords", List.of("HTTP Methods", "Status Codes", "Endpoints", "JSON")),
            Map.of("id", "q2", "question", "Explain the difference between SQL and NoSQL databases and when to use each.", "level", "2", "level_name", "Database Architecture", "category", "Databases", "difficulty", "medium", "weight", 1.2, "expected_keywords", List.of("ACID", "BASE", "Relational", "Document", "MongoDB", "PostgreSQL")),
            Map.of("id", "q3", "question", "How do microservices communicate synchronously vs asynchronously?", "level", "3", "level_name", "Distributed Systems", "category", "Architecture", "difficulty", "hard", "weight", 1.5, "expected_keywords", List.of("gRPC", "REST", "Kafka", "RabbitMQ", "Event-Driven"))
        ));
    }

    public QuestionBankManager(GeminiService geminiService) {
        this.geminiService = geminiService;
    }

    public List<Map<String, Object>> getQuestionsForRole(String role, List<String> skills, Integer numQuestions) {
        if (numQuestions == null || numQuestions <= 0) numQuestions = 8;
        String normalizedRole = role != null ? role.toLowerCase().replace(" ", "_") : "backend_developer";

        List<Map<String, Object>> preset = PRESET_QUESTION_BANK.getOrDefault(normalizedRole, PRESET_QUESTION_BANK.get("backend_developer"));

        List<Map<String, Object>> result = new ArrayList<>();
        int count = 1;

        // If preset exists, start with preset questions
        for (Map<String, Object> item : preset) {
            Map<String, Object> q = new HashMap<>(item);
            q.put("question_id", "q_" + count);
            result.add(q);
            count++;
            if (result.size() >= numQuestions) break;
        }

        // Fill remaining questions using AI if requested
        while (result.size() < numQuestions) {
            Map<String, Object> q = Map.of(
                "question_id", "q_" + count,
                "question", "Explain how you apply " + (skills != null && !skills.isEmpty() ? skills.get((count - 1) % skills.size()) : "core development practices") + " in software engineering projects.",
                "level", String.valueOf((count % 3) + 1),
                "level_name", count % 2 == 0 ? "Technical Practical" : "System Design",
                "category", "Software Engineering",
                "difficulty", count % 3 == 0 ? "hard" : (count % 2 == 0 ? "medium" : "easy"),
                "weight", 1.0 + (count * 0.1),
                "expected_keywords", List.of("Architecture", "Best Practices", "Testing", "Optimization")
            );
            result.add(q);
            count++;
        }

        return result;
    }
}
