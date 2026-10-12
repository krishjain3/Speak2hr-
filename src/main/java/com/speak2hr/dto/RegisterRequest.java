package com.speak2hr.dto;

import java.util.List;

public class RegisterRequest {
    private String name;
    private String email;
    private String password;
    private String role; // "hr" or "candidate"
    private String target_role;
    private List<String> skills;
    private Integer experience_years;

    public RegisterRequest() {}

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getTarget_role() { return target_role; }
    public void setTarget_role(String target_role) { this.target_role = target_role; }

    public List<String> getSkills() { return skills; }
    public void setSkills(List<String> skills) { this.skills = skills; }

    public Integer getExperience_years() { return experience_years; }
    public void setExperience_years(Integer experience_years) { this.experience_years = experience_years; }
}
