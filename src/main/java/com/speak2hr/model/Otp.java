package com.speak2hr.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "otps")
public class Otp {

    @Id
    private String email;
    private String otp;
    private String expiresAt;
    private String createdAt;

    public Otp() {}

    public Otp(String email, String otp, String expiresAt, String createdAt) {
        this.email = email;
        this.otp = otp;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
    }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getOtp() { return otp; }
    public void setOtp(String otp) { this.otp = otp; }

    public String getExpiresAt() { return expiresAt; }
    public void setExpiresAt(String expiresAt) { this.expiresAt = expiresAt; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
