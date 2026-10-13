package com.speak2hr.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "resume_chunks")
@JsonIgnoreProperties(ignoreUnknown = true)
public class ResumeChunk {

    @Id
    @JsonProperty("chunk_id")
    private String id;

    @JsonProperty("resume_id")
    private String resumeId;

    @JsonProperty("candidate_id")
    private String candidateId;

    @JsonProperty("chunk_index")
    private Integer chunkIndex;

    private String category; // project, work_experience, skills, education, summary, general

    private String heading;

    private String content;

    private List<String> technologies = new ArrayList<>();

    private List<Double> embedding = new ArrayList<>();

    @JsonProperty("created_at")
    private String createdAt = Instant.now().toString();

    public ResumeChunk() {}

    public ResumeChunk(String id, String resumeId, String candidateId, Integer chunkIndex,
                       String category, String heading, String content,
                       List<String> technologies, List<Double> embedding) {
        this.id = id;
        this.resumeId = resumeId;
        this.candidateId = candidateId;
        this.chunkIndex = chunkIndex;
        this.category = category;
        this.heading = heading;
        this.content = content;
        this.technologies = technologies != null ? technologies : new ArrayList<>();
        this.embedding = embedding != null ? embedding : new ArrayList<>();
        this.createdAt = Instant.now().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getResumeId() { return resumeId; }
    public void setResumeId(String resumeId) { this.resumeId = resumeId; }

    public String getCandidateId() { return candidateId; }
    public void setCandidateId(String candidateId) { this.candidateId = candidateId; }

    public Integer getChunkIndex() { return chunkIndex; }
    public void setChunkIndex(Integer chunkIndex) { this.chunkIndex = chunkIndex; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getHeading() { return heading; }
    public void setHeading(String heading) { this.heading = heading; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public List<String> getTechnologies() { return technologies != null ? technologies : new ArrayList<>(); }
    public void setTechnologies(List<String> technologies) { this.technologies = technologies; }

    public List<Double> getEmbedding() { return embedding != null ? embedding : new ArrayList<>(); }
    public void setEmbedding(List<Double> embedding) { this.embedding = embedding; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
