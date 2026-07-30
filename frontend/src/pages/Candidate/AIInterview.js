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
} from '@mui/icons-material';
import Webcam from 'react-webcam';
import { interviewAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useInterviewStore } from '../../store/authStore';

const QUESTION_LEVELS = [
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

  const webcamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioChunksRef = useRef([]);

  const [sessionId] = useState(`session_${Date.now()}`);
  const [isLoading, setIsLoading] = useState(true);
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
      // Countdown reached 0: proceed
      handleNextQuestion();
    }
    return () => clearInterval(timer);
  }, [showEvaluation, isTimerPaused, countdown]);

  const config = location.state?.config;

  // Generate questions on mount
  useEffect(() => {
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

  const submitResponse = async () => {
    if (!recordedBlob || !audioBlob) {
      setError('Please record your response first');
      return;
    }

    console.log('[AIInterview] Submitting response for evaluation...');
    setEvaluating(true);
    setError('');

    const currentQuestion = questions[currentQuestionIndex];

    try {
      const videoFile = new File([recordedBlob], 'response.webm', { type: 'video/webm' });
      const audioFile = new File([audioBlob], 'response.webm', { type: 'audio/webm' });

      console.log('[AIInterview] Files packaged. Sending to backend...');
      const response = await interviewAPI.evaluateResponse(
        sessionId,
        currentQuestion,
        videoFile,
        audioFile
      );
      
      console.log('[AIInterview] Received evaluation response:', response.data);
      setCurrentEvaluation(response.data);
      addResponse(response.data);
      setCountdown(15);
      setIsTimerPaused(false);
      setShowEvaluation(true);
    } catch (err) {
      console.error('[AIInterview] Evaluation failed:', err);
      const errMsg = err.response?.data?.detail || err.message || 'Failed to evaluate response. Please try again.';
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

    if (currentQuestionIndex < questions.length - 1) {
      nextQuestion();
    } else {
      setInterviewComplete(true);
      handleFinishInterview();
    }
  };

  const handleFinishInterview = async () => {
    console.log('[AIInterview] Finalizing interview and generating report...');
    setEvaluating(true);
    setError('Generating final interview report. Please wait...');
    try {
      const summary = await interviewAPI.getSessionSummary(sessionId);
      console.log('[AIInterview] Report summary generated:', summary.data);
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
            Generating interview questions...
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
      {/* Progress Stepper */}
      <Box sx={{ mb: 3 }}>
        <Stepper activeStep={currentQuestionIndex} alternativeLabel>
          {QUESTION_LEVELS.map((label, index) => (
            <Step key={label} completed={index < currentQuestionIndex}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <Grid container spacing={3}>
        {/* Video Preview */}
        <Grid item xs={12} md={7}>
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
                  <Box sx={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

              {/* Controls */}
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
        </Grid>

        {/* Question Panel */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ mb: 2 }}>
                <Chip
                  label={`Level ${currentQuestion?.level}: ${QUESTION_LEVELS[currentQuestion?.level - 1]}`}
                  color="primary"
                  size="small"
                />
                <Typography variant="caption" sx={{ ml: 1 }}>
                  Question {currentQuestionIndex + 1} of {questions.length}
                </Typography>
              </Box>

              <Typography variant="h6" sx={{ mb: 3 }}>
                {currentQuestion?.question}
              </Typography>

              {error && (
                <Box sx={{ mb: 2 }}>
                  <Alert severity="error" sx={{ mb: 1 }}>
                    {error}
                  </Alert>
                  {!evaluating && (
                    <Button
                      variant="outlined"
                      color="warning"
                      onClick={handleNextQuestion}
                      fullWidth
                    >
                      Skip & Move to Next Question
                    </Button>
                  )}
                </Box>
              )}

              {/* Recording Controls */}
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
                    <Alert severity="success">
                      Response recorded successfully!
                    </Alert>
                    <Button
                      variant="outlined"
                      onClick={startRecording}
                      fullWidth
                    >
                      Re-record
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      startIcon={<Assessment />}
                      onClick={submitResponse}
                      fullWidth
                    >
                      Submit for Evaluation
                    </Button>
                  </>
                )}
                {evaluating && (
                  <Box sx={{ textAlign: 'center', py: 2 }}>
                    <CircularProgress />
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {error && error.includes('wait') ? error : "Analyzing your response..."}
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Evaluation Dialog */}
      <Dialog open={showEvaluation} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight={600}>
              Response Evaluation
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
                  {Math.round((currentEvaluation.weighted_score || currentEvaluation.base_score || 0) * 100)}%
                </Typography>
                <Chip
                  label={currentEvaluation.rating || 'Evaluated'}
                  color={
                    currentEvaluation.weighted_score >= 0.85 ? 'success' :
                    currentEvaluation.weighted_score >= 0.60 ? 'warning' : 'error'
                  }
                />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Relevance</Typography>
                  <LinearProgress variant="determinate" value={(currentEvaluation.relevance_score || 0) * 100} sx={{ height: 8, borderRadius: 4 }} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Clarity</Typography>
                  <LinearProgress variant="determinate" value={(currentEvaluation.clarity_score || 0) * 100} sx={{ height: 8, borderRadius: 4 }} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Confidence</Typography>
                  <LinearProgress variant="determinate" value={(currentEvaluation.confidence_score || 0) * 100} sx={{ height: 8, borderRadius: 4 }} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Technical</Typography>
                  <LinearProgress variant="determinate" value={(currentEvaluation.technical_accuracy_score || 0) * 100} sx={{ height: 8, borderRadius: 4 }} />
                </Grid>
              </Grid>

              {currentEvaluation.feedback && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" fontWeight={600}>Feedback</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {currentEvaluation.feedback}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setIsTimerPaused(!isTimerPaused)}
          >
            {isTimerPaused ? 'Resume Autoplay' : 'Pause'}
          </Button>
          <Button
            variant="contained"
            onClick={handleNextQuestion}
            endIcon={currentQuestionIndex < questions.length - 1 ? <NavigateNext /> : <Check />}
          >
            {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Generating Report...'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Interview Complete Dialog */}
      <Dialog open={interviewComplete} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h5" fontWeight={600} textAlign="center">
            Interview Complete!
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Check sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              Congratulations! You have completed all 8 levels of the interview.
              Your detailed report is being generated.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button variant="contained" size="large" onClick={handleFinishInterview}>
            View Results & Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AIInterview;
