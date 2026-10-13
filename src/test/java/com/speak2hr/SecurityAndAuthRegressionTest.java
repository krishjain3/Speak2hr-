package com.speak2hr;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.speak2hr.dto.ForgotPasswordRequest;
import com.speak2hr.dto.LoginRequest;
import com.speak2hr.dto.ResetPasswordRequest;
import com.speak2hr.model.User;
import com.speak2hr.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class SecurityAndAuthRegressionTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthService authService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    public void testProtectedEndpointsRequireAuthentication() throws Exception {
        // Calling protected endpoints without JWT token returns 401 Unauthorized
        mockMvc.perform(get("/api/slots"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/candidates"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void testPublicEndpointsPermitAll() throws Exception {
        // Health endpoint should be publicly accessible
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk());

        // Login endpoint should be publicly accessible (returns 401 for bad credentials from controller, not security filter)
        LoginRequest badLogin = new LoginRequest();
        badLogin.setEmail("nonexistent@example.com");
        badLogin.setPassword("wrongpass");
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(badLogin)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void testForgotPasswordDoesNotLeakOtp() throws Exception {
        // Request forgot-password for existing user
        ForgotPasswordRequest request = new ForgotPasswordRequest();
        request.setEmail("candidate@speak2hr.com");

        MvcResult result = mockMvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn();

        String responseBody = result.getResponse().getContentAsString();
        // OTP and otp_debug should NEVER be exposed in the response
        assertFalse(responseBody.contains("otp_debug"), "Response must not contain otp_debug");
        Map<?, ?> map = objectMapper.readValue(responseBody, Map.class);
        assertNull(map.get("otp"), "Response must not contain OTP");
    }

    @Test
    public void testAdminEndpointsRequireAdminRole() throws Exception {
        User candidate = new User("cand_test", "Candidate User", "candidate@speak2hr.com", "pass", "candidate");
        String candidateToken = authService.generateJwtToken(candidate);

        // Candidate user attempting to access admin endpoint is rejected with 403 Forbidden
        mockMvc.perform(get("/api/admin/users")
                        .header("Authorization", "Bearer " + candidateToken))
                .andExpect(status().isForbidden());

        User admin = new User("admin_test", "Admin User", "admin@speak2hr.com", "pass", "admin");
        String adminToken = authService.generateJwtToken(admin);

        // Admin user with ROLE_ADMIN is accepted with 200 OK
        mockMvc.perform(get("/api/admin/users")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
    }

    @Test
    public void testValidJwtBearerAuthenticatesProtectedEndpoint() throws Exception {
        User candidate = new User("cand_test", "Candidate User", "candidate@speak2hr.com", "pass", "candidate");
        String candidateToken = authService.generateJwtToken(candidate);

        mockMvc.perform(get("/api/slots")
                        .header("Authorization", "Bearer " + candidateToken))
                .andExpect(status().isOk());
    }

    @Test
    public void testResetPasswordEnforcesAttemptsLimit() {
        // Forgot password creates an OTP
        ForgotPasswordRequest req = new ForgotPasswordRequest();
        req.setEmail("candidate@speak2hr.com");
        authService.forgotPassword(req);

        ResetPasswordRequest wrongAttempt = new ResetPasswordRequest();
        wrongAttempt.setEmail("candidate@speak2hr.com");
        wrongAttempt.setVerificationCode("000000"); // wrong OTP
        wrongAttempt.setNewPassword("newpassword123");

        for (int i = 0; i < 5; i++) {
            try {
                authService.resetPassword(wrongAttempt);
            } catch (RuntimeException ignored) {
            }
        }

        // 6th attempt must fail with too many attempts
        RuntimeException ex = assertThrows(RuntimeException.class, () -> authService.resetPassword(wrongAttempt));
        assertTrue(ex.getMessage().contains("Too many") || ex.getMessage().contains("attempts"),
                "Expected attempt limit error, got: " + ex.getMessage());
    }
}
