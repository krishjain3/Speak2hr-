package com.speak2hr.dto;

import java.util.List;

public class InterviewQuestionRequest {
    private String candidate_name;
    private List<String> candidate_skills;
    private Integer candidate_experience_years;
    private String job_description;
    private List<String> candidate_work_history;
    private String role;
    private String user_id;
    private Integer num_questions = 8;
    private String interview_level = "Technical Basic";

    public InterviewQuestionRequest() {}

    public String getCandidate_name() { return candidate_name; }
    public void setCandidate_name(String candidate_name) { this.candidate_name = candidate_name; }

    public List<String> getCandidate_skills() { return candidate_skills; }
    public void setCandidate_skills(List<String> candidate_skills) { this.candidate_skills = candidate_skills; }

    public Integer getCandidate_experience_years() { return candidate_experience_years; }
    public void setCandidate_experience_years(Integer candidate_experience_years) { this.candidate_experience_years = candidate_experience_years; }

    public String getJob_description() { return job_description; }
    public void setJob_description(String job_description) { this.job_description = job_description; }

    public List<String> getCandidate_work_history() { return candidate_work_history; }
    public void setCandidate_work_history(List<String> candidate_work_history) { this.candidate_work_history = candidate_work_history; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getUser_id() { return user_id; }
    public void setUser_id(String user_id) { this.user_id = user_id; }

    public Integer getNum_questions() { return num_questions; }
    public void setNum_questions(Integer num_questions) { this.num_questions = num_questions; }

    public String getInterview_level() { return interview_level; }
    public void setInterview_level(String interview_level) { this.interview_level = interview_level; }
}
