import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      token: null,

      login: (userData, token) => {
        set({
          user: userData,
          isAuthenticated: true,
          token: token,
        });
      },

      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
          token: null,
        });
      },

      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData },
        }));
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

export const useInterviewStore = create((set, get) => ({
  currentSession: null,
  questions: [],
  currentQuestionIndex: 0,
  responses: [],
  sessionResults: null,
  isLoading: false,

  setSession: (session) => set({ currentSession: session }),

  setQuestions: (questions) => set({ questions, currentQuestionIndex: 0 }),

  nextQuestion: () => {
    const { currentQuestionIndex, questions } = get();
    if (currentQuestionIndex < questions.length - 1) {
      set({ currentQuestionIndex: currentQuestionIndex + 1 });
    }
  },

  prevQuestion: () => {
    const { currentQuestionIndex } = get();
    if (currentQuestionIndex > 0) {
      set({ currentQuestionIndex: currentQuestionIndex - 1 });
    }
  },

  goToQuestion: (index) => {
    const { questions } = get();
    if (index >= 0 && index < questions.length) {
      set({ currentQuestionIndex: index });
    }
  },

  addResponse: (response) => {
    set((state) => ({
      responses: [...state.responses, response],
    }));
  },

  setSessionResults: (results) => set({ sessionResults: results }),

  setLoading: (loading) => set({ isLoading: loading }),

  resetInterview: () => set({
    currentSession: null,
    questions: [],
    currentQuestionIndex: 0,
    responses: [],
    sessionResults: null,
    isLoading: false,
  }),
}));

export const useAssessmentStore = create((set) => ({
  currentAssessment: null,
  assessmentHistory: [],
  isLoading: false,

  setCurrentAssessment: (assessment) => set({ currentAssessment: assessment }),
  setAssessmentHistory: (history) => set({ assessmentHistory: history }),
  setLoading: (loading) => set({ isLoading: loading }),
  clearAssessment: () => set({ currentAssessment: null }),
}));

export const useHRStore = create((set) => ({
  candidates: [],
  selectedCandidate: null,
  slots: [],
  evaluations: [],
  isLoading: false,

  setCandidates: (candidates) => set({ candidates }),
  setSelectedCandidate: (candidate) => set({ selectedCandidate: candidate }),
  setSlots: (slots) => set({ slots }),
  setEvaluations: (evaluations) => set({ evaluations }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
