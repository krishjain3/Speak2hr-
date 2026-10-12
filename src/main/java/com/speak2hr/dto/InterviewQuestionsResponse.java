package com.speak2hr.dto;

import java.util.List;
import java.util.Map;

public class InterviewQuestionsResponse {
    private String session_id;
    private List<Map<String, Object>> questions;
    private Integer total_questions;
    private String target_role;

    public InterviewQuestionsResponse() {}

    public String getSession_id() { return session_id; }
    public void setSession_id(String session_id) { this.session_id = session_id; }

    public List<Map<String, Object>> getQuestions() { return questions; }
    public void setQuestions(List<Map<String, Object>> questions) { this.questions = questions; }

    public Integer getTotal_questions() { return total_questions; }
    public void setTotal_questions(Integer total_questions) { this.total_questions = total_questions; }

    public String getTarget_role() { return target_role; }
    public void setTarget_role(String target_role) { this.target_role = target_role; }
}
