package com.speak2hr.dto;

import java.util.List;

public class JobMatchResponse {
    private Double match_score;
    private List<String> matching_skills;
    private List<String> missing_skills;
    private List<String> recommendations;

    public JobMatchResponse() {}

    public Double getMatch_score() { return match_score; }
    public void setMatch_score(Double match_score) { this.match_score = match_score; }

    public List<String> getMatching_skills() { return matching_skills; }
    public void setMatching_skills(List<String> matching_skills) { this.matching_skills = matching_skills; }

    public List<String> getMissing_skills() { return missing_skills; }
    public void setMissing_skills(List<String> missing_skills) { this.missing_skills = missing_skills; }

    public List<String> getRecommendations() { return recommendations; }
    public void setRecommendations(List<String> recommendations) { this.recommendations = recommendations; }
}
