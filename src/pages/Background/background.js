// Add initialization logging
console.log('Background script initialized');

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'API_REQUEST') {
    const { url, method, headers, body } = request;
    
    // Return true to indicate we will send a response asynchronously
    (async () => {
      try {
        const requestBody = JSON.stringify(body);
        
        const response = await fetch(url, {
          method: method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': 'chrome-extension://' + chrome.runtime.id,
            ...headers
          },
          body: requestBody,
          mode: 'cors',
          credentials: 'include'
        });
        
        const responseText = await response.text();
        
        // Try to parse as JSON
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}...`);
        }
        
        // Ensure we're sending a response
        if (sendResponse) {
          sendResponse({ success: true, data });
        }
      } catch (error) {
        // Ensure we're sending an error response
        if (sendResponse) {
          sendResponse({ success: false, error: error.message });
        }
      }
    })();

    return true; // Will respond asynchronously
  } else {
    sendResponse({ success: false, error: 'Unknown message type' });
    return false;
  }
}); 