import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  TextField,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  People,
  EventAvailable,
  Assessment,
  TrendingUp,
  Schedule,
  VideoCall,
  Refresh,
  Person,
  CheckCircle,
  Cancel,
  Work,
  Email,
  Phone,
  LocationOn,
  Settings,
} from '@mui/icons-material';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useAuthStore } from '../../store/authStore';
import api, { candidatesAPI, slotAPI } from '../../services/api';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

function HRDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Dashboard metrics
  const [stats, setStats] = useState({
    totalCandidates: 0,
    interviewsToday: 0,
    pendingEvaluations: 0,
    averageScore: 0,
  });
  
  const [recentCandidates, setRecentCandidates] = useState([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);
  const [allHrSlots, setAllHrSlots] = useState([]);
  
  // Recruiter Profile state
  const [profileForm, setProfileForm] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    designation: '',
    department: '',
    specialization: '',
    languages: '',
    bio: '',
    working_hours: '09:00 AM - 06:00 PM',
    location: '',
    avatar: '',
  });

  // Chart state
  const [chartData, setChartData] = useState({
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    datasets: [{
      label: 'Scheduled Round Completions',
      data: [0, 0, 0, 0, 0],
      backgroundColor: 'rgba(79, 70, 229, 0.8)',
      borderRadius: 6,
    }]
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch stats
      const statsResponse = await candidatesAPI.getStats();
      setStats(statsResponse.data);

      // Fetch candidates
      const candidatesResponse = await candidatesAPI.getAll();
      setRecentCandidates(candidatesResponse.data.slice(0, 4) || []);

      // Fetch slots
      const slotsResponse = await slotAPI.getAll();
      const slots = slotsResponse.data || [];
      
      const hrSlots = slots.filter(slot =>
        slot.hrEmail === user?.email ||
        slot.hrName === user?.name ||
        !slot.hrEmail
      );
      setAllHrSlots(hrSlots);

      const bookedSlots = hrSlots
        .filter(s => s.status === 'booked')
        .sort((a, b) => new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`));
      setUpcomingInterviews(bookedSlots);

      // Load HR profile details from database
      const hrListResponse = await api.get('/api/hrs');
      const matchedHr = hrListResponse.data.find(h => h.email === user?.email || h.id === user?.id);
      
      if (matchedHr) {
        setProfileForm({
          id: matchedHr.id,
          name: matchedHr.name || user?.name || '',
          email: matchedHr.email || user?.email || '',
          phone: matchedHr.phone || '',
          designation: matchedHr.designation || 'HR Recruitment Lead',
          department: matchedHr.department || 'Talent Acquisition',
          specialization: Array.isArray(matchedHr.specialization) ? matchedHr.specialization.join(', ') : '',
          languages: Array.isArray(matchedHr.languages) ? matchedHr.languages.join(', ') : 'English',
          bio: matchedHr.bio || '',
          working_hours: matchedHr.working_hours || '09:00 AM - 06:00 PM',
          location: matchedHr.location || 'Remote',
          avatar: matchedHr.avatar || '',
        });
      }

      // Build chart with real completions per day of week
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const completionsPerDay = [0, 0, 0, 0, 0];
      hrSlots
        .filter(s => s.status === 'completed' && s.date)
        .forEach(s => {
          const slotDate = new Date(s.date);
          const dayOfWeek = slotDate.getDay(); // 0=Sun, 1=Mon...
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            completionsPerDay[dayOfWeek - 1] += 1;
          }
        });
      setChartData({
        labels: dayLabels,
        datasets: [{
          label: 'Completed Interviews',
          data: completionsPerDay,
          backgroundColor: 'rgba(79, 70, 229, 0.85)',
          borderRadius: 6,
        }]
      });

    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError('Could not connect to backend server.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSuccessMsg('');
    setError('');
    
    try {
      const payload = {
        name: profileForm.name,
        email: profileForm.email,
        phone: profileForm.phone,
        designation: profileForm.designation,
        department: profileForm.department,
        specialization: profileForm.specialization.split(',').map(s => s.trim()).filter(Boolean),
        languages: profileForm.languages.split(',').map(s => s.trim()).filter(Boolean),
        bio: profileForm.bio,
        working_hours: profileForm.working_hours,
        location: profileForm.location,
        avatar: profileForm.avatar,
      };

      await api.put(`/api/hr/profile/${profileForm.id || user?.id}`, payload);
      setSuccessMsg('Profile updated successfully!');
      fetchDashboardData();
    } catch (err) {
      setError('Failed to update recruiter profile.');
    }
  };

  const handleSlotStatusUpdate = async (slotId, newStatus) => {
    try {
      await api.put(`/api/slots/${slotId}`, { status: newStatus });
      setSuccessMsg(`Slot marked as ${newStatus}`);
      fetchDashboardData();
    } catch (err) {
      setError('Failed to update slot status.');
    }
  };

  const activeSlots = allHrSlots.filter(s => s.status === 'available').length;
  const bookedSlots = allHrSlots.filter(s => s.status === 'booked').length;
  const completedRounds = allHrSlots.filter(s => s.status === 'completed').length;

  return (
    <Box sx={{ pb: 6 }}>
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
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 2 }}>
          <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
            Welcome, {user?.name || 'Recruiter'}!
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9, maxWidth: 600 }}>
            Manage slots, candidates, and edit recruiter profiles.
          </Typography>
        </Box>
        <Button 
          startIcon={<Refresh />} 
          variant="contained" 
          onClick={fetchDashboardData}
          sx={{ 
            bgcolor: 'rgba(255, 255, 255, 0.2)', 
            color: 'white', 
            zIndex: 2,
            backdropFilter: 'blur(10px)',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.3)',
            }
          }}
        >
          Sync Data
        </Button>
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

      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onChange={(e, val) => setActiveTab(val)} 
        sx={{ 
          mb: 4, 
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
          '& .MuiTab-root': { fontWeight: 600 }
        }}
      >
        <Tab label="Dashboard Portal" />
        <Tab label="My Recruiter Profile" />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}
      {successMsg && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{successMsg}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : activeTab === 0 ? (
        <Box>
          {/* Recruiter KPIs */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {/* Total Registered Candidates */}
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Avatar sx={{ bgcolor: 'rgba(79, 70, 229, 0.1)', color: 'primary.main', mx: 'auto', mb: 1.5 }}>
                    <People />
                  </Avatar>
                  <Typography variant="h4" fontWeight={800}>{stats.totalCandidates}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Registered</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Interviews Today */}
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Avatar sx={{ bgcolor: 'rgba(192, 132, 252, 0.1)', color: 'secondary.main', mx: 'auto', mb: 1.5 }}>
                    <Schedule />
                  </Avatar>
                  <Typography variant="h4" fontWeight={800}>{stats.interviewsToday}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Today's Rounds</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Pending evaluations */}
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Avatar sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: 'error.main', mx: 'auto', mb: 1.5 }}>
                    <Assessment />
                  </Avatar>
                  <Typography variant="h4" fontWeight={800}>{stats.pendingEvaluations}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Pending Review</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Active / Available slots */}
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Avatar sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.main', mx: 'auto', mb: 1.5 }}>
                    <EventAvailable />
                  </Avatar>
                  <Typography variant="h4" fontWeight={800}>{activeSlots}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Available Slots</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Slots Booked */}
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Avatar sx={{ bgcolor: 'rgba(79, 70, 229, 0.1)', color: 'primary.main', mx: 'auto', mb: 1.5 }}>
                    <Work />
                  </Avatar>
                  <Typography variant="h4" fontWeight={800}>{bookedSlots}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Booked Slots</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Slots Completed */}
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Avatar sx={{ bgcolor: 'rgba(251, 191, 36, 0.1)', color: 'warning.main', mx: 'auto', mb: 1.5 }}>
                    <TrendingUp />
                  </Avatar>
                  <Typography variant="h4" fontWeight={800}>{completedRounds}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Completed Rounds</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Chart Section */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12}>
              <Card sx={{ p: 2 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                    Completion & Capacity Performance
                  </Typography>
                  <Box sx={{ height: 250 }}>
                    <Bar 
                      data={chartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          y: { grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true },
                          x: { grid: { display: false } }
                        }
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Candidates & Booked Schedules listing panels */}
          <Grid container spacing={3}>
            {/* Recent Candidates */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" fontWeight={700}>Recent Candidates</Typography>
                    <Button variant="text" size="small" onClick={() => navigate('/hr/candidates')}>View All</Button>
                  </Box>
                  {recentCandidates.length === 0 ? (
                    <Typography color="text.secondary" variant="body2" sx={{ py: 3, textAlign: 'center' }}>
                      No registered candidates yet.
                    </Typography>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {recentCandidates.map((cand) => (
                        <ListItem key={cand.id} divider sx={{ px: 0, py: 1.5 }}>
                          <ListItemAvatar>
                            <Avatar sx={{ bgcolor: 'rgba(79, 70, 229, 0.1)', color: 'primary.main' }}>
                              {cand.name.charAt(0)}
                            </Avatar>
                          </ListItemAvatar>
                          <ListItemText 
                            primary={cand.name} 
                            primaryTypographyProps={{ fontWeight: 600 }}
                            secondary={cand.role || 'Software Engineer'}
                          />
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="subtitle2" fontWeight={700}>{cand.score}%</Typography>
                            <Chip 
                              label={cand.status || 'NEW'} 
                              size="small" 
                              color={cand.status === 'Passed' || cand.status === 'accepted' ? 'success' : 'warning'} 
                              sx={{ mt: 0.5, fontSize: '0.65rem', height: 20 }}
                            />
                          </Box>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Upcoming / Booked Rounds */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" fontWeight={700}>Booked Rounds</Typography>
                    <Button variant="text" size="small" onClick={() => navigate('/hr/slots')}>Manage Slots</Button>
                  </Box>
                  {upcomingInterviews.length === 0 ? (
                    <Typography color="text.secondary" variant="body2" sx={{ py: 3, textAlign: 'center' }}>
                      No upcoming candidate matches scheduled.
                    </Typography>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {upcomingInterviews.map((intv) => (
                        <ListItem key={intv.id} divider sx={{ px: 0, py: 2 }}>
                          <ListItemAvatar>
                            <Avatar sx={{ bgcolor: 'rgba(192, 132, 252, 0.1)', color: 'secondary.main' }}>
                              <Schedule />
                            </Avatar>
                          </ListItemAvatar>
                          <ListItemText 
                            primary={`Interview: ${intv.candidate || 'Candidate'}`}
                            primaryTypographyProps={{ fontWeight: 600 }}
                            secondary={`${intv.date} at ${intv.time} (${intv.duration} min)`}
                          />
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            {intv.videoCallLink && (
                              <Button 
                                variant="contained" 
                                color="success" 
                                size="small"
                                onClick={() => navigate(intv.videoCallLink)}
                              >
                                Join
                              </Button>
                            )}
                            <Button 
                              variant="outlined" 
                              size="small"
                              onClick={() => handleSlotStatusUpdate(intv.id, 'completed')}
                            >
                              Done
                            </Button>
                          </Box>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      ) : (
        <Box sx={{ maxWidth: 800, mx: 'auto' }}>
          <Card sx={{ p: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
                Recruiter Profile Setup
              </Typography>
              <form onSubmit={handleUpdateProfile}>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      label="Full Recruiter Name" 
                      fullWidth 
                      value={profileForm.name} 
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      label="Recruiter Email Address" 
                      fullWidth 
                      type="email" 
                      value={profileForm.email} 
                      onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      label="Recruiter Contact Phone" 
                      fullWidth 
                      value={profileForm.phone} 
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      label="Recruitment Designation" 
                      fullWidth 
                      value={profileForm.designation} 
                      onChange={(e) => setProfileForm({ ...profileForm, designation: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      label="HR Department" 
                      fullWidth 
                      value={profileForm.department} 
                      onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      label="Office/Recruitment Location" 
                      fullWidth 
                      value={profileForm.location} 
                      onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      label="Standard Recruiter Hours (e.g. 09:00 AM - 06:00 PM)" 
                      fullWidth 
                      value={profileForm.working_hours} 
                      onChange={(e) => setProfileForm({ ...profileForm, working_hours: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      label="Avatar Profile Image Link URL" 
                      fullWidth 
                      value={profileForm.avatar} 
                      onChange={(e) => setProfileForm({ ...profileForm, avatar: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      label="Specializations / Targeted Departments (comma separated, e.g. Frontend, Java, SQL)" 
                      fullWidth 
                      value={profileForm.specialization} 
                      onChange={(e) => setProfileForm({ ...profileForm, specialization: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      label="Interview Languages (comma separated, e.g. English, Spanish)" 
                      fullWidth 
                      value={profileForm.languages} 
                      onChange={(e) => setProfileForm({ ...profileForm, languages: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      label="Recruiter Biography / Bio Description" 
                      fullWidth 
                      multiline 
                      rows={4} 
                      value={profileForm.bio} 
                      onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="contained" type="submit">
                      Save Changes
                    </Button>
                  </Grid>
                </Grid>
              </form>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}

export default HRDashboard;
