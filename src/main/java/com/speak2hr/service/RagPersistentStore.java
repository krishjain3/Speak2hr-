package com.speak2hr.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.speak2hr.model.RagInterviewSession;
import com.speak2hr.model.ResumeChunk;
import com.speak2hr.model.ResumeDocument;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Robust persistent store for RAG resumes, vector embeddings, chunks, and sessions.
 * Guarantees persistence across backend restarts via local disk storage and mirrors
 * to MongoDB when available.
 */
@Service
public class RagPersistentStore {

    private static final Logger logger = LoggerFactory.getLogger(RagPersistentStore.class);

    private final ObjectMapper objectMapper;
    private final MongoTemplate mongoTemplate;

    private final Path storageDir;
    private final Path resumesFile;
    private final Path chunksFile;
    private final Path sessionsFile;

    private final Map<String, ResumeDocument> resumes = new ConcurrentHashMap<>();
    private final Map<String, List<ResumeChunk>> chunksByResumeId = new ConcurrentHashMap<>();
    private final Map<String, RagInterviewSession> sessions = new ConcurrentHashMap<>();

    private volatile boolean mongoAvailable = false;
    private volatile long lastMongoCheck = 0;

    @Autowired
    public RagPersistentStore(@Autowired(required = false) MongoTemplate mongoTemplate) {
        this.objectMapper = new ObjectMapper();
        this.mongoTemplate = mongoTemplate;

        String baseDir = System.getProperty("user.dir");
        this.storageDir = Paths.get(baseDir, "data", "rag_store");
        this.resumesFile = storageDir.resolve("resumes.json");
        this.chunksFile = storageDir.resolve("chunks.json");
        this.sessionsFile = storageDir.resolve("sessions.json");
    }

    @PostConstruct
    public synchronized void init() {
        try {
            Files.createDirectories(storageDir);
            loadResumesFromDisk();
            loadChunksFromDisk();
            loadSessionsFromDisk();
            logger.info("Initialized RAG Persistent Store: {} resumes, {} chunk collections, {} sessions",
                    resumes.size(), chunksByResumeId.size(), sessions.size());
        } catch (Exception e) {
            logger.error("Failed to initialize RAG persistent store directory: {}", e.getMessage(), e);
        }
    }

    private boolean isMongoConnected() {
        if (mongoTemplate == null) return false;
        long now = System.currentTimeMillis();
        if (now - lastMongoCheck < 30000) {
            return mongoAvailable;
        }
        lastMongoCheck = now;
        try {
            mongoTemplate.executeCommand("{ ping: 1 }");
            mongoAvailable = true;
        } catch (Exception e) {
            mongoAvailable = false;
        }
        return mongoAvailable;
    }

    public synchronized void saveResume(ResumeDocument doc) {
        if (doc == null || doc.getId() == null) return;
        resumes.put(doc.getId(), doc);
        persistResumesToDisk();

        if (isMongoConnected()) {
            try {
                mongoTemplate.save(doc);
            } catch (Exception e) {
                logger.debug("MongoDB mirror skipped for resume {}: {}", doc.getId(), e.getMessage());
            }
        }
    }

    public ResumeDocument getResume(String resumeId, String candidateId) {
        if (resumeId == null) return null;
        ResumeDocument doc = resumes.get(resumeId);
        if (doc != null) {
            if (candidateId != null && !candidateId.isBlank() && !candidateId.equals(doc.getCandidateId())) {
                logger.warn("Candidate access denied: {} attempted to access resume {} owned by {}",
                        candidateId, resumeId, doc.getCandidateId());
                return null;
            }
            return doc;
        }

        if (isMongoConnected()) {
            try {
                ResumeDocument mDoc = mongoTemplate.findById(resumeId, ResumeDocument.class);
                if (mDoc != null) {
                    if (candidateId != null && !candidateId.isBlank() && !candidateId.equals(mDoc.getCandidateId())) {
                        return null;
                    }
                    resumes.put(mDoc.getId(), mDoc);
                    return mDoc;
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    public ResumeDocument getLatestResumeForCandidate(String candidateId) {
        if (candidateId == null) return null;
        List<ResumeDocument> candResumes = getResumesForCandidate(candidateId);
        return candResumes.isEmpty() ? null : candResumes.get(candResumes.size() - 1);
    }

    public List<ResumeDocument> getResumesForCandidate(String candidateId) {
        if (candidateId == null) return Collections.emptyList();
        List<ResumeDocument> list = new ArrayList<>();
        for (ResumeDocument doc : resumes.values()) {
            if (candidateId.equals(doc.getCandidateId())) {
                list.add(doc);
            }
        }
        list.sort(Comparator.comparing(ResumeDocument::getCreatedAt));
        return list;
    }

    public ResumeDocument findResumeByHash(String candidateId, String fileHash) {
        if (candidateId == null || fileHash == null) return null;
        for (ResumeDocument doc : resumes.values()) {
            if (candidateId.equals(doc.getCandidateId()) && fileHash.equals(doc.getFileHash())) {
                return doc;
            }
        }
        return null;
    }

    public synchronized void saveChunks(String resumeId, List<ResumeChunk> chunks) {
        if (resumeId == null || chunks == null) return;
        chunksByResumeId.put(resumeId, new ArrayList<>(chunks));
        persistChunksToDisk();

        if (isMongoConnected()) {
            try {
                for (ResumeChunk c : chunks) {
                    mongoTemplate.save(c);
                }
            } catch (Exception e) {
                logger.debug("MongoDB mirror skipped for chunks: {}", e.getMessage());
            }
        }
    }

    public List<ResumeChunk> getChunks(String resumeId, String candidateId) {
        if (resumeId == null) return Collections.emptyList();
        List<ResumeChunk> list = chunksByResumeId.get(resumeId);
        if (list == null && isMongoConnected()) {
            try {
                org.springframework.data.mongodb.core.query.Query q =
                        new org.springframework.data.mongodb.core.query.Query(
                                org.springframework.data.mongodb.core.query.Criteria.where("resumeId").is(resumeId)
                        );
                list = mongoTemplate.find(q, ResumeChunk.class);
                if (list != null && !list.isEmpty()) {
                    chunksByResumeId.put(resumeId, list);
                }
            } catch (Exception ignored) {}
        }

        if (list == null) return Collections.emptyList();

        if (candidateId != null && !candidateId.isBlank()) {
            for (ResumeChunk c : list) {
                if (c.getCandidateId() != null && !candidateId.equals(c.getCandidateId())) {
                    logger.warn("Security check failed: chunk candidate mismatch {} != {}",
                            candidateId, c.getCandidateId());
                    return Collections.emptyList();
                }
            }
        }
        return Collections.unmodifiableList(list);
    }

    public synchronized void saveSession(RagInterviewSession session) {
        if (session == null || session.getId() == null) return;
        sessions.put(session.getId(), session);
        persistSessionsToDisk();

        if (isMongoConnected()) {
            try {
                mongoTemplate.save(session);
            } catch (Exception e) {
                logger.debug("MongoDB mirror skipped for session {}: {}", session.getId(), e.getMessage());
            }
        }
    }

    public RagInterviewSession getSession(String sessionId) {
        if (sessionId == null) return null;
        RagInterviewSession session = sessions.get(sessionId);
        if (session != null) return session;

        if (isMongoConnected()) {
            try {
                RagInterviewSession mSession = mongoTemplate.findById(sessionId, RagInterviewSession.class);
                if (mSession != null) {
                    sessions.put(mSession.getId(), mSession);
                    return mSession;
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    public synchronized void saveEvaluation(String sessionId, Map<String, Object> evaluation) {
        RagInterviewSession session = getSession(sessionId);
        if (session != null) {
            session.getEvaluations().add(evaluation);
            saveSession(session);
        }
    }

    public List<Map<String, Object>> getEvaluations(String sessionId) {
        RagInterviewSession session = getSession(sessionId);
        return session != null ? session.getEvaluations() : Collections.emptyList();
    }

    public synchronized void deleteResume(String resumeId, String candidateId) {
        ResumeDocument doc = getResume(resumeId, candidateId);
        if (doc != null) {
            resumes.remove(resumeId);
            chunksByResumeId.remove(resumeId);
            persistResumesToDisk();
            persistChunksToDisk();

            if (isMongoConnected()) {
                try {
                    mongoTemplate.remove(doc);
                } catch (Exception ignored) {}
            }
        }
    }

    public List<ResumeDocument> getAllResumes() {
        return new ArrayList<>(resumes.values());
    }

    // ------------------------------------------------------------------------
    // Disk Serialization & Deserialization
    // ------------------------------------------------------------------------

    private void loadResumesFromDisk() {
        if (!Files.exists(resumesFile)) return;
        try {
            List<ResumeDocument> list = objectMapper.readValue(resumesFile.toFile(), new TypeReference<List<ResumeDocument>>() {});
            for (ResumeDocument doc : list) {
                resumes.put(doc.getId(), doc);
            }
        } catch (Exception e) {
            logger.warn("Could not load resumes from {}: {}", resumesFile, e.getMessage());
        }
    }

    private void persistResumesToDisk() {
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(resumesFile.toFile(), new ArrayList<>(resumes.values()));
        } catch (Exception e) {
            logger.error("Could not persist resumes to {}: {}", resumesFile, e.getMessage());
        }
    }

    private void loadChunksFromDisk() {
        if (!Files.exists(chunksFile)) return;
        try {
            Map<String, List<ResumeChunk>> map = objectMapper.readValue(chunksFile.toFile(), new TypeReference<Map<String, List<ResumeChunk>>>() {});
            chunksByResumeId.putAll(map);
        } catch (Exception e) {
            logger.warn("Could not load chunks from {}: {}", chunksFile, e.getMessage());
        }
    }

    private void persistChunksToDisk() {
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(chunksFile.toFile(), chunksByResumeId);
        } catch (Exception e) {
            logger.error("Could not persist chunks to {}: {}", chunksFile, e.getMessage());
        }
    }

    private void loadSessionsFromDisk() {
        if (!Files.exists(sessionsFile)) return;
        try {
            List<RagInterviewSession> list = objectMapper.readValue(sessionsFile.toFile(), new TypeReference<List<RagInterviewSession>>() {});
            for (RagInterviewSession s : list) {
                sessions.put(s.getId(), s);
            }
        } catch (Exception e) {
            logger.warn("Could not load sessions from {}: {}", sessionsFile, e.getMessage());
        }
    }

    private void persistSessionsToDisk() {
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(sessionsFile.toFile(), new ArrayList<>(sessions.values()));
        } catch (Exception e) {
            logger.error("Could not persist sessions to {}: {}", sessionsFile, e.getMessage());
        }
    }
}
