import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  Tabs,
  Tab,
  Stepper,
  Step,
  StepLabel,
  Rating,
  Divider,
} from '@mui/material';
import {
  CalendarMonth,
  AccessTime,
  Person,
  Check,
  EventAvailable,
  Cancel,
  Star,
  ArrowBack,
  VideoCall,
  Room,
  Language,
} from '@mui/icons-material';
import api, { slotAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

function HRInterviewBooking() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [slots, setSlots] = useState([]);
  const [hrs, setHrs] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Stepper state
  const [activeStep, setActiveStep] = useState(0);
  const [selectedHr, setSelectedHr] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [booked, setBooked] = useState(false);
  const [bookingResponse, setBookingResponse] = useState(null);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load available slots
      const response = await slotAPI.getAvailableSlots();
      setSlots(response.data);

      // Load HR Recruiters
      const hrResponse = await api.get('/api/hrs');
      setHrs(hrResponse.data || []);

      // Get user's bookings
      const allSlotsResponse = await slotAPI.getAll();
      const allSlots = allSlotsResponse.data || [];
      const userBookings = allSlots.filter(
        s => s.candidateId === user?.id || s.candidate === user?.name
      );
      setMyBookings(userBookings);
    } catch (err) {
      setError('Failed to load data from server.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHr = (hr) => {
    setSelectedHr(hr);
    setActiveStep(1); // Go to profile view
  };

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
    setActiveStep(3); // Go to confirmation page
  };

  const handleConfirmBooking = async () => {
    setBooking(true);
    setError('');

    try {
      const response = await slotAPI.bookSlot(selectedSlot.id, user?.id, user?.name, user?.email);
      setBookingResponse(response.data);
      setBooked(true);
      setActiveStep(4); // Success screen
      fetchData();
    } catch (err) {
      setError('Failed to book slot. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  const handleCancelBooking = async () => {
    setCancelling(true);
    setError('');

    try {
      await slotAPI.cancelBooking(
        selectedSlot.id,
        user?.id,
        user?.name,
        user?.email
      );
      setCancelDialogOpen(false);
      setSelectedSlot(null);
      fetchData();
    } catch (err) {
      setError('Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };

  const openCancelDialog = (slot) => {
    setSelectedSlot(slot);
    setCancelDialogOpen(true);
  };

  const handleReschedule = (bookingItem) => {
    setSelectedSlot(bookingItem);
    handleCancelBooking();
    setActiveStep(0);
    setSelectedHr(null);
    setTabValue(0);
  };

  const groupSlotsByDate = () => {
    const grouped = {};
    const filteredSlots = slots.filter(
      s => selectedHr && (s.hrEmail === selectedHr.email || s.hrName === selectedHr.name)
    );
    
    filteredSlots.forEach((slot) => {
      if (!grouped[slot.date]) {
        grouped[slot.date] = [];
      }
      grouped[slot.date].push(slot);
    });
    return grouped;
  };

  const formatDate = (dateStr) => {
    try {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      return new Date(dateStr).toLocaleDateString(undefined, options);
    } catch {
      return dateStr;
    }
  };

  const steps = ['Choose HR', 'HR Profile', 'Select Slot', 'Confirm Details'];

  return (
    <Box sx={{ pb: 6 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={800}>
          HR Interview Booking
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Schedule or manage your direct human recruiter matching rounds
        </Typography>
      </Box>

      <Tabs 
        value={tabValue} 
        onChange={(e, v) => setTabValue(v)} 
        sx={{ 
          mb: 4, 
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
          '& .MuiTab-root': { fontWeight: 600 }
        }}
      >
        <Tab label="Book an Interview" />
        <Tab label={`My Bookings (${myBookings.length})`} />
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : tabValue === 0 ? (
        <Box>
          {activeStep < 4 && (
            <Box sx={{ mb: 5, maxWidth: 800, mx: 'auto' }}>
              <Stepper activeStep={activeStep} alternativeLabel>
                {steps.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
            </Box>
          )}

          {activeStep === 0 && (
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
                Select a Recruiter
              </Typography>
              <Grid container spacing={3}>
                {hrs.map((hr) => (
                  <Grid item xs={12} md={6} lg={4} key={hr.id}>
                    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <Avatar src={hr.avatar} sx={{ width: 56, height: 56, mr: 2, border: '2px solid #818cf8' }} />
                          <Box>
                            <Typography variant="subtitle1" fontWeight={700}>
                              {hr.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {hr.designation} • {hr.department}
                            </Typography>
                          </Box>
                        </Box>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                          <Rating value={hr.rating || 4.5} precision={0.1} readOnly size="small" />
                          <Typography variant="caption" fontWeight={600}>
                            ({hr.rating || '4.5'})
                          </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ minHeight: 45 }}>
                          {hr.bio || 'Professional technical recruiter looking to screen top tier candidates.'}
                        </Typography>

                        <Divider sx={{ my: 2 }} />

                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                          {hr.specialization.map((spec) => (
                            <Chip key={spec} label={spec} size="small" variant="outlined" />
                          ))}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Language sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            Languages: {hr.languages.join(', ') || 'English'}
                          </Typography>
                        </Box>
                      </CardContent>
                      <Box sx={{ p: 2, pt: 0 }}>
                        <Button 
                          fullWidth 
                          variant="contained"
                          onClick={() => handleSelectHr(hr)}
                        >
                          Select Recruiter
                        </Button>
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {activeStep === 1 && selectedHr && (
            <Box sx={{ maxWidth: 800, mx: 'auto' }}>
              <Button 
                startIcon={<ArrowBack />} 
                onClick={() => setActiveStep(0)}
                sx={{ mb: 3 }}
              >
                Back to recruiters
              </Button>
              <Card sx={{ p: 3 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 3, mb: 4 }}>
                    <Avatar src={selectedHr.avatar} sx={{ width: 100, height: 100, border: '3px solid #818cf8' }} />
                    <Box sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
                      <Typography variant="h5" fontWeight={800}>{selectedHr.name}</Typography>
                      <Typography variant="subtitle1" color="text.secondary">{selectedHr.designation} • {selectedHr.department}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'center', sm: 'flex-start' }, gap: 1, mt: 1 }}>
                        <Rating value={selectedHr.rating || 4.5} precision={0.1} readOnly />
                        <Typography variant="body2" fontWeight={600}>({selectedHr.rating || '4.5'})</Typography>
                      </Box>
                    </Box>
                  </Box>

                  <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>About Recruiter</Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {selectedHr.bio}
                  </Typography>

                  <Grid container spacing={3} sx={{ mt: 2 }}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" fontWeight={600}>Recruitment Specializations</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                        {selectedHr.specialization.map((s) => (
                          <Chip key={s} label={s} size="small" color="primary" variant="outlined" />
                        ))}
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" fontWeight={600}>Location & Working Hours</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <Room sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">{selectedHr.location || 'Remote'}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">Hours: {selectedHr.working_hours}</Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button 
                    variant="contained" 
                    onClick={() => setActiveStep(2)}
                  >
                    View Available Slots
                  </Button>
                </Box>
              </Card>
            </Box>
          )}

          {activeStep === 2 && selectedHr && (
            <Box sx={{ maxWidth: 800, mx: 'auto' }}>
              <Button 
                startIcon={<ArrowBack />} 
                onClick={() => setActiveStep(1)}
                sx={{ mb: 3 }}
              >
                Back to profile
              </Button>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
                Select Available Slot with {selectedHr.name}
              </Typography>
              
              {Object.keys(groupSlotsByDate()).length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  {selectedHr.name} has no available interview slots currently.
                </Alert>
              ) : (
                Object.entries(groupSlotsByDate()).map(([date, dateSlots]) => (
                  <Box key={date} sx={{ mb: 4 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CalendarMonth sx={{ fontSize: 18, color: 'primary.main' }} />
                      {formatDate(date)}
                    </Typography>
                    <Grid container spacing={2}>
                      {dateSlots.map((slot) => (
                        <Grid item xs={12} sm={6} key={slot.id}>
                          <Card 
                            onClick={() => handleSelectSlot(slot)}
                            sx={{ 
                              cursor: 'pointer',
                              border: '1px solid rgba(226, 232, 240, 0.8)',
                              transition: 'all 0.2s',
                              '&:hover': {
                                borderColor: 'primary.main',
                                transform: 'translateY(-2px)'
                              }
                            }}
                          >
                            <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Avatar sx={{ bgcolor: 'rgba(79, 70, 229, 0.1)', color: 'primary.main' }}>
                                  <AccessTime />
                                </Avatar>
                                <Box>
                                  <Typography variant="subtitle1" fontWeight={700}>{slot.time}</Typography>
                                  <Typography variant="caption" color="text.secondary">Duration: {slot.duration} mins</Typography>
                                </Box>
                              </Box>
                              <Chip label="Select" color="primary" size="small" variant="outlined" />
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                ))
              )}
            </Box>
          )}

          {activeStep === 3 && selectedSlot && selectedHr && (
            <Box sx={{ maxWidth: 600, mx: 'auto' }}>
              <Button 
                startIcon={<ArrowBack />} 
                onClick={() => setActiveStep(2)}
                sx={{ mb: 3 }}
              >
                Back to slots
              </Button>
              <Card sx={{ p: 2 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
                    Confirm Interview Booking
                  </Typography>
                  <Box sx={{ bgcolor: 'rgba(79, 70, 229, 0.03)', p: 3, borderRadius: 3, border: '1px dashed rgba(79, 70, 229, 0.2)', mb: 3 }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">INTERVIEWER</Typography>
                        <Typography variant="subtitle1" fontWeight={700}>{selectedHr.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{selectedHr.designation}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">DATE & TIME</Typography>
                        <Typography variant="subtitle1" fontWeight={700}>{formatDate(selectedSlot.date)}</Typography>
                        <Typography variant="body2" color="text.secondary">{selectedSlot.time} ({selectedSlot.duration} min)</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">MEETING MODE</Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <VideoCall color="primary" sx={{ fontSize: 18 }} /> Google Meet (Online Video call)
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    A calendar invite with the join code link will be sent automatically to <strong>{user?.email}</strong>.
                  </Typography>
                </CardContent>
                <Box sx={{ p: 2, pt: 0, display: 'flex', gap: 2 }}>
                  <Button fullWidth variant="outlined" onClick={() => setActiveStep(2)}>Cancel</Button>
                  <Button 
                    fullWidth 
                    variant="contained" 
                    onClick={handleConfirmBooking}
                    disabled={booking}
                  >
                    {booking ? 'Booking...' : 'Confirm schedule'}
                  </Button>
                </Box>
              </Card>
            </Box>
          )}

          {activeStep === 4 && booked && selectedSlot && (
            <Box sx={{ textAlign: 'center', maxWidth: 500, mx: 'auto', py: 5 }}>
              <Avatar sx={{ bgcolor: 'success.main', width: 64, height: 64, mx: 'auto', mb: 3 }}>
                <Check sx={{ fontSize: 36 }} />
              </Avatar>
              <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>
                Interview Scheduled!
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Your matching round with <strong>{selectedSlot.hrName}</strong> is confirmed on <strong>{formatDate(selectedSlot.date)}</strong> at <strong>{selectedSlot.time}</strong>.
              </Typography>
              
              {bookingResponse?.videoCallLink && (
                <Card sx={{ border: '1px solid rgba(226, 232, 240, 0.8)', p: 3, mb: 4, borderRadius: 3 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>MEETING LINK</Typography>
                  <Typography variant="body2" color="primary" fontWeight={600} sx={{ wordBreak: 'break-all', mb: 2 }}>
                    {bookingResponse.videoCallLink}
                  </Typography>
                  <Button 
                    variant="contained" 
                    fullWidth
                    onClick={() => navigate(bookingResponse.videoCallLink)}
                  >
                    Join Video Call Room
                  </Button>
                </Card>
              )}

              <Button 
                variant="outlined" 
                onClick={() => {
                  setActiveStep(0);
                  setSelectedHr(null);
                  setSelectedSlot(null);
                  setTabValue(1);
                }}
              >
                Go to My Bookings
              </Button>
            </Box>
          )}
        </Box>
      ) : (
        <Box>
          {myBookings.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CalendarMonth sx={{ fontSize: 64, color: 'text.secondary', opacity: 0.5, mb: 2 }} />
              <Typography variant="h6" fontWeight={700}>No interviews scheduled</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Book an available slot from the booking tab to match with recruiters
              </Typography>
              <Button variant="contained" onClick={() => setTabValue(0)}>Schedule Round</Button>
            </Box>
          ) : (
            <Grid container spacing={3}>
              {myBookings.map((b) => (
                <Grid item xs={12} md={6} key={b.id}>
                  <Card sx={{ p: 2 }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box>
                          <Typography variant="h6" fontWeight={800}>{formatDate(b.date)}</Typography>
                          <Typography variant="subtitle1" fontWeight={700} color="primary.main">{b.time}</Typography>
                        </Box>
                        <Chip 
                          label={b.status.toUpperCase()} 
                          color={b.status === 'booked' ? 'success' : 'default'}
                          size="small"
                        />
                      </Box>
                      
                      <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Person sx={{ fontSize: 16, color: 'text.secondary' }} /> Interviewer: <strong>{b.hrName}</strong>
                      </Typography>
                      <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                        <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} /> Duration: {b.duration} mins
                      </Typography>

                      <Grid container spacing={2}>
                        {b.videoCallLink && (
                          <Grid item xs={12} sm={6}>
                            <Button 
                              fullWidth 
                              variant="contained"
                              onClick={() => navigate(b.videoCallLink)}
                            >
                              Join Call
                            </Button>
                          </Grid>
                        )}
                        <Grid item xs={12} sm={b.videoCallLink ? 6 : 12}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            color="error"
                            onClick={() => openCancelDialog(b)}
                          >
                            Cancel
                          </Button>
                        </Grid>
                        <Grid item xs={12}>
                          <Button 
                            fullWidth 
                            variant="text" 
                            size="small"
                            onClick={() => handleReschedule(b)}
                          >
                            Reschedule
                          </Button>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)}>
        <DialogTitle>Cancel Interview Booking</DialogTitle>
        <DialogContent>
          {selectedSlot && (
            <Typography variant="body2" color="text.secondary">
              Are you sure you want to cancel the scheduled interview on <strong>{formatDate(selectedSlot.date)}</strong> at <strong>{selectedSlot.time}</strong>? This slot will be released.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)}>Keep Interview</Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleCancelBooking}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Cancel Booking'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default HRInterviewBooking;
