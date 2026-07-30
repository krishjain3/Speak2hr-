import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Download,
  Email,
  Assessment,
  TrendingUp,
  EmojiEvents,
  Visibility,
} from '@mui/icons-material';
import { interviewAPI, candidatesAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

// Helper functions for localStorage
const getStoredReports = () => {
  try {
    const data = localStorage.getItem('interview_reports');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveReport = (report) => {
  const reports = getStoredReports();
  // Check if report already exists
  const exists = reports.find(r => r.sessionId === report.sessionId);
  if (!exists) {
    reports.unshift(report); // Add to beginning
    localStorage.setItem('interview_reports', JSON.stringify(reports));
  }
  return reports;
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
    if (isoString.length <= 10) {
      return `${day}-${month}-${year}`;
    }
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
};

function MyReports() {
  const location = useLocation();
  const { user } = useAuthStore();
  const [tabValue, setTabValue] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [weeklyReports, setWeeklyReports] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await candidatesAPI.getReports(user.id);
      const fetchedReports = response.data || [];
      
      let finalReports = [...fetchedReports];
      if (location.state?.summary && location.state?.sessionId) {
        const summary = location.state.summary;
        const exists = fetchedReports.find(r => r.sessionId === location.state.sessionId);
        if (!exists) {
          const newReport = {
            id: location.state.sessionId,
            sessionId: location.state.sessionId,
            date: new Date().toISOString().split('T')[0],
            type: 'AI Interview',
            overallScore: Math.round((summary.overall_score || summary.average_score || 0) * 100),
            technicalScore: Math.round((summary.technical_score || summary.average_technical || 0) * 100),
            communicationScore: Math.round((summary.communication_score || summary.average_clarity || 0) * 100),
            behavioralScore: Math.round((summary.behavioral_score || summary.average_relevance || 0) * 100),
            emotionScore: Math.round((summary.emotion_score || summary.average_confidence || 0) * 100),
            rating: getRating(summary.overall_score || summary.average_score || 0),
            questionsAnswered: summary.total_questions || 8,
            status: 'completed',
            evaluations: summary.evaluations || [],
            feedback: summary.feedback || '',
          };
          finalReports = [newReport, ...fetchedReports];
          setSelectedReport(newReport);
          setDetailsOpen(true);
        }
      }
      
      setReports(finalReports);
      setWeeklyReports(calculateWeeklySummary(finalReports));
    } catch (err) {
      console.error('Failed to load reports from backend:', err);
      let storedReports = getStoredReports();
      if (location.state?.summary && location.state?.sessionId) {
        const summary = location.state.summary;
        const newReport = {
          id: Date.now(),
          sessionId: location.state.sessionId,
          date: new Date().toISOString().split('T')[0],
          type: 'AI Interview',
          overallScore: Math.round((summary.overall_score || summary.average_score || 0) * 100),
          technicalScore: Math.round((summary.technical_score || summary.average_technical || 0) * 100),
          communicationScore: Math.round((summary.communication_score || summary.average_clarity || 0) * 100),
          behavioralScore: Math.round((summary.behavioral_score || summary.average_relevance || 0) * 100),
          emotionScore: Math.round((summary.emotion_score || summary.average_confidence || 0) * 100),
          rating: getRating(summary.overall_score || summary.average_score || 0),
          questionsAnswered: summary.total_questions || 8,
          status: 'completed',
          evaluations: summary.evaluations || [],
          feedback: summary.feedback || '',
        };
        storedReports = saveReport(newReport);
        setSelectedReport(newReport);
        setDetailsOpen(true);
      }
      setReports(storedReports);
      setWeeklyReports(calculateWeeklySummary(storedReports));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [user?.id, location.state]);

  const getRating = (score) => {
    if (score >= 0.85) return 'Excellent';
    if (score >= 0.70) return 'Good';
    if (score >= 0.50) return 'Average';
    return 'Needs Improvement';
  };

  const calculateWeeklySummary = (reports) => {
    if (reports.length === 0) return [];

    // Group reports by week
    const now = new Date();
    const weekGroups = {};

    reports.forEach(report => {
      const reportDate = new Date(report.date);
      const weekStart = new Date(reportDate);
      weekStart.setDate(reportDate.getDate() - reportDate.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = [];
      }
      weekGroups[weekKey].push(report);
    });

    // Convert to weekly reports
    const weeklySummaries = Object.entries(weekGroups)
      .sort(([a], [b]) => new Date(b) - new Date(a))
      .slice(0, 4) // Last 4 weeks
      .map(([weekStart, weekReports], index, arr) => {
        const startDate = new Date(weekStart);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        const avgScore = Math.round(
          weekReports.reduce((sum, r) => sum + r.overallScore, 0) / weekReports.length
        );

        // Calculate improvement from previous week
        let improvement = '+0%';
        if (index < arr.length - 1) {
          const prevWeekReports = arr[index + 1][1];
          const prevAvg = Math.round(
            prevWeekReports.reduce((sum, r) => sum + r.overallScore, 0) / prevWeekReports.length
          );
          const diff = avgScore - prevAvg;
          improvement = diff >= 0 ? `+${diff}%` : `${diff}%`;
        }

        return {
          week: `Week of ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          averageScore: avgScore,
          improvement,
          assessmentsTaken: 0, // Would need assessment data
          interviewsCompleted: weekReports.length,
          topSkills: avgScore >= 70 ? ['Technical', 'Problem Solving'] : ['Communication'],
          areasToImprove: avgScore < 85 ? ['Advanced Topics', 'System Design'] : [],
        };
      });

    return weeklySummaries;
  };

  const handleDownloadReport = async (report) => {
    setDownloading(true);
    try {
      // Generate report first
      await interviewAPI.generateReport(
        report.sessionId,
        user?.name || 'Candidate',
        user?.email,
        false
      );

      // Download the report
      const response = await interviewAPI.downloadReport(`report_${report.sessionId}.pdf`);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `interview_report_${report.date}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleEmailReport = async (report) => {
    setEmailing(true);
    try {
      await interviewAPI.generateReport(
        report.sessionId,
        user?.name || 'Candidate',
        user?.email,
        true
      );
      alert('Report sent to your email!');
    } catch (err) {
      console.error('Email failed:', err);
    } finally {
      setEmailing(false);
    }
  };

  const handleViewDetails = (report) => {
    setSelectedReport(report);
    setDetailsOpen(true);
  };

  const getScoreColor = (score) => {
    if (score >= 85) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={600}>
          My Reports
        </Typography>
        <Typography variant="body1" color="text.secondary">
          View and download your interview and assessment reports
        </Typography>
      </Box>

      <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 3 }}>
        <Tab label="Interview Reports" />
        <Tab label="Weekly Summary" />
      </Tabs>

      {/* Interview Reports Tab */}
      {tabValue === 0 && (
        <Box>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress />
            </Box>
          ) : reports.length === 0 ? (
            <Alert severity="info">
              No interview reports yet. Complete an interview to see your reports here.
            </Alert>
          ) : (
            <TableContainer component={Card}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Overall Score</TableCell>
                    <TableCell>Rating</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>{formatDate(report.date)}</TableCell>
                      <TableCell>
                        <Chip
                          label={report.type}
                          size="small"
                          color={report.type === 'AI Interview' ? 'primary' : 'secondary'}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box sx={{ width: 100, mr: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={report.overallScore}
                              color={getScoreColor(report.overallScore)}
                            />
                          </Box>
                          <Typography variant="body2">
                            {report.overallScore}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={report.rating}
                          size="small"
                          color={getScoreColor(report.overallScore)}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          startIcon={<Visibility />}
                          onClick={() => handleViewDetails(report)}
                          sx={{ mr: 1 }}
                        >
                          View
                        </Button>
                        <Button
                          size="small"
                          startIcon={downloading ? <CircularProgress size={16} /> : <Download />}
                          onClick={() => handleDownloadReport(report)}
                          disabled={downloading}
                          sx={{ mr: 1 }}
                        >
                          PDF
                        </Button>
                        <Button
                          size="small"
                          startIcon={emailing ? <CircularProgress size={16} /> : <Email />}
                          onClick={() => handleEmailReport(report)}
                          disabled={emailing}
                        >
                          Email
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* Weekly Summary Tab */}
      {tabValue === 1 && (
        <Grid container spacing={3}>
          {weeklyReports.map((weekly, index) => (
            <Grid item xs={12} key={index}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" fontWeight={600}>
                      {weekly.week}
                    </Typography>
                    <Chip
                      icon={<TrendingUp />}
                      label={weekly.improvement}
                      color="success"
                      size="small"
                    />
                  </Box>

                  <Grid container spacing={3}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" color="primary" fontWeight={700}>
                          {weekly.averageScore}%
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Average Score
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" fontWeight={700}>
                          {weekly.assessmentsTaken}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Assessments Taken
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" fontWeight={700}>
                          {weekly.interviewsCompleted}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Interviews Completed
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                          Top Skills
                        </Typography>
                        {weekly.topSkills.map((skill) => (
                          <Chip key={skill} label={skill} size="small" color="success" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 1, mb: 1 }}>
                          Areas to Improve
                        </Typography>
                        {weekly.areasToImprove.map((area) => (
                          <Chip key={area} label={area} size="small" color="warning" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Report Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>
            Report Details
          </Typography>
        </DialogTitle>
        <DialogContent>
          {selectedReport && (
            <Box>
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Typography variant="h2" color="primary" fontWeight={700}>
                  {selectedReport.overallScore}%
                </Typography>
                <Chip
                  label={selectedReport.rating}
                  color={getScoreColor(selectedReport.overallScore)}
                />
              </Box>

              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                Score Breakdown
              </Typography>

              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Technical</Typography>
                  <Typography variant="body2">{selectedReport.technicalScore}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={selectedReport.technicalScore} sx={{ height: 8, borderRadius: 4 }} />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Communication</Typography>
                  <Typography variant="body2">{selectedReport.communicationScore}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={selectedReport.communicationScore} sx={{ height: 8, borderRadius: 4 }} color="secondary" />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Behavioral</Typography>
                  <Typography variant="body2">{selectedReport.behavioralScore}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={selectedReport.behavioralScore} sx={{ height: 8, borderRadius: 4 }} color="warning" />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Emotion/Engagement</Typography>
                  <Typography variant="body2">{selectedReport.emotionScore}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={selectedReport.emotionScore} sx={{ height: 8, borderRadius: 4 }} color="success" />
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<Download />}
            onClick={() => handleDownloadReport(selectedReport)}
          >
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default MyReports;
