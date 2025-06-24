import React, { useState, useEffect } from 'react';
import './Popup.css';
import StudentView from './Studentview';
import InstructorView from './InstructorView';

const FEEDBACK_URL = "https://docs.google.com/forms/d/e/1FAIpQLSejLTcgwl2-JStfV-nAWQfJW1WfGRp4AnEDd5BuVf8MOvShXQ/viewform?usp=sharing&ouid=102318012117186033401";
const BACKEND_URL = process.env.BACKEND_URL;

const Popup = () => {
  const [userRole, setUserRole] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [isSyncingCourse, setIsSyncingCourse] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [tokenStatus, setTokenStatus] = useState('');

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

  const loadCourse = async (courseId, accessToken, link) => {
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

      const dbData = await dbResponse.json();
      if (dbData.status === 'Error') {
        throw new Error(dbData.message);
      }

      return {
        status: 'success',
        message: 'Course database updated successfully'
      };
    } catch (error) {
      console.error('Error updating course database:', error);
      setSyncError(error.message);
      return {
        status: 'error',
        message: error.message
      };
    } finally {
      setIsSyncingCourse(false);
    }
  };

  const updateCourseContext = async (courseId, role) => {
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
            user_role: role
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
    const fetchUserRole = async () => {
      const baseUrl = getCanvasBaseUrl();
      const courseId = fetchCurrentCourseId();
      const storedToken = localStorage.getItem('apiToken');

      if (!baseUrl || !courseId || !storedToken) {
        console.error('Missing base URL, course ID, or API token');
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
          `${baseUrl}/api/v1/courses/${courseId}/enrollments?user_id=self`,
          requestOptions
        );
        const enrollmentData = await response.json();
        const role = enrollmentData[0].type;
        setUserRole(role);

        // Only instructors should call loadCourse
        if (role === 'TeacherEnrollment') {
          await loadCourse(courseId, storedToken, baseUrl);
        }

        // Then update the course context with the role
        await updateCourseContext(courseId, role);
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    };

    if (localStorage.getItem('apiToken')) {
      fetchUserRole();
    }
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('apiToken');
    console.log('Stored token:', storedToken ? 'exists' : 'not found');
    if (storedToken) {
      setApiToken(storedToken);
    }
  }, []);

  const removeToken = () => {
    localStorage.removeItem('apiToken');
    setApiToken('');
    setUserRole('');
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

  const handleRefreshCourse = async () => {
    const courseId = fetchCurrentCourseId();
    const storedToken = localStorage.getItem('apiToken');
    const baseUrl = getCanvasBaseUrl();

    if (courseId && storedToken && baseUrl) {
      const result = await loadCourse(courseId, storedToken, baseUrl);
      if (result.status === 'success') {
        window.location.reload(); // Reload to refresh all data
      }
    }
  };

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', margin: '0 auto', ...( !localStorage.getItem('apiToken') && !userRole ? { maxWidth: '600px', maxHeight: '200px', minHeight: '120px', justifyContent: 'center' } : {} ) }}>
      <div style={{ flex: 1 }}>
        {!localStorage.getItem('apiToken') && !userRole ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '120px', width: '100%' }}>
              <input
                type="password"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                placeholder="Enter your Canvas API token"
                className="token-input"
                style={{ marginBottom: '1rem', width: '100%', maxWidth: '250px', marginLeft: 'auto', marginRight: 'auto', display: 'block' }}
              />
              {tokenStatus && (
                <p className={`token-status ${tokenStatus.includes('successfully') ? 'success' : 'error'}`}
                  style={{ textAlign: 'center' }}>
                  {tokenStatus}
                </p>
              )}
              <div style={{ width: '100%', maxWidth: '250px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                <button
                  onClick={handleTokenSubmit}
                  className="token-submit"
                  style={{ marginLeft: 0 }}
                >
                  Submit Token
                </button>
                <button
                  className="feedback-button px-4 py-2 rounded"
                  onClick={() => window.open(FEEDBACK_URL, "_blank")}
                  style={{ marginRight: 0 }}
                >
                  Give Feedback
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
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
            {userRole === 'TeacherEnrollment' ? (
              <>
                <InstructorView />
              </>
            ) : userRole === 'StudentEnrollment' ? (
              <>
                <StudentView />
              </>
            ) : (
              <p style={{ textAlign: 'center', marginTop: '2rem', fontWeight: 500 }}>
                Token Accepted! Navigate to a course to access GenAiPrime.
              </p>
            )}
          </>
        )}
      </div>
      <div style={{ width: '100%', display: localStorage.getItem('apiToken') ? 'flex' : 'block', justifyContent: localStorage.getItem('apiToken') ? 'flex-end' : undefined, alignItems: 'center', marginTop: localStorage.getItem('apiToken') ? 0 : undefined }}>
        {localStorage.getItem('apiToken') && (
          <button onClick={removeToken} className="token-remove">
            Remove Token
          </button>
        )}
        {localStorage.getItem('apiToken') && (
          <button
            className="feedback-button px-4 py-2 rounded"
            onClick={() => window.open(FEEDBACK_URL, "_blank")}
            style={{ marginLeft: 'auto' }}
          >
            Give Feedback
          </button>
        )}
      </div>
    </div>
  );
};

export default Popup;
