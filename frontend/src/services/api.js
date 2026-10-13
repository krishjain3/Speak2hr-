import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const { state } = JSON.parse(authStorage);
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth-storage');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: async (email, password) => {
    return api.post('/api/auth/login', { email, password });
  },
  register: async (userData) => {
    return api.post('/api/auth/register', userData);
  },
  forgotPassword: async (email) => {
    return api.post('/api/auth/forgot-password', { email });
  },
  resetPassword: async (email, verificationCode, newPassword) => {
    return api.post('/api/auth/reset-password', { email, verificationCode, newPassword });
  },
};

// Resume APIs
export const resumeAPI = {
  upload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/resume/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  matchJob: async (resumeText, jobDescription) => {
    return api.post('/api/job/match', {
      resume_text: resumeText,
      job_description: jobDescription,
    });
  },

  analyzeSkillGap: async (resumeText, jobDescription, targetRole) => {
    return api.post('/api/skill-gap/analyze', {
      resume_text: resumeText,
      job_description: jobDescription,
      target_role: targetRole,
    });
  },
};

// Interview APIs
export const interviewAPI = {
  generateQuestions: async (data) => {
    return api.post('/api/interview/generate-questions', {
      candidate_name: data.candidateName,
      candidate_skills: data.skills,
      candidate_experience_years: data.experienceYears,
      job_description: data.jobDescription,
      candidate_work_history: data.workHistory || [],
      role: data.targetRole || data.jobDescription,
      user_id: data.userId || `user_${Date.now()}`,
      num_questions: 8,
      interview_level: data.interviewLevel || 'Technical Basic',
    });
  },

  evaluateResponse: async (sessionId, questionData, videoFile, audioFile) => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('question_id', questionData.question_id);
    formData.append('question', questionData.question);
    formData.append('level', questionData.level);
    formData.append('level_name', questionData.level_name);
    formData.append('category', questionData.category);
    formData.append('difficulty', questionData.difficulty);
    formData.append('weight', questionData.weight);
    formData.append('expected_keywords', JSON.stringify(questionData.expected_keywords || []));
    formData.append('video_file', videoFile);
    formData.append('audio_file', audioFile);

    return api.post('/api/interview/evaluate-response', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 minute timeout for processing
    });
  },

  getSessionSummary: async (sessionId) => {
    return api.get(`/api/interview/session/${sessionId}`);
  },

  generateReport: async (sessionId, candidateName, email, sendEmail = false) => {
    return api.post('/api/interview/generate-report', {
      session_id: sessionId,
      candidate_name: candidateName,
      email: email,
      send_email: sendEmail,
    });
  },

  downloadReport: async (filename) => {
    return api.get(`/api/interview/download-report/${filename}`, {
      responseType: 'blob',
    });
  },
};

// Resume-Based RAG Interview APIs
export const resumeRagAPI = {
  uploadResume: async (file, candidateId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (candidateId) {
      formData.append('candidate_id', candidateId);
    }
    return api.post('/api/resume/upload-rag', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
  },

  getCandidateResumes: async (candidateId) => {
    return api.get(`/api/resume/candidate/${candidateId}`);
  },

  generateQuestions: async (data) => {
    return api.post('/api/interview/rag/generate-questions', {
      candidate_id: data.candidateId,
      resume_id: data.resumeId,
      role: data.role || 'Software Engineer',
      candidate_name: data.candidateName || 'Candidate',
      candidate_email: data.candidateEmail || '',
      num_questions: data.numQuestions || 10,
      difficulty: data.difficulty || 'medium',
      focus_area: data.focusArea ? (Array.isArray(data.focusArea) ? data.focusArea : [data.focusArea]) : [],
    });
  },

  getSession: async (sessionId, candidateId) => {
    const url = candidateId
      ? `/api/interview/rag/session/${sessionId}?candidate_id=${candidateId}`
      : `/api/interview/rag/session/${sessionId}`;
    return api.get(url);
  },

  evaluateTextResponse: async (data) => {
    return api.post('/api/interview/rag/evaluate-text-response', {
      session_id: data.sessionId,
      candidate_id: data.candidateId,
      question_id: data.questionId,
      question: data.question,
      answer_text: data.answerText,
      category: data.category || 'technical',
      difficulty: data.difficulty || 'medium',
      expected_keywords: data.expectedKeywords || [],
    });
  },

  getSessionReport: async (sessionId, candidateId) => {
    const url = candidateId
      ? `/api/interview/rag/session/${sessionId}/report?candidate_id=${candidateId}`
      : `/api/interview/rag/session/${sessionId}/report`;
    return api.get(url);
  },
};

// Assessment APIs
export const assessmentAPI = {
  generate: async (userId, role, difficulty = 'medium', category = 'technical', experienceLevel = 'mid', skills = []) => {
    return api.post('/api/assessment/generate', {
      user_id: userId,
      role: role,
      difficulty: difficulty,
      category: category,
      num_questions: 10,
      experience_level: experienceLevel,
      skills: skills,
    });
  },

  submit: async (assessmentId, userId, answers) => {
    return api.post('/api/assessment/submit', {
      assessment_id: assessmentId,
      user_id: userId,
      answers: answers,
    });
  },

  getHistory: async (userId) => {
    return api.get(`/api/assessment/history/${userId}`);
  },

  getResult: async (assessmentId) => {
    return api.get(`/api/assessment/result/${assessmentId}`);
  },
};

// Helper functions for localStorage persistence
const getStoredData = (key, defaultValue) => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setStoredData = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data));
};

// Initialize default data if not exists
const initializeHRData = () => {
  if (!localStorage.getItem('hr_slots')) {
    const defaultSlots = [];
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      defaultSlots.push({
        id: `slot-${Date.now()}-${i}`,
        date: date.toISOString().split('T')[0],
        time: '10:00 AM',
        duration: 30,
        status: 'available',
        candidate: null,
        hrName: 'HR Manager',
      });
      defaultSlots.push({
        id: `slot-${Date.now()}-${i}-2`,
        date: date.toISOString().split('T')[0],
        time: '2:00 PM',
        duration: 30,
        status: 'available',
        candidate: null,
        hrName: 'HR Manager',
      });
    }
    setStoredData('hr_slots', defaultSlots);
  }

  if (!localStorage.getItem('hr_evaluations')) {
    const defaultEvaluations = [];
    setStoredData('hr_evaluations', defaultEvaluations);
  }
};

// Initialize data on load
initializeHRData();

// HR Candidates API
export const candidatesAPI = {
  getActivities: async (userId) => {
    try {
      const response = await api.get(`/api/candidates/activities/${userId}`);
      return { data: response.data.activities };
    } catch (error) {
      console.error("Failed to fetch candidate activities:", error);
      throw error;
    }
  },

  getDashboardData: async (userId) => {
    try {
      const response = await api.get(`/api/candidates/dashboard/${userId}`);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch candidate dashboard data:", error);
      throw error;
    }
  },

  getReports: async (userId) => {
    try {
      const response = await api.get(`/api/candidates/${userId}/reports`);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch candidate reports:", error);
      throw error;
    }
  },

  getAll: async () => {
    try {
      const response = await api.get('/api/candidates');
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch all candidates:", error);
      throw error;
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/api/candidates/${id}`);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch candidate:", error);
      throw error;
    }
  },

  update: async (id, data) => {
    try {
      const response = await api.put(`/api/candidates/${id}`, data);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to update candidate:", error);
      throw error;
    }
  },

  getStats: async () => {
    try {
      const response = await api.get('/api/hr/stats');
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch HR stats:", error);
      throw error;
    }
  },
};

// HR Slot Management APIs
export const slotAPI = {
  getAvailableSlots: async () => {
    try {
      const response = await api.get('/api/slots');
      return {
        data: response.data
          .filter(slot => slot.status === 'available')
          .map(slot => ({ ...slot, available: true }))
      };
    } catch (error) {
      console.error("Failed to fetch available slots:", error);
      throw error;
    }
  },

  getAll: async () => {
    try {
      const response = await api.get('/api/slots');
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch all slots:", error);
      throw error;
    }
  },

  bookSlot: async (slotId, candidateId, candidateName, candidateEmail) => {
    try {
      // Fetch current slot to get date, time, hr info
      const slotsResponse = await api.get('/api/slots');
      const slot = slotsResponse.data.find(s => s.id === slotId);

      if (!slot) {
        throw new Error('Slot not found');
      }

      const response = await api.post('/api/slots/book', {
        slot_id: slotId,
        candidate_id: candidateId,
        candidate_name: candidateName || 'Candidate',
        candidate_email: candidateEmail || '',
        hr_name: slot.hrName || 'HR Manager',
        hr_email: slot.hrEmail || 'hr@speak2hr.com',
        date: slot.date,
        time: slot.time,
        duration: slot.duration
      });

      return {
        data: {
          success: true,
          slotId,
          candidateId,
          videoCallLink: response.data.video_call_link,
          emailSent: response.data.email_sent
        }
      };
    } catch (error) {
      console.error("Failed to book slot:", error);
      throw error;
    }
  },

  create: async (slotData) => {
    try {
      const newSlot = {
        id: `slot-${Date.now()}`,
        ...slotData,
        status: 'available',
        hrName: slotData.hrName || 'HR Manager',
        hrEmail: slotData.hrEmail || 'hr@speak2hr.com'
      };

      const response = await api.post('/api/slots', newSlot);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to create slot:", error);
      throw error;
    }
  },

  update: async (slotId, slotData) => {
    try {
      const response = await api.put(`/api/slots/${slotId}`, slotData);
      return { data: { ...slotData, id: slotId } }; // Simplified return vs fetching updated
    } catch (error) {
      console.error("Failed to update slot:", error);
      throw error;
    }
  },

  delete: async (slotId) => {
    try {
      const response = await api.delete(`/api/slots/${slotId}`);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to delete slot:", error);
      throw error;
    }
  },

  cancelBooking: async (slotId, candidateId, candidateName, candidateEmail) => {
    try {
      const response = await api.post(`/api/slots/cancel/${slotId}`, {
        candidateId, candidateName, candidateEmail
      });
      return { data: response.data };
    } catch (error) {
      console.error("Failed to cancel slot booking:", error);
      throw error;
    }
  }
};

// HR Evaluations API
export const evaluationsAPI = {
  getAll: async () => {
    try {
      const response = await api.get('/api/evaluations');
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch evaluations:", error);
      throw error;
    }
  },

  submit: async (evaluationId, evaluationData) => {
    try {
      const response = await api.put(`/api/evaluations/${evaluationId}/submit`, evaluationData);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to submit evaluation:", error);
      throw error;
    }
  },

  create: async (evaluationData) => {
    try {
      const response = await api.post('/api/evaluations', evaluationData);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to create evaluation:", error);
      throw error;
    }
  },
};

// Admin APIs
const initializeAdminData = () => {
  const users = getStoredData('admin_users', []);

  // Check if admin user exists with password
  const adminUser = users.find(u => u.email === 'admin@company.com');

  if (!adminUser || !adminUser.password) {
    // Remove old admin user if exists without password
    const filteredUsers = users.filter(u => u.email !== 'admin@company.com');

    // Add proper admin user with password
    const newAdmin = {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@company.com',
      password: 'admin123',
      role: 'admin',
      status: 'active',
      registeredDate: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      lastLogin: new Date().toISOString()
    };

    filteredUsers.unshift(newAdmin);
    setStoredData('admin_users', filteredUsers);
    console.log('✅ Admin user initialized with credentials: admin@company.com / admin123');
  } else {
    console.log('✅ Admin user already exists');
  }

  if (!localStorage.getItem('admin_settings')) {
    const defaultSettings = {
      siteName: 'Speak2HR',
      allowRegistration: true,
      hrAutoApproval: false,
      emailNotifications: true,
      maintenanceMode: false,
      maxInterviewDuration: 60,
      assessmentPassScore: 70,
    };
    setStoredData('admin_settings', defaultSettings);
  }
};

// Initialize admin data
initializeAdminData();

// Utility function to reset all data (call from console if needed)
window.resetSpeak2HRData = () => {
  const confirmReset = window.confirm(
    'This will delete ALL data including:\n' +
    '- All users (candidates, HR, admin)\n' +
    '- All settings\n' +
    '- Authentication data\n' +
    '- Slots and evaluations\n\n' +
    'Are you sure you want to continue?'
  );

  if (confirmReset) {
    localStorage.removeItem('admin_users');
    localStorage.removeItem('admin_settings');
    localStorage.removeItem('auth-storage');
    localStorage.removeItem('hr_slots');
    localStorage.removeItem('hr_evaluations');

    console.log('🔄 All data cleared. Reinitializing...');
    initializeAdminData();
    initializeHRData();
    console.log('✅ Data reset complete! Please refresh the page.');
    window.location.reload();
  }
};

export const adminAPI = {
  // User Management
  getAllUsers: async () => {
    try {
      const response = await api.get('/api/admin/users');
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch users:", error);
      throw error;
    }
  },

  updateUser: async (userId, updates) => {
    try {
      const response = await api.put(`/api/admin/users/${userId}`, updates);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to update user:", error);
      throw error;
    }
  },

  deleteUser: async (userId) => {
    try {
      const response = await api.delete(`/api/admin/users/${userId}`);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to delete user:", error);
      throw error;
    }
  },

  // HR Approval Management
  getPendingHRRequests: async () => {
    try {
      const response = await api.get('/api/admin/hr-pending');
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch pending HR requests:", error);
      throw error;
    }
  },

  approveHR: async (userId) => {
    try {
      const response = await api.post(`/api/admin/hr-approve/${userId}`);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to approve HR:", error);
      throw error;
    }
  },

  rejectHR: async (userId) => {
    try {
      const response = await api.post(`/api/admin/hr-reject/${userId}`);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to reject HR:", error);
      throw error;
    }
  },

  sendApprovalEmail: async (email, name, approved) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const subject = approved
          ? 'Your HR Account Has Been Approved - Speak2HR'
          : 'Your HR Account Request Has Been Rejected - Speak2HR';

        const body = approved
          ? `Dear ${name},

Congratulations! Your HR account on Speak2HR has been approved by the administrator.

You can now log in to your HR dashboard and access the following features:
- View and manage candidate profiles
- Create and manage interview slots
- Evaluate candidates after interviews
- Access candidate reports and analytics

Please log in at your earliest convenience to set up your availability and start managing interviews.

Best regards,
Speak2HR Team`
          : `Dear ${name},

Thank you for your interest in joining Speak2HR as an HR user.

After review, your account request has been not been approved at this time. This could be due to:
- Incomplete registration information
- Account restrictions
- Other administrative considerations

If you believe this is an error or would like to discuss further, please contact the system administrator.

Best regards,
Speak2HR Team`;

        console.log(`Email would be sent to: ${email}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body: ${body}`);

        resolve({
          data: {
            success: true,
            message: `Email notification ${approved ? 'approval' : 'rejection'} sent to ${email}`
          }
        });
      }, 200);
    });
  },

  // System Statistics
  getSystemStats: async () => {
    try {
      const response = await api.get('/api/admin/stats');
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch system stats:", error);
      throw error;
    }
  },

  // System Settings
  getSettings: async () => {
    try {
      const response = await api.get('/api/admin/settings');
      return { data: response.data };
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      throw error;
    }
  },

  updateSettings: async (settings) => {
    try {
      const response = await api.put('/api/admin/settings', settings);
      return { data: response.data };
    } catch (error) {
      console.error("Failed to update settings:", error);
      throw error;
    }
  },

  // Weekly Report Email
  sendWeeklyReport: async (reportData) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('Sending weekly report:', reportData);

        const subject = `Speak2HR Weekly Report - ${reportData.period}`;
        const body = `
Weekly Performance Report
========================
Period: ${reportData.period}

Summary:
- Total Interviews: ${reportData.totalInterviews}
- Completed Interviews: ${reportData.completedInterviews}
- Upcoming Interviews: ${reportData.upcomingInterviews}
- Average Score: ${reportData.averageScore}%
- New Candidates: ${reportData.newCandidates}

Top Skills: ${reportData.topSkills?.join(', ') || 'N/A'}
Areas to Improve: ${reportData.areasToImprove?.join(', ') || 'N/A'}

---
This is an automated report from Speak2HR.
        `;

        console.log(`Email would be sent to: ${reportData.recipientEmail || 'all candidates and HR'}`);
        console.log(`Subject: ${subject}`);

        resolve({
          data: {
            success: true,
            message: 'Weekly report sent successfully to all recipients'
          }
        });
      }, 500);
    });
  },

  // Slot Cancellation Email
  sendCancellationEmail: async (slotData) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('Sending cancellation email:', slotData);

        const subject = `Interview Cancelled - ${slotData.date} at ${slotData.time}`;
        const body = `
Interview Cancellation Notice
=============================
Dear ${slotData.candidateName},

Your interview has been cancelled by the HR manager.

Original Interview Details:
- Date: ${slotData.date}
- Time: ${slotData.time}
- Interviewer: ${slotData.hrName}

Reason: ${slotData.reason || 'Emergency cancellation by HR'}

Please contact the HR team to reschedule your interview.

Best regards,
Speak2HR Team
        `;

        console.log(`Cancellation email would be sent to: ${slotData.candidateEmail}`);
        console.log(`Subject: ${subject}`);

        resolve({
          data: {
            success: true,
            message: 'Cancellation email sent to candidate'
          }
        });
      }, 200);
    });
  },
};

// Health check
export const healthCheck = async () => {
  return api.get('/health');
};

export default api;
