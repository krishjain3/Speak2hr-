import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider,
  Rating,
  CardActions,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import {
  VideoCall,
  Assignment,
  TrendingUp,
  EmojiEvents,
  Schedule,
  CheckCircle,
  AccessTime,
  Work,
  Person,
  Star,
  ChevronRight,
  Language,
  Refresh,
} from '@mui/icons-material';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { useAuthStore } from '../../store/authStore';
import api, { slotAPI, candidatesAPI } from '../../services/api';
import CircularProgress from '@mui/material/CircularProgress';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);

function CandidateDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [hrs, setHrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    completedInterviews: 0,
    pendingAssessments: 0,
    averageScore: 0,
    totalSessions: 0,
  });

  const [progress, setProgress] = useState({
    overall: 0,
    technical: 0,
    communication: 0
  });

  const [performanceData, setPerformanceData] = useState({
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [{
      label: 'Performance Score', data: [0, 0, 0, 0],
      borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.05)',
      fill: true, tension: 0.4,
    }],
  });

  const [skillsData, setSkillsData] = useState({
    labels: ['Technical', 'Communication', 'Problem Solving', 'Behavioral'],
    datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#4f46e5', '#818cf8', '#a78bfa', '#c084fc'] }],
  });

  const [bookedInterviews, setBookedInterviews] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);

  useEffect(() => {
    if (user?.id) {
      setLoading(true);
      Promise.all([
        fetchBookedInterviews(),
        fetchActivities(),
        fetchDashboardData(),
        fetchHrs(),
      ]).finally(() => setLoading(false));
    }
  }, [user?.id]);

  const fetchDashboardData = async () => {
    try {
      const resp = await candidatesAPI.getDashboardData(user.id);
      if (resp.data.stats) setStats(resp.data.stats);
      if (resp.data.progress) setProgress(resp.data.progress);
      if (resp.data.performanceData) setPerformanceData(resp.data.performanceData);
      if (resp.data.skillsData) setSkillsData(resp.data.skillsData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  const fetchBookedInterviews = async () => {
    try {
      const response = await slotAPI.getAll();
      const myInterviews = response.data.filter(
        slot => slot.status === 'booked' && slot.candidateId === user?.id
      );
      setBookedInterviews(myInterviews);
    } catch (error) {
      console.error('Failed to fetch booked interviews:', error);
    }
  };

  const fetchActivities = async () => {
    try {
      const resp = await candidatesAPI.getActivities(user.id);
      const data = resp.data;
      setRecentActivities(Array.isArray(data) ? data : (data?.activities || []));
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    }
  };

  const fetchHrs = async () => {
    try {
      const response = await api.get('/api/hrs');
      setHrs(response.data.slice(0, 3) || []); // Limit to 3 for quick dashboard listing
    } catch (err) {
      console.error('Failed to load HRs:', err);
    }
  };

  const formatDate = (isoString) => {
    try {
      if (!isoString) return '';
      const d = new Date(isoString);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}-${month}-${year} ${hours}:${minutes}`;
    } catch {
      return isoString;
    }
  };

  // Build static pipeline flow steps based on scores/evaluations
  const getActiveStep = () => {
    if (stats.completedInterviews > 0) return 4; // Final decision
    if (bookedInterviews.length > 0) return 3; // HR Booking completed
    if (stats.averageScore > 0) return 2; // Assessment complete
    return 1; // Registered
  };

  const timelineSteps = [
    { label: 'Profile Registered & Resume Parsed', desc: 'Your profile is active.' },
    { label: 'AI Technical Interview Evaluation', desc: 'Assess technical stacks.' },
    { label: 'General Knowledge & HR Behavioral Assessment', desc: 'Continuous testing.' },
    { label: 'Direct HR Interview Scheduling', desc: 'Booked recruiter round.' },
    { label: 'Hiring Committee Review', desc: 'Feedback pending.' }
  ];

  const nextInterview = bookedInterviews[0];

  return (
    <Box sx={{ pb: 6 }}>
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
          <CircularProgress size={48} />
          <Typography variant="body1" color="text.secondary">Loading your dashboard...</Typography>
        </Box>
      ) : (
      <>
      {/* Welcome Hero Banner */}
      <Box 
        sx={{ 
          background: 'linear-gradient(135deg, #4f46e5 0%, #7e22ce 100%)',
          color: 'white',
          borderRadius: 4,
          p: { xs: 3, md: 5 },
          mb: 4,
          boxShadow: '0 8px 30px rgba(79, 70, 229, 0.25)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 2 }}>
          <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
            Welcome, {user?.name || 'Candidate'}!
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9, maxWidth: 600 }}>
            Manage your interviews, check your specialty scores, and select top-tier recruiters to schedule your final matching evaluations.
          </Typography>
        </Box>
        <Box 
          sx={{ 
            position: 'absolute',
            top: -50,
            right: -50,
            width: 250,
            height: 250,
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
      </Box>

      {/* KPI Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Next/Upcoming Interview */}
        <Grid item xs={12} md={6} lg={3}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                  Upcoming Interview
                </Typography>
                <Avatar sx={{ bgcolor: 'primary.light' }}><Schedule /></Avatar>
              </Box>
              {nextInterview ? (
                <Box>
                  <Typography variant="h6" fontWeight={700} noWrap>
                    {nextInterview.hrName || 'HR Recruiter'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {formatDate(nextInterview.date)} at {nextInterview.time}
                  </Typography>
                </Box>
              ) : (
                <Box>
                  <Typography variant="h6" fontWeight={700} color="text.secondary">
                    No slot booked
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Select an HR below to book
                  </Typography>
                </Box>
              )}
            </CardContent>
            <CardActions sx={{ px: 2, pb: 2 }}>
              {nextInterview ? (
                <Button 
                  fullWidth 
                  variant="contained" 
                  startIcon={<VideoCall />}
                  onClick={() => navigate(nextInterview.videoCallLink || `/video-call/room_${nextInterview.id}`)}
                >
                  Join Call
                </Button>
              ) : (
                <Button 
                  fullWidth 
                  variant="outlined" 
                  onClick={() => navigate('/candidate/hr-interview-booking')}
                >
                  Schedule Now
                </Button>
              )}
            </CardActions>
          </Card>
        </Grid>

        {/* Completed Interviews */}
        <Grid item xs={12} sm={6} md={3} lg={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                  Completed Interviews
                </Typography>
                <Avatar sx={{ bgcolor: 'success.light' }}><CheckCircle /></Avatar>
              </Box>
              <Typography variant="h3" fontWeight={800} color="primary.dark">
                {stats.completedInterviews}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Feedback submitted
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Average Score */}
        <Grid item xs={12} sm={6} md={3} lg={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                  Average Score
                </Typography>
                <Avatar sx={{ bgcolor: 'warning.light' }}><TrendingUp /></Avatar>
              </Box>
              <Typography variant="h3" fontWeight={800} color="primary.dark">
                {stats.averageScore}%
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Across all tasks
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Application Status */}
        <Grid item xs={12} sm={6} md={3} lg={3}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
                  Application Status
                </Typography>
                <Avatar sx={{ bgcolor: 'secondary.light' }}><Work /></Avatar>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <Chip 
                  label={user?.status?.toUpperCase() || 'ACTIVE'} 
                  color={
                    user?.status === 'approved' || user?.status === 'accepted' ? 'success' :
                    user?.status === 'hold' ? 'warning' :
                    user?.status === 'rejected' ? 'error' : 'primary'
                  }
                  sx={{ fontWeight: 700, px: 1 }}
                />
              </Box>
            </CardContent>
            <CardActions sx={{ px: 2, pb: 2 }}>
              <Button fullWidth variant="text" size="small" onClick={() => navigate('/candidate/profile')}>
                View Profile Details
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>

      {/* Main Grid: Left Column: Available HRs & Timeline, Right Column: Analytics & Progress */}
      <Grid container spacing={3}>
        {/* Left Side */}
        <Grid item xs={12} lg={8}>
          {/* Timeline */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
                Interview Timeline
              </Typography>
              <Stepper activeStep={getActiveStep()} orientation="vertical">
                {timelineSteps.map((step, index) => (
                  <Step key={index}>
                    <StepLabel>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {step.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {step.desc}
                      </Typography>
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>
            </CardContent>
          </Card>

          {/* Available Recruiter cards */}
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Featured Recruiters
          </Typography>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {hrs.map((hr) => (
              <Grid item xs={12} md={4} key={hr.id}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Avatar src={hr.avatar} sx={{ width: 52, height: 52, mr: 2, border: '2px solid #818cf8' }} />
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700} noWrap>
                          {hr.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {hr.designation}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Star sx={{ color: '#fbbf24', fontSize: 16, mr: 0.5 }} />
                      <Typography variant="caption" fontWeight={600}>
                        {hr.rating} / 5.0
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {hr.bio}
                    </Typography>
                    <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {hr.specialization.slice(0, 2).map((s) => (
                        <Chip key={s} label={s} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                      ))}
                    </Box>
                  </CardContent>
                  <CardActions sx={{ p: 2 }}>
                    <Button 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      onClick={() => navigate('/candidate/hr-interview-booking')}
                    >
                      Book Interview
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Performance chart */}
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                Evaluation Trend
              </Typography>
              <Box sx={{ height: 280 }}>
                <Line
                  data={performanceData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' } },
                      x: { grid: { display: false } }
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right Side */}
        <Grid item xs={12} lg={4}>
          {/* Skill progress bars */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
                Skills Breakdown
              </Typography>
              
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}>Overall Progress</Typography>
                  <Typography variant="body2" fontWeight={600}>{progress.overall}%</Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={progress.overall} 
                  sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(79, 70, 229, 0.1)' }} 
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}>Technical Skills</Typography>
                  <Typography variant="body2" fontWeight={600}>{progress.technical}%</Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={progress.technical} 
                  color="secondary"
                  sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(192, 132, 252, 0.1)' }} 
                />
              </Box>

              <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}>Communication</Typography>
                  <Typography variant="body2" fontWeight={600}>{progress.communication}%</Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={progress.communication} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4, 
                    bgcolor: 'rgba(129, 140, 248, 0.1)',
                    '& .MuiLinearProgress-bar': { backgroundColor: '#818cf8' }
                  }} 
                />
              </Box>
            </CardContent>
          </Card>

          {/* Skill Distribution Donut */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                Focus Distribution
              </Typography>
              <Box sx={{ height: 200, display: 'flex', justifyContent: 'center' }}>
                <Doughnut
                  data={skillsData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
                    }
                  }}
                />
              </Box>
            </CardContent>
          </Card>

          {/* Recent Activity logs */}
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                Recent Activities
              </Typography>
              {recentActivities.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  No recent activities yet. Complete an assessment to get started!
                </Typography>
              ) : (
                recentActivities.map((activity, index) => (
                  <React.Fragment key={activity.id || index}>
                    <ListItem alignItems="flex-start" sx={{ px: 0, py: 1.5 }}>
                      <ListItemAvatar sx={{ minWidth: 40 }}>
                        <Avatar sx={{ bgcolor: 'primary.light', width: 32, height: 32 }}>
                          {activity.type === 'assessment' ? <Assignment sx={{ fontSize: 16 }} /> : <VideoCall sx={{ fontSize: 16 }} />}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={activity.title}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                        secondary={formatDate(activity.date)}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                    {index < recentActivities.length - 1 && <Divider />}
                  </React.Fragment>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      </>
      )}
    </Box>
  );
}

export default CandidateDashboard;
