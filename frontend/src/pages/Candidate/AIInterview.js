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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Paper,
  Stack,
  Tooltip,
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
  AccessTime,
  SkipNext,
  HelpOutline,
  CheckCircle,
  HourglassEmpty,
  Send,
  Article,
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

const normalizeScore = (score) => {
  if (score === null || score === undefined || isNaN(score)) return 0;
  const num = Number(score);
  if (num > 1.0) return Math.min(100, Math.max(0, Math.round(num)));
  return Math.min(100, Math.max(0, Math.round(num * 100)));
};

const toFractionScore = (val) => {
  if (val === null || val === undefined || isNaN(val)) return 0;
  const num = Number(val);
  if (num > 1.0) return Math.min(1.0, Math.max(0, num / 100.0));
  return Math.min(1.0, Math.max(0, num));
};

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
  const initialMode = location.state?.answerMode || 'text';

  const webcamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioChunksRef = useRef([]);

  const [sessionId] = useState(ragSessionId || `session_${Date.now()}`);
  const [isLoading, setIsLoading] = useState(!isRag);
  const [responseMode, setResponseMode] = useState(initialMode);
  const [textAnswer, setTextAnswer] = useState('');

  // Assessment question palette statuses: { [index]: 'answered' | 'skipped' }
  const [questionStatuses, setQuestionStatuses] = useState({});

  // Assessment countdown timer (e.g., 20 mins)
  const [testTimeLeft, setTestTimeLeft] = useState(20 * 60);

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
  const [countdown, setCountdown] = useState(10);
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  // Overall test countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTestTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Post-answer countdown transition
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
        setRecordingTime((prev) => prev + 1);
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

      const evalData = response.data;
      const formattedEval = {
        question_id: currentQuestion.question_id || currentQuestion.id || (currentQuestionIndex + 1),
        question: currentQuestion.question || currentQuestion.question_text,
        weighted_score: toFractionScore(evalData.overall_score || evalData.weighted_score),
        relevance_score: toFractionScore(evalData.relevance || evalData.relevance_score),
        clarity_score: toFractionScore(evalData.clarity || evalData.clarity_score),
        confidence_score: toFractionScore(evalData.confidence || evalData.reasoning_depth),
        technical_accuracy_score: toFractionScore(evalData.technical_score || evalData.technical_accuracy),
        feedback: evalData.feedback,
        strengths: evalData.strengths || [],
        improvements: evalData.improvements || [],
        transcription: evalData.transcription || 'Spoken response evaluated.',
        isSkipped: false,
      };

      setQuestionStatuses((prev) => ({
        ...prev,
        [currentQuestionIndex]: 'answered',
      }));

      setCurrentEvaluation(formattedEval);
      addResponse(formattedEval);
      setCountdown(10);
      setIsTimerPaused(false);
      setShowEvaluation(true);
    } catch (err) {
      console.error('[AIInterview] Spoken evaluation failed:', err);
      const errMsg = err.response?.data?.detail || err.message || 'Failed to evaluate response.';
      setError(`Failed to evaluate response: ${errMsg}`);
    } finally {
      setEvaluating(false);
    }
  };

  // Submit written text response (or handle Skip)
  const submitTextResponse = async (forcedAnswer = null) => {
    const rawAnswer = forcedAnswer !== null ? forcedAnswer : textAnswer;
    const answerToSubmit = (rawAnswer || '').trim();

    // Check if empty or explicitly skipped
    const isSkippedOrEmpty =
      !answerToSubmit ||
      answerToSubmit.toLowerCase() === 'skip' ||
      answerToSubmit.toLowerCase() === "don't know" ||
      answerToSubmit.toLowerCase() === 'dont know' ||
      answerToSubmit.toLowerCase() === "i don't know" ||
      answerToSubmit.toLowerCase() === 'i dont know' ||
      answerToSubmit.toLowerCase().startsWith('skipped');

    setEvaluating(true);
    setError('');

    const currentQuestion = questions[currentQuestionIndex];
    const qId = currentQuestion.question_id || currentQuestion.id || (currentQuestionIndex + 1);
    const qText = currentQuestion.question || currentQuestion.question_text;

    try {
      let evalData;

      if (isSkippedOrEmpty) {
        // Fast, zero-score evaluation for skipped question
        evalData = {
          overall_score: 0.0,
          technical_score: 0.0,
          scores: {
            overall: 0.0,
            relevance: 0.0,
            clarity: 0.0,
            confidence: 0.0,
            technical_accuracy: 0.0,
          },
          feedback:
            'Question was skipped or unanswered. Take time to study this core architectural concept.',
          strengths: [],
          improvements: [
            'Review key topic: ' +
              (currentQuestion.expected_keywords?.join(', ') || currentQuestion.category || 'System Architecture'),
          ],
        };

        // Post to backend to record 0.0 in the session
        resumeRagAPI
          .evaluateTextResponse({
            sessionId: sessionId,
            candidateId: user?.id || 'candidate_user',
            questionId: qId,
            question: qText,
            answerText: 'Skipped - Candidate opted to skip',
            category: currentQuestion.category || 'technical',
            difficulty: currentQuestion.difficulty || 'medium',
            expectedKeywords: currentQuestion.expected_keywords || [],
          })
          .catch((e) => console.warn('Background skip registration:', e));
      } else {
        const response = await resumeRagAPI.evaluateTextResponse({
          sessionId: sessionId,
          candidateId: user?.id || 'candidate_user',
          questionId: qId,
          question: qText,
          answerText: answerToSubmit,
          category: currentQuestion.category || 'technical',
          difficulty: currentQuestion.difficulty || 'medium',
          expectedKeywords: currentQuestion.expected_keywords || [],
        });
        evalData = response.data;
      }

      const overall = isSkippedOrEmpty
        ? 0.0
        : toFractionScore(evalData.scores?.overall ?? evalData.overall_score);
      const relevance = isSkippedOrEmpty
        ? 0.0
        : toFractionScore(evalData.scores?.relevance ?? evalData.relevance);
      const clarity = isSkippedOrEmpty
        ? 0.0
        : toFractionScore(evalData.scores?.clarity ?? evalData.clarity);
      const confidence = isSkippedOrEmpty
        ? 0.0
        : toFractionScore(evalData.scores?.confidence ?? evalData.reasoning_depth);
      const technicalAccuracy = isSkippedOrEmpty
        ? 0.0
        : toFractionScore(
            evalData.scores?.technical_accuracy ?? evalData.technical_score
          );

      const formattedEval = {
        question_id: qId,
        question: qText,
        weighted_score: overall,
        relevance_score: relevance,
        clarity_score: clarity,
        confidence_score: confidence,
        technical_accuracy_score: technicalAccuracy,
        feedback:
          evalData.feedback ||
          (isSkippedOrEmpty ? 'Question skipped.' : 'Evaluated successfully.'),
        strengths: evalData.strengths || [],
        improvements: evalData.improvements || [],
        transcription: answerToSubmit || '(No answer provided)',
        isSkipped: isSkippedOrEmpty,
      };

      setQuestionStatuses((prev) => ({
        ...prev,
        [currentQuestionIndex]: isSkippedOrEmpty ? 'skipped' : 'answered',
      }));

      setCurrentEvaluation(formattedEval);
      addResponse(formattedEval);
      setCountdown(10);
      setIsTimerPaused(false);
      setShowEvaluation(true);
    } catch (err) {
      console.error('[AIInterview] Text evaluation failed:', err);
      const errMsg =
        err.response?.data?.detail || err.message || 'Failed to evaluate text response.';
      setError(`Failed to evaluate response: ${errMsg}`);
    } finally {
      setEvaluating(false);
    }
  };

  const handleSkipQuestion = () => {
    submitTextResponse('Skipped - Candidate opted to skip');
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
    setError('Generating final assessment report. Please wait...');
    try {
      const summary = isRag
        ? await resumeRagAPI.getSessionReport(sessionId)
        : await interviewAPI.getSessionSummary(sessionId);

      setSessionResults(summary.data);
      navigate('/candidate/reports', { state: { sessionId, summary: summary.data } });
    } catch (err) {
      console.error('[AIInterview] Failed to load session summary:', err);
      navigate('/candidate/reports');
    } finally {
      setEvaluating(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={60} thickness={4} />
          <Typography variant="h6" sx={{ mt: 2, fontWeight: 600 }}>
            Preparing Your Technical Assessment...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Grounding questions in your verified resume projects and skills
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
          Return to Assessment Setup
        </Button>
      </Box>
    );
  }

  const currentQuestion = questions[currentQuestionIndex] || {};
  const currentWordCount = textAnswer.trim() ? textAnswer.trim().split(/\s+/).length : 0;
  const currentCharCount = textAnswer.length;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 1, md: 2 } }}>
      {/* AUTHENTIC TEST PLATFORM HEADER BAR */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Grid container alignItems="center" spacing={2}>
          {/* Test Name & Candidate Status */}
          <Grid item xs={12} sm={4}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Article color="primary" />
              <Box>
                <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                  {isRag ? 'Resume Technical Assessment' : 'AI Technical Evaluation'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Candidate: {user?.name || 'Candidate'} • Role: {config?.targetRole || 'Software Engineer'}
                </Typography>
              </Box>
            </Stack>
          </Grid>

          {/* Question Palette / Navigator */}
          <Grid item xs={12} sm={5}>
            <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mr: 0.5 }}>
                Palette:
              </Typography>
              {questions.map((q, idx) => {
                const status = questionStatuses[idx];
                const isCurrent = idx === currentQuestionIndex;
                let bgcolor = 'grey.100';
                let color = 'text.primary';
                let borderColor = 'divider';

                if (isCurrent) {
                  bgcolor = 'primary.main';
                  color = 'primary.contrastText';
                  borderColor = 'primary.main';
                } else if (status === 'answered') {
                  bgcolor = 'success.light';
                  color = 'success.dark';
                  borderColor = 'success.main';
                } else if (status === 'skipped') {
                  bgcolor = 'warning.light';
                  color = 'warning.dark';
                  borderColor = 'warning.main';
                }

                return (
                  <Tooltip
                    key={idx}
                    title={
                      isCurrent
                        ? `Question ${idx + 1} (Current)`
                        : status === 'answered'
                        ? `Question ${idx + 1} (Answered)`
                        : status === 'skipped'
                        ? `Question ${idx + 1} (Skipped)`
                        : `Question ${idx + 1} (Pending)`
                    }
                  >
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'default',
                        bgcolor,
                        color,
                        border: '1.5px solid',
                        borderColor,
                        transition: 'all 0.2s',
                        boxShadow: isCurrent ? '0 0 0 2px rgba(99, 102, 241, 0.25)' : 'none',
                      }}
                    >
                      {idx + 1}
                    </Box>
                  </Tooltip>
                );
              })}
            </Stack>
          </Grid>

          {/* Test Timer & Mode Switcher */}
          <Grid item xs={12} sm={3}>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" alignItems="center">
              <Chip
                icon={<AccessTime fontSize="small" />}
                label={formatTimer(testTimeLeft)}
                color={testTimeLeft < 300 ? 'error' : 'default'}
                variant={testTimeLeft < 300 ? 'filled' : 'outlined'}
                sx={{ fontWeight: 700, fontSize: '0.9rem' }}
              />

              <ToggleButtonGroup
                value={responseMode}
                exclusive
                onChange={(_, newMode) => newMode && setResponseMode(newMode)}
                size="small"
              >
                <ToggleButton value="text" disabled={isRecording} sx={{ py: 0.5, px: 1 }}>
                  <Create fontSize="small" sx={{ mr: 0.5 }} /> Text
                </ToggleButton>
                <ToggleButton value="video" disabled={isRecording} sx={{ py: 0.5, px: 1 }}>
                  <Videocam fontSize="small" sx={{ mr: 0.5 }} /> Video
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* MAIN TEST WORKSPACE: PROBLEM STATEMENT (LEFT) vs SOLUTION INPUT (RIGHT) */}
      <Grid container spacing={3}>
        {/* LEFT COLUMN: PROBLEM STATEMENT & TOPIC BREAKDOWN */}
        <Grid item xs={12} md={5}>
          <Card
            elevation={1}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <CardContent sx={{ flexGrow: 1, p: 3 }}>
              {/* Question Level & Difficulty Badges */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Chip
                  label={`Question ${currentQuestionIndex + 1} of ${questions.length}`}
                  color="primary"
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
                <Chip
                  label={currentQuestion?.difficulty?.toUpperCase() || 'MEDIUM'}
                  color={
                    currentQuestion?.difficulty === 'hard'
                      ? 'error'
                      : currentQuestion?.difficulty === 'medium'
                      ? 'warning'
                      : 'success'
                  }
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
                <Chip
                  label={currentQuestion?.category || 'System Architecture'}
                  size="small"
                  variant="outlined"
                />
              </Stack>

              {/* RAG Project Grounding Banner */}
              {currentQuestion?.rag_context?.project_name ? (
                <Box
                  sx={{
                    mb: 2.5,
                    p: 1.5,
                    bgcolor: 'rgba(99, 102, 241, 0.08)',
                    borderRadius: 1.5,
                    borderLeft: '4px solid',
                    borderColor: 'primary.main',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FolderSpecial color="primary" fontSize="small" />
                    <Typography variant="body2" fontWeight={600} color="primary.dark">
                      Anchored Project: {currentQuestion.rag_context.project_name}
                    </Typography>
                  </Stack>
                </Box>
              ) : currentQuestion?.project_context ? (
                <Box
                  sx={{
                    mb: 2.5,
                    p: 1.5,
                    bgcolor: 'rgba(99, 102, 241, 0.08)',
                    borderRadius: 1.5,
                    borderLeft: '4px solid',
                    borderColor: 'primary.main',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FolderSpecial color="primary" fontSize="small" />
                    <Typography variant="body2" fontWeight={600} color="primary.dark">
                      Project Context: {currentQuestion.project_context}
                    </Typography>
                  </Stack>
                </Box>
              ) : null}

              {/* The Question Text */}
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.5,
                  color: 'text.primary',
                  mb: 3,
                }}
              >
                {currentQuestion?.question || currentQuestion?.question_text}
              </Typography>

              <Divider sx={{ my: 2 }} />

              {/* Expected Concepts */}
              {currentQuestion?.expected_keywords?.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Key Concepts to Address:
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.8}>
                    {currentQuestion.expected_keywords.map((kw) => (
                      <Chip key={kw} label={kw} size="small" variant="outlined" />
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Evaluation Criteria Guide */}
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: 'grey.50',
                  borderRadius: 1.5,
                  borderStyle: 'dashed',
                }}
              >
                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block">
                  Test Guidelines:
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  • Structure your explanation clearly with architecture tradeoffs or code examples.
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  • If you are unfamiliar with this specific topic, you can click <strong>Skip / I Don't Know</strong> without blocking your assessment progress.
                </Typography>
              </Paper>
            </CardContent>
          </Card>
        </Grid>

        {/* RIGHT COLUMN: SOLUTION WORKSPACE (TEXT OR VIDEO) */}
        <Grid item xs={12} md={7}>
          <Card
            elevation={1}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <CardContent sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
              {responseMode === 'text' ? (
                <>
                  {/* Editor Header Bar */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1.5,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Create color="primary" fontSize="small" />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Your Technical Solution / Answer
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={1}>
                      <Chip label={`${currentWordCount} words`} size="small" variant="outlined" />
                      <Chip label={`${currentCharCount} chars`} size="small" variant="outlined" />
                    </Stack>
                  </Box>

                  {/* Main Textarea Workspace */}
                  <TextField
                    fullWidth
                    multiline
                    rows={15}
                    variant="outlined"
                    placeholder="Write your technical explanation, architectural approach, engineering tradeoffs, or pseudocode here...

(If you are unsure or do not know the answer, feel free to write what you know or click 'Skip / I Don't Know' below)"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    disabled={evaluating}
                    sx={{
                      flexGrow: 1,
                      '& .MuiOutlinedInput-root': {
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        fontSize: '0.95rem',
                        lineHeight: 1.6,
                        bgcolor: '#fafafa',
                      },
                    }}
                  />

                  {error && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {error}
                    </Alert>
                  )}

                  {/* Test Action Buttons */}
                  <Box
                    sx={{
                      mt: 3,
                      pt: 2,
                      borderTop: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <Button
                      variant="outlined"
                      color="inherit"
                      size="large"
                      startIcon={<HelpOutline />}
                      onClick={handleSkipQuestion}
                      disabled={evaluating}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Skip / I Don't Know
                    </Button>

                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      endIcon={isLastQuestion ? <Check /> : <Send />}
                      onClick={() => submitTextResponse()}
                      disabled={evaluating}
                      sx={{ textTransform: 'none', fontWeight: 700, px: 3 }}
                    >
                      {evaluating
                        ? 'Evaluating Solution...'
                        : isLastQuestion
                        ? 'Submit & Finish Assessment'
                        : 'Submit Answer'}
                    </Button>
                  </Box>
                </>
              ) : (
                /* VIDEO RESPONSE MODE */
                <>
                  <Box sx={{ position: 'relative', backgroundColor: 'black', borderRadius: 2, overflow: 'hidden' }}>
                    {isCameraOn ? (
                      <Webcam
                        ref={webcamRef}
                        audio={isMicOn}
                        videoConstraints={{ facingMode: 'user' }}
                        style={{ width: '100%', height: 380, objectFit: 'cover' }}
                      />
                    ) : (
                      <Box sx={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <VideocamOff sx={{ fontSize: 80, color: 'grey.600' }} />
                      </Box>
                    )}

                    {isRecording && (
                      <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
                        <Chip
                          icon={<HourglassEmpty fontSize="small" />}
                          label={formatTimer(recordingTime)}
                          color="error"
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                      </Box>
                    )}
                  </Box>

                  <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
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
                  </Stack>

                  <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" spacing={2} justifyContent="space-between">
                      <Button
                        variant="outlined"
                        color="inherit"
                        size="large"
                        startIcon={<HelpOutline />}
                        onClick={handleSkipQuestion}
                        disabled={evaluating || isRecording}
                      >
                        Skip Question
                      </Button>

                      {!isRecording && !recordedBlob && (
                        <Button
                          variant="contained"
                          color="error"
                          size="large"
                          startIcon={<PlayArrow />}
                          onClick={startRecording}
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
                        >
                          Stop Recording
                        </Button>
                      )}

                      {recordedBlob && !evaluating && (
                        <Stack direction="row" spacing={1}>
                          <Button variant="outlined" onClick={startRecording}>
                            Re-record
                          </Button>
                          <Button
                            variant="contained"
                            color="primary"
                            size="large"
                            startIcon={<Assessment />}
                            onClick={submitSpokenResponse}
                          >
                            Submit Recording
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                </>
              )}

              {evaluating && (
                <Box sx={{ textAlign: 'center', py: 2, mt: 2 }}>
                  <CircularProgress size={30} thickness={4} />
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
                    Evaluating response against technical criteria...
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* EVALUATION RESULT DIALOG */}
      <Dialog open={showEvaluation} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight={700}>
              Question Evaluation
            </Typography>
            <Chip
              label={isTimerPaused ? 'Paused' : `Auto-advance in ${countdown}s`}
              color={isTimerPaused ? 'default' : 'primary'}
              variant="outlined"
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          {currentEvaluation && (
            <Box>
              <Box sx={{ mb: 3, textAlign: 'center' }}>
                <Typography variant="h3" color="primary" fontWeight={800}>
                  {normalizeScore(
                    currentEvaluation.weighted_score ?? currentEvaluation.overall_score
                  )}
                  %
                </Typography>
                <Chip
                  label={
                    currentEvaluation.isSkipped
                      ? 'Skipped / Unanswered'
                      : normalizeScore(currentEvaluation.weighted_score) >= 80
                      ? 'Strong Answer'
                      : normalizeScore(currentEvaluation.weighted_score) >= 60
                      ? 'Competent'
                      : 'Needs Improvement'
                  }
                  color={
                    currentEvaluation.isSkipped
                      ? 'default'
                      : normalizeScore(currentEvaluation.weighted_score) >= 80
                      ? 'success'
                      : normalizeScore(currentEvaluation.weighted_score) >= 60
                      ? 'warning'
                      : 'error'
                  }
                  sx={{ mt: 1, fontWeight: 700 }}
                />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Technical Correctness
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={normalizeScore(currentEvaluation.technical_accuracy_score)}
                    sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Relevance
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={normalizeScore(currentEvaluation.relevance_score)}
                    sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Clarity
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={normalizeScore(currentEvaluation.clarity_score)}
                    sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Reasoning Depth
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={normalizeScore(currentEvaluation.confidence_score)}
                    sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
                  />
                </Grid>
              </Grid>

              {currentEvaluation.strengths?.length > 0 && (
                <Box sx={{ mt: 2.5 }}>
                  <Typography variant="subtitle2" fontWeight={700} color="success.main">
                    Key Strengths:
                  </Typography>
                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                    {currentEvaluation.strengths.map((s, i) => (
                      <li key={i}>
                        <Typography variant="body2">{s}</Typography>
                      </li>
                    ))}
                  </ul>
                </Box>
              )}

              {currentEvaluation.improvements?.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight={700} color="warning.main">
                    Areas for Improvement:
                  </Typography>
                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                    {currentEvaluation.improvements.map((imp, i) => (
                      <li key={i}>
                        <Typography variant="body2">{imp}</Typography>
                      </li>
                    ))}
                  </ul>
                </Box>
              )}

              {currentEvaluation.feedback && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Feedback Summary:
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {currentEvaluation.feedback}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setIsTimerPaused(!isTimerPaused)}>
            {isTimerPaused ? 'Resume Auto-advance' : 'Pause'}
          </Button>
          <Button
            variant="contained"
            onClick={handleNextQuestion}
            endIcon={currentQuestionIndex < questions.length - 1 ? <NavigateNext /> : <Check />}
            sx={{ fontWeight: 700 }}
          >
            {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish & View Report'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* INTERVIEW COMPLETE DIALOG */}
      <Dialog open={interviewComplete} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h5" fontWeight={700} textAlign="center">
            Assessment Completed!
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircle sx={{ fontSize: 72, color: 'success.main', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              You have completed all questions in this technical assessment.
              Your evaluation report has been compiled and saved.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button variant="contained" size="large" onClick={handleFinishInterview} sx={{ fontWeight: 700 }}>
            View Candidate Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AIInterview;
