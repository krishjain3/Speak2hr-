import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  Checkbox,
  FormGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
} from '@mui/material';
import {
  Assignment,
  Check,
  Timer,
  History,
  PlayArrow,
  CheckCircle,
  Cancel,
  ArrowBack,
  HelpOutline,
} from '@mui/icons-material';
import { assessmentAPI } from '../../services/api';
import { useAuthStore, useAssessmentStore } from '../../store/authStore';

const ROLES_OPTIONS = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Java Developer',
  'Python Developer',
  'AI/ML Engineer',
  'Data Scientist',
  'Data Analyst',
  'DevOps Engineer',
  'Cybersecurity Analyst',
  'UI/UX Designer',
  'Software Engineer',
  'Product Manager',
  'HR Specialist'
];

const SKILLS_OPTIONS = [
  'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'AWS',
  'Docker', 'Kubernetes', 'Machine Learning', 'Data Analysis', 'TypeScript',
  'Go', 'Rust', 'C++', 'C#', '.NET', 'Ruby', 'PHP', 'Swift', 'Figma', 'HTML/CSS',
  'Git', 'CI/CD', 'Security', 'Agile'
];

function Assessments() {
  const { user } = useAuthStore();
  const {
    currentAssessment,
    setCurrentAssessment,
    assessmentHistory,
    setAssessmentHistory,
    clearAssessment,
  } = useAssessmentStore();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes

  // Config states initialized from candidate profile
  const [role, setRole] = useState(user?.targetRole || 'Full Stack Developer');
  const [experienceLevel, setExperienceLevel] = useState(
    user?.experienceYears >= 5 ? 'senior' : user?.experienceYears >= 2 ? 'mid' : 'entry'
  );
  const [skills, setSkills] = useState(user?.skills || []);
  const [category, setCategory] = useState('mixed');

  // Review states
  const [reviewResult, setReviewResult] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    let timer;
    if (currentAssessment && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [currentAssessment, timeLeft]);

  const fetchHistory = async () => {
    try {
      const response = await assessmentAPI.getHistory(user?.id);
      const historyData = response.data;
      const assessments = historyData?.assessments || historyData || [];
      setAssessmentHistory(Array.isArray(assessments) ? assessments : []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
      setAssessmentHistory([]);
    }
  };

  const startAssessment = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await assessmentAPI.generate(
        user?.id,
        role,
        'medium',
        category,
        experienceLevel,
        []
      );
      setCurrentAssessment(response.data);
      setAnswers({});
      setTimeLeft(30 * 60);
      setReviewResult(null); // Close active review if any
    } catch (err) {
      setError('Failed to generate assessment. Please try again.');
      console.error('Assessment generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionIndex, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: answer,
    }));
  };

  const handleCheckboxChange = (questionIndex, option, checked) => {
    const currentSelected = answers[questionIndex] || [];
    let newSelected;
    if (checked) {
      newSelected = [...currentSelected, option];
    } else {
      newSelected = currentSelected.filter(opt => opt !== option);
    }
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: newSelected,
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const formattedAnswers = {};
      currentAssessment.questions.forEach((q, index) => {
        const ans = answers[index];
        if (q.question_type === 'msq') {
          formattedAnswers[q.question_id] = Array.isArray(ans) ? JSON.stringify(ans) : '[]';
        } else {
          formattedAnswers[q.question_id] = ans || '';
        }
      });

      const response = await assessmentAPI.submit(
        currentAssessment.assessment_id,
        user?.id,
        formattedAnswers
      );
      setReviewResult(response.data);
      clearAssessment();
      fetchHistory();
    } catch (err) {
      setError('Failed to submit assessment. Please try again.');
      console.error('Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReview = async (assessmentId) => {
    setLoading(true);
    setShowHistory(false);
    try {
      const response = await assessmentAPI.getResult(assessmentId);
      setReviewResult(response.data);
      setError('');
    } catch (err) {
      console.error('Failed to fetch assessment review:', err);
      setError('Failed to load assessment review details.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    if (!currentAssessment) return 0;
    const answered = Object.keys(answers).length;
    return (answered / currentAssessment.questions.length) * 100;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Preparing your personalized assessment...
          </Typography>
        </Box>
      </Box>
    );
  }

  // Review View (Detailed Post-Assessment Review Page)
  if (reviewResult) {
    const score = Math.round(reviewResult.score_percentage || 0);
    const isPass = score >= 70;
    return (
      <Box sx={{ pb: 6 }}>
        {/* Back Button */}
        <Button
          startIcon={<ArrowBack />}
          onClick={() => setReviewResult(null)}
          sx={{ mb: 3 }}
        >
          Back to Dashboard
        </Button>

        {/* Header Summary */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={8}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
                  Assessment Review
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Here is a complete breakdown of your answers, ideal responses, and custom suggestions for improvement.
                </Typography>
                {reviewResult.improvement_areas && reviewResult.improvement_areas.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" fontWeight={600} color="warning.dark">
                      Key Recommendations:
                    </Typography>
                    <List dense>
                      {reviewResult.improvement_areas.map((area, index) => (
                        <ListItem key={index} sx={{ py: 0, px: 1 }}>
                          <ListItemText
                            primary={`• ${area}`}
                            primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Your Score
                </Typography>
                <Typography
                  variant="h2"
                  fontWeight={800}
                  color={isPass ? 'success.main' : score >= 50 ? 'warning.main' : 'error.main'}
                >
                  {score}%
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {reviewResult.correct_answers} of {reviewResult.total_questions} Questions Correct
                </Typography>
                <Chip
                  label={isPass ? 'Excellent Work' : score >= 50 ? 'Good Effort' : 'Needs Practice'}
                  color={isPass ? 'success' : score >= 50 ? 'warning' : 'error'}
                  sx={{ mt: 2, px: 2 }}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Detailed Questions Review */}
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Questions Review
        </Typography>

        {reviewResult.detailed_feedback?.map((item, index) => {
          const isCorrect = item.score >= 0.75;
          const qType = item.question_type || 'short_answer';
          const difficulty = item.difficulty || 'medium';

          // Safe MSQ array parsing
          let parsedUserAnswer = [];
          if (qType === 'msq') {
            try {
              parsedUserAnswer = JSON.parse(item.your_answer || '[]');
              if (typeof parsedUserAnswer === 'string') {
                parsedUserAnswer = JSON.parse(parsedUserAnswer);
              }
            } catch (e) {
              parsedUserAnswer = (item.your_answer || '').split(',').map(s => s.trim()).filter(Boolean);
            }
          }

          return (
            <Card key={index} sx={{ mb: 3, borderLeft: 6, borderLeftColor: isCorrect ? 'success.light' : item.score > 0 ? 'warning.light' : 'error.light' }}>
              <CardContent>
                {/* Meta details */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Question {index + 1}
                  </Typography>
                  <Box>
                    <Chip label={qType.toUpperCase()} size="small" variant="outlined" sx={{ mr: 1 }} />
                    <Chip
                      label={difficulty.toUpperCase()}
                      size="small"
                      color={difficulty === 'hard' ? 'error' : difficulty === 'medium' ? 'warning' : 'success'}
                    />
                  </Box>
                </Box>

                {/* Question content */}
                <Typography variant="h6" fontWeight={500} sx={{ mb: 3 }}>
                  {item.question}
                </Typography>

                {/* Question Types rendering */}
                {qType === 'mcq' && item.options && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                    {item.options.map((opt, optIdx) => {
                      const isCorrectOpt = opt.toLowerCase() === (item.correct_answer || '').toLowerCase();
                      const isSelectedOpt = opt.toLowerCase() === (item.your_answer || '').toLowerCase();

                      let bg = 'background.paper';
                      let border = '1px solid';
                      let borderColor = 'divider';
                      let icon = null;

                      if (isCorrectOpt) {
                        bg = 'success.light';
                        borderColor = 'success.main';
                        icon = <CheckCircle color="success" sx={{ mr: 1, verticalAlign: 'middle' }} />;
                      } else if (isSelectedOpt) {
                        bg = 'error.light';
                        borderColor = 'error.main';
                        icon = <Cancel color="error" sx={{ mr: 1, verticalAlign: 'middle' }} />;
                      }

                      return (
                        <Box
                          key={optIdx}
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            backgroundColor: bg,
                            border: border,
                            borderColor: borderColor,
                            opacity: (bg === 'background.paper') ? 0.8 : 1.0,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {icon}
                          <Typography variant="body1" sx={{ fontWeight: isSelectedOpt || isCorrectOpt ? 600 : 400 }}>
                            {opt}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {qType === 'msq' && item.options && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                    {item.options.map((opt, optIdx) => {
                      const correctList = Array.isArray(item.correct_answer) ? item.correct_answer : [];
                      const isCorrectOpt = correctList.some(c => c.toLowerCase() === opt.toLowerCase());
                      const isSelectedOpt = parsedUserAnswer.some(u => u.toLowerCase() === opt.toLowerCase());

                      let bg = 'background.paper';
                      let border = '1px solid';
                      let borderColor = 'divider';
                      let label = '';
                      let icon = null;

                      if (isSelectedOpt && isCorrectOpt) {
                        bg = 'success.light';
                        borderColor = 'success.main';
                        icon = <CheckCircle color="success" sx={{ mr: 1 }} />;
                        label = ' (Correct Selection)';
                      } else if (isSelectedOpt && !isCorrectOpt) {
                        bg = 'error.light';
                        borderColor = 'error.main';
                        icon = <Cancel color="error" sx={{ mr: 1 }} />;
                        label = ' (Incorrect Selection)';
                      } else if (!isSelectedOpt && isCorrectOpt) {
                        border = '2px dashed';
                        borderColor = 'success.main';
                        label = ' (Correct Answer - Missed)';
                      }

                      return (
                        <Box
                          key={optIdx}
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            backgroundColor: bg,
                            border: border,
                            borderColor: borderColor,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {icon}
                          <Typography variant="body1" sx={{ fontWeight: isSelectedOpt || isCorrectOpt ? 600 : 400, flexGrow: 1 }}>
                            {opt}
                            <Typography component="span" variant="caption" sx={{ fontStyle: 'italic', fontWeight: 700 }}>
                              {label}
                            </Typography>
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {/* Explanation for MCQs and MSQs */}
                {(qType === 'mcq' || qType === 'msq') && item.explanation && (
                  <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                      Concept Explanation:
                    </Typography>
                    <Typography variant="body2">{item.explanation}</Typography>
                  </Alert>
                )}

                {/* Descriptive rendering */}
                {(qType !== 'mcq' && qType !== 'msq') && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                    {/* Your Answer */}
                    <Card variant="outlined" sx={{ borderColor: 'divider', borderRadius: 2 }}>
                      <CardContent>
                        <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
                          Your Answer:
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-line', fontStyle: item.your_answer ? 'normal' : 'italic' }}>
                          {item.your_answer || '(No answer submitted)'}
                        </Typography>
                      </CardContent>
                    </Card>

                    {/* Ideal Model Answer */}
                    <Card variant="outlined" sx={{ borderColor: 'success.light', borderRadius: 2, backgroundColor: 'rgba(239, 253, 245, 0.3)' }}>
                      <CardContent>
                        <Typography variant="subtitle2" fontWeight={600} color="success.dark" gutterBottom>
                          Ideal Model Answer:
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                          {item.model_answer || item.correct_answer || 'No ideal answer provided.'}
                        </Typography>
                      </CardContent>
                    </Card>

                    {/* Score and Suggestions */}
                    <Alert severity="warning" icon={<HelpOutline />} sx={{ borderRadius: 2 }}>
                      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Evaluation & Recommendations (Score: {Math.round(item.score * 100)}%):
                      </Typography>
                      <Typography variant="body2">{item.feedback}</Typography>
                    </Alert>
                  </Box>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Footer actions */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Button variant="contained" size="large" onClick={() => setReviewResult(null)}>
            Return to Dashboard
          </Button>
        </Box>
      </Box>
    );
  }

  // Assessment in progress
  if (currentAssessment) {
    return (
      <Box>
        {/* Header with timer */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={600}>
            Assessment In Progress
          </Typography>
          <Chip
            icon={<Timer />}
            label={formatTime(timeLeft)}
            color={timeLeft < 300 ? 'error' : 'primary'}
          />
        </Box>

        {/* Progress */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2">Progress</Typography>
            <Typography variant="body2">
              {Object.keys(answers).length} / {currentAssessment.questions.length}
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={getProgressPercentage()} sx={{ height: 8, borderRadius: 4 }} />
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Questions */}
        {currentAssessment.questions.map((question, index) => {
          const questionType = question.question_type || question.type || 'short_answer';
          return (
            <Card key={index} sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Question {index + 1}
                  </Typography>
                  <Chip
                    label={questionType.toUpperCase()}
                    size="small"
                    color={
                      questionType === 'mcq' ? 'primary' :
                      questionType === 'msq' ? 'success' :
                      questionType === 'short_answer' ? 'secondary' : 'warning'
                    }
                  />
                </Box>

                <Typography variant="body1" sx={{ mb: 2, fontWeight: 500 }}>
                  {question.question}
                </Typography>

                {questionType === 'mcq' && question.options && (
                  <RadioGroup
                    value={answers[index] || ''}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                  >
                    {question.options.map((option, optIndex) => (
                      <FormControlLabel
                        key={optIndex}
                        value={option}
                        control={<Radio />}
                        label={option}
                      />
                    ))}
                  </RadioGroup>
                )}

                {questionType === 'msq' && question.options && (
                  <FormGroup>
                    {question.options.map((option, optIndex) => {
                      const currentSelected = answers[index] || [];
                      const isChecked = currentSelected.includes(option);
                      return (
                        <FormControlLabel
                          key={optIndex}
                          control={
                            <Checkbox
                              checked={isChecked}
                              onChange={(e) => handleCheckboxChange(index, option, e.target.checked)}
                            />
                          }
                          label={option}
                        />
                      );
                    })}
                  </FormGroup>
                )}

                {(questionType !== 'mcq' && questionType !== 'msq') && (
                  <TextField
                    fullWidth
                    multiline
                    rows={questionType === 'scenario' ? 4 : 2}
                    placeholder="Type your answer here..."
                    value={answers[index] || ''}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Submit Button */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Button
            variant="contained"
            size="large"
            onClick={handleSubmit}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={20} /> : <Check />}
          >
            {submitting ? 'Evaluating...' : 'Submit Assessment'}
          </Button>
        </Box>
      </Box>
    );
  }

  // Configuration and Start Page
  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700}>
          Assessments Center
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Configure and generate tailored assessments to evaluate your skills.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Configuration Panel */}
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Assignment sx={{ fontSize: 32, color: 'primary.main', mr: 1 }} />
                <Typography variant="h5" fontWeight={600}>
                  Assessment Setup
                </Typography>
              </Box>

              <Grid container spacing={3}>
                {/* Job Role Dropdown */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel id="role-select-label">Job Role</InputLabel>
                    <Select
                      labelId="role-select-label"
                      value={role}
                      label="Job Role"
                      onChange={(e) => setRole(e.target.value)}
                    >
                      {ROLES_OPTIONS.map((item) => (
                        <MenuItem key={item} value={item}>
                          {item}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Experience Level Dropdown */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel id="exp-select-label">Experience Level</InputLabel>
                    <Select
                      labelId="exp-select-label"
                      value={experienceLevel}
                      label="Experience Level"
                      onChange={(e) => setExperienceLevel(e.target.value)}
                    >
                      <MenuItem value="entry">Entry Level (0-1 yrs)</MenuItem>
                      <MenuItem value="mid">Mid Level (2-5 yrs)</MenuItem>
                      <MenuItem value="senior">Senior Level (5+ yrs)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* Category Dropdown */}
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel id="category-select-label">Assessment Focus</InputLabel>
                    <Select
                      labelId="category-select-label"
                      value={category}
                      label="Assessment Focus"
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <MenuItem value="mixed">Mixed (Technical + Behavioral)</MenuItem>
                      <MenuItem value="technical">Technical Focus Only</MenuItem>
                      <MenuItem value="hr">HR & Behavioral Focus Only</MenuItem>
                      <MenuItem value="general">General / Basic Concepts for Role</MenuItem>
                      <MenuItem value="coding">Coding & Logical Challenges</MenuItem>
                      <MenuItem value="design">System Design & Architecture Focus</MenuItem>
                      <MenuItem value="hr_basic">HR Basic</MenuItem>
                      <MenuItem value="hr_intermediate">HR Intermediate</MenuItem>
                      <MenuItem value="technical_basic">Technical Basic</MenuItem>
                      <MenuItem value="technical_advanced">Technical Advanced</MenuItem>
                      <MenuItem value="tech_expert">Tech Expert</MenuItem>
                      <MenuItem value="problem_solving">Problem Solving</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<PlayArrow />}
                  onClick={startAssessment}
                  sx={{ px: 4, py: 1.5 }}
                >
                  Generate & Start Assessment
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* History and Overview Panel */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <History sx={{ fontSize: 32, color: 'secondary.main', mr: 1 }} />
                <Typography variant="h5" fontWeight={600}>
                  Assessment History
                </Typography>
              </Box>

              <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Review detailed insights and feedback on your past performance to study and improve your interview skills.
              </Typography>

              <Button
                variant="outlined"
                size="large"
                fullWidth
                onClick={() => setShowHistory(true)}
                sx={{ py: 1.5 }}
              >
                View Past Assessments ({assessmentHistory.length})
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* History Dialog */}
      <Dialog open={showHistory} onClose={() => setShowHistory(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>
            Assessment History
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {!Array.isArray(assessmentHistory) || assessmentHistory.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              No assessment history yet. Complete an assessment to see your history.
            </Typography>
          ) : (
            <List>
              {assessmentHistory.map((item, index) => {
                const score = item.score_percentage || item.score || 0;
                return (
                  <React.Fragment key={index}>
                    <ListItem>
                      <ListItemText
                        primary={`Assessment on ${new Date(item.date).toLocaleDateString()}`}
                        secondary={`Score: ${Math.round(score)}% (${item.correct_answers || 0}/${item.total_questions || 0})`}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 2 }}>
                        <Chip
                          label={`${Math.round(score)}%`}
                          size="small"
                          color={score >= 70 ? 'success' : score >= 50 ? 'warning' : 'error'}
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleViewReview(item.assessment_id)}
                        >
                          Review
                        </Button>
                      </Box>
                    </ListItem>
                    {index < assessmentHistory.length - 1 && <Divider />}
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHistory(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Assessments;
