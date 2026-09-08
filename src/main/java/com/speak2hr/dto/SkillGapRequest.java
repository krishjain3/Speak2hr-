package com.speak2hr.dto;

public class SkillGapRequest {
    private String resume_text;
    private String job_description;
    private String target_role;

    public SkillGapRequest() {}

    public String getResume_text() { return resume_text; }
    public void setResume_text(String resume_text) { this.resume_text = resume_text; }

    public String getJob_description() { return job_description; }
    public void setJob_description(String job_description) { this.job_description = job_description; }

    public String getTarget_role() { return target_role; }
    public void setTarget_role(String target_role) { this.target_role = target_role; }
}
