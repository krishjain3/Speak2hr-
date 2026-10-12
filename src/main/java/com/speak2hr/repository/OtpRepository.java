package com.speak2hr.repository;

import com.speak2hr.model.Otp;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OtpRepository extends MongoRepository<Otp, String> {
    Optional<Otp> findByEmail(String email);
    void deleteByEmail(String email);
}
