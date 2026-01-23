import React, { useState, useEffect } from 'react';
import './Studentview.css';
import youtube from './imgs/youtube.png';

const BACKEND_URL = process.env.BACKEND_URL;

const calculateSlope = (assignments) => {
  const lastFiveAssignments = assignments
    .filter(
      (assignment) => assignment.score !== 'N/A' && assignment.score !== 'Error'
    )
    .slice(-5);

  console.log('calculateSlope - lastFiveAssignments:', lastFiveAssignments);

  if (lastFiveAssignments.length < 2) {
    return [0]; // Return array with just 0 if not enough data
  }

  const x = Array.from({ length: lastFiveAssignments.length }, (_, i) => i + 1);
  const y = lastFiveAssignments.map(
    (assignment) => (Number(assignment.score) / assignment.pointsPossible) * 100
  );

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumXSquared = x.reduce((a, b) => a + b * b, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXSquared - sumX * sumX);
  
  // Return array with slope at index 0, then all the percentage grades
  return [slope, ...y];
};

const normalizeGts = (slope, minSlope = -10, maxSlope = 10) => {
  return ((slope - minSlope) / (maxSlope - minSlope)) * 100;
};

const calculateRiskIndex = (rps, cgs, gts, currentScore) => {
  const weights = {
    rps: 0.3,
    cgs: 0.55,
    gts: 0.15,
  };

  const riskIndex = weights.rps * rps + weights.cgs * cgs + weights.gts * gts;

  let riskLevel;
  
  // Special case: If grade is below 69 but showing strong improvement
  if (currentScore < 69 && gts > 75) {
    riskLevel = 'Medium Risk';
  }
  // Normal risk index calculation
  else if (riskIndex >= 75) {
    riskLevel = 'Low Risk';
  } else if (riskIndex >= 69 && riskIndex < 75) {
    riskLevel = 'Medium Risk';
  } else {
    riskLevel = 'High Risk';
  }

  return { riskLevel, riskIndex };
};

const normalizeRiskLevel = (riskLevel) => {
  const level = riskLevel.replace(' Risk', '').toLowerCase();
  return level; // Returns "low", "medium", or "high"
};

const StudentView = () => {
  const [activeTab, setActiveTab] = useState('assignments');
  const [assignments, setAssignments] = useState([]);
  const [recommendedVideos, setRecommendedVideos] = useState([]);
  const [supportVideo, setSupportVideo] = useState(null);
  const [classGrade, setClassGrade] = useState('N/A');
  const [studentName, setStudentName] = useState('');
  const [isSyncingCourse, setIsSyncingCourse] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [apiToken, setApiToken] = useState('');
  const [tokenStatus, setTokenStatus] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [userId, setUserId] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState('');
  const [isRiskEnabled, setIsRiskEnabled] = useState(true);
  const [watchedVideos, setWatchedVideos] = useState({});

  const imgs = { youtube };

  const getCanvasDomain = () => {
    const url = window.location.href;
    const match = url.match(/^https?:\/\/(.*?)(?:\/|$)/);
    return match ? match[1] : null;
  };

  const fetchCurrentCourseId = () => {
    const url = window.location.href;
    const match = url.match(/\/courses\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  };

  const fetchSupportVideos = async (riskLevel) => {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          url: `${BACKEND_URL}/get-support-video`,
          method: 'POST',
          body: {
            risk_level: riskLevel,
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
      return response;
    } catch (error) {
      console.error('Error fetching support videos:', error);
      return null;
    }
  };

  const fetchAssignments = async (courseId) => {
    const canvasDomain = getCanvasDomain();
    if (!canvasDomain) {
      console.error('Unable to determine Canvas domain');
      return;
    }

    const storedToken = localStorage.getItem('apiToken');
    if (!storedToken) {
      console.error('No API token found');
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
      const assignmentsResponse = await fetch(
        `https://${canvasDomain}/api/v1/courses/${courseId}/assignments`,
        requestOptions
      );
      const assignmentsResult = await assignmentsResponse.json();

      const formattedAssignments = await Promise.all(
        assignmentsResult.map(async (assignment) => {
          try {
            const submissionResponse = await fetch(
              `https://${canvasDomain}/api/v1/courses/${courseId}/assignments/${assignment.id}/submissions/self`,
              requestOptions
            );
            if (!submissionResponse.ok) {
              throw new Error(
                `HTTP error! status: ${submissionResponse.status}`
              );
            }
            const submissionResult = await submissionResponse.json();

            return {
              name: assignment.name,
              score: submissionResult.score || 'N/A',
              pointsPossible: assignment.points_possible,
            };
          } catch (error) {
            console.error(
              `Error fetching submission for assignment ${assignment.id}:`,
              error
            );
            return {
              name: assignment.name,
              score: 'Error',
              pointsPossible: assignment.points_possible,
            };
          }
        })
      );

      setAssignments(formattedAssignments);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const fetchEnrollment = async (courseId) => {
    const canvasDomain = getCanvasDomain();
    const storedToken = localStorage.getItem('apiToken');

    if (!canvasDomain || !storedToken) {
      console.error('Missing Canvas domain or API token');
      return null;
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
        `https://${canvasDomain}/api/v1/courses/${courseId}/enrollments?user_id=self`,
        requestOptions
      );
      const enrollmentData = await response.json();
      return enrollmentData[0];
    } catch (error) {
      console.error('Error fetching enrollment data:', error);
      return null;
    }
  };

  const fetchUserProfile = async () => {
    const storedToken = localStorage.getItem('apiToken');
    const canvasDomain = getCanvasDomain();
    if (!storedToken || !canvasDomain) {
      console.error('Missing token or domain');
      return null;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/get-student-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + (chrome?.runtime?.id || '')
        },
        body: JSON.stringify({
          access_token: storedToken,
          canvas_domain: canvasDomain
        }),
        mode: 'cors',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch user profile');
      const profileData = await response.json();
      if (profileData && profileData.profile) {
        setStudentName(profileData.profile.name);
        return profileData.profile.id;
      } else {
        setStudentName('Unknown Student');
        return null;
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setStudentName('Unknown Student');
      return null;
    }
  };

  const fetchVideoRecommendations = async (userId, courseId) => {
    try {
      const studentIdStr = String(userId);
      const storedToken = localStorage.getItem('apiToken');
      const baseUrl = getCanvasDomain();
      console.log('Debug - Sending request with:', { student_id: studentIdStr, course_id: courseId, access_token: storedToken, link: baseUrl });
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          url: `${BACKEND_URL}/get-assessment-videos`,
          method: 'POST',
          body: {
            student_id: studentIdStr,
            course_id: courseId,
            access_token: storedToken,
            link: baseUrl,
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
      return response;
    } catch (error) {
      console.error('Error fetching video recommendations:', error);
      return null;
    }
  };

  const formatVideoRecommendations = (data) => {
    const formattedVideos = [];
    if (
      data &&
      data.assessment_videos &&
      Array.isArray(data.assessment_videos)
    ) {
      data.assessment_videos.forEach((item) => {
        if (item.video) {
          formattedVideos.push({
            title: item.video.title,
            channel: item.video.channel,
            reason: `Learn about ${item.topic}`,
            id: item.video.link?.split('v=')[1] || '',
            url: item.video.link,
            thumbnail: item.video.thumbnail,
            viewCount: 'N/A',
            duration: 'N/A',
            quizName: item.quiz_name,
          });
        }
      });
    }
    return formattedVideos;
  };

  const fetchQuizzes = async (courseId) => {
    const canvasDomain = getCanvasDomain();
    const storedToken = localStorage.getItem('apiToken');
    if (!canvasDomain || !storedToken) {
      console.error('Missing Canvas domain or API token');
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
      let nextUrl = `https://${canvasDomain}/api/v1/courses/${courseId}/quizzes?per_page=100`;
      while (nextUrl) {
        const response = await fetch(nextUrl, requestOptions);
        const quizzesData = await response.json();
        allQuizzes = [...allQuizzes, ...quizzesData];
        const linkHeader = response.headers.get('Link');
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<([^>]+)>; rel="next"/);
          nextUrl = nextMatch ? nextMatch[1] : null;
        } else {
          nextUrl = null;
        }
      }
      return allQuizzes;
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      return [];
    }
  };

  // Helper to get watched key
  const getWatchedKey = () => {
    const courseId = fetchCurrentCourseId();
    return `watchedVideos_${userId || 'nouser'}_${courseId || 'nocourse'}`;
  };

  // Load watched videos from localStorage
  useEffect(() => {
    const key = getWatchedKey();
    const stored = localStorage.getItem(key);
    if (stored) {
      setWatchedVideos(JSON.parse(stored));
    }
  }, [userId]);

  // Save watched videos to localStorage when changed
  useEffect(() => {
    const key = getWatchedKey();
    localStorage.setItem(key, JSON.stringify(watchedVideos));
  }, [watchedVideos]);

  // Handler for checkbox
  const handleWatchedChange = (videoId) => {
    setWatchedVideos(prev => {
      const updated = { ...prev, [videoId]: !prev[videoId] };
      return updated;
    });
  };

  // Effect 1: Fetch userId on mount
  useEffect(() => {
    const getUserId = async () => {
      const id = await fetchUserProfile();
      setUserId(id);
    };
    getUserId();
  }, []);

  // Add this helper function to fetch the student's grade from the backend
  const fetchStudentGrade = async (courseId, userId) => {
    try {
      const storedToken = localStorage.getItem('apiToken');
      const canvasDomain = getCanvasDomain();
      if (!storedToken || !canvasDomain || !courseId || !userId) {
        console.error('Missing required data for fetching student grade');
        return null;
      }
      const response = await fetch(`${BACKEND_URL}/get-student-grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + (chrome?.runtime?.id || '')
        },
        body: JSON.stringify({
          course_id: courseId,
          user_id: userId,
          access_token: storedToken,
          canvas_domain: canvasDomain
        }),
        mode: 'cors',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data && data.grade !== undefined && data.grade !== null) {
        return data.grade;
      }
      return null;
    } catch (error) {
      console.error('Error fetching student grade:', error);
      return null;
    }
  };

  // In the useEffect that runs when userId changes, fetch and set the grade
  useEffect(() => {
    const updateCourseAndData = async () => {
      const courseId = fetchCurrentCourseId();
      const storedToken = localStorage.getItem('apiToken');
      const baseUrl = getCanvasDomain();

      if (courseId) {
        try {
          // Fix double slash issue if BACKEND_URL ends in /
          const cleanUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
          
          console.log(`Checking risk status for course ${courseId}...`);
          const toggleResponse = await fetch(`${cleanUrl}/get-toggle-risk/${courseId}`);
          
          if (toggleResponse.ok) {
            const toggleData = await toggleResponse.json();
            // If the backend says toggle_risk is false, hide the UI. Default to true.
            if (toggleData && typeof toggleData.toggle_risk !== 'undefined') {
              setIsRiskEnabled(toggleData.toggle_risk);
              console.log('Risk Analysis Enabled:', toggleData.toggle_risk);
            }
          }
        } catch (error) {
          console.error('Error fetching risk toggle status:', error);
        }
      }

      console.log('Debug - Initial conditions:', {
        courseId,
        hasToken: !!storedToken,
        baseUrl,
        userId
      });

      if (!userId) {
        console.warn('StudentView: userId is missing, not calling /update-course-db');
        return;
      }

      if (courseId && storedToken && baseUrl && userId) {
        try {
          console.log('Debug - Calling /update-course-db for student');
          await fetch(`${BACKEND_URL}/update-course-db`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Origin': 'chrome-extension://' + chrome.runtime.id
            },
            body: JSON.stringify({
              course_id: courseId,
              access_token: storedToken,
              link: baseUrl,
              student_id: String(userId)
            }),
            mode: 'cors',
            credentials: 'include'
          });
        } catch (error) {
          console.error('Error calling /update-course-db:', error);
        }

        try {
          const riskToggleResponse = await fetch(`${BACKEND_URL}/get-toggle-risk/${courseId}`);
          if (riskToggleResponse.ok) {
            const riskToggleData = await riskToggleResponse.json();
            // If toggle_risk is false, hide the UI. Otherwise default to true.
            if (riskToggleData && typeof riskToggleData.toggle_risk !== 'undefined') {
              setIsRiskEnabled(riskToggleData.toggle_risk);
            }
          }
        } catch (error) {
          console.error('Error fetching risk toggle status:', error);
        }

        // Fetch and set the student's grade from the backend
        try {
          const grade = await fetchStudentGrade(courseId, userId);
          let gradeValue = 'N/A';
          if (grade && typeof grade === 'object') {
            gradeValue = grade.current_score ?? grade.final_score ?? 'N/A';
          } else if (grade !== null && grade !== undefined && grade !== '') {
            gradeValue = grade;
          }
          setClassGrade(gradeValue);
        } catch (error) {
          setClassGrade('N/A');
        }

        await fetchAssignments(courseId);
        const enrollment = await fetchEnrollment(courseId);
        if (enrollment && enrollment.user && enrollment.user.name) {
          setStudentName(enrollment.user.name);
        } else {
          setStudentName('Unknown Student');
          console.warn('StudentView: enrollment or enrollment.user is missing:', enrollment);
          // Fallback: try to get userId from localStorage or another source if possible
        }
        // Fetch quizzes for the dropdown
        const quizzesData = await fetchQuizzes(courseId);
        setQuizzes(quizzesData);
        // Then fetch video recommendations
        if (userId) {
          console.log('Debug - Fetching video recommendations for:', { userId, courseId });
          const recommendations = await fetchVideoRecommendations(userId, courseId);
          console.log('Debug - Video recommendations response:', recommendations);
          if (recommendations) {
            setRecommendedVideos(formatVideoRecommendations(recommendations));
          }
        }
      } else {
        console.log('Debug - Missing required data:', {
          hasCourseId: !!courseId,
          hasToken: !!storedToken,
          hasBaseUrl: !!baseUrl,
          hasUserId: !!userId
        });
      }
    };

    if (userId) {
      updateCourseAndData();
    } else {
      console.warn('StudentView: userId not available, skipping updateCourseAndData');
    }
  }, [userId]);

  useEffect(() => {
    const storedToken = localStorage.getItem('apiToken');
    console.log('StudentView - Stored token:', storedToken ? 'exists' : 'not found');
    if (storedToken) {
      setApiToken(storedToken);
      setHasToken(true);
    }
  }, []);

  const calculateRisk = () => {
    const slopeData = calculateSlope(assignments); // Returns [slope, grade1, grade2, ...]
    const slope = slopeData[0]; // Extract slope from index 0
    const grades = slopeData.slice(1); // Extract all the percentage grades
    const gts = normalizeGts(slope);

    const currentGrade = parseFloat(classGrade);
    if (isNaN(currentGrade)) {
      return { riskLevel: 'Medium Risk' };
    }

    // Calculate rps as the average of all the assignment scores
    const rps = grades.length > 0 
      ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length 
      : currentGrade;
    
    const cgs = currentGrade;
    console.log('cgs:', cgs);
    console.log('rps (average of last assignments):', rps);

    return calculateRiskIndex(rps, cgs, gts, currentGrade);
  };

  const getRiskLevelClass = (riskLevel) => {
    switch (riskLevel) {
      case 'High Risk':
        return 'risk-high';
      case 'Medium Risk':
        return 'risk-medium';
      case 'Low Risk':
        return 'risk-low';
      default:
        return '';
    }
  };

  const removeToken = () => {
    localStorage.removeItem('apiToken');
    setAssignments([]);
    setClassGrade('N/A');
    setSupportVideo(null);
    setHasToken(false);
    setApiToken('');
  };

  const sendTokenToServer = async (token) => {
    try {
      const response = await fetch(`${BACKEND_URL}/add-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          access_token: token,
          link: getCanvasDomain(),
        }),
        mode: 'cors',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      localStorage.setItem('apiToken', token);
    } catch (error) {
      console.error('Error sending token:', error);
    }
  };

  const refreshSupportVideo = async () => {
    const { riskLevel } = calculateRisk();
    const supportVideoData = await fetchSupportVideos(
      normalizeRiskLevel(riskLevel)
    );
    setSupportVideo(supportVideoData);
  };

  const { riskLevel } = calculateRisk();

  const validateToken = async (token) => {
    const baseUrl = getCanvasDomain();
    if (!baseUrl) {
      setTokenStatus('Error: Unable to determine Canvas URL');
      return false;
    }

    const myHeaders = new Headers();
    myHeaders.append('Authorization', `Bearer ${token}`);

    try {
      const response = await fetch(`${baseUrl}/api/v1/users/self`, {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error('Invalid token');
      }

      const data = await response.json();
      setTokenStatus('Token validated successfully!');
      return true;
    } catch (error) {
      setTokenStatus('Invalid token. Please check and try again.');
      return false;
    }
  };

  const handleTokenSubmit = async () => {
    if (!apiToken.trim()) {
      setTokenStatus('Please enter a token');
      return;
    }

    setTokenStatus('Validating token...');
    const isValid = await validateToken(apiToken);

    if (isValid) {
      localStorage.setItem('apiToken', apiToken);
      setTokenStatus('Token saved successfully!');
      // Wait a moment before reloading to show success message
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  // Sort videos: unwatched first
  const sortedVideos = recommendedVideos
    .filter(video => !selectedQuiz || video.quizName === selectedQuiz)
    .sort((a, b) => {
      const aWatched = watchedVideos[a.id] || false;
      const bWatched = watchedVideos[b.id] || false;
      return aWatched - bWatched;
    });

  return (
    <body className="student-view">
      <div className="container">
        {!hasToken && !localStorage.getItem('apiToken') ? (
          null
        ) : (
          <div>
            {isSyncingCourse && (
              <div className="sync-status">
                Syncing course data...
              </div>
            )}
            {syncError && (
              <div className="error-message">
                Error: {syncError}
              </div>
            )}
            <div className="performance-overview fade-in">
              <h2 className="overview-title" style={{ textAlign: 'center' }}>
                {`Performance Overview for ${studentName || 'Student'}`}
              </h2>
              <div className="overview-grid" style={{ justifyContent: 'center', textAlign: 'center' }}>
              
              {/* --- WRAP THIS DIV IN THE CONDITION --- */}
              {isRiskEnabled && (
                  <div>
                    <h3 className="risk-level">Risk Level</h3>
                    <p className={`risk-value ${getRiskLevelClass(riskLevel)}`}>
                      {riskLevel}
                    </p>
                  </div>
                )}
              {/* -------------------------------------- */}

              <div>
                <h3 className="risk-level">Class Grade</h3>
                <p className="risk-value average-score">
                  {classGrade === null ? 'N/A' : `${classGrade}%`}
                </p>
              </div>
              <div>
                <h3 className="risk-level">Recommended Videos</h3>
                <p className="risk-value recommended-videos">
                  {recommendedVideos.length}
                </p>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>

      <div className="tab-container">
        <button
          className={`tab-button ${activeTab === 'assignments' ? 'active' : ''
            }`}
          onClick={() => setActiveTab('assignments')}
        >
          Assignments
        </button>
        <button
          className={`tab-button ${activeTab === 'videos' ? 'active' : ''}`}
          onClick={() => setActiveTab('videos')}
        >
          Recommended Videos
        </button>
        <button
          className={`tab-button ${activeTab === 'support' ? 'active' : ''}`}
          onClick={() => setActiveTab('support')}
        >
          Support
        </button>
      </div>

      {activeTab === 'assignments' && (
        <div className="content-container slide-in">
          <h2 className="content-title">Your Assignments</h2>
          <div className="assignments-list">
            <ul>
              {assignments.map((assignment, index) => (
                <li
                  key={assignment.name}
                  className="list-item slide-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div>
                    <h3 className="item-title">{assignment.name}</h3>
                    <p
                      className={`item-score ${assignment.score === 'N/A' ||
                        assignment.score === 'Error'
                        ? ''
                        : Number(assignment.score) <
                          assignment.pointsPossible * 0.7
                          ? 'score-bad'
                          : 'score-good'
                        }`}
                    >
                      {assignment.score === 'N/A' ||
                        assignment.score === 'Error'
                        ? assignment.score
                        : `${assignment.score}/${assignment.pointsPossible}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'videos' && (
        <div className="content-container slide-in">
          <h2 className="content-title">Recommended Videos</h2>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Quiz to View Videos:</label>
            <select
              value={selectedQuiz}
              onChange={e => setSelectedQuiz(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0' }}
            >
              <option value="">Select Quiz</option>
              {quizzes.map((quiz) => (
                <option key={quiz.id} value={quiz.title || quiz.name}>
                  {quiz.title || quiz.name}
                </option>
              ))}
            </select>
          </div>
          {selectedQuiz && (
            <ul>
              {sortedVideos.map((video, index) => (
                <li
                  key={video.id}
                  className="list-item slide-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="video-card"
                    style={{ display: 'flex', textDecoration: 'none', color: 'inherit', flex: 1 }}
                  >
                    <div className="video-info">
                      <h3 className="item-title">{video.title}</h3>
                      <p className="video-channel">{video.channel}</p>
                      <p className="video-reason">{video.reason}</p>
                    </div>
                  </a>
                  {/* Watched checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: '16px' }}>
                    <input
                      type="checkbox"
                      checked={!!watchedVideos[video.id]}
                      onChange={() => handleWatchedChange(video.id)}
                      id={`watched-${video.id}`}
                      style={{ marginRight: '6px' }}
                    />
                    <label htmlFor={`watched-${video.id}`}>Watched</label>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'support' && (
        <div className="content-container slide-in">
          <h2 className="content-title">Support Resources</h2>

          {supportVideo && (
            <div className="support-video-container">
              <div className="support-video-card">
                <div className="support-video-info">
                  <div className="video-title-row">
                    <h3 className="support-video-title">
                      {supportVideo.title}
                    </h3>
                    <button
                      className="refresh-icon-button"
                      onClick={refreshSupportVideo}
                      title="Get another video"
                    >
                      ↻
                    </button>
                  </div>
                  <p className="support-video-channel">
                    {supportVideo.channelTitle}
                  </p>
                </div>
                <a
                  href={supportVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="youtube-link"
                >
                  <img
                    className="support-video-thumbnail"
                    src={`https://img.youtube.com/vi/${supportVideo.videoId}/mqdefault.jpg`}
                    alt="Video thumbnail"
                  />
                </a>
              </div>
            </div>
          )}

          <div className="support-links-container">
            <div className="support-links-list">
              <ul>
                {[
                  {
                    href: 'https://caps.sdes.ucf.edu/',
                    text: 'UCF CAPS - Counseling Services',
                  },
                  {
                    href: 'https://scs.sdes.ucf.edu/',
                    text: 'Student Care Services',
                  },
                  {
                    href: 'https://www.sdes.ucf.edu/asc/',
                    text: 'Academic Success Coaching (ASC)',
                  },
                  {
                    href: 'https://cares.sdes.ucf.edu/',
                    text: 'UCF Cares - Student Support',
                  },
                ].map((link, index) => (
                  <li key={index} className="support-link-item">
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="support-link"
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </body>
  );
};

export default StudentView;
