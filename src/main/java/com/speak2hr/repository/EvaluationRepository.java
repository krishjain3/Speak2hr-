package com.speak2hr.repository;

import com.speak2hr.model.Evaluation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EvaluationRepository extends MongoRepository<Evaluation, String> {
    List<Evaluation> findByCandidateId(String candidateId);
    List<Evaluation> findByHrId(String hrId);
}
