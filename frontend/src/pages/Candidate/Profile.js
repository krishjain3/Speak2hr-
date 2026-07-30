import React, { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Avatar,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  Person,
  Edit,
  Save,
  Upload,
  Check,
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { resumeAPI, candidatesAPI } from '../../services/api';

const SKILLS_OPTIONS = [
  'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'AWS',
  'Docker', 'Kubernetes', 'Machine Learning', 'Data Analysis', 'TypeScript',
  'Go', 'Rust', 'C++', 'C#', '.NET', 'Ruby', 'PHP', 'Swift',
];

function Profile() {
  const { user, updateUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [resumeUploaded, setResumeUploaded] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    targetRole: user?.targetRole || '',
    skills: user?.skills || [],
    experienceYears: user?.experienceYears || 0,
    phone: user?.phone || '',
    location: user?.location || '',
    linkedin: user?.linkedin || '',
    github: user?.github || '',
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSkillsChange = (event) => {
    const { value } = event.target;
    setFormData({
      ...formData,
      skills: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await candidatesAPI.update(user.id, formData);
      updateUser(formData);
      setEditing(false);
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResumeUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError('');

    try {
      const response = await resumeAPI.upload(file);
      setResumeUploaded(true);

      // Auto-fill from resume
      if (response.data.skills) {
        setFormData(prev => ({
          ...prev,
          skills: [...new Set([...prev.skills, ...response.data.skills])],
        }));
      }
      setSuccess('Resume uploaded and analyzed successfully!');
    } catch (err) {
      setError('Failed to upload resume.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            My Profile
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your profile information
          </Typography>
        </Box>
        <Button
          variant={editing ? 'contained' : 'outlined'}
          startIcon={editing ? <Save /> : <Edit />}
          onClick={editing ? handleSave : () => setEditing(true)}
          disabled={loading}
        >
          {loading ? <CircularProgress size={20} /> : (editing ? 'Save Changes' : 'Edit Profile')}
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Profile Overview Card */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Avatar
                sx={{
                  width: 120,
                  height: 120,
                  mx: 'auto',
                  mb: 2,
                  bgcolor: 'primary.main',
                  fontSize: 48,
                }}
              >
                {formData.name?.charAt(0)?.toUpperCase() || 'U'}
              </Avatar>
              <Typography variant="h5" fontWeight={600}>
                {formData.name}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {formData.targetRole || 'Candidate'}
              </Typography>
              <Chip label={`${formData.experienceYears} years exp`} size="small" />

              <Divider sx={{ my: 3 }} />

              <Button
                variant="outlined"
                component="label"
                startIcon={resumeUploaded ? <Check /> : <Upload />}
                color={resumeUploaded ? 'success' : 'primary'}
                fullWidth
              >
                {resumeUploaded ? 'Resume Uploaded' : 'Upload Resume'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleResumeUpload}
                />
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Profile Details Card */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
                Personal Information
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Full Name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    disabled={!editing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={!editing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={!editing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Location"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    disabled={!editing}
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 3 }} />

              <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
                Professional Information
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Target Role"
                    name="targetRole"
                    value={formData.targetRole}
                    onChange={handleChange}
                    disabled={!editing}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Years of Experience"
                    name="experienceYears"
                    type="number"
                    value={formData.experienceYears}
                    onChange={handleChange}
                    disabled={!editing}
                    inputProps={{ min: 0, max: 50 }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth disabled={!editing}>
                    <InputLabel>Skills</InputLabel>
                    <Select
                      multiple
                      name="skills"
                      value={formData.skills}
                      onChange={handleSkillsChange}
                      input={<OutlinedInput label="Skills" />}
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
                </Grid>
              </Grid>

              <Divider sx={{ my: 3 }} />

              <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
                Social Links
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="LinkedIn URL"
                    name="linkedin"
                    value={formData.linkedin}
                    onChange={handleChange}
                    disabled={!editing}
                    placeholder="https://linkedin.com/in/..."
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="GitHub URL"
                    name="github"
                    value={formData.github}
                    onChange={handleChange}
                    disabled={!editing}
                    placeholder="https://github.com/..."
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Profile;
