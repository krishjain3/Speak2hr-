package com.speak2hr.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSetter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class RagGenerateQuestionsRequest {

    @JsonProperty("candidate_id")
    @JsonAlias({"candidateId", "candidateID", "userId", "user_id"})
    private String candidate_id;

    @JsonProperty("resume_id")
    @JsonAlias({"resumeId", "resumeID"})
    private String resume_id;

    private String role;

    private String difficulty;

    @JsonProperty("num_questions")
    @JsonAlias({"numQuestions", "question_count", "questionCount"})
    private Integer num_questions;

    @JsonProperty("focus_topics")
    @JsonAlias({"focusTopics", "focusArea", "focus_area"})
    private List<String> focus_topics = new ArrayList<>();

    @JsonProperty("candidate_name")
    @JsonAlias({"candidateName"})
    private String candidate_name;

    @JsonProperty("candidate_email")
    @JsonAlias({"candidateEmail"})
    private String candidate_email;

    public RagGenerateQuestionsRequest() {}

    public String getCandidate_id() { return candidate_id; }
    public void setCandidate_id(String candidate_id) { this.candidate_id = candidate_id; }
    public String getCandidateId() { return candidate_id; }
    public void setCandidateId(String candidateId) { this.candidate_id = candidateId; }

    public String getResume_id() { return resume_id; }
    public void setResume_id(String resume_id) { this.resume_id = resume_id; }
    public String getResumeId() { return resume_id; }
    public void setResumeId(String resumeId) { this.resume_id = resumeId; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

    public Integer getNum_questions() { return num_questions != null ? num_questions : 10; }

    @JsonSetter("num_questions")
    @JsonAlias({"numQuestions", "question_count", "questionCount"})
    public void setNum_questions(Object numQuestionsObj) {
        if (numQuestionsObj instanceof Number) {
            this.num_questions = ((Number) numQuestionsObj).intValue();
        } else if (numQuestionsObj instanceof String) {
            try {
                this.num_questions = Integer.parseInt(((String) numQuestionsObj).trim());
            } catch (Exception e) {
                this.num_questions = 10;
            }
        } else {
            this.num_questions = 10;
        }
    }
    public Integer getNumQuestions() { return getNum_questions(); }
    public void setNumQuestions(Object numQuestions) { setNum_questions(numQuestions); }

    public List<String> getFocus_topics() { return focus_topics != null ? focus_topics : Collections.emptyList(); }

    @JsonSetter("focus_topics")
    @JsonAlias({"focusTopics", "focusArea", "focus_area"})
    public void setFocus_topics(Object focusObj) {
        if (focusObj == null) {
            this.focus_topics = new ArrayList<>();
        } else if (focusObj instanceof List) {
            this.focus_topics = new ArrayList<>();
            for (Object item : (List<?>) focusObj) {
                if (item != null) this.focus_topics.add(item.toString());
            }
        } else if (focusObj instanceof String) {
            String str = ((String) focusObj).trim();
            this.focus_topics = str.isEmpty() ? new ArrayList<>() : new ArrayList<>(List.of(str));
        } else {
            this.focus_topics = new ArrayList<>();
        }
    }

    public List<String> getFocusArea() { return getFocus_topics(); }
    public void setFocusArea(Object focusArea) { setFocus_topics(focusArea); }

    public String getCandidate_name() { return candidate_name; }
    public void setCandidate_name(String candidate_name) { this.candidate_name = candidate_name; }
    public String getCandidateName() { return candidate_name; }
    public void setCandidateName(String candidateName) { this.candidate_name = candidateName; }

    public String getCandidate_email() { return candidate_email; }
    public void setCandidate_email(String candidate_email) { this.candidate_email = candidate_email; }
    public String getCandidateEmail() { return candidate_email; }
    public void setCandidateEmail(String candidateEmail) { this.candidate_email = candidateEmail; }
}
