package com.speak2hr.service;

import com.speak2hr.dto.*;
import com.speak2hr.model.Otp;
import com.speak2hr.model.User;
import com.speak2hr.repository.OtpRepository;
import com.speak2hr.repository.UserRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.Key;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AuthService {

    private static final Logger logger = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;
    private final OtpRepository otpRepository;
    private final PasswordEncoder passwordEncoder;
    private final Key jwtSecretKey;

    private final Map<String, User> inMemoryUsers = new ConcurrentHashMap<>();
    private final Map<String, Otp> inMemoryOtps = new ConcurrentHashMap<>();
    private final Map<String, Integer> otpAttempts = new ConcurrentHashMap<>();

    public AuthService(
            UserRepository userRepository,
            OtpRepository otpRepository,
            PasswordEncoder passwordEncoder,
            @Value("${jwt.secret:}") String jwtSecret,
            @Value("${spring.profiles.active:}") String activeProfile
    ) {
        this.userRepository = userRepository;
        this.otpRepository = otpRepository;
        this.passwordEncoder = passwordEncoder;

        boolean isProduction = "production".equalsIgnoreCase(activeProfile) ||
                "prod".equalsIgnoreCase(activeProfile) ||
                "production".equalsIgnoreCase(System.getenv("ENVIRONMENT"));

        if (jwtSecret != null && jwtSecret.trim().length() >= 32) {
            this.jwtSecretKey = Keys.hmacShaKeyFor(jwtSecret.trim().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } else if (isProduction) {
            throw new IllegalStateException("Required JWT signing secret (jwt.secret / JWT_SECRET) is missing or too short in production environment!");
        } else {
            logger.warn("No valid JWT signing secret configured in application properties. Using secure ephemeral 256-bit key for local development.");
            this.jwtSecretKey = Keys.secretKeyFor(SignatureAlgorithm.HS256);
        }

        seedInMemoryDefaults();
    }

    private void seedInMemoryDefaults() {
        User admin = new User("admin-1", "Admin User", "admin@company.com", passwordEncoder.encode("admin123"), "admin");
        admin.setStatus("active");
        inMemoryUsers.put(admin.getEmail(), admin);

        User hr1 = new User("hr_1", "Sarah Johnson", "hr@speak2hr.com", passwordEncoder.encode("password123"), "hr");
        hr1.setStatus("approved");
        hr1.setDesignation("Senior Technical Recruiter");
        hr1.setDepartment("Engineering Hiring");
        hr1.setSpecialization(List.of("Backend Engineering", "Java", "Spring Boot", "Microservices"));
        hr1.setLanguages(List.of("English", "Hindi"));
        hr1.setBio("Passionate recruiter with 7+ years of experience helping candidates find their dream jobs.");
        hr1.setWorkingHours("9:00 AM - 6:00 PM");
        hr1.setLocation("San Francisco, CA (Remote)");
        hr1.setRating(4.8);
        hr1.setAvatar("https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150");
        inMemoryUsers.put(hr1.getEmail(), hr1);

        User hr2 = new User("hr_2", "David Miller", "david.miller@speak2hr.com", passwordEncoder.encode("password123"), "hr");
        hr2.setStatus("approved");
        hr2.setDesignation("Technical Talent Partner");
        hr2.setDepartment("Frontend & Design");
        hr2.setSpecialization(List.of("Frontend Development", "React", "Vue", "UX/UI Design", "TypeScript"));
        hr2.setLanguages(List.of("English", "Spanish"));
        hr2.setBio("Recruiter focused on pixel-perfect frontend engineering and product design.");
        hr2.setWorkingHours("10:00 AM - 7:00 PM");
        hr2.setLocation("New York, NY");
        hr2.setRating(4.9);
        hr2.setAvatar("https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150");
        inMemoryUsers.put(hr2.getEmail(), hr2);

        User cand1 = new User("cand_1", "John Doe", "candidate@speak2hr.com", passwordEncoder.encode("password123"), "candidate");
        cand1.setTargetRole("Software Engineer");
        cand1.setSkills(List.of("Python", "React", "SQL", "Java"));
        cand1.setExperienceYears(3);
        cand1.setStatus("active");
        cand1.setOverallScore(86.5);
        cand1.setTechnicalScore(88.0);
        cand1.setCommunicationScore(85.0);
        inMemoryUsers.put(cand1.getEmail(), cand1);

        User cand2 = new User("cand_2", "Jane Smith", "jane.smith@speak2hr.com", passwordEncoder.encode("password123"), "candidate");
        cand2.setTargetRole("Senior Backend Engineer");
        cand2.setSkills(List.of("Java", "Spring Boot", "MySQL", "Microservices"));
        cand2.setExperienceYears(5);
        cand2.setStatus("active");
        cand2.setOverallScore(91.0);
        cand2.setTechnicalScore(93.5);
        cand2.setCommunicationScore(88.5);
        inMemoryUsers.put(cand2.getEmail(), cand2);

        User cand3 = new User("cand_3", "Alex Jones", "alex.jones@speak2hr.com", passwordEncoder.encode("password123"), "candidate");
        cand3.setTargetRole("Frontend Developer");
        cand3.setSkills(List.of("JavaScript", "HTML", "CSS", "React", "Figma"));
        cand3.setExperienceYears(2);
        cand3.setStatus("active");
        cand3.setOverallScore(84.0);
        cand3.setTechnicalScore(85.0);
        cand3.setCommunicationScore(83.0);
        inMemoryUsers.put(cand3.getEmail(), cand3);
    }

    public AuthResponse login(LoginRequest request) {
        User user = findUserByEmail(request.getEmail());
        if (user == null) {
            throw new org.springframework.security.authentication.BadCredentialsException("Invalid email or password");
        }

        boolean matches = passwordEncoder.matches(request.getPassword(), user.getPassword());

        if (!matches) {
            throw new org.springframework.security.authentication.BadCredentialsException("Invalid email or password");
        }

        user.setLastLogin(Instant.now().toString());
        saveUser(user);

        String token = generateJwtToken(user);
        Map<String, Object> userData = mapUserToMap(user);

        return new AuthResponse(token, userData);
    }

    public AuthResponse register(RegisterRequest request) {
        if (findUserByEmail(request.getEmail()) != null) {
            throw new RuntimeException("Email already registered");
        }

        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(request.getRole() != null ? request.getRole() : "candidate");
        user.setTargetRole(request.getTarget_role());
        user.setSkills(request.getSkills() != null ? request.getSkills() : new ArrayList<>());
        user.setExperienceYears(request.getExperience_years() != null ? request.getExperience_years() : 0);
        user.setStatus("active");
        user.setRegisteredDate(Instant.now().toString());
        user.setLastLogin(Instant.now().toString());

        saveUser(user);

        String token = generateJwtToken(user);
        Map<String, Object> userData = mapUserToMap(user);

        return new AuthResponse(token, userData);
    }

    public Map<String, Object> forgotPassword(ForgotPasswordRequest request) {
        User user = findUserByEmail(request.getEmail());
        if (user == null) {
            throw new RuntimeException("User with specified email not found");
        }

        String otpCode = String.format("%06d", new Random().nextInt(900000) + 100000);
        String expiresAt = Instant.now().plusSeconds(600).toString();
        String createdAt = Instant.now().toString();

        Otp otp = new Otp(request.getEmail(), otpCode, expiresAt, createdAt);
        inMemoryOtps.put(request.getEmail(), otp);
        otpAttempts.put(request.getEmail(), 0);

        return Map.of(
                "success", true,
                "message", "Verification code sent to your email"
        );
    }

    public Map<String, Object> resetPassword(ResetPasswordRequest request) {
        Otp otp = inMemoryOtps.get(request.getEmail());
        if (otp == null) {
            throw new RuntimeException("No verification code found. Please request a new code.");
        }

        int attempts = otpAttempts.getOrDefault(request.getEmail(), 0);
        if (attempts >= 5) {
            inMemoryOtps.remove(request.getEmail());
            otpAttempts.remove(request.getEmail());
            throw new RuntimeException("Too many invalid attempts. Please request a new verification code.");
        }

        // Validate expiration
        try {
            if (Instant.parse(otp.getExpiresAt()).isBefore(Instant.now())) {
                inMemoryOtps.remove(request.getEmail());
                otpAttempts.remove(request.getEmail());
                throw new RuntimeException("Verification code has expired.");
            }
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("expired")) throw e;
        }

        // Validate matching OTP code
        if (!otp.getOtp().equals(request.getVerificationCode())) {
            otpAttempts.put(request.getEmail(), attempts + 1);
            throw new RuntimeException("Invalid verification code");
        }

        User user = findUserByEmail(request.getEmail());
        if (user == null) {
            throw new RuntimeException("User not found");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        saveUser(user);

        // One-time-use invalidation
        inMemoryOtps.remove(request.getEmail());
        otpAttempts.remove(request.getEmail());
        return Map.of("success", true, "message", "Password reset successfully");
    }

    private User findUserByEmail(String email) {
        return inMemoryUsers.get(email);
    }

    public List<User> getAllUsersInMemoryOrDb() {
        return new ArrayList<>(inMemoryUsers.values());
    }

    public List<User> getUsersByRole(String role) {
        List<User> filtered = new ArrayList<>();
        for (User u : inMemoryUsers.values()) {
            if (role.equalsIgnoreCase(u.getRole())) {
                filtered.add(u);
            }
        }
        return filtered;
    }

    private void saveUser(User user) {
        inMemoryUsers.put(user.getEmail(), user);
    }

    public String generateJwtToken(User user) {
        return Jwts.builder()
                .setSubject(user.getId())
                .claim("email", user.getEmail())
                .claim("role", user.getRole())
                .claim("name", user.getName())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 86400000))
                .signWith(jwtSecretKey, SignatureAlgorithm.HS256)
                .compact();
    }

    public Map<String, Object> mapUserToMap(User user) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", user.getId());
        map.put("name", user.getName());
        map.put("email", user.getEmail());
        map.put("role", user.getRole());
        map.put("target_role", user.getTargetRole());
        map.put("skills", user.getSkills() != null ? user.getSkills() : List.of());
        map.put("experience_years", user.getExperienceYears());
        map.put("status", user.getStatus());
        map.put("registered_date", user.getRegisteredDate());
        map.put("last_login", user.getLastLogin());
        map.put("avatar", user.getAvatar());
        map.put("phone", user.getPhone());
        map.put("designation", user.getDesignation());
        map.put("department", user.getDepartment());
        return map;
    }

    public io.jsonwebtoken.Claims validateAndGetClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(jwtSecretKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    public Key getJwtSecretKey() {
        return jwtSecretKey;
    }
}
