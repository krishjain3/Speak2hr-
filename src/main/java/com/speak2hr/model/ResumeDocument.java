package com.speak2hr.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Document(collection = "candidate_resumes")
@JsonIgnoreProperties(ignoreUnknown = true)
public class ResumeDocument {

    @Id
    @JsonProperty("resume_id")
    private String id;

    @JsonProperty("candidate_id")
    private String candidateId;

    private String filename;

    @JsonProperty("file_hash")
    private String fileHash;

    @JsonProperty("raw_text")
    private String rawText;

    @JsonProperty("candidate_name")
    private String candidateName;

    @JsonProperty("target_role")
    private String targetRole;

    @JsonProperty("experience_years")
    private Double experienceYears;

    private List<String> skills = new ArrayList<>();

    private List<Map<String, Object>> projects = new ArrayList<>();

    @JsonProperty("sections_found")
    private List<String> sectionsFound = new ArrayList<>();

    @JsonProperty("total_chunks")
    private Integer totalChunks = 0;

    @JsonProperty("embedding_model")
    private String embeddingModel = "gemini-text-embedding-004";

    @JsonProperty("embedding_version")
    private String embeddingVersion = "1.0";

    @JsonProperty("created_at")
    private String createdAt = Instant.now().toString();

    public ResumeDocument() {}

    public ResumeDocument(String id, String candidateId, String filename, String fileHash, String rawText) {
        this.id = id;
        this.candidateId = candidateId;
        this.filename = filename;
        this.fileHash = fileHash;
        this.rawText = rawText;
        this.createdAt = Instant.now().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCandidateId() { return candidateId; }
    public void setCandidateId(String candidateId) { this.candidateId = candidateId; }

    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }

    public String getFileHash() { return fileHash; }
    public void setFileHash(String fileHash) { this.fileHash = fileHash; }

    public String getRawText() { return rawText; }
    public void setRawText(String rawText) { this.rawText = rawText; }

    public String getCandidateName() { return candidateName; }
    public void setCandidateName(String candidateName) { this.candidateName = candidateName; }

    public String getTargetRole() { return targetRole; }
    public void setTargetRole(String targetRole) { this.targetRole = targetRole; }

    public Double getExperienceYears() { return experienceYears; }
    public void setExperienceYears(Double experienceYears) { this.experienceYears = experienceYears; }

    public List<String> getSkills() { return skills != null ? skills : new ArrayList<>(); }
    public void setSkills(List<String> skills) { this.skills = skills; }

    public List<Map<String, Object>> getProjects() { return projects != null ? projects : new ArrayList<>(); }
    public void setProjects(List<Map<String, Object>> projects) { this.projects = projects; }

    public List<String> getSectionsFound() { return sectionsFound != null ? sectionsFound : new ArrayList<>(); }
    public void setSectionsFound(List<String> sectionsFound) { this.sectionsFound = sectionsFound; }

    public Integer getTotalChunks() { return totalChunks; }
    public void setTotalChunks(Integer totalChunks) { this.totalChunks = totalChunks; }

    public String getEmbeddingModel() { return embeddingModel; }
    public void setEmbeddingModel(String embeddingModel) { this.embeddingModel = embeddingModel; }

    public String getEmbeddingVersion() { return embeddingVersion; }
    public void setEmbeddingVersion(String embeddingVersion) { this.embeddingVersion = embeddingVersion; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
