import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
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
  Backdrop,
} from '@mui/material';
import {
  Videocam,
  VideocamOff,
  Mic,
  MicOff,
  PlayArrow,
  Stop,
  NavigateNext,
  NavigateBefore,
  Check,
  Assessment,
  Create,
  FolderSpecial,
  AccessTime,
  HelpOutline,
  CheckCircle,
  HourglassEmpty,
  Send,
  Article,
  ExitToApp,
} from '@mui/icons-material';
import Webcam from 'react-webcam';
import { interviewAPI, resumeRagAPI } from '../../services/api';
import { useAuthStore, useInterviewStore } from '../../store/authStore';

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
    goToQuestion,
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

  // Current editor response & draft storage for each question index
  const [textAnswer, setTextAnswer] = useState('');
  const [draftAnswers, setDraftAnswers] = useState({});

  // Question palette statuses: { [index]: 'answered' | 'skipped' }
  const [questionStatuses, setQuestionStatuses] = useState({});

  // Overall test countdown timer (e.g., 20 mins)
  const [testTimeLeft, setTestTimeLeft] = useState(20 * 60);

  // Video recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);

  // UI status states
  const [evaluating, setEvaluating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [endTestDialogOpen, setEndTestDialogOpen] = useState(false);
  const [error, setError] = useState('');

  // Overall test countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTestTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinishInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Prevent accidental tab closure mid-test
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Assessment in progress. Are you sure you want to leave?';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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

  // Jump to any question from palette or buttons with draft preservation
  const handleJumpToQuestion = (targetIndex) => {
    if (targetIndex < 0 || targetIndex >= questions.length || targetIndex === currentQuestionIndex) {
      return;
    }

    // Save current question's text draft
    const updatedDrafts = {
      ...draftAnswers,
      [currentQuestionIndex]: textAnswer,
    };
    setDraftAnswers(updatedDrafts);

    // Switch active question index
    goToQuestion(targetIndex);

    // Load target question's draft or empty string
    setTextAnswer(updatedDrafts[targetIndex] || '');
    setRecordedBlob(null);
    setAudioBlob(null);
    setError('');
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      handleJumpToQuestion(currentQuestionIndex - 1);
    }
  };

  // Submit spoken video/audio response (background processing, no intermediate popup)
  const submitSpokenResponse = async () => {
    if (!recordedBlob || !audioBlob) {
      setError('Please record your response first');
      return;
    }

    setEvaluating(true);
    setError('');

    const currentQuestion = questions[currentQuestionIndex] || {};
    const qId = currentQuestion.question_id || currentQuestion.id || (currentQuestionIndex + 1);

    try {
      const videoFile = new File([recordedBlob], 'response.webm', { type: 'video/webm' });
      const audioFile = new File([audioBlob], 'response.webm', { type: 'audio/webm' });

      // Mark as answered in palette
      setQuestionStatuses((prev) => ({
        ...prev,
        [currentQuestionIndex]: 'answered',
      }));

      // Non-blocking evaluation call in background
      interviewAPI
        .evaluateResponse(sessionId, currentQuestion, videoFile, audioFile)
        .then((res) => {
          const evalData = res.data;
          addResponse({
            question_id: qId,
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
          });
        })
        .catch((err) => console.warn('Background spoken evaluation:', err));

      // Advance directly to next question without any popup dialog
      if (currentQuestionIndex < questions.length - 1) {
        handleJumpToQuestion(currentQuestionIndex + 1);
      } else {
        setEndTestDialogOpen(true);
      }
    } catch (err) {
      console.error('[AIInterview] Spoken evaluation submit error:', err);
      setError('Failed to submit recording. Please try again.');
    } finally {
      setEvaluating(false);
    }
  };

  // Save current answer and advance to next question
  const handleSaveAndNext = () => {
    const rawAnswer = textAnswer.trim();
    const isSkippedOrEmpty =
      !rawAnswer ||
      rawAnswer.toLowerCase() === 'skip' ||
      rawAnswer.toLowerCase() === "don't know" ||
      rawAnswer.toLowerCase() === 'dont know';

    const currentQ = questions[currentQuestionIndex] || {};
    const qId = currentQ.question_id || currentQ.id || (currentQuestionIndex + 1);
    const qText = currentQ.question || currentQ.question_text || '';

    // Update draft store
    const updatedDrafts = {
      ...draftAnswers,
      [currentQuestionIndex]: textAnswer,
    };
    setDraftAnswers(updatedDrafts);

    // Update palette status
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestionIndex]: isSkippedOrEmpty ? 'skipped' : 'answered',
    }));

    // Register response on backend in background without any blocking popup
    if (isRag) {
      resumeRagAPI
        .evaluateTextResponse({
          sessionId: sessionId,
          candidateId: user?.id || 'candidate_user',
          questionId: qId,
          question: qText,
          answerText: isSkippedOrEmpty ? 'Skipped - Candidate opted to skip' : rawAnswer,
          category: currentQ.category || 'technical',
          difficulty: currentQ.difficulty || 'medium',
          expectedKeywords: currentQ.expected_keywords || [],
        })
        .then((res) => {
          if (res?.data) {
            const evalData = res.data;
            addResponse({
              question_id: qId,
              question: qText,
              weighted_score: isSkippedOrEmpty ? 0.0 : toFractionScore(evalData.scores?.overall ?? evalData.overall_score),
              relevance_score: isSkippedOrEmpty ? 0.0 : toFractionScore(evalData.scores?.relevance ?? evalData.relevance),
              clarity_score: isSkippedOrEmpty ? 0.0 : toFractionScore(evalData.scores?.clarity ?? evalData.clarity),
              confidence_score: isSkippedOrEmpty ? 0.0 : toFractionScore(evalData.scores?.confidence ?? evalData.reasoning_depth),
              technical_accuracy_score: isSkippedOrEmpty ? 0.0 : toFractionScore(evalData.scores?.technical_accuracy ?? evalData.technical_score),
              feedback: evalData.feedback || (isSkippedOrEmpty ? 'Skipped.' : 'Evaluated.'),
              strengths: evalData.strengths || [],
              improvements: evalData.improvements || [],
              transcription: rawAnswer || '(No answer provided)',
              isSkipped: isSkippedOrEmpty,
            });
          }
        })
        .catch((e) => console.warn('Background evaluation error:', e));
    }

    // Seamless navigation: go directly to next question or open submission modal if last question
    if (currentQuestionIndex < questions.length - 1) {
      goToQuestion(currentQuestionIndex + 1);
      setTextAnswer(updatedDrafts[currentQuestionIndex + 1] || '');
      setRecordedBlob(null);
      setAudioBlob(null);
      setError('');
    } else {
      setEndTestDialogOpen(true);
    }
  };

  // Mark current question as skipped and move to next question
  const handleSkipQuestion = () => {
    const updatedDrafts = {
      ...draftAnswers,
      [currentQuestionIndex]: textAnswer || 'Skipped',
    };
    setDraftAnswers(updatedDrafts);

    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestionIndex]: 'skipped',
    }));

    const currentQ = questions[currentQuestionIndex] || {};
    const qId = currentQ.question_id || currentQ.id || (currentQuestionIndex + 1);
    const qText = currentQ.question || currentQ.question_text || '';

    if (isRag) {
      resumeRagAPI
        .evaluateTextResponse({
          sessionId: sessionId,
          candidateId: user?.id || 'candidate_user',
          questionId: qId,
          question: qText,
          answerText: 'Skipped - Candidate opted to skip',
          category: currentQ.category || 'technical',
          difficulty: currentQ.difficulty || 'medium',
          expectedKeywords: currentQ.expected_keywords || [],
        })
        .catch((e) => console.warn('Background skip registration:', e));
    }

    if (currentQuestionIndex < questions.length - 1) {
      goToQuestion(currentQuestionIndex + 1);
      setTextAnswer(updatedDrafts[currentQuestionIndex + 1] || '');
      setRecordedBlob(null);
      setAudioBlob(null);
      setError('');
    } else {
      setEndTestDialogOpen(true);
    }
  };

  // Finalize assessment and navigate to the comprehensive final report
  const handleFinishInterview = async () => {
    setEndTestDialogOpen(false);
    setIsFinalizing(true);
    setError('');

    try {
      // If candidate typed an answer for current question that hasn't been sent yet, evaluate it
      if (textAnswer.trim() && questionStatuses[currentQuestionIndex] !== 'answered') {
        const currentQ = questions[currentQuestionIndex] || {};
        const qId = currentQ.question_id || currentQ.id || (currentQuestionIndex + 1);
        const qText = currentQ.question || currentQ.question_text || '';
        if (isRag) {
          try {
            await resumeRagAPI.evaluateTextResponse({
              sessionId: sessionId,
              candidateId: user?.id || 'candidate_user',
              questionId: qId,
              question: qText,
              answerText: textAnswer.trim(),
              category: currentQ.category || 'technical',
              difficulty: currentQ.difficulty || 'medium',
              expectedKeywords: currentQ.expected_keywords || [],
            });
          } catch (e) {
            console.warn('Final answer evaluate registration error:', e);
          }
        }
      }

      // Fetch complete report from backend
      const summary = isRag
        ? await resumeRagAPI.getSessionReport(sessionId)
        : await interviewAPI.getSessionSummary(sessionId);

      setSessionResults(summary.data);
      navigate('/candidate/reports', { state: { sessionId, summary: summary.data } });
    } catch (err) {
      console.error('[AIInterview] Failed to load session summary:', err);
      navigate('/candidate/reports');
    } finally {
      setIsFinalizing(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={56} thickness={4} />
          <Typography variant="h6" sx={{ mt: 3, fontWeight: 700 }}>
            Preparing Assessment Environment...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Retrieving interview questions grounded in your resume projects and skills
          </Typography>
        </Box>
      </Box>
    );
  }

  if (error && questions.length === 0) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', mt: 8, p: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={() => navigate('/candidate/interview-selection')}>
          Return to Assessment Selection
        </Button>
      </Box>
    );
  }

  const currentQuestion = questions[currentQuestionIndex] || {};
  const currentWordCount = textAnswer.trim() ? textAnswer.trim().split(/\s+/).length : 0;
  const currentCharCount = textAnswer.length;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  const answeredCount = Object.values(questionStatuses).filter((s) => s === 'answered').length;
  const skippedCount = Object.values(questionStatuses).filter((s) => s === 'skipped').length;
  const unvisitedCount = Math.max(0, questions.length - answeredCount - skippedCount);

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        bgcolor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 1. PROFESSIONAL TEST PORTAL HEADER BAR (Like HirePro / HackerRank Assessment) */}
      <Paper
        elevation={0}
        sx={{
          py: 1.5,
          px: { xs: 2, md: 4 },
          bgcolor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 1100,
        }}
      >
        <Grid container alignItems="center" spacing={2}>
          {/* Assessment Branding & Candidate Details */}
          <Grid item xs={12} sm={3}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  bgcolor: 'primary.main',
                  color: 'white',
                  borderRadius: 1.5,
                  p: 0.8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Article fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                  {isRag ? 'Resume Technical Assessment' : 'AI Technical Evaluation'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.name || 'Candidate'} • {config?.targetRole || 'Software Engineer'}
                </Typography>
              </Box>
            </Stack>
          </Grid>

          {/* Interactive Question Palette */}
          <Grid item xs={12} sm={6}>
            <Stack spacing={0.5} alignItems="center">
              <Stack
                direction="row"
                spacing={0.8}
                justifyContent="center"
                alignItems="center"
                flexWrap="wrap"
              >
                {questions.map((_, idx) => {
                  const status = questionStatuses[idx];
                  const isCurrent = idx === currentQuestionIndex;
                  let bgcolor = '#f1f5f9';
                  let color = '#334155';
                  let border = '1.5px solid #cbd5e1';

                  if (isCurrent) {
                    bgcolor = '#4f46e5';
                    color = '#ffffff';
                    border = '2px solid #4338ca';
                  } else if (status === 'answered') {
                    bgcolor = '#10b981';
                    color = '#ffffff';
                    border = '1.5px solid #059669';
                  } else if (status === 'skipped') {
                    bgcolor = '#f59e0b';
                    color = '#ffffff';
                    border = '1.5px solid #d97706';
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
                          ? `Question ${idx + 1} (Skipped / Marked)`
                          : `Question ${idx + 1} (Not Attempted)`
                      }
                    >
                      <Box
                        onClick={() => handleJumpToQuestion(idx)}
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          bgcolor,
                          color,
                          border,
                          transition: 'all 0.15s ease-in-out',
                          boxShadow: isCurrent ? '0 0 0 3px rgba(79, 70, 229, 0.2)' : 'none',
                          '&:hover': {
                            transform: 'translateY(-1px)',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          },
                        }}
                      >
                        {idx + 1}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Stack>

              {/* Palette Legend */}
              <Stack direction="row" spacing={2} justifyContent="center" alignItems="center">
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#059669', fontWeight: 600 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} /> Answered ({answeredCount})
                </Typography>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#d97706', fontWeight: 600 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b' }} /> Skipped ({skippedCount})
                </Typography>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#64748b', fontWeight: 600 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#cbd5e1' }} /> Pending ({unvisitedCount})
                </Typography>
              </Stack>
            </Stack>
          </Grid>

          {/* Test Timer & End Test Option */}
          <Grid item xs={12} sm={3}>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" alignItems="center">
              <Chip
                icon={<AccessTime fontSize="small" />}
                label={formatTimer(testTimeLeft)}
                color={testTimeLeft < 300 ? 'error' : 'default'}
                variant={testTimeLeft < 300 ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                }}
              />

              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<ExitToApp />}
                onClick={() => setEndTestDialogOpen(true)}
                sx={{
                  fontWeight: 700,
                  textTransform: 'none',
                  borderRadius: 1.5,
                  px: 1.8,
                  borderColor: '#ef4444',
                  color: '#dc2626',
                  '&:hover': {
                    bgcolor: '#fef2f2',
                    borderColor: '#dc2626',
                  },
                }}
              >
                End Test
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* 2. MAIN TEST WORKSPACE (PROBLEM STATEMENT & SOLUTION INPUT) */}
      <Box sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
        <Grid container spacing={3} sx={{ height: 'calc(100vh - 130px)', minHeight: 620 }}>
          {/* LEFT COLUMN: PROBLEM STATEMENT */}
          <Grid item xs={12} md={5} sx={{ height: '100%' }}>
            <Card
              elevation={0}
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                bgcolor: '#ffffff',
              }}
            >
              <CardContent sx={{ flexGrow: 1, p: 3, overflowY: 'auto' }}>
                {/* Question Info Chips */}
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
                    label={currentQuestion?.category || 'Technical Assessment'}
                    size="small"
                    variant="outlined"
                  />
                </Stack>

                {/* Grounded Project Context */}
                {currentQuestion?.rag_context?.project_name ? (
                  <Box
                    sx={{
                      mb: 2.5,
                      p: 1.5,
                      bgcolor: '#eff6ff',
                      borderRadius: 1.5,
                      borderLeft: '4px solid #3b82f6',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FolderSpecial color="primary" fontSize="small" />
                      <Typography variant="body2" fontWeight={600} color="#1d4ed8">
                        Anchored Project: {currentQuestion.rag_context.project_name}
                      </Typography>
                    </Stack>
                  </Box>
                ) : currentQuestion?.project_context ? (
                  <Box
                    sx={{
                      mb: 2.5,
                      p: 1.5,
                      bgcolor: '#eff6ff',
                      borderRadius: 1.5,
                      borderLeft: '4px solid #3b82f6',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FolderSpecial color="primary" fontSize="small" />
                      <Typography variant="body2" fontWeight={600} color="#1d4ed8">
                        Project Context: {currentQuestion.project_context}
                      </Typography>
                    </Stack>
                  </Box>
                ) : null}

                {/* Question Statement */}
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    lineHeight: 1.6,
                    color: '#1e293b',
                    mb: 3,
                  }}
                >
                  {currentQuestion?.question || currentQuestion?.question_text}
                </Typography>

                <Divider sx={{ my: 2.5 }} />

                {/* Key Concepts to address */}
                {currentQuestion?.expected_keywords?.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}
                    >
                      Key Technical Concepts to Cover:
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.8}>
                      {currentQuestion.expected_keywords.map((kw) => (
                        <Chip
                          key={kw}
                          label={kw}
                          size="small"
                          variant="outlined"
                          sx={{ bgcolor: '#f8fafc', borderColor: '#cbd5e1' }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}

                {/* Examination Guidelines */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    bgcolor: '#f8fafc',
                    borderRadius: 1.5,
                    borderStyle: 'dashed',
                    borderColor: '#cbd5e1',
                  }}
                >
                  <Typography variant="caption" fontWeight={700} color="#475569" display="block">
                    Assessment Guidelines:
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    • Provide detailed, concrete technical explanations with design tradeoffs or pseudocode.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    • You can navigate between questions at any time using the palette above or Prev/Next buttons. Your drafts are preserved.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    • No scores or intermediate popups will interrupt your test. The complete evaluation will be generated once submitted.
                  </Typography>
                </Paper>
              </CardContent>
            </Card>
          </Grid>

          {/* RIGHT COLUMN: SOLUTION WORKSPACE */}
          <Grid item xs={12} md={7} sx={{ height: '100%' }}>
            <Card
              elevation={0}
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                bgcolor: '#ffffff',
              }}
            >
              <CardContent sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
                {/* Editor Header Bar with word counts and response mode toggle */}
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
                    <Typography variant="subtitle2" fontWeight={700} color="#1e293b">
                      Your Technical Solution
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <ToggleButtonGroup
                      value={responseMode}
                      exclusive
                      onChange={(_, newMode) => newMode && setResponseMode(newMode)}
                      size="small"
                    >
                      <ToggleButton value="text" disabled={isRecording} sx={{ py: 0.3, px: 1 }}>
                        <Create fontSize="small" sx={{ mr: 0.5 }} /> Text
                      </ToggleButton>
                      <ToggleButton value="video" disabled={isRecording} sx={{ py: 0.3, px: 1 }}>
                        <Videocam fontSize="small" sx={{ mr: 0.5 }} /> Video
                      </ToggleButton>
                    </ToggleButtonGroup>

                    <Chip
                      label={`${currentWordCount} words`}
                      size="small"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                    <Chip
                      label={`${currentCharCount} chars`}
                      size="small"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  </Stack>
                </Box>

                {responseMode === 'text' ? (
                  <>
                    {/* Text Answer Workspace */}
                    <TextField
                      fullWidth
                      multiline
                      rows={17}
                      variant="outlined"
                      placeholder="Enter your technical solution, engineering approach, code snippets, or architecture rationale here...

(If you are unsure or wish to attempt this question later, you can skip or click any question in the palette.)"
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      sx={{
                        flexGrow: 1,
                        '& .MuiOutlinedInput-root': {
                          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                          fontSize: '0.95rem',
                          lineHeight: 1.6,
                          bgcolor: '#f8fafc',
                          borderColor: '#cbd5e1',
                        },
                      }}
                    />

                    {error && (
                      <Alert severity="error" sx={{ mt: 2 }}>
                        {error}
                      </Alert>
                    )}

                    {/* Bottom Action Controls */}
                    <Box
                      sx={{
                        mt: 2.5,
                        pt: 2,
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 1.5,
                      }}
                    >
                      {/* Previous Question Button */}
                      <Button
                        variant="outlined"
                        color="inherit"
                        size="medium"
                        startIcon={<NavigateBefore />}
                        onClick={handlePrevQuestion}
                        disabled={currentQuestionIndex === 0}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        Previous
                      </Button>

                      {/* Center Skip Button */}
                      <Button
                        variant="outlined"
                        color="warning"
                        size="medium"
                        startIcon={<HelpOutline />}
                        onClick={handleSkipQuestion}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        Skip / Mark for Later
                      </Button>

                      {/* Save & Next / Submit Assessment Button */}
                      <Button
                        variant="contained"
                        color="primary"
                        size="medium"
                        endIcon={isLastQuestion ? <Check /> : <NavigateNext />}
                        onClick={handleSaveAndNext}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          px: 3,
                          bgcolor: isLastQuestion ? '#059669' : '#4f46e5',
                          '&:hover': {
                            bgcolor: isLastQuestion ? '#047857' : '#4338ca',
                          },
                        }}
                      >
                        {isLastQuestion ? 'Submit Assessment' : 'Save & Next'}
                      </Button>
                    </Box>
                  </>
                ) : (
                  /* VIDEO RESPONSE MODE */
                  <>
                    <Box
                      sx={{
                        position: 'relative',
                        backgroundColor: '#0f172a',
                        borderRadius: 2,
                        overflow: 'hidden',
                        flexGrow: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
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

                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #e2e8f0' }}>
                      <Stack direction="row" spacing={2} justifyContent="space-between">
                        <Button
                          variant="outlined"
                          color="inherit"
                          startIcon={<NavigateBefore />}
                          onClick={handlePrevQuestion}
                          disabled={currentQuestionIndex === 0}
                        >
                          Previous
                        </Button>

                        {!isRecording && !recordedBlob && (
                          <Button
                            variant="contained"
                            color="error"
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
                              startIcon={<Assessment />}
                              onClick={submitSpokenResponse}
                            >
                              Save Recording & Next
                            </Button>
                          </Stack>
                        )}

                        <Button
                          variant="outlined"
                          color="warning"
                          startIcon={<HelpOutline />}
                          onClick={handleSkipQuestion}
                        >
                          Skip
                        </Button>
                      </Stack>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* 3. CONFIRM END TEST DIALOG */}
      <Dialog
        open={endTestDialogOpen}
        onClose={() => setEndTestDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>
            End Assessment Confirmation
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Are you sure you want to end your assessment? Review your test completion status below:
          </Typography>

          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            <Grid item xs={4}>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <Typography variant="h5" fontWeight={800} color="#15803d">
                  {answeredCount}
                </Typography>
                <Typography variant="caption" fontWeight={600} color="#166534">
                  Answered
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={4}>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: '#fffbeb', borderColor: '#fde68a' }}>
                <Typography variant="h5" fontWeight={800} color="#b45309">
                  {skippedCount}
                </Typography>
                <Typography variant="caption" fontWeight={600} color="#92400e">
                  Skipped
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={4}>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: '#f8fafc', borderColor: '#e2e8f0' }}>
                <Typography variant="h5" fontWeight={800} color="#475569">
                  {unvisitedCount}
                </Typography>
                <Typography variant="caption" fontWeight={600} color="#334155">
                  Unattempted
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mb: 1 }}>
            Once you submit, you will not be able to modify any responses. Your complete evaluation scorecard and report will be compiled immediately.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            variant="outlined"
            onClick={() => setEndTestDialogOpen(false)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Return to Assessment
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleFinishInterview}
            sx={{ textTransform: 'none', fontWeight: 700, px: 3 }}
          >
            Confirm & End Test
          </Button>
        </DialogActions>
      </Dialog>

      {/* 4. FINALIZING SCORECARD BACKDROP */}
      <Backdrop
        open={isFinalizing}
        sx={{
          color: '#fff',
          zIndex: (theme) => theme.zIndex.drawer + 999,
          flexDirection: 'column',
          backdropFilter: 'blur(4px)',
          bgcolor: 'rgba(15, 23, 42, 0.75)',
        }}
      >
        <Paper
          elevation={4}
          sx={{
            p: 4,
            borderRadius: 3,
            textAlign: 'center',
            maxWidth: 420,
            bgcolor: '#ffffff',
            color: '#1e293b',
          }}
        >
          <CircularProgress size={56} thickness={4} sx={{ color: '#4f46e5', mb: 2 }} />
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
            Generating Assessment Report
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Evaluating responses against technical correctness, relevance, and reasoning depth...
          </Typography>
        </Paper>
      </Backdrop>
    </Box>
  );
}

export default AIInterview;
