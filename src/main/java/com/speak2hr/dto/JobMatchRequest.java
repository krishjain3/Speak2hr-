package com.speak2hr.dto;

public class JobMatchRequest {
    private String resume_text;
    private String job_description;

    public JobMatchRequest() {}

    public String getResume_text() { return resume_text; }
    public void setResume_text(String resume_text) { this.resume_text = resume_text; }

    public String getJob_description() { return job_description; }
    public void setJob_description(String job_description) { this.job_description = job_description; }
}
