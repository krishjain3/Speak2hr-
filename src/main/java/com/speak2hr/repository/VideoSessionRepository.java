package com.speak2hr.repository;

import com.speak2hr.model.VideoSession;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VideoSessionRepository extends MongoRepository<VideoSession, String> {
    List<VideoSession> findByCandidateId(String candidateId);
    List<VideoSession> findByHrId(String hrId);
    List<VideoSession> findByStatus(String status);
}
