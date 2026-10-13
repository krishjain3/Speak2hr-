import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Alert,
  CircularProgress,
  Divider,
  RadioGroup,
  FormControlLabel,
  Radio,
  LinearProgress,
} from '@mui/material';
import {
  SmartToy,
  Person,
  Upload,
  Check,
  AutoAwesome,
  Description,
  Psychology,
  CheckCircle,
  Videocam,
  Create,
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { resumeAPI, resumeRagAPI } from '../../services/api';

const SKILLS_OPTIONS = [
  'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'AWS',
  'Docker', 'Kubernetes', 'Machine Learning', 'Data Analysis', 'TypeScript',
  'Go', 'Rust', 'C++', 'C#', '.NET', 'Ruby', 'PHP', 'Swift',
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Junior / Basic (Foundational Concepts)' },
  { value: 'medium', label: 'Mid-Level (Architecture & Tradeoffs - Recommended)' },
  { value: 'hard', label: 'Senior / Staff (Deep Systems, Scalability & Failures)' },
];

function InterviewSelection() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [selectedType, setSelectedType] = useState(null);

  // Standard AI Interview setup state
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [interviewConfig, setInterviewConfig] = useState({
    skills: user?.skills || [],
    experienceYears: user?.experienceYears || 0,
    jobDescription: '',
    targetRole: user?.targetRole || '',
    interviewLevel: 'Technical Basic',
  });

  // RAG Resume Interview setup state
  const [ragDialogOpen, setRagDialogOpen] = useState(false);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragGenerating, setRagGenerating] = useState(false);
  const [ragData, setRagData] = useState(null);
  const [ragError, setRagError] = useState('');
  const [existingResumes, setExistingResumes] = useState([]);
  const [selectedExistingResumeId, setSelectedExistingResumeId] = useState('');

  const [ragConfig, setRagConfig] = useState({
    role: user?.targetRole || 'Full-Stack Developer',
    difficulty: 'medium',
    numQuestions: 10,
    focusArea: 'Full Technical & Project Defense',
    answerMode: 'video', // 'video' or 'text'
  });

  // Fetch candidate's previously uploaded resumes on mount
  useEffect(() => {
    if (user?.id) {
      resumeRagAPI.getCandidateResumes(user.id)
        .then((res) => {
          if (res.data?.resumes && res.data.resumes.length > 0) {
            setExistingResumes(res.data.resumes);
            setSelectedExistingResumeId(res.data.resumes[0].resume_id);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const handleInterviewTypeSelect = (type) => {
    setSelectedType(type);
    if (type === 'rag') {
      setRagError('');
      setRagDialogOpen(true);
    } else if (type === 'ai') {
      setSetupDialogOpen(true);
    } else {
      navigate('/candidate/hr-interview-booking');
    }
  };

  // Standard AI Interview Resume Upload
  const handleStandardResumeUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const response = await resumeAPI.upload(file);
      setResumeData(response.data);
      setResumeUploaded(true);
      if (response.data.skills) {
        setInterviewConfig(prev => ({
          ...prev,
          skills: response.data.skills,
        }));
      }
    } catch (error) {
      console.error('Resume upload failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartStandardAIInterview = () => {
    setSetupDialogOpen(false);
    navigate('/candidate/ai-interview', {
      state: {
        config: interviewConfig,
        resumeData: resumeData,
        isRag: false,
      },
    });
  };

  // RAG Resume Upload
  const handleRagFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setRagLoading(true);
    setRagError('');
    try {
      const candidateId = user?.id || user?._id || user?.userId || 'candidate_user';
      const response = await resumeRagAPI.uploadResume(file, candidateId);
      setRagData(response.data);
      setSelectedExistingResumeId(response.data.resume_id);
      if (response.data.target_role) {
        setRagConfig(prev => ({ ...prev, role: response.data.target_role }));
      }
    } catch (err) {
      console.error('RAG resume upload failed:', err);
      let detail = err.response?.data?.detail || err.response?.data?.message || err.response?.data?.error;
      if (!detail || detail === 'Not Found' || err.response?.status === 404) {
        detail = 'Cannot connect to backend service. Please verify that the Java Spring Boot backend is running at http://localhost:8000.';
      }
      setRagError(detail);
    } finally {
      setRagLoading(false);
    }
  };

  const handleStartRagInterview = async () => {
    const resumeId = ragData?.resume_id || selectedExistingResumeId;
    if (!resumeId) {
      setRagError('Please upload your resume first.');
      return;
    }

    setRagGenerating(true);
    setRagError('');
    try {
      const candidateId = user?.id || user?._id || user?.userId || 'candidate_user';
      const targetRole = ragData?.target_role || ragConfig.role || user?.targetRole || 'Full-Stack Developer';
      const response = await resumeRagAPI.generateQuestions({
        candidateId: candidateId,
        resumeId: resumeId,
        role: targetRole,
        candidateName: user?.name || ragData?.candidate_name || 'Candidate',
        candidateEmail: user?.email || '',
        numQuestions: parseInt(ragConfig.numQuestions) || 10,
        difficulty: ragConfig.difficulty,
        focusArea: 'Full Technical & Project Defense',
      });

      setRagDialogOpen(false);
      navigate('/candidate/ai-interview', {
        state: {
          isRag: true,
          ragSessionId: response.data.session_id,
          questions: response.data.questions,
          role: targetRole,
          answerMode: ragConfig.answerMode,
          resumeData: ragData,
        },
      });
    } catch (err) {
      console.error('Failed to generate RAG questions:', err);
      let detail = err.response?.data?.detail || err.response?.data?.message || err.response?.data?.error;
      if (!detail || detail === 'Not Found' || err.response?.status === 404) {
        detail = 'Failed to generate interview questions. Please verify that the Java Spring Boot backend is running at http://localhost:8000.';
      }
      setRagError(detail);
    } finally {
      setRagGenerating(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={600}>
          Select Interview Type
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Choose between personalized Resume-Based RAG, Practice AI mock rounds, or Live HR sessions.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Featured Card: Resume-Based Technical Interview (RAG AI) */}
        <Grid item xs={12} md={4}>
          <Card
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              overflow: 'hidden',
              border: selectedType === 'rag' ? '2px solid' : '1px solid',
              borderColor: selectedType === 'rag' ? 'primary.main' : 'divider',
              background: 'linear-gradient(180deg, rgba(238, 242, 255, 0.5) 0%, rgba(255, 255, 255, 1) 100%)',
              '&:hover': {
                transform: 'translateY(-6px)',
                boxShadow: 6,
                borderColor: 'primary.main',
              },
            }}
            onClick={() => handleInterviewTypeSelect('rag')}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                bgcolor: 'primary.main',
                color: 'white',
                px: 1.5,
                py: 0.5,
                borderRadius: 2,
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AutoAwesome sx={{ fontSize: 14 }} /> RAG POWERED
            </Box>

            <CardContent sx={{ p: 4, textAlign: 'center', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  bgcolor: 'primary.light',
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Psychology sx={{ fontSize: 46 }} />
              </Box>

              <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
                Resume-Based Interview
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Targeted technical defense based strictly on your uploaded resume.
                Deeply probes your actual projects, verified architectures, and engineering choices with zero fabrication.
              </Typography>

              <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.5 }}>
                <Chip label="Evidence Grounded" size="small" color="primary" variant="outlined" />
                <Chip label="Project Deep-Dives" size="small" color="primary" variant="outlined" />
                <Chip label="Zero Hallucination" size="small" color="primary" variant="outlined" />
                <Chip label="Spoken or Written" size="small" color="primary" variant="outlined" />
              </Box>

              <Box sx={{ mt: 'auto' }}>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<AutoAwesome />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInterviewTypeSelect('rag');
                  }}
                  sx={{ py: 1.2, fontWeight: 600 }}
                >
                  Start Resume Interview
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Standard AI Mock Interview Card */}
        <Grid item xs={12} md={4}>
          <Card
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              transition: 'all 0.3s',
              border: selectedType === 'ai' ? '2px solid' : '1px solid',
              borderColor: selectedType === 'ai' ? 'primary.main' : 'divider',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 4,
              },
            }}
            onClick={() => handleInterviewTypeSelect('ai')}
          >
            <CardContent sx={{ p: 4, textAlign: 'center', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  bgcolor: 'info.light',
                  color: 'info.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <SmartToy sx={{ fontSize: 46 }} />
              </Box>

              <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
                Role Practice Mock
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Curated 8-level technical mock interviews covering system design, coding,
                algorithms, and behavioral rounds with emotion analysis.
              </Typography>

              <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.5 }}>
                <Chip label="8 Progressive Levels" size="small" />
                <Chip label="Instant Feedback" size="small" />
                <Chip label="Emotion Analysis" size="small" />
                <Chip label="Role Question Banks" size="small" />
              </Box>

              <Box sx={{ mt: 'auto' }}>
                <Button
                  variant="outlined"
                  size="large"
                  fullWidth
                  startIcon={<SmartToy />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInterviewTypeSelect('ai');
                  }}
                  sx={{ py: 1.2 }}
                >
                  Role Mock Interview
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* HR Interview Card */}
        <Grid item xs={12} md={4}>
          <Card
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              transition: 'all 0.3s',
              border: selectedType === 'hr' ? '2px solid' : '1px solid',
              borderColor: selectedType === 'hr' ? 'secondary.main' : 'divider',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 4,
              },
            }}
            onClick={() => handleInterviewTypeSelect('hr')}
          >
            <CardContent sx={{ p: 4, textAlign: 'center', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  bgcolor: 'secondary.light',
                  color: 'secondary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Person sx={{ fontSize: 46 }} />
              </Box>

              <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
                Live HR Interview
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Schedule a live 1-on-1 interview session with our HR team.
                Book available slots and receive personalized human recruiter feedback.
              </Typography>

              <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.5 }}>
                <Chip label="Live Human Call" size="small" color="secondary" variant="outlined" />
                <Chip label="Slot Booking" size="small" color="secondary" variant="outlined" />
                <Chip label="HR Feedback" size="small" color="secondary" variant="outlined" />
                <Chip label="Behavioral & Fit" size="small" color="secondary" variant="outlined" />
              </Box>

              <Box sx={{ mt: 'auto' }}>
                <Button
                  variant="outlined"
                  color="secondary"
                  size="large"
                  fullWidth
                  startIcon={<Person />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInterviewTypeSelect('hr');
                  }}
                  sx={{ py: 1.2 }}
                >
                  Book HR Interview
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* RAG RESUME INTERVIEW SETUP DIALOG */}
      <Dialog
        open={ragDialogOpen}
        onClose={() => !ragGenerating && setRagDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesome color="primary" />
            <Typography variant="h6" fontWeight={700}>
              Setup Resume-Based RAG Interview
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Upload or select your resume to generate personalized, factual technical interview questions.
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {ragError && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setRagError('')}>
              {ragError}
            </Alert>
          )}

          {/* Resume Upload / Selection Section */}
          <Box sx={{ p: 2.5, mb: 3, border: '1px dashed', borderColor: 'primary.main', borderRadius: 2, bgcolor: 'background.default' }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Description color="primary" fontSize="small" /> 1. Provide Your Resume (PDF or DOCX)
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
              <Button
                variant="contained"
                component="label"
                startIcon={ragLoading ? <CircularProgress size={20} color="inherit" /> : <Upload />}
                disabled={ragLoading || ragGenerating}
              >
                {ragLoading ? 'Analyzing Resume...' : 'Upload New Resume'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={handleRagFileUpload}
                />
              </Button>

              {existingResumes.length > 0 && (
                <FormControl size="small" sx={{ minWidth: 260 }}>
                  <InputLabel>Or Select Previous Resume</InputLabel>
                  <Select
                    value={selectedExistingResumeId}
                    label="Or Select Previous Resume"
                    onChange={(e) => setSelectedExistingResumeId(e.target.value)}
                    disabled={ragLoading || ragGenerating}
                  >
                    {existingResumes.map((r) => (
                      <MenuItem key={r.resume_id} value={r.resume_id}>
                        {r.filename} ({r.chunks_count} chunks)
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>

            {ragLoading && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Extracting text, chunking project sections, and indexing vectors...
                </Typography>
                <LinearProgress sx={{ mt: 0.5 }} />
              </Box>
            )}

            {ragData && (
              <Alert severity="success" icon={<CheckCircle fontSize="inherit" />} sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  {ragData.filename} {ragData.is_cached ? '(Cached Vectors Loaded)' : '(Indexed & Cached)'}
                </Typography>
                <Typography variant="body2">
                  Created <strong>{ragData.chunks_count} structured chunks</strong> with persistent vector embeddings.
                </Typography>
                {ragData.detected_projects?.length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                    <Typography variant="caption" fontWeight={600}>Verified Projects:</Typography>
                    {ragData.detected_projects.map((p) => (
                      <Chip key={p} label={p} size="small" color="primary" variant="outlined" />
                    ))}
                  </Box>
                )}
                {ragData.skills?.length > 0 && (
                  <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                    <Typography variant="caption" fontWeight={600}>Verified Skills:</Typography>
                    {ragData.skills.slice(0, 8).map((s) => (
                      <Chip key={s} label={s} size="small" />
                    ))}
                  </Box>
                )}
              </Alert>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Interview Configuration Section - exactly the requested parameters */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            2. Configure Interview Parameters
          </Typography>

          <Grid container spacing={2}>
            {/* Number of Questions */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Number of Questions</InputLabel>
                <Select
                  value={ragConfig.numQuestions}
                  label="Number of Questions"
                  onChange={(e) => setRagConfig({ ...ragConfig, numQuestions: e.target.value })}
                  disabled={ragGenerating}
                >
                  <MenuItem value={5}>5 Questions (Quick Technical Screen)</MenuItem>
                  <MenuItem value={6}>6 Questions (Quick Technical Screen)</MenuItem>
                  <MenuItem value={8}>8 Questions (Standard Round)</MenuItem>
                  <MenuItem value={10}>10 Questions (Complete Technical Defense - Default)</MenuItem>
                  <MenuItem value={12}>12 Questions (Deep Comprehensive Review)</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Experience / Difficulty Level */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Experience / Difficulty Level</InputLabel>
                <Select
                  value={ragConfig.difficulty}
                  label="Experience / Difficulty Level"
                  onChange={(e) => setRagConfig({ ...ragConfig, difficulty: e.target.value })}
                  disabled={ragGenerating}
                >
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Response Mode: Spoken or Written */}
            <Grid item xs={12}>
              <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  Response Mode:
                </Typography>
                <RadioGroup
                  row
                  value={ragConfig.answerMode}
                  onChange={(e) => setRagConfig({ ...ragConfig, answerMode: e.target.value })}
                >
                  <FormControlLabel
                    value="video"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Videocam fontSize="small" color="primary" />
                        <Typography variant="body2">Spoken (Camera, Audio & Emotion Analysis)</Typography>
                      </Box>
                    }
                    disabled={ragGenerating}
                  />
                  <FormControlLabel
                    value="text"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Create fontSize="small" color="primary" />
                        <Typography variant="body2">Written (Text Responses & Code)</Typography>
                      </Box>
                    }
                    disabled={ragGenerating}
                  />
                </RadioGroup>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setRagDialogOpen(false)} disabled={ragGenerating}>
            Cancel
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handleStartRagInterview}
            disabled={ragGenerating || (!ragData && !selectedExistingResumeId)}
            startIcon={ragGenerating ? <CircularProgress size={20} color="inherit" /> : <AutoAwesome />}
            sx={{ px: 4, py: 1.2, fontWeight: 700 }}
          >
            {ragGenerating ? 'Generating Evidence-Grounded Questions...' : 'Start RAG Interview'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* STANDARD AI MOCK SETUP DIALOG */}
      <Dialog open={setupDialogOpen} onClose={() => setSetupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>
            Setup Role Practice Mock Interview
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Upload Resume (Optional for Skill Extraction)
              </Typography>
              <Button
                variant="outlined"
                component="label"
                startIcon={resumeUploaded ? <Check /> : <Upload />}
                color={resumeUploaded ? 'success' : 'primary'}
                disabled={loading}
              >
                {resumeUploaded ? 'Resume Uploaded' : 'Upload Resume'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleStandardResumeUpload}
                />
              </Button>
              {resumeUploaded && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  Resume analyzed! Skills have been auto-filled below.
                </Alert>
              )}
            </Box>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Your Skills</InputLabel>
              <Select
                multiple
                value={interviewConfig.skills}
                onChange={(e) => {
                  const val = e.target.value;
                  setInterviewConfig({
                    ...interviewConfig,
                    skills: typeof val === 'string' ? val.split(',') : val,
                  });
                }}
                input={<OutlinedInput label="Your Skills" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value} size="small" />
                    ))}
                  </Box>
                )}
              >
                {SKILLS_OPTIONS.map((skill) => (
                  <MenuItem key={skill} value={skill}>{skill}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Years of Experience"
              type="number"
              value={interviewConfig.experienceYears}
              onChange={(e) => setInterviewConfig({ ...interviewConfig, experienceYears: parseInt(e.target.value) || 0 })}
              sx={{ mb: 2 }}
              inputProps={{ min: 0, max: 50 }}
            />

            <TextField
              fullWidth
              label="Target Role"
              value={interviewConfig.targetRole}
              onChange={(e) => setInterviewConfig({ ...interviewConfig, targetRole: e.target.value })}
              sx={{ mb: 2 }}
              placeholder="e.g., Software Engineer"
            />

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="standard-level-label">Interview Level / Focus</InputLabel>
              <Select
                labelId="standard-level-label"
                value={interviewConfig.interviewLevel}
                label="Interview Level / Focus"
                onChange={(e) => setInterviewConfig({ ...interviewConfig, interviewLevel: e.target.value })}
              >
                <MenuItem value="Technical Basic">Technical Basic</MenuItem>
                <MenuItem value="Technical Advanced">Technical Advanced</MenuItem>
                <MenuItem value="Tech Expert">Tech Expert</MenuItem>
                <MenuItem value="Problem Solving">Problem Solving</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Job Description (Optional)"
              multiline
              rows={3}
              value={interviewConfig.jobDescription}
              onChange={(e) => setInterviewConfig({ ...interviewConfig, jobDescription: e.target.value })}
              placeholder="Paste job description to tailor mock questions..."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSetupDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleStartStandardAIInterview}
            disabled={interviewConfig.skills.length === 0}
          >
            Start Mock Interview
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default InterviewSelection;
