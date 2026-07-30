import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  TextField,
  Tabs,
  Tab,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Add,
  Delete,
  Edit,
  CalendarMonth,
  Schedule,
  Cancel,
  VideoCall,
  CheckCircle,
  HighlightOff,
  VideoCameraFront,
  Room,
} from '@mui/icons-material';
import api, { slotAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

function SlotManagement() {
  const { user } = useAuthStore();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeViewTab, setActiveViewTab] = useState(0);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [candidateDetailDialog, setCandidateDetailDialog] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  
  const [editingSlot, setEditingSlot] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  
  // Custom states for validation
  const [slotForm, setSlotForm] = useState({
    date: '',
    time: '',
    end_time: '',
    duration: 30,
    interview_type: 'Technical',
    meeting_mode: 'Google Meet',
    max_candidates: 1,
    notes: '',
    recurring: 'none',
  });

  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSlots();
  }, []);

  const fetchSlots = async () => {
    try {
      setLoading(true);
      const response = await slotAPI.getAll();
      const allSlots = response.data || [];
      const hrSlots = allSlots.filter(slot =>
        slot.hrEmail === user?.email || slot.hrName === user?.name || !slot.hrEmail
      );
      setSlots(hrSlots);
    } catch (err) {
      setError('Failed to fetch slots');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSlot = () => {
    setEditingSlot(null);
    setSlotForm({
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      end_time: '09:30',
      duration: 30,
      interview_type: 'Technical',
      meeting_mode: 'Google Meet',
      max_candidates: 1,
      notes: '',
      recurring: 'none',
    });
    setDialogOpen(true);
  };

  const handleEditSlot = (slot) => {
    setEditingSlot(slot);
    
    // Parse time to HH:MM format for HTML input compatibility
    let formattedTime = slot.time;
    if (slot.time.includes('AM') || slot.time.includes('PM')) {
      const date = new Date(`2000-01-01 ${slot.time}`);
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      formattedTime = `${h}:${m}`;
    }
    
    setSlotForm({
      date: slot.date,
      time: formattedTime,
      end_time: slot.endTime || '',
      duration: slot.duration || 30,
      interview_type: slot.interview_type || 'Technical',
      meeting_mode: slot.meeting_mode || 'Google Meet',
      max_candidates: slot.max_candidates || 1,
      notes: slot.notes || '',
      recurring: slot.recurring || 'none',
    });
    setDialogOpen(true);
  };

  const handleDeleteSlot = async (slotId) => {
    try {
      await slotAPI.delete(slotId);
      setSlots(slots.filter(s => s.id !== slotId));
      setSuccess('Slot deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to delete slot');
    }
  };

  const handleCancelBooking = (slot) => {
    setSelectedSlot(slot);
    setCancelDialogOpen(true);
  };

  const confirmCancelBooking = async () => {
    try {
      await slotAPI.cancelBooking(
        selectedSlot.id,
        selectedSlot.candidateId,
        selectedSlot.candidate,
        selectedSlot.candidateEmail
      );
      setSuccess('Booking cancelled successfully.');
      setCancelDialogOpen(false);
      setSelectedSlot(null);
      fetchSlots();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to cancel booking');
    }
  };

  const handleSaveSlot = async (e) => {
    e.preventDefault();
    setError('');
    
    // 1. Validation check end_time after time
    const startMins = parseMins(slotForm.time);
    const endMins = parseMins(slotForm.end_time);
    if (slotForm.end_time && endMins <= startMins) {
      setError('End Time must be after Start Time.');
      return;
    }

    // Convert start time back to AM/PM for backend matching if needed
    const ampmTime = convertToAMPM(slotForm.time);
    const ampmEndTime = slotForm.end_time ? convertToAMPM(slotForm.end_time) : '';

    const payload = {
      date: slotForm.date,
      time: ampmTime,
      end_time: ampmEndTime,
      duration: slotForm.duration,
      interview_type: slotForm.interview_type,
      meeting_mode: slotForm.meeting_mode,
      max_candidates: slotForm.max_candidates,
      notes: slotForm.notes,
      recurring: slotForm.recurring,
      hrName: user?.name || 'HR Recruiter',
      hrEmail: user?.email || '',
    };

    try {
      if (editingSlot) {
        await api.put(`/api/slots/${editingSlot.id}`, payload);
        setSuccess('Slot updated successfully');
      } else {
        await api.post('/api/slots', payload);
        setSuccess('Slot created successfully');
      }
      setDialogOpen(false);
      fetchSlots();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save slot. Check overlaps or working hours.');
    }
  };

  const handleMarkCompleted = async (slotId) => {
    try {
      await api.put(`/api/slots/${slotId}`, { status: 'completed' });
      setSuccess('Round marked as Completed.');
      fetchSlots();
    } catch (err) {
      setError('Failed to update slot status.');
    }
  };

  const handleMarkMissed = async (slotId) => {
    try {
      await api.put(`/api/slots/${slotId}`, { status: 'missed' });
      setSuccess('Round marked as Missed.');
      fetchSlots();
    } catch (err) {
      setError('Failed to update slot status.');
    }
  };

  const handleShowCandidate = (slot) => {
    setSelectedCandidate({
      name: slot.candidate,
      email: slot.candidateEmail,
      id: slot.candidateId,
      time: slot.time,
      date: slot.date,
    });
    setCandidateDetailDialog(true);
  };

  // Helper parsers
  const parseMins = (tStr) => {
    const parts = tStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  };

  const convertToAMPM = (tStr) => {
    const parts = tStr.split(':');
    let h = parseInt(parts[0]);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m} ${ampm}`;
  };

  const formatDate = (dateStr) => {
    try {
      const options = { weekday: 'short', month: 'short', day: 'numeric' };
      return new Date(dateStr).toLocaleDateString(undefined, options);
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Group slots by date for Calendar grid view
  const groupedSlots = {};
  slots.forEach((s) => {
    if (!groupedSlots[s.date]) groupedSlots[s.date] = [];
    groupedSlots[s.date].push(s);
  });

  return (
    <Box sx={{ pb: 6 }}>
      {/* Title */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Interview Availability Slots
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Define and manage technical and behavioral interview time slot reserves
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={handleAddSlot}>
          Create Slot
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Tabs */}
      <Tabs 
        value={activeViewTab} 
        onChange={(e, v) => setActiveViewTab(v)} 
        sx={{ 
          mb: 4, 
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
          '& .MuiTab-root': { fontWeight: 600 }
        }}
      >
        <Tab label="Interactive Calendar Grid" />
        <Tab label="List Table View" />
      </Tabs>

      {activeViewTab === 0 ? (
        <Box>
          {Object.keys(groupedSlots).length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>No availability slots set up. Click Create Slot to begin.</Alert>
          ) : (
            <Grid container spacing={4}>
              {Object.entries(groupedSlots).map(([date, dateSlots]) => (
                <Grid item xs={12} key={date}>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CalendarMonth color="primary" /> {formatDate(date)}
                  </Typography>
                  <Grid container spacing={2}>
                    {dateSlots.map((slot) => (
                      <Grid item xs={12} sm={6} md={4} lg={3} key={slot.id}>
                        <Card 
                          sx={{ 
                            borderLeft: `5px solid ${
                              slot.status === 'booked' ? '#4f46e5' : 
                              slot.status === 'completed' ? '#22c55e' : 
                              slot.status === 'missed' ? '#ef4444' : '#cbd5e1'
                            }`
                          }}
                        >
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                              <Typography variant="subtitle1" fontWeight={800}>{slot.time}</Typography>
                              <Chip 
                                label={slot.status.toUpperCase()} 
                                size="small" 
                                color={
                                  slot.status === 'booked' ? 'primary' : 
                                  slot.status === 'completed' ? 'success' : 
                                  slot.status === 'missed' ? 'error' : 'default'
                                }
                                sx={{ fontSize: '0.65rem', height: 20 }}
                              />
                            </Box>
                            
                            <Typography variant="body2" fontWeight={600} display="block">
                              {slot.interview_type || 'General Round'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                              Mode: {slot.meeting_mode} ({slot.duration} mins)
                            </Typography>

                            {slot.status === 'booked' && (
                              <Box sx={{ mb: 2, p: 1, bgcolor: 'rgba(79,70,229,0.04)', borderRadius: 1.5 }}>
                                <Typography 
                                  variant="body2" 
                                  fontWeight={700} 
                                  color="primary" 
                                  sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }}
                                  onClick={() => handleShowCandidate(slot)}
                                >
                                  Candidate: {slot.candidate}
                                </Typography>
                              </Box>
                            )}

                            {slot.notes && (
                              <Typography variant="caption" color="text.secondary" display="block" paragraph sx={{ minHeight: 30, overflow: 'hidden' }}>
                                {slot.notes}
                              </Typography>
                            )}

                            <Divider sx={{ my: 1.5 }} />

                            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                              {slot.status === 'booked' && (
                                <>
                                  <IconButton color="success" size="small" onClick={() => handleMarkCompleted(slot.id)}>
                                    <CheckCircle />
                                  </IconButton>
                                  <IconButton color="error" size="small" onClick={() => handleMarkMissed(slot.id)}>
                                    <HighlightOff />
                                  </IconButton>
                                  <IconButton color="warning" size="small" onClick={() => handleCancelBooking(slot)}>
                                    <Cancel />
                                  </IconButton>
                                </>
                              )}
                              
                              <Box sx={{ flexGrow: 1 }} />
                              
                              <IconButton color="primary" size="small" onClick={() => handleEditSlot(slot)}>
                                <Edit />
                              </IconButton>
                              <IconButton color="error" size="small" onClick={() => handleDeleteSlot(slot.id)}>
                                <Delete />
                              </IconButton>
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      ) : (
        <TableContainer component={Card}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Meeting Mode</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Candidate</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {slots.map((slot) => (
                <TableRow key={slot.id}>
                  <TableCell>{formatDate(slot.date)}</TableCell>
                  <TableCell>{slot.time}</TableCell>
                  <TableCell>{slot.interview_type || 'Technical'}</TableCell>
                  <TableCell>{slot.meeting_mode}</TableCell>
                  <TableCell>
                    {slot.candidate ? (
                      <Typography variant="body2" fontWeight={600} color="primary">{slot.candidate}</Typography>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={slot.status.toUpperCase()} 
                      size="small" 
                      color={
                        slot.status === 'booked' ? 'primary' : 
                        slot.status === 'completed' ? 'success' : 
                        slot.status === 'missed' ? 'error' : 'default'
                      }
                    />
                  </TableCell>
                  <TableCell align="right">
                    {slot.status === 'booked' && (
                      <>
                        <Button size="small" color="success" onClick={() => handleMarkCompleted(slot.id)}>Done</Button>
                        <Button size="small" color="error" onClick={() => handleMarkMissed(slot.id)}>Missed</Button>
                      </>
                    )}
                    <IconButton color="primary" onClick={() => handleEditSlot(slot)}><Edit /></IconButton>
                    <IconButton color="error" onClick={() => handleDeleteSlot(slot.id)}><Delete /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add / Edit Slot Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingSlot ? 'Edit Slot Reserve' : 'Add Slot Reserve'}</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleSaveSlot} sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField 
                  label="Interview Date" 
                  type="date" 
                  fullWidth 
                  InputLabelProps={{ shrink: true }}
                  value={slotForm.date}
                  onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField 
                  label="Slot Start Time" 
                  type="time" 
                  fullWidth 
                  InputLabelProps={{ shrink: true }}
                  value={slotForm.time}
                  onChange={(e) => setSlotForm({ ...slotForm, time: e.target.value })}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField 
                  label="Slot End Time" 
                  type="time" 
                  fullWidth 
                  InputLabelProps={{ shrink: true }}
                  value={slotForm.end_time}
                  onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField 
                  label="Default Duration (mins)" 
                  type="number" 
                  fullWidth 
                  value={slotForm.duration}
                  onChange={(e) => setSlotForm({ ...slotForm, duration: parseInt(e.target.value) })}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Interview Type</InputLabel>
                  <Select
                    value={slotForm.interview_type}
                    label="Interview Type"
                    onChange={(e) => setSlotForm({ ...slotForm, interview_type: e.target.value })}
                  >
                    <MenuItem value="Technical">Technical Round</MenuItem>
                    <MenuItem value="HR Round">HR Round</MenuItem>
                    <MenuItem value="Managerial">Managerial Round</MenuItem>
                    <MenuItem value="Final Round">Final Round</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Meeting Mode</InputLabel>
                  <Select
                    value={slotForm.meeting_mode}
                    label="Meeting Mode"
                    onChange={(e) => setSlotForm({ ...slotForm, meeting_mode: e.target.value })}
                  >
                    <MenuItem value="Google Meet">Google Meet</MenuItem>
                    <MenuItem value="Teams">Microsoft Teams</MenuItem>
                    <MenuItem value="Zoom">Zoom Meeting</MenuItem>
                    <MenuItem value="Offline">Offline Face to Face</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField 
                  label="Max Candidates Capacity" 
                  type="number" 
                  fullWidth 
                  value={slotForm.max_candidates}
                  onChange={(e) => setSlotForm({ ...slotForm, max_candidates: parseInt(e.target.value) })}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Recurrence</InputLabel>
                  <Select
                    value={slotForm.recurring}
                    label="Recurrence"
                    onChange={(e) => setSlotForm({ ...slotForm, recurring: e.target.value })}
                  >
                    <MenuItem value="none">No Recurrence</MenuItem>
                    <MenuItem value="weekly">Repeat Every Week</MenuItem>
                    <MenuItem value="monthly">Repeat Every Month</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <TextField 
                  label="Recruiter Notes" 
                  fullWidth 
                  multiline 
                  rows={2} 
                  value={slotForm.notes}
                  onChange={(e) => setSlotForm({ ...slotForm, notes: e.target.value })}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
          <Button variant="contained" onClick={handleSaveSlot}>
            Save Availability
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancellation Dialog */}
      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)}>
        <DialogTitle>Cancel Booking Slot</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to cancel candidate <strong>{selectedSlot?.candidate}</strong>'s booking? An email notification will be dispatched.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)}>Keep Booking</Button>
          <Button variant="contained" color="error" onClick={confirmCancelBooking}>
            Cancel Booking
          </Button>
        </DialogActions>
      </Dialog>

      {/* Candidate details popup */}
      <Dialog open={candidateDetailDialog} onClose={() => setCandidateDetailDialog(false)}>
        <DialogTitle>Booked Candidate Information</DialogTitle>
        <DialogContent>
          {selectedCandidate && (
            <Box sx={{ py: 1, minWidth: 300 }}>
              <Typography variant="subtitle1" fontWeight={700}>{selectedCandidate.name}</Typography>
              <Typography variant="body2" color="text.secondary" paragraph>{selectedCandidate.email}</Typography>
              <Typography variant="body2"><strong>Date:</strong> {formatDate(selectedCandidate.date)}</Typography>
              <Typography variant="body2"><strong>Time:</strong> {selectedCandidate.time}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCandidateDetailDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default SlotManagement;
