import React, { useState, useEffect } from 'react';
import './Popup.css';
import youtube from '../Popup/imgs/youtube.png';

// Add backend URL constant
const BACKEND_URL = process.env.BACKEND_URL;

const InstructorView = () => {
  const [activeTab, setActiveTab] = useState('assignments');
  const [students, setStudents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [courseQuestions, setCourseQuestions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState('');
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [isLoadingQuizzes, setIsLoadingQuizzes] = useState(true);
  const [isSyncingCourse, setIsSyncingCourse] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [showRiskLevels, setShowRiskLevels] = useState(true);
  const [newVideo, setNewVideo] = useState({
    title: '',
    url: '',
    questionId: '',
  });
  const [courseContext, setCourseContext] = useState('');
  const [editingVideo, setEditingVideo] = useState(null);
  const [apiToken, setApiToken] = useState('');
  const [tokenStatus, setTokenStatus] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [isDeepSyncing, setIsDeepSyncing] = useState(false);
  const [deepSyncStatus, setDeepSyncStatus] = useState('');

  const imgs = { youtube: '/path/to/youtube/icon.png' };

  const getCanvasBaseUrl = () => {
    const url = window.location.href;
    const match = url.match(/(https?:\/\/[^\/]+)/);
    return match ? match[1] : null;
  };

  const fetchCurrentCourseId = () => {
    const url = window.location.href;
    const match = url.match(/\/courses\/(\d+)/);
    return match && match[1] ? match[1] : null;
  };

  const fetchUserProfile = async () => {
    const baseUrl = getCanvasBaseUrl();
    const storedToken = localStorage.getItem('apiToken');

    if (!baseUrl || !storedToken) {
      console.error('Missing base URL or API token');
      return;
    }

    const myHeaders = new Headers();
    myHeaders.append('Authorization', `Bearer ${storedToken}`);

    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow',
    };

    try {
      const response = await fetch(
        `${baseUrl}/api/v1/users/self`,
        requestOptions
      );
      const profileData = await response.json();
      return profileData.id;
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchTeacherCourses = async () => {
    const baseUrl = getCanvasBaseUrl();
    const storedToken = localStorage.getItem('apiToken');

    if (!baseUrl || !storedToken) {
      console.error('Missing base URL or API token');
      return [];
    }

    const myHeaders = new Headers();
    myHeaders.append('Authorization', `Bearer ${storedToken}`);

    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow',
    };

    try {
      const response = await fetch(
        `${baseUrl}/api/v1/courses?enrollment_type=teacher&per_page=100`,
        requestOptions
      );
      const coursesData = await response.json();
      return coursesData.map((course) => course.id);
    } catch (error) {
      console.error('Error fetching teacher courses:', error);
      return [];
    }
  };

  const removeToken = () => {
    localStorage.removeItem('apiToken');
    setApiToken('');
    setStudents([]);
    setCourseQuestions([]);
    setTokenStatus('');
  };

  const sendTokenToServer = async (token) => {
    setTokenStatus('Sending token...');
    const teacherCourses = await fetchTeacherCourses();
    const userId = await fetchUserProfile();

    try {
      const response = await fetch(`${BACKEND_URL}/add-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          userid: userId.toString(),
          access_token: token,
          courseids: teacherCourses,
          link: getCanvasBaseUrl(),
        }),
        mode: 'cors',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setTokenStatus('Token set successfully!');
      localStorage.setItem('apiToken', token);
    } catch (error) {
      console.error('Error sending token:', error);
      setTokenStatus('Error setting token. Please try again.');
    }
  };

  const fetchEnrollments = async (courseId) => {
    const baseUrl = getCanvasBaseUrl();
    const storedToken = localStorage.getItem('apiToken');

    if (!baseUrl || !storedToken) {
      console.error('Missing base URL or API token');
      return [];
    }

    const myHeaders = new Headers();
    myHeaders.append('Authorization', `Bearer ${storedToken}`);

    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow',
    };

    try {
      const response = await fetch(
        `${baseUrl}/api/v1/courses/${courseId}/enrollments`,
        requestOptions
      );
      const enrollmentData = await response.json();
      return enrollmentData.filter(
        (enrollment) => enrollment.type === 'StudentEnrollment'
      );
    } catch (error) {
      console.error('Error fetching enrollment data:', error);
      return [];
    }
  };

  const fetchAssignments = async (courseId, userId) => {
    const baseUrl = getCanvasBaseUrl();
    const storedToken = localStorage.getItem('apiToken');

    if (!baseUrl || !storedToken) {
      console.error('Missing base URL or API token');
      return [];
    }

    const myHeaders = new Headers();
    myHeaders.append('Authorization', `Bearer ${storedToken}`);

    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow',
    };

    try {
      const assignmentsResponse = await fetch(
        `${baseUrl}/api/v1/courses/${courseId}/assignments`,
        requestOptions
      );
      const assignmentsResult = await assignmentsResponse.json();

      const studentAssignments = await Promise.all(
        assignmentsResult.map(async (assignment) => {
          const submissionResponse = await fetch(
            `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignment.id}/submissions/${userId}`,
            requestOptions
          );
          const submissionResult = await submissionResponse.json();

          return {
            name: assignment.name,
            score: submissionResult.score || 'N/A',
            pointsPossible: assignment.points_possible,
          };
        })
      );

      return studentAssignments;
    } catch (error) {
      console.error('Error fetching assignments:', error);
      return [];
    }
  };

  const fetchQuizzes = async (courseId) => {
    const baseUrl = getCanvasBaseUrl();
    const storedToken = localStorage.getItem('apiToken');

    console.log('Fetching quizzes for course:', courseId);
    console.log('Base URL:', baseUrl);
    console.log('Has API token:', !!storedToken);

    if (!baseUrl || !storedToken) {
      console.error('Missing base URL or API token');
      return [];
    }

    const myHeaders = new Headers();
    myHeaders.append('Authorization', `Bearer ${storedToken}`);

    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow',
    };

    try {
      let allQuizzes = [];
      let nextUrl = `${baseUrl}/api/v1/courses/${courseId}/quizzes?per_page=100`;

      while (nextUrl) {
        console.log('Fetching quizzes from:', nextUrl);
        const response = await fetch(nextUrl, requestOptions);
        const quizzesData = await response.json();
        allQuizzes = [...allQuizzes, ...quizzesData];

        // Get the next page URL from the Link header
        const linkHeader = response.headers.get('Link');
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<([^>]+)>; rel="next"/);
          nextUrl = nextMatch ? nextMatch[1] : null;
        } else {
          nextUrl = null;
        }
      }

      console.log('Total quizzes received:', allQuizzes.length);
      return allQuizzes;
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      return [];
    }
  };

  const fetchQuizQuestions = async (courseId, quizId) => {
    const baseUrl = getCanvasBaseUrl();
    const storedToken = localStorage.getItem('apiToken');

    if (!baseUrl || !storedToken) {
      console.error('Missing base URL or API token');
      return [];
    }

    const myHeaders = new Headers();
    myHeaders.append('Authorization', `Bearer ${storedToken}`);

    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow',
    };

    try {
      const response = await fetch(
        `${baseUrl}/api/v1/courses/${courseId}/quizzes/${quizId}/questions`,
        requestOptions
      );
      const questionsData = await response.json();
      return questionsData;
    } catch (error) {
      console.error('Error fetching quiz questions:', error);
      return [];
    }
  };

  const loadCourse = async (courseId, accessToken, link, courseContext) => {
    try {
      setIsSyncingCourse(true);
      setSyncError(null);

      // 1. Update course database
      const dbResponse = await fetch(`${BACKEND_URL}/update-course-db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          course_id: courseId,
          access_token: accessToken,
          link: link
        }),
        mode: 'cors',
        credentials: 'include'
      });

      if (!dbResponse.ok) {
        throw new Error('Failed to update course database');
      }

      return {
        status: 'success',
        message: 'Course data synchronized successfully'
      };
    } catch (error) {
      console.error('Error synchronizing course data:', error);
      setSyncError(error.message);
      return {
        status: 'error',
        message: error.message
      };
    } finally {
      setIsSyncingCourse(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const courseId = fetchCurrentCourseId();
      if (courseId) {
        setIsLoadingQuizzes(true);
        const storedToken = localStorage.getItem('apiToken');
        const baseUrl = getCanvasBaseUrl();

        // Only sync if not already synced this page load
        if (!localStorage.getItem('courseSynced')) {
          await loadCourse(
            courseId,
            storedToken,
            baseUrl,
            courseContext
          );
          localStorage.setItem('courseSynced', 'true');
        }

        // --- FETCH INITIAL RISK TOGGLE STATE FROM DATABASE ---
        try {
          console.log('Fetching initial risk toggle state...');
          const toggleResponse = await fetch(`${BACKEND_URL}/get-toggle-risk/${courseId}`);
          if (toggleResponse.ok) {
            const toggleData = await toggleResponse.json();
            if (toggleData && typeof toggleData.toggle_risk !== 'undefined') {
              setShowRiskLevels(toggleData.toggle_risk);
              console.log('Initial Risk State Loaded:', toggleData.toggle_risk);
            }
          }
        } catch (error) {
          console.error('Error fetching initial risk state:', error);
        }
        // ------------------------------------------------------

        const enrollments = await fetchEnrollments(courseId);
        const studentData = await Promise.all(
          enrollments.map(async (enrollment) => {
            const assignments = await fetchAssignments(
              courseId,
              enrollment.user_id
            );
            return {
              id: enrollment.user_id,
              name: enrollment.user.name,
              scores: assignments.map((a) =>
                a.score !== 'N/A' ? parseFloat(a.score) : 0
              ),
              assignments: assignments,
            };
          })
        );
        setStudents(studentData);
        fetchCourseVideos(courseId);

        // Fetch quizzes for the course
        const quizzesData = await fetchQuizzes(courseId);
        setQuizzes(quizzesData);
        setIsLoadingQuizzes(false);
      }
    };

    fetchData();
    // Clear the flag on unmount so it can sync again on next page load
    return () => {
      localStorage.removeItem('courseSynced');
    };
  }, []);

  // Effect to fetch questions when a quiz is selected
  useEffect(() => {
    const fetchQuestions = async () => {
      if (selectedQuiz) {
        const courseId = fetchCurrentCourseId();
        const questions = await fetchQuizQuestions(courseId, selectedQuiz);
        setQuizQuestions(questions);
      } else {
        setQuizQuestions([]);
      }
    };

    fetchQuestions();
  }, [selectedQuiz]);

  const calculateAverageScore = (scores) => {
    const validScores = scores.filter((score) => score !== 'N/A');
    return validScores.length > 0
      ? validScores.reduce((acc, score) => acc + score, 0) / validScores.length
      : 0;
  };

  const calculateRiskFactor = (averageScore) => {
    return averageScore < 50 ? 1 : averageScore < 70 ? 0.5 : 0;
  };

  const getRiskMeterColor = (riskFactor) => {
    return riskFactor === 1
      ? 'bg-red-600'
      : riskFactor === 0.5
        ? 'bg-yellow-500'
        : 'bg-green-500';
  };

  const getClassPerformanceOverview = () => {
    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let lowRiskCount = 0;
    let totalScore = 0;

    students.forEach((student) => {
      const averageScore = calculateAverageScore(student.scores);
      const riskFactor = calculateRiskFactor(averageScore);

      if (riskFactor === 1) {
        highRiskCount++;
      } else if (riskFactor === 0.5) {
        mediumRiskCount++;
      } else {
        lowRiskCount++;
      }

      totalScore += averageScore;
    });

    const classSize = students.length;
    const averageScore = totalScore / classSize;

    return {
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      averageScore,
    };
  };

  const sendNotification = (message) => {
    setNotifications([...notifications, message]);
  };

  const fetchCourseVideos = async (courseId) => {
    const fullUrl = `${BACKEND_URL}/get-course-videos`;

    try {
      const response = await new Promise((resolve, reject) => {
        if (!chrome.runtime) {
          reject(new Error('chrome.runtime is not available'));
          return;
        }

        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          url: fullUrl,
          method: 'POST',
          body: {
            course_id: courseId,
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error('No response received from background script'));
          } else if (!response.success) {
            reject(new Error(response.error || 'Unknown error occurred'));
          } else {
            resolve(response.data);
          }
        });
      });

      console.log('Course videos response:', response); // Debug log

      if (response && response.course_videos) {
        setCourseQuestions(response.course_videos);
      } else {
        console.log('No course videos found in response');
        setCourseQuestions([]);
      }
    } catch (error) {
      console.error('Error fetching course videos:', error);
      setCourseQuestions([]); // Set empty array on error
    }
  };

  const addVideoToQuestion = (questionId, video) => {
    setCourseQuestions((prevQuestions) =>
      prevQuestions.map((question) =>
        question.questionid === questionId
          ? { ...question, video_data: [...question.video_data, video] }
          : question
      )
    );
  };

  const removeVideoFromQuestion = async (questionId, quizId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/remove-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          quiz_id: quizId,
          question_id: questionId,
        }),
        mode: 'cors',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        setCourseQuestions((prevQuestions) =>
          prevQuestions.filter((q) => q.questionid !== questionId)
        );
        setNotifications([...notifications, 'Video removed successfully']);
      } else {
        const errorData = await response.json();
        setNotifications([...notifications, `Failed to remove video: ${errorData.message || 'Unknown error'}`]);
      }
    } catch (error) {
      console.error('Error removing video:', error);
      setNotifications([...notifications, 'Failed to remove video: ' + error.message]);
    }
  };
  const getYoutubeId = (url) => {
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const handleAddVideo = async () => {
    if (!newVideo.title || !newVideo.url || !newVideo.questionId || !selectedQuiz) {
      console.log('Missing required fields');
      return;
    }

    // Get the selected question from quizQuestions
    const selectedQuestion = quizQuestions.find(
      (q) => q.id.toString() === newVideo.questionId
    );

    if (!selectedQuestion) {
      console.log('Could not find matching question');
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}add-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          quiz_id: selectedQuiz,
          question_id: newVideo.questionId,
          video_link: newVideo.url,
        }),
        mode: 'cors',
        credentials: 'include'
      });

      const data = await response.json();
      console.log('API Response:', data);

      if (response.ok) {
        const newVideoData = {
          question_id: newVideo.questionId,
          quiz_id: selectedQuiz,
          questionid: newVideo.questionId,
          quizid: selectedQuiz,
          question_text: selectedQuestion.question_text,
          core_topic: selectedQuestion.question_text.substring(0, 50),
          video_data: {
            title: newVideo.title || 'Custom Video',
            link: newVideo.url,
            thumbnail: `https://img.youtube.com/vi/${getYoutubeId(newVideo.url)}/hqdefault.jpg`,
            channel: 'Custom Added',
          },
        };

        setCourseQuestions((prevQuestions) => [...prevQuestions, newVideoData]);
        setNewVideo({ title: '', url: '', questionId: '' });
        console.log('Video added successfully:', newVideoData);
      }
    } catch (error) {
      console.log('Error adding video:', error);
    }
  };

  const updateCourseContext = async () => {
    const courseId = fetchCurrentCourseId();
    if (!courseId) return;

    try {
      const response = await fetch(`${BACKEND_URL}/update-course-context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          course_id: courseId,
          course_context: courseContext,
        }),
        mode: 'cors',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log('Course context updated successfully');
      setUpdateSuccess(true);
      setCourseContext(''); // Clear the textarea
      // Hide success message after 3 seconds
      setTimeout(() => {
        setUpdateSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error updating course context:', error);
      setUpdateSuccess(false);
    }
  };

  const handleEditVideo = (questionId, videoIndex, currentLink) => {
    setEditingVideo({ questionId, videoIndex, currentLink });
  };

  const handleSaveEdit = async () => {
    if (!editingVideo) return;

    const question = courseQuestions.find(
      (q) => q.questionid === editingVideo.questionId
    );

    if (!question) {
      console.error('Question not found:', editingVideo.questionId);
      setNotifications([...notifications, 'Failed to find question']);
      return;
    }

    if (!question.quizid) {
      console.error('Quiz ID is missing for question:', question);
      setNotifications([...notifications, 'Quiz ID is missing']);
      return;
    }

    const requestBody = {
      quiz_id: String(question.quizid),
      question_id: String(editingVideo.questionId),
      new_link: String(editingVideo.newLink),
    };

    console.log('Sending update request with body:', requestBody);

    try {
      const response = await fetch(`${BACKEND_URL}/update-video-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify(requestBody),
        mode: 'cors',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        setEditingVideo(null);
        fetchCourseVideos(fetchCurrentCourseId());
        setNotifications([...notifications, 'Video link updated successfully']);
      } else {
        const errorData = await response.json();
        console.error('Update failed with status:', response.status);
        console.error('Error response:', errorData);
        setNotifications([...notifications, `Failed to update video link: ${errorData.message || 'Unknown error'}`]);
      }
    } catch (error) {
      console.error('Error updating video link:', error);
      setNotifications([...notifications, 'Failed to update video link: ' + error.message]);
    }
  };

  // Add a helper function to clean HTML from text
  const cleanHtml = (html) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
  };

  // Add a manual refresh function
  const handleRefreshCourse = async () => {
    const courseId = fetchCurrentCourseId();
    const storedToken = localStorage.getItem('apiToken');
    const baseUrl = getCanvasBaseUrl();

    if (courseId && storedToken && baseUrl) {
      await loadCourse(
        courseId,
        storedToken,
        baseUrl,
        courseContext
      );
    }
  };

  // Add a handler for deep sync
  const handleDeepSync = async () => {
    setIsDeepSyncing(true);
    setDeepSyncStatus('');
    const courseId = fetchCurrentCourseId();
    const storedToken = localStorage.getItem('apiToken');
    const baseUrl = getCanvasBaseUrl();
    try {
      const response = await fetch(`${BACKEND_URL}/sync-all-quizzes-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          course_id: courseId,
          access_token: storedToken,
          link: baseUrl
        }),
        mode: 'cors',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      setDeepSyncStatus('Deep sync completed successfully!');
    } catch (error) {
      setDeepSyncStatus('Deep sync failed: ' + error.message);
    } finally {
      setIsDeepSyncing(false);
    }
  };

  // --- UPDATED FUNCTION: HANDLE RISK TOGGLE WITH BETTER ERROR HANDLING ---
  const handleToggleRisk = async () => {
    const courseId = fetchCurrentCourseId();
    const storedToken = localStorage.getItem('apiToken');

    if (!storedToken) {
      console.error('Missing API token');
      return;
    }

    // Calculate new state
    const newRiskState = !showRiskLevels;

    console.log(`[Risk Toggle] Sending request for Course ${courseId}`);

    try {
      //Fix potential double slash in URL
      const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;

      const response = await fetch(`${baseUrl}/update-toggle-risk/${courseId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          //'Origin': 'chrome-extension://' + chrome.runtime.id,
          'Authorization': `Bearer ${storedToken}`
        },
        body: JSON.stringify({
          toggle_risk: newRiskState
        }),
      });
      
      const result = await response.json();

      if (response.ok) {
        console.log('[SUCCESS] Database updated successfully.');
        console.log('Server Message:', result.message);
        setShowRiskLevels(newRiskState);
      } else {
        console.error('[FAILED] Backend rejected the request.');
        console.error('Error Code:', response.status);
        console.error('Backend Response:', result);
      }
    } catch (error) {
      console.error('[NETWORK ERROR] Request failed:', error);
    }

  };

  const styles = {
    body: {
      backgroundColor: '#f7fafc',
      fontFamily: 'Arial, sans-serif',
    },
    container: {
      maxWidth: '40rem',
      margin: '1rem auto',
      padding: '1rem',
      backgroundColor: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderRadius: '0.375rem',
    },
    title: {
      fontSize: '1.125rem',
      fontWeight: '600',
      marginBottom: '0.5rem',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '1rem',
    },
    item: {
      textAlign: 'center',
    },
    itemTitle: {
      fontSize: '0.875rem',
      fontWeight: '500',
      marginBottom: '0.25rem',
    },
    highRisk: {
      fontSize: '2rem',
      fontWeight: '700',
      color: '#e53e3e',
    },
    mediumRisk: {
      fontSize: '2rem',
      fontWeight: '700',
      color: '#ecc94b',
    },
    lowRisk: {
      fontSize: '2rem',
      fontWeight: '700',
      color: '#48bb78',
    },
    averageScore: {
      fontSize: '0.875rem',
      fontWeight: '500',
      marginTop: '1rem',
    },
    studentList: {
      listStyleType: 'none',
      padding: '0',
      margin: '0',
    },
    studentItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.75rem 1rem',
      backgroundColor: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: '4px solid transparent',
      borderRadius: '0.375rem',
      transition: 'background-color 0.15s ease-in-out',
      cursor: 'pointer',
    },
    studentItemHover: {
      backgroundColor: '#bee3f8',
    },
    studentName: {
      fontSize: '1rem',
      fontWeight: '500',
      color: '#4a5568',
    },
    studentDetail: {
      fontSize: '0.875rem',
      color: '#a0aec0',
    },
    riskTag: {
      padding: '0.25rem 0.5rem',
      borderRadius: '0.375rem',
      fontSize: '0.75rem',
      fontWeight: '500',
      color: '#fff',
    },
    highRiskTag: {
      backgroundColor: '#e53e3e',
    },
    mediumRiskTag: {
      backgroundColor: '#ecc94b',
    },
    lowRiskTag: {
      backgroundColor: '#48bb78',
    },
    button: {
      backgroundColor: '#e53e3e',
      color: '#fff',
      padding: '0.5rem 0.75rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      transition: 'background-color 0.15s ease-in-out',
    },
    buttonHover: {
      backgroundColor: '#c53030',
    },
    textArea: {
      width: '100%',
      border: '1px solid #cbd5e0',
      borderRadius: '0.375rem',
      padding: '0.5rem',
      marginBottom: '0.5rem',
    },
    messageButton: {
      backgroundColor: '#3182ce',
      color: '#fff',
      padding: '0.5rem 0.75rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      transition: 'background-color 0.15s ease-in-out',
    },
    messageButtonHover: {
      backgroundColor: '#2b6cb0',
    },
    notificationList: {
      listStyleType: 'none',
      padding: '0',
      margin: '0',
      marginTop: '1rem',
    },
    notificationItem: {
      padding: '0.75rem 1rem',
      backgroundColor: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: '4px solid #3182ce',
      borderRadius: '0.375rem',
    },
    videoCard: {
      border: '1px solid #e2e8f0',
      borderRadius: '0.375rem',
      padding: '1rem',
      marginBottom: '1rem',
      boxShadow:
        '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    },
    videoThumbnail: {
      width: '100%',
      height: 'auto',
      borderRadius: '0.25rem',
      marginBottom: '0.5rem',
    },
    videoTitle: {
      fontSize: '1rem',
      fontWeight: '600',
      marginBottom: '0.25rem',
    },
    videoChannel: {
      fontSize: '0.875rem',
      color: '#718096',
      marginBottom: '0.5rem',
    },
    questionText: {
      fontSize: '0.875rem',
      color: '#4a5568',
      marginTop: '0.5rem',
    },
    removeButton: {
      backgroundColor: '#e53e3e',
      color: '#fff',
      border: 'none',
      padding: '0.5rem',
      borderRadius: '0.25rem',
      cursor: 'pointer',
      marginTop: '0.5rem',
    },
    editButton: {
      backgroundColor: '#4299e1',
      color: '#fff',
      border: 'none',
      padding: '0.5rem',
      borderRadius: '0.25rem',
      cursor: 'pointer',
      marginTop: '0.5rem',
      marginLeft: '0.5rem',
    },
    editModal: {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: '#fff',
      padding: '2rem',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      zIndex: 1000,
    },
    input: {
      width: '100%',
      padding: '0.5rem',
      marginBottom: '1rem',
      borderRadius: '0.25rem',
      border: '1px solid #e2e8f0',
    },
    saveButton: {
      backgroundColor: '#48bb78',
      color: '#fff',
      border: 'none',
      padding: '0.5rem 1rem',
      borderRadius: '0.25rem',
      cursor: 'pointer',
      marginRight: '0.5rem',
    },
    cancelButton: {
      backgroundColor: '#e53e3e',
      color: '#fff',
      border: 'none',
      padding: '0.5rem 1rem',
      borderRadius: '0.25rem',
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.body}>
      <div style={styles.container}>
        <div>
          {/* Header Row with Toggle Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ ...styles.title, marginBottom: 0 }}>Class Performance Overview</h2>
            <button 
              onClick={handleToggleRisk}
              style={{
                ...styles.button,
                backgroundColor: showRiskLevels ? '#3182ce' : '#718096', // Gray when turning off, Blue when turning on
                fontSize: '0.875rem',
                margin: 0
              }}
            >
              {showRiskLevels ? 'Turn Off Risk Analysis for Class' : 'Turn On Risk Analysis for Class'}
            </button>
          </div>

          {/* Conditional Rendering for the Risk Grid */}
          {showRiskLevels && (
            <div style={styles.grid}>
              <div style={styles.item}>
                <h3 style={styles.itemTitle}>High Risk</h3>
                <p style={styles.highRisk}>
                  {getClassPerformanceOverview().highRiskCount}
                </p>
              </div>
              <div style={styles.item}>
                <h3 style={styles.itemTitle}>Medium Risk</h3>
                <p style={styles.mediumRisk}>
                  {getClassPerformanceOverview().mediumRiskCount}
                </p>
              </div>
              <div style={styles.item}>
                <h3 style={styles.itemTitle}>Low Risk</h3>
                <p style={styles.lowRisk}>
                  {getClassPerformanceOverview().lowRiskCount}
                </p>
              </div>
            </div>
          )}

          <p style={styles.averageScore}>
            Average Score:{' '}
            {getClassPerformanceOverview().averageScore.toFixed(2)}%
          </p>
        </div>
      </div>

      <div
        style={{ ...styles.container, maxHeight: '400px', overflowY: 'auto' }}
      >
        <div>
          <h2 style={styles.title}>Student Risk Dashboard</h2>
          <ul style={styles.studentList}>
            {students.map((student) => (
              <li
                key={student.id}
                style={{
                  ...styles.studentItem,
                  ':hover': styles.studentItemHover,
                }}
              >
                <div>
                  <h3 style={styles.studentName}>{student.name}</h3>
                  <p style={styles.studentDetail}>
                    Average Score:{' '}
                    {calculateAverageScore(student.scores).toFixed(2)}%
                  </p>
                </div>
                
                {/* Risk Tag - Hidden when showRiskLevels is false */}
                <div>
                  {showRiskLevels && (
                    <span
                      style={{
                        ...styles.riskTag,
                        ...(calculateRiskFactor(
                          calculateAverageScore(student.scores)
                        ) === 1
                          ? styles.highRiskTag
                          : calculateRiskFactor(
                            calculateAverageScore(student.scores)
                          ) === 0.5
                            ? styles.mediumRiskTag
                            : styles.lowRiskTag),
                      }}
                    >
                      {calculateRiskFactor(
                        calculateAverageScore(student.scores)
                      ) === 1
                        ? 'High Risk'
                        : calculateRiskFactor(
                          calculateAverageScore(student.scores)
                        ) === 0.5
                          ? 'Medium Risk'
                          : 'Low Risk'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={styles.container}>
        <div>
          <h2 style={styles.title}>Manage Course Videos</h2>

          {/* Quiz selection dropdown for filtering videos */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Quiz to View Videos:</label>
            {isLoadingQuizzes ? (
              <div style={{
                padding: '1rem',
                textAlign: 'center',
                backgroundColor: '#f7fafc',
                borderRadius: '0.375rem',
                marginBottom: '0.5rem'
              }}>
                Loading quizzes...
              </div>
            ) : (
              <select
                value={selectedQuiz}
                onChange={(e) => setSelectedQuiz(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginBottom: '0.5rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #e2e8f0',
                }}
              >
                <option value="">Select a quiz</option>
                {quizzes.map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {quiz.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '1rem',
            }}
          >
            {selectedQuiz ? (
              courseQuestions
                .filter((question) => String(question.quizid) === String(selectedQuiz))
                .map((question, index) => (
                  <div key={index} style={styles.videoCard}>
                    <img
                      src={question.video_data?.thumbnail}
                      alt={question.video_data?.title}
                      style={styles.videoThumbnail}
                    />
                    <h3 style={styles.videoTitle}>{question.video_data?.title}</h3>
                    <p style={styles.videoChannel}>
                      {question.video_data?.channel}
                    </p>
                    <a
                      href={question.video_data?.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'block', marginBottom: '0.5rem' }}
                    >
                      Watch Video
                    </a>
                    <p style={styles.questionText}>
                      <strong>Question:</strong> {question.question_text}
                    </p>
                    <p style={styles.questionText}>
                      <strong>Core Topic:</strong> {question.core_topic}
                    </p>
                    <button
                      onClick={() =>
                        removeVideoFromQuestion(
                          question.questionid,
                          question.quizid
                        )
                      }
                      style={styles.removeButton}
                    >
                      Remove Video
                    </button>
                    <button
                      onClick={() =>
                        handleEditVideo(
                          question.questionid,
                          0,
                          question.video_data?.link
                        )
                      }
                      style={styles.editButton}
                    >
                      Edit Video
                    </button>
                  </div>
                ))
            ) : (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem' }}>
                Please select a quiz to view its videos.
              </div>
            )}
          </div>

          {editingVideo && (
            <div style={styles.editModal}>
              <h3>Edit Video Link</h3>
              <input
                type="text"
                value={editingVideo.newLink}
                onChange={(e) =>
                  setEditingVideo({ ...editingVideo, newLink: e.target.value })
                }
                style={styles.input}
              />
              <button onClick={handleSaveEdit} style={styles.saveButton}>
                Save
              </button>
              <button
                onClick={() => setEditingVideo(null)}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          )}

          <h4>Add New Video</h4>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Question:</label>
            <select
              value={newVideo.questionId}
              onChange={(e) =>
                setNewVideo({ ...newVideo, questionId: e.target.value })
              }
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #e2e8f0',
              }}
            >
              <option value="">Select a question</option>
              {quizQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  {cleanHtml(question.question_text).substring(0, 100)}...
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Video Title"
              value={newVideo.title}
              onChange={(e) =>
                setNewVideo({ ...newVideo, title: e.target.value })
              }
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #e2e8f0',
              }}
            />
            <input
              type="text"
              placeholder="Video URL"
              value={newVideo.url}
              onChange={(e) => setNewVideo({ ...newVideo, url: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #e2e8f0',
              }}
            />
            <button
              onClick={handleAddVideo}
              style={{
                backgroundColor: '#4299e1',
                color: '#fff',
                padding: '0.5rem 1rem',
                borderRadius: '0.25rem',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Add Video
            </button>
          </div>
        </div>
      </div>

      <div style={styles.container}>
        <div>
          <h2 style={styles.title}>Course Context</h2>
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              style={{
                ...styles.messageButton,
                marginBottom: '1rem',
                backgroundColor: isSyncingCourse ? '#a0aec0' : '#3182ce',
                cursor: isSyncingCourse ? 'not-allowed' : 'pointer'
              }}
              onClick={handleRefreshCourse}
              disabled={isSyncingCourse}
            >
              {isSyncingCourse ? 'Syncing Course...' : 'Refresh Course Data'}
            </button>
            <button
              style={{
                ...styles.messageButton,
                marginBottom: '1rem',
                backgroundColor: isDeepSyncing ? '#a0aec0' : '#4299e1',
                cursor: isDeepSyncing ? 'not-allowed' : 'pointer'
              }}
              onClick={handleDeepSync}
              disabled={isDeepSyncing}
            >
              {isDeepSyncing ? 'Deep Syncing...' : 'Deep Sync Quizzes/Questions'}
            </button>
          </div>
          {deepSyncStatus && (
            <div style={{
              color: deepSyncStatus.includes('success') ? '#48bb78' : '#e53e3e',
              marginBottom: '1rem',
              padding: '0.5rem',
              backgroundColor: deepSyncStatus.includes('success') ? '#f0fff4' : '#fff5f5',
              borderRadius: '0.375rem',
              textAlign: 'center'
            }}>
              {deepSyncStatus}
            </div>
          )}
          {syncError && (
            <div style={{
              color: '#e53e3e',
              marginBottom: '1rem',
              padding: '0.5rem',
              backgroundColor: '#fff5f5',
              borderRadius: '0.375rem'
            }}>
              Error: {syncError}
            </div>
          )}
          <textarea
            style={styles.textArea}
            value={courseContext}
            onChange={(e) => setCourseContext(e.target.value)}
            placeholder="Enter course context..."
          ></textarea>
          <button
            style={{
              ...styles.messageButton,
              ':hover': styles.messageButtonHover,
            }}
            onClick={updateCourseContext}
          >
            Update Course Context
          </button>
          {updateSuccess && (
            <div style={{
              color: '#48bb78',
              marginTop: '1rem',
              padding: '0.5rem',
              backgroundColor: '#f0fff4',
              borderRadius: '0.375rem',
              textAlign: 'center'
            }}>
              Success! Course context updated successfully.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstructorView;