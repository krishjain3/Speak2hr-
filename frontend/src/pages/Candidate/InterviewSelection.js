import React, { useState } from 'react';
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
} from '@mui/material';
import {
  SmartToy,
  Person,
  Upload,
  Check,
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { resumeAPI } from '../../services/api';

const SKILLS_OPTIONS = [
  'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'AWS',
  'Docker', 'Kubernetes', 'Machine Learning', 'Data Analysis', 'TypeScript',
  'Go', 'Rust', 'C++', 'C#', '.NET', 'Ruby', 'PHP', 'Swift',
];

function InterviewSelection() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [selectedType, setSelectedType] = useState(null);
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

  const handleInterviewTypeSelect = (type) => {
    setSelectedType(type);
    if (type === 'ai') {
      setSetupDialogOpen(true);
    } else {
      navigate('/candidate/hr-interview-booking');
    }
  };

  const handleResumeUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const response = await resumeAPI.upload(file);
      setResumeData(response.data);
      setResumeUploaded(true);

      // Auto-fill skills from resume
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

  const handleSkillsChange = (event) => {
    const { value } = event.target;
    setInterviewConfig({
      ...interviewConfig,
      skills: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const handleStartAIInterview = () => {
    setSetupDialogOpen(false);
    navigate('/candidate/ai-interview', {
      state: {
        config: interviewConfig,
        resumeData: resumeData,
      },
    });
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={600}>
          Select Interview Type
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Choose how you want to be interviewed
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {/* AI Interview Card */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              height: '100%',
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
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <SmartToy sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
              <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
                AI-Powered Interview
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Get instant feedback with our AI-powered interview system.
                Answer questions on video and receive detailed analysis of your
                performance including emotion detection and technical evaluation.
              </Typography>
              <Box sx={{ mb: 3 }}>
                <Chip label="8 Progressive Levels" size="small" sx={{ m: 0.5 }} />
                <Chip label="Instant Feedback" size="small" sx={{ m: 0.5 }} />
                <Chip label="Emotion Analysis" size="small" sx={{ m: 0.5 }} />
                <Chip label="Technical Scoring" size="small" sx={{ m: 0.5 }} />
              </Box>
              <Button
                variant="contained"
                size="large"
                startIcon={<SmartToy />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleInterviewTypeSelect('ai');
                }}
              >
                Start AI Interview
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* HR Interview Card */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              height: '100%',
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
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Person sx={{ fontSize: 80, color: 'secondary.main', mb: 2 }} />
              <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
                HR Interview
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Schedule a live interview session with our HR team.
                Book an available slot and get personalized feedback
                from experienced interviewers.
              </Typography>
              <Box sx={{ mb: 3 }}>
                <Chip label="Live Session" size="small" sx={{ m: 0.5 }} color="secondary" />
                <Chip label="Personalized Feedback" size="small" sx={{ m: 0.5 }} color="secondary" />
                <Chip label="Flexible Scheduling" size="small" sx={{ m: 0.5 }} color="secondary" />
                <Chip label="Human Touch" size="small" sx={{ m: 0.5 }} color="secondary" />
              </Box>
              <Button
                variant="contained"
                color="secondary"
                size="large"
                startIcon={<Person />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleInterviewTypeSelect('hr');
                }}
              >
                Book HR Interview
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* AI Interview Setup Dialog */}
      <Dialog open={setupDialogOpen} onClose={() => setSetupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>
            Setup Your AI Interview
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {/* Resume Upload */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Upload Resume (Optional)
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
                  onChange={handleResumeUpload}
                />
              </Button>
              {resumeUploaded && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  Resume analyzed successfully! Skills have been auto-filled.
                </Alert>
              )}
            </Box>

            {/* Skills Selection */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Your Skills</InputLabel>
              <Select
                multiple
                value={interviewConfig.skills}
                onChange={handleSkillsChange}
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

            {/* Experience Years */}
            <TextField
              fullWidth
              label="Years of Experience"
              type="number"
              value={interviewConfig.experienceYears}
              onChange={(e) => setInterviewConfig({ ...interviewConfig, experienceYears: parseInt(e.target.value) || 0 })}
              sx={{ mb: 2 }}
              inputProps={{ min: 0, max: 50 }}
            />

            {/* Target Role */}
            <TextField
              fullWidth
              label="Target Role"
              value={interviewConfig.targetRole}
              onChange={(e) => setInterviewConfig({ ...interviewConfig, targetRole: e.target.value })}
              sx={{ mb: 2 }}
              placeholder="e.g., Senior Software Engineer"
            />

            {/* Interview Level */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="interview-level-label">Interview Level / Focus</InputLabel>
              <Select
                labelId="interview-level-label"
                value={interviewConfig.interviewLevel}
                label="Interview Level / Focus"
                onChange={(e) => setInterviewConfig({ ...interviewConfig, interviewLevel: e.target.value })}
              >
                <MenuItem value="Technical Basic">Technical Basic</MenuItem>
                <MenuItem value="Technical Advanced">Technical Advanced</MenuItem>
                <MenuItem value="Tech Expert">Tech Expert</MenuItem>
                <MenuItem value="HR Basic">HR Basic</MenuItem>
                <MenuItem value="HR Intermediate">HR Intermediate</MenuItem>
                <MenuItem value="Problem Solving">Problem Solving</MenuItem>
              </Select>
            </FormControl>

            {/* Job Description */}
            <TextField
              fullWidth
              label="Job Description (Optional)"
              multiline
              rows={4}
              value={interviewConfig.jobDescription}
              onChange={(e) => setInterviewConfig({ ...interviewConfig, jobDescription: e.target.value })}
              placeholder="Paste the job description to get more relevant questions..."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSetupDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleStartAIInterview}
            disabled={interviewConfig.skills.length === 0}
          >
            Start Interview
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default InterviewSelection;
