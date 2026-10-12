import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Grid,
  Stepper,
  Step,
  StepLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Videocam,
  VideocamOff,
  Mic,
  MicOff,
  PlayArrow,
  Stop,
  NavigateNext,
  Check,
  Assessment,
  Create,
  FolderSpecial,
  AutoAwesome,
} from '@mui/icons-material';
import Webcam from 'react-webcam';
import { interviewAPI, resumeRagAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useInterviewStore } from '../../store/authStore';

const STANDARD_QUESTION_LEVELS = [
  'Introduction',
  'Recent Project',
  'Technical Concepts',
  'Coding/Algorithms',
  'System Design',
  'Behavioral (STAR)',
  'Scenario Analysis',
  'Career Goals',
];

function AIInterview() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    questions,
    setQuestions,
    currentQuestionIndex,
    nextQuestion,
    addResponse,
    setSessionResults,
    resetInterview,
  } = useInterviewStore();

  const isRag = Boolean(location.state?.isRag);
  const ragSessionId = location.state?.ragSessionId;
  const initialRagQuestions = location.state?.questions;
  const initialMode = location.state?.answerMode || 'video';

  const webcamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioChunksRef = useRef([]);

  const [sessionId] = useState(ragSessionId || `session_${Date.now()}`);
  const [isLoading, setIsLoading] = useState(!isRag);
  const [responseMode, setResponseMode] = useState(initialMode); // 'video' or 'text'
  const [textAnswer, setTextAnswer] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [currentEvaluation, setCurrentEvaluation] = useState(null);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [countdown, setCountdown] = useState(15);
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  // Automatic countdown transition
  useEffect(() => {
    let timer;
    if (showEvaluation && !isTimerPaused && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (showEvaluation && countdown === 0) {
      handleNextQuestion();
    }
    return () => clearInterval(timer);
  }, [showEvaluation, isTimerPaused, countdown]);

  const config = location.state?.config;

  // Initialize questions
  useEffect(() => {
    if (isRag && initialRagQuestions && initialRagQuestions.length > 0) {
      setQuestions(initialRagQuestions);
      setIsLoading(false);
      return;
    }

    const generateQuestions = async () => {
      if (!config) {
        navigate('/candidate/interview-selection');
        return;
      }

      try {
        const response = await interviewAPI.generateQuestions({
          candidateName: user?.name || 'Candidate',
          candidateEmail: user?.email || '',
          skills: config.skills,
          experienceYears: config.experienceYears,
          jobDescription: config.jobDescription || config.targetRole,
          targetRole: config.targetRole || 'Software Engineer',
          workHistory: [],
          userId: user?.id,
          interviewLevel: config.interviewLevel || 'Technical Basic',
        });
        setQuestions(response.data.questions);
      } catch (err) {
        setError('Failed to generate questions. Please try again.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    generateQuestions();

    return () => {
      resetInterview();
    };
  }, []);

  // Recording timer
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    chunksRef.current = [];
    audioChunksRef.current = [];
    setRecordedBlob(null);
    setAudioBlob(null);

    try {
      const stream = webcamRef.current?.stream;
      if (!stream) {
        setError('Camera not available');
        return;
      }

      // Video recording
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'video/webm',
      });
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);
      };

      // Audio recording
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioRecorderRef.current = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm',
      });
      audioRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      audioRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      mediaRecorderRef.current.start();
      audioRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      setError('Failed to start recording. Please check camera/mic permissions.');
      console.error(err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
      audioRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Submit spoken video/audio response
  const submitSpokenResponse = async () => {
    if (!recordedBlob || !audioBlob) {
      setError('Please record your response first');
      return;
    }

    setEvaluating(true);
    setError('');

    const currentQuestion = questions[currentQuestionIndex];

    try {
      const videoFile = new File([recordedBlob], 'response.webm', { type: 'video/webm' });
      const audioFile = new File([audioBlob], 'response.webm', { type: 'audio/webm' });

      const response = await interviewAPI.evaluateResponse(
        sessionId,
        currentQuestion,
        videoFile,
        audioFile
      );

      setCurrentEvaluation(response.data);
      addResponse(response.data);
      setCountdown(15);
      setIsTimerPaused(false);
      setShowEvaluation(true);
    } catch (err) {
      console.error('[AIInterview] Evaluation failed:', err);
      const errMsg = err.response?.data?.detail || err.message || 'Failed to evaluate response.';
      setError(`Failed to evaluate response: ${errMsg}`);
    } finally {
      setEvaluating(false);
    }
  };

  // Submit written text response
  const submitTextResponse = async () => {
    if (!textAnswer.trim() || textAnswer.trim().length < 10) {
      setError('Please enter a substantive answer before submitting (at least 10 characters).');
      return;
    }

    setEvaluating(true);
    setError('');

    const currentQuestion = questions[currentQuestionIndex];

    try {
      const response = await resumeRagAPI.evaluateTextResponse({
        sessionId: sessionId,
        candidateId: user?.id || 'candidate_user',
        questionId: currentQuestion.question_id,
        question: currentQuestion.question,
        answerText: textAnswer.trim(),
        category: currentQuestion.category || 'technical',
        difficulty: currentQuestion.difficulty || 'medium',
        expectedKeywords: currentQuestion.expected_keywords || [],
      });

      const evalData = response.data;
      const formattedEval = {
        question_id: currentQuestion.question_id,
        question: currentQuestion.question,
        weighted_score: evalData.scores?.overall || 0.5,
        relevance_score: evalData.scores?.relevance || 0.5,
        clarity_score: evalData.scores?.clarity || 0.5,
        confidence_score: evalData.scores?.confidence || 0.5,
        technical_accuracy_score: evalData.scores?.technical_accuracy || 0.5,
        feedback: evalData.feedback,
        strengths: evalData.strengths || [],
        improvements: evalData.improvements || [],
        transcription: textAnswer.trim(),
      };

      setCurrentEvaluation(formattedEval);
      addResponse(formattedEval);
      setCountdown(15);
      setIsTimerPaused(false);
      setShowEvaluation(true);
    } catch (err) {
      console.error('[AIInterview] Text evaluation failed:', err);
      const errMsg = err.response?.data?.detail || err.message || 'Failed to evaluate text response.';
      setError(`Failed to evaluate response: ${errMsg}`);
    } finally {
      setEvaluating(false);
    }
  };

  const handleNextQuestion = () => {
    setShowEvaluation(false);
    setCurrentEvaluation(null);
    setRecordedBlob(null);
    setAudioBlob(null);
    setTextAnswer('');

    if (currentQuestionIndex < questions.length - 1) {
      nextQuestion();
    } else {
      setInterviewComplete(true);
      handleFinishInterview();
    }
  };

  const handleFinishInterview = async () => {
    setEvaluating(true);
    setError('Generating final interview report. Please wait...');
    try {
      const summary = await interviewAPI.getSessionSummary(sessionId);
      setSessionResults(summary.data);
      navigate('/candidate/reports', { state: { sessionId, summary: summary.data } });
    } catch (err) {
      console.error('[AIInterview] Failed to load session summary:', err);
      navigate('/candidate/reports');
    } finally {
      setEvaluating(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Preparing your personalized technical interview...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (error && questions.length === 0) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="contained" onClick={() => navigate('/candidate/interview-selection')}>
          Go Back
        </Button>
      </Box>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <Box>
      {/* Top Banner & Stepper */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isRag && (
              <Chip
                icon={<AutoAwesome />}
                label="Resume-Based RAG Interview"
                color="primary"
                size="small"
                sx={{ fontWeight: 600 }}
              />
            )}
            <Typography variant="h6" fontWeight={600}>
              Question {currentQuestionIndex + 1} of {questions.length}
            </Typography>
          </Box>

          {/* Mode Switcher */}
          <ToggleButtonGroup
            value={responseMode}
            exclusive
            onChange={(_, newMode) => newMode && setResponseMode(newMode)}
            size="small"
          >
            <ToggleButton value="video" disabled={isRecording}>
              <Videocam fontSize="small" sx={{ mr: 0.5 }} /> Spoken Video
            </ToggleButton>
            <ToggleButton value="text" disabled={isRecording}>
              <Create fontSize="small" sx={{ mr: 0.5 }} /> Written Text
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Dynamic Stepper */}
        <Stepper activeStep={currentQuestionIndex} alternativeLabel>
          {questions.map((q, index) => (
            <Step key={q.question_id || index} completed={index < currentQuestionIndex}>
              <StepLabel>
                {isRag ? `Q${index + 1}` : STANDARD_QUESTION_LEVELS[index] || `L${index + 1}`}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <Grid container spacing={3}>
        {/* Left Column: Response Input (Camera Preview or Text Area) */}
        <Grid item xs={12} md={7}>
          {responseMode === 'video' ? (
            <Card>
              <CardContent>
                <Box sx={{ position: 'relative', backgroundColor: 'black', borderRadius: 1, overflow: 'hidden' }}>
                  {isCameraOn ? (
                    <Webcam
                      ref={webcamRef}
                      audio={isMicOn}
                      videoConstraints={{ facingMode: 'user' }}
                      style={{ width: '100%', display: 'block' }}
                    />
                  ) : (
                    <Box sx={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <VideocamOff sx={{ fontSize: 80, color: 'grey.500' }} />
                    </Box>
                  )}

                  {isRecording && (
                    <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
                      <Chip
                        icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main', animation: 'pulse 1s infinite' }} />}
                        label={formatTime(recordingTime)}
                        color="error"
                        size="small"
                      />
                    </Box>
                  )}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={() => setIsCameraOn(!isCameraOn)}
                    startIcon={isCameraOn ? <Videocam /> : <VideocamOff />}
                  >
                    {isCameraOn ? 'Camera On' : 'Camera Off'}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => setIsMicOn(!isMicOn)}
                    startIcon={isMicOn ? <Mic /> : <MicOff />}
                  >
                    {isMicOn ? 'Mic On' : 'Mic Off'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          ) : (
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Create color="primary" />
                  <Typography variant="h6" fontWeight={600}>
                    Write Your Technical Response
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Explain your architecture choices, engineering tradeoffs, and implementation details.
                  You may include code snippets or pseudocode.
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={14}
                  variant="outlined"
                  placeholder="Explain your approach, system architecture, database design, and key implementation decisions here..."
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  disabled={evaluating}
                  sx={{
                    fontFamily: 'monospace',
                    flexGrow: 1,
                  }}
                />
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Right Column: Question Panel & Action Controls */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              {/* Question Metadata Tags */}
              <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                <Chip
                  label={currentQuestion?.level_name || `Question ${currentQuestionIndex + 1}`}
                  color="primary"
                  size="small"
                />
                <Chip
                  label={currentQuestion?.difficulty?.toUpperCase() || 'MEDIUM'}
                  color={
                    currentQuestion?.difficulty === 'hard' ? 'error' :
                    currentQuestion?.difficulty === 'medium' ? 'warning' : 'success'
                  }
                  size="small"
                  variant="outlined"
                />
              </Box>

              {/* Project Context Badge (for RAG questions) */}
              {currentQuestion?.project_context && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: 'primary.light', borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FolderSpecial color="primary" fontSize="small" />
                  <Typography variant="body2" fontWeight={600} color="primary.dark">
                    Context: {currentQuestion.project_context}
                  </Typography>
                </Box>
              )}

              {/* The Actual Question */}
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, lineHeight: 1.4 }}>
                {currentQuestion?.question}
              </Typography>

              {/* Expected Keywords hint if provided */}
              {currentQuestion?.expected_keywords?.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Key Concepts to Address:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {currentQuestion.expected_keywords.map((kw) => (
                      <Chip key={kw} label={kw} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}

              {error && (
                <Box sx={{ mb: 2 }}>
                  <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>
                  {!evaluating && (
                    <Button variant="outlined" color="warning" onClick={handleNextQuestion} fullWidth>
                      Skip & Next Question
                    </Button>
                  )}
                </Box>
              )}

              {/* Controls depending on Spoken vs Written Mode */}
              <Box sx={{ mt: 'auto', pt: 2 }}>
                {responseMode === 'video' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {!isRecording && !recordedBlob && (
                      <Button
                        variant="contained"
                        color="error"
                        size="large"
                        startIcon={<PlayArrow />}
                        onClick={startRecording}
                        fullWidth
                      >
                        Start Recording
                      </Button>
                    )}

                    {isRecording && (
                      <Button
                        variant="contained"
                        color="error"
                        size="large"
                        startIcon={<Stop />}
                        onClick={stopRecording}
                        fullWidth
                      >
                        Stop Recording
                      </Button>
                    )}

                    {recordedBlob && !evaluating && (
                      <>
                        <Alert severity="success">Response recorded successfully!</Alert>
                        <Button variant="outlined" onClick={startRecording} fullWidth>
                          Re-record
                        </Button>
                        <Button
                          variant="contained"
                          color="primary"
                          size="large"
                          startIcon={<Assessment />}
                          onClick={submitSpokenResponse}
                          fullWidth
                        >
                          Submit for Evaluation
                        </Button>
                      </>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      startIcon={<Assessment />}
                      onClick={submitTextResponse}
                      disabled={evaluating || textAnswer.trim().length < 5}
                      fullWidth
                    >
                      {evaluating ? 'Evaluating Answer...' : 'Submit Technical Answer'}
                    </Button>
                  </Box>
                )}

                {evaluating && (
                  <Box sx={{ textAlign: 'center', py: 2 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Evaluating technical correctness and reasoning depth...
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* EVALUATION RESULT DIALOG */}
      <Dialog open={showEvaluation} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight={600}>
              Technical Evaluation
            </Typography>
            <Chip
              label={isTimerPaused ? "Autoplay Paused" : `Next in ${countdown}s`}
              color={isTimerPaused ? "default" : "primary"}
              variant="outlined"
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          {currentEvaluation && (
            <Box>
              <Box sx={{ mb: 3, textAlign: 'center' }}>
                <Typography variant="h3" color="primary" fontWeight={700}>
                  {Math.round((currentEvaluation.weighted_score || currentEvaluation.overall_score || 0) * 100)}%
                </Typography>
                <Chip
                  label={
                    (currentEvaluation.weighted_score || currentEvaluation.overall_score || 0) >= 0.80 ? 'Strong Answer' :
                    (currentEvaluation.weighted_score || currentEvaluation.overall_score || 0) >= 0.60 ? 'Competent' : 'Needs Improvement'
                  }
                  color={
                    (currentEvaluation.weighted_score || currentEvaluation.overall_score || 0) >= 0.80 ? 'success' :
                    (currentEvaluation.weighted_score || currentEvaluation.overall_score || 0) >= 0.60 ? 'warning' : 'error'
                  }
                />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Technical Correctness</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(currentEvaluation.technical_accuracy_score || currentEvaluation.technical_accuracy || 0) * 100}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Relevance</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(currentEvaluation.relevance_score || currentEvaluation.relevance || 0) * 100}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Clarity</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(currentEvaluation.clarity_score || currentEvaluation.clarity || 0) * 100}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Reasoning Depth</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(currentEvaluation.confidence_score || currentEvaluation.confidence || 0) * 100}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Grid>
              </Grid>

              {currentEvaluation.strengths?.length > 0 && (
                <Box sx={{ mt: 2.5 }}>
                  <Typography variant="subtitle2" fontWeight={600} color="success.main">
                    Key Strengths:
                  </Typography>
                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                    {currentEvaluation.strengths.map((s, i) => (
                      <li key={i}><Typography variant="body2">{s}</Typography></li>
                    ))}
                  </ul>
                </Box>
              )}

              {currentEvaluation.improvements?.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight={600} color="warning.main">
                    Areas for Improvement:
                  </Typography>
                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                    {currentEvaluation.improvements.map((imp, i) => (
                      <li key={i}><Typography variant="body2">{imp}</Typography></li>
                    ))}
                  </ul>
                </Box>
              )}

              {currentEvaluation.feedback && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600}>Feedback Summary:</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {currentEvaluation.feedback}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setIsTimerPaused(!isTimerPaused)}>
            {isTimerPaused ? 'Resume Countdown' : 'Pause'}
          </Button>
          <Button
            variant="contained"
            onClick={handleNextQuestion}
            endIcon={currentQuestionIndex < questions.length - 1 ? <NavigateNext /> : <Check />}
          >
            {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish & View Report'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* INTERVIEW COMPLETE DIALOG */}
      <Dialog open={interviewComplete} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h5" fontWeight={600} textAlign="center">
            Interview Session Complete!
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Check sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              Congratulations! You have completed all questions in your resume-grounded interview.
              Your evaluation report has been compiled and saved.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button variant="contained" size="large" onClick={handleFinishInterview}>
            View Detailed Candidate Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AIInterview;
