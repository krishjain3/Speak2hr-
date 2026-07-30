import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Avatar,
  Chip,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Divider,
  TextField,
  Rating,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  ArrowBack,
  Email,
  Phone,
  LocationOn,
  Download,
} from '@mui/icons-material';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'react-chartjs-2';
import api, { candidatesAPI } from '../../services/api';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

function CandidateDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [hrNotes, setHrNotes] = useState('');
  const [hrRating, setHrRating] = useState(0);
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchCandidate();
  }, [id]);

  const fetchCandidate = async () => {
    try {
      const response = await candidatesAPI.getById(id);
      setCandidate(response.data);
      setHrNotes(response.data.hrNotes || '');
      setHrRating(response.data.hrRating || 0);
    } catch (err) {
      console.error('Failed to fetch candidate:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await candidatesAPI.update(id, { hrNotes, hrRating });
      setSuccess('Notes saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      setSaving(true);
      await api.put(`/api/candidates/${id}/status`, { status: newStatus });
      setSuccess(`Candidate status updated to ${newStatus.toUpperCase()}`);
      fetchCandidate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setSuccess('');
    } finally {
      setSaving(false);
    }
  };

  const radarData = {
    labels: ['Technical', 'Communication', 'Problem Solving', 'Behavioral', 'Engagement'],
    datasets: [
      {
        label: 'Candidate Score',
        data: candidate ? [
          candidate.score,
          Math.round(candidate.score * 0.9),
          Math.round(candidate.score * 0.95),
          Math.round(candidate.score * 0.92),
          Math.round(candidate.score * 0.98)
        ] : [0, 0, 0, 0, 0],
        backgroundColor: 'rgba(25, 118, 210, 0.2)',
        borderColor: '#1976d2',
        pointBackgroundColor: '#1976d2',
      },
    ],
  };

  const getScoreColor = (score) => {
    if (score >= 85) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!candidate) {
    return (
      <Box>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/hr/candidates')} sx={{ mb: 3 }}>
          Back to Candidates
        </Button>
        <Alert severity="error">Candidate not found</Alert>
      </Box>
    );
  }

  // Generate mock interview history based on candidate data
  const interviews = [
    {
      id: 1,
      date: candidate.date,
      type: 'AI Interview',
      score: candidate.score,
      technical: Math.round(candidate.score * 1.02),
      communication: Math.round(candidate.score * 0.9),
      behavioral: Math.round(candidate.score * 0.95),
    },
  ];

  if (candidate.interviews > 1) {
    interviews.push({
      id: 2,
      date: new Date(new Date(candidate.date).getTime() - 86400000 * 5).toISOString().split('T')[0],
      type: 'HR Interview',
      score: Math.round(candidate.score * 0.95),
      technical: Math.round(candidate.score * 0.93),
      communication: Math.round(candidate.score * 0.98),
      behavioral: Math.round(candidate.score * 0.92),
    });
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate('/hr/candidates')}
        sx={{ mb: 3 }}
      >
        Back to Candidates
      </Button>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Grid container spacing={3}>
        {/* Profile Card */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Avatar
                sx={{
                  width: 100,
                  height: 100,
                  mx: 'auto',
                  mb: 2,
                  bgcolor: 'primary.main',
                  fontSize: 40,
                }}
              >
                {candidate.name.charAt(0)}
              </Avatar>
              <Typography variant="h5" fontWeight={600}>
                {candidate.name}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {candidate.role}
              </Typography>
              <Chip
                label={candidate.status?.toUpperCase() || 'NEW'}
                color={
                  candidate.status === 'Passed' || candidate.status === 'accepted' || candidate.status === 'approved' ? 'success' : 
                  candidate.status === 'hold' ? 'warning' :
                  candidate.status === 'rejected' ? 'error' : 'default'
                }
                sx={{ mb: 3 }}
              />

              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 1 }}>
                  APPLICATION DECISION STATUS
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={4}>
                    <Button 
                      fullWidth 
                      variant={candidate.status === 'accepted' || candidate.status === 'approved' ? 'contained' : 'outlined'}
                      color="success" 
                      size="small"
                      onClick={() => handleUpdateStatus('accepted')}
                    >
                      Accept
                    </Button>
                  </Grid>
                  <Grid item xs={4}>
                    <Button 
                      fullWidth 
                      variant={candidate.status === 'hold' ? 'contained' : 'outlined'}
                      color="warning" 
                      size="small"
                      onClick={() => handleUpdateStatus('hold')}
                    >
                      Hold
                    </Button>
                  </Grid>
                  <Grid item xs={4}>
                    <Button 
                      fullWidth 
                      variant={candidate.status === 'rejected' ? 'contained' : 'outlined'}
                      color="error" 
                      size="small"
                      onClick={() => handleUpdateStatus('rejected')}
                    >
                      Reject
                    </Button>
                  </Grid>
                </Grid>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ textAlign: 'left' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Email sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                  <Typography variant="body2">{candidate.email}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Phone sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                  <Typography variant="body2">{candidate.phone || 'N/A'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <LocationOn sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                  <Typography variant="body2">{candidate.location || 'N/A'}</Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Skills
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
                {(candidate.skills || []).map((skill) => (
                  <Chip key={skill} label={skill} size="small" />
                ))}
              </Box>

              <Button
                variant="outlined"
                startIcon={<Download />}
                fullWidth
                sx={{ mt: 3 }}
              >
                Download Report
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Details Section */}
        <Grid item xs={12} md={8}>
          {/* Overall Score Card */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h2" color="primary" fontWeight={700}>
                      {candidate.score}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Overall Score
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={8}>
                  <Box sx={{ height: 200 }}>
                    <Radar
                      data={radarData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                          r: {
                            beginAtZero: true,
                            max: 100,
                          },
                        },
                        plugins: { legend: { display: false } },
                      }}
                    />
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Card>
            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab label="Interview History" />
              <Tab label="HR Notes" />
            </Tabs>

            {/* Interview History Tab */}
            {tabValue === 0 && (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Overall</TableCell>
                      <TableCell>Technical</TableCell>
                      <TableCell>Communication</TableCell>
                      <TableCell>Behavioral</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {interviews.map((interview) => (
                      <TableRow key={interview.id}>
                        <TableCell>{interview.date}</TableCell>
                        <TableCell>
                          <Chip
                            label={interview.type}
                            size="small"
                            color={interview.type === 'AI Interview' ? 'primary' : 'secondary'}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <LinearProgress
                              variant="determinate"
                              value={interview.score}
                              color={getScoreColor(interview.score)}
                              sx={{ width: 60, mr: 1 }}
                            />
                            {interview.score}%
                          </Box>
                        </TableCell>
                        <TableCell>{interview.technical}%</TableCell>
                        <TableCell>{interview.communication}%</TableCell>
                        <TableCell>{interview.behavioral}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* HR Notes Tab */}
            {tabValue === 1 && (
              <Box sx={{ p: 3 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                  Your Rating
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <Rating
                    value={hrRating}
                    onChange={(e, newValue) => setHrRating(newValue)}
                    size="large"
                  />
                  <Typography variant="body2" sx={{ ml: 2 }}>
                    {hrRating > 0 ? `${hrRating} out of 5` : 'Not rated'}
                  </Typography>
                </Box>

                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                  Notes & Feedback
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={6}
                  placeholder="Add your notes about this candidate..."
                  value={hrNotes}
                  onChange={(e) => setHrNotes(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="contained"
                  onClick={handleSaveNotes}
                  disabled={saving}
                >
                  {saving ? <CircularProgress size={20} /> : 'Save Notes'}
                </Button>
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default CandidateDetails;
