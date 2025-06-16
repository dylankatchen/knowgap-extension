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

  if (lastFiveAssignments.length < 2) {
    return 0;
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
  return slope;
};

const normalizeGts = (slope, minSlope = -10, maxSlope = 10) => {
  return ((slope - minSlope) / (maxSlope - minSlope)) * 100;
};

const calculateRiskIndex = (rps, cgs, gts, currentScore) => {
  if (currentScore <= 69) {
    return { riskLevel: 'High Risk' };
  }

  const weights = {
    rps: 0.3,
    cgs: 0.55,
    gts: 0.15,
  };

  const riskIndex = weights.rps * rps + weights.cgs * cgs + weights.gts * gts;

  let riskLevel;
  if (riskIndex > 70) {
    riskLevel = 'Low Risk';
  } else if (riskIndex > 40 && riskIndex <= 70) {
    riskLevel = 'Medium Risk';
  } else {
    riskLevel = 'High Risk';
  }

  return { riskLevel };
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

  const imgs = { youtube };

  const getCanvasBaseUrl = () => {
    const url = window.location.href;
    const match = url.match(/(https?:\/\/[^\/]+)/);
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
    const baseUrl = getCanvasBaseUrl();
    if (!baseUrl) {
      console.error('Unable to determine Canvas base URL');
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
        `${baseUrl}/api/v1/courses/${courseId}/assignments`,
        requestOptions
      );
      const assignmentsResult = await assignmentsResponse.json();

      const formattedAssignments = await Promise.all(
        assignmentsResult.map(async (assignment) => {
          try {
            const submissionResponse = await fetch(
              `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignment.id}/submissions/self`,
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
    const baseUrl = getCanvasBaseUrl();
    const storedToken = localStorage.getItem('apiToken');

    if (!baseUrl || !storedToken) {
      console.error('Missing base URL or API token');
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
        `${baseUrl}/api/v1/courses/${courseId}/enrollments?user_id=self`,
        requestOptions
      );
      const enrollmentData = await response.json();
      return enrollmentData[0].grades.current_score;
    } catch (error) {
      console.error('Error fetching enrollment data:', error);
      return null;
    }
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
      setStudentName(profileData.name);
      return profileData.id;
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchVideoRecommendations = async (userId, courseId) => {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          url: `${BACKEND_URL}/get-assessment-videos`,
          method: 'POST',
          body: {
            user_id: userId,
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

  const updateCourseContext = async (courseId, assignments, grade, name) => {
    try {
      const contextResponse = await fetch(`${BACKEND_URL}/update-course-context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          course_id: courseId,
          course_context: {
            assignments: assignments,
            class_grade: grade,
            student_name: name
          }
        }),
        mode: 'cors',
        credentials: 'include'
      });

      const contextData = await contextResponse.json();
      if (contextData.status === 'Error') {
        throw new Error(contextData.message);
      }

      return {
        status: 'success',
        message: 'Course context updated successfully'
      };
    } catch (error) {
      console.error('Error updating course context:', error);
      setSyncError(error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  };

  useEffect(() => {
    const updateCourseAndData = async () => {
      const courseId = fetchCurrentCourseId();
      const storedToken = localStorage.getItem('apiToken');
      const baseUrl = getCanvasBaseUrl();

      if (courseId && storedToken && baseUrl) {
        await fetchAssignments(courseId);
        const enrollment = await fetchEnrollment(courseId);
        if (enrollment) {
          setStudentName(enrollment.user.name);
        }
        const userId = await fetchUserProfile();
        let recommendations = null;
        if (userId) {
          recommendations = await fetchVideoRecommendations(userId, courseId);
          if (recommendations) {
            setRecommendedVideos(formatVideoRecommendations(recommendations));
          }
        }

        // Only call updateCourseContext if all required data is present
        if (assignments.length > 0 && classGrade !== 'N/A' && studentName) {
          try {
            await updateCourseContext(courseId, assignments, classGrade, studentName);
          } catch (error) {
            // Log error but do not set syncError if main data is present
            console.error('Error updating course context:', error);
          }
        }
      }
    };

    updateCourseAndData();
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('apiToken');
    console.log('StudentView - Stored token:', storedToken ? 'exists' : 'not found');
    if (storedToken) {
      setApiToken(storedToken);
      setHasToken(true);
    }
  }, []);

  const calculateRisk = () => {
    const slope = calculateSlope(assignments);
    const gts = normalizeGts(slope);

    const currentGrade = parseFloat(classGrade);
    if (isNaN(currentGrade)) {
      return { riskLevel: 'Medium Risk' };
    }

    const rps = currentGrade;
    const cgs = currentGrade;

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
          link: getCanvasBaseUrl(),
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
    const baseUrl = getCanvasBaseUrl();
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

  return (
    <body className="student-view">
      <div className="container">
        {!hasToken && !localStorage.getItem('apiToken') ? (
          <div className="api-token-input">
            <h3>Enter Your Canvas API Token</h3>
            <p className="token-instructions">
              To access your course data, please enter your Canvas API token.
              <a
                href="https://community.canvaslms.com/t5/Student-Guide/How-do-I-manage-API-access-tokens-as-a-student/ta-p/273"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get your token here
              </a>
            </p>
            <input
              type="password"
              placeholder="Paste your API token here"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
            <button onClick={handleTokenSubmit}>
              Save Token
            </button>
            {tokenStatus && (
              <p className={`token-status ${tokenStatus.includes('successfully') ? 'success' : 'error'}`}>
                {tokenStatus}
              </p>
            )}
          </div>
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
              <h2 className="overview-title">Your Performance Overview</h2>
              <h3>{studentName}</h3>
              <div className="overview-grid">
                <div>
                  <h3 className="risk-level">Risk Level</h3>
                  <p className={`risk-value ${getRiskLevelClass(riskLevel)}`}>
                    {riskLevel}
                  </p>
                </div>
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
          <ul>
            {recommendedVideos.map((video, index) => (
              <li
                key={video.id}
                className="list-item slide-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="video-card">
                  <div className="video-info">
                    <h3 className="item-title">{video.title}</h3>
                    <p className="video-channel">{video.channel}</p>
                    <p className="video-reason">{video.reason}</p>
                  </div>
                </div>
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="youtube-link"
                >
                  <img src={video.thumbnail} alt="youtube-logo" />
                </a>
              </li>
            ))}
          </ul>
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
