# CritKey Pro - Security Testing Checklist

This document provides a comprehensive checklist for testing the security features implemented in CritKey Pro.

## Pre-Testing Setup

- [ ] Start backend server: `cd server && npm run dev`
- [ ] Start frontend: `cd rubric-grader && npm run dev`
- [ ] Open browser DevTools (F12)
- [ ] Navigate to Application tab (for storage inspection)
- [ ] Navigate to Network tab (for request inspection)

---

## 1. Token Encryption (sessionStorage)

### ✅ Verify Encrypted Storage

**Steps:**
1. Enter a Canvas API token in the Canvas Integration panel
2. Click "Save & Connect"
3. Open DevTools → Application → Session Storage → `http://localhost:5173`
4. Find the `canvas_api_token` key

**Expected Results:**
- [ ] Token value is NOT plaintext (should be encrypted gibberish)
- [ ] Token cannot be read directly from sessionStorage
- [ ] An `_ek` (encryption key) entry exists in sessionStorage

**Test Decryption:**
1. Open browser console
2. Run: `sessionStorage.getItem('canvas_api_token')`
3. Run: `sessionStorage.getItem('_ek')`

**Expected Results:**
- [ ] Both values are encrypted/random strings
- [ ] Values are different from the original token

---

## 2. Authorization Headers (No Tokens in URLs)

### ✅ Verify Token Not in URLs

**Steps:**
1. With API token configured, navigate through Canvas integration:
   - Select a course
   - Select an assignment
   - View a submission
2. Open DevTools → Network tab
3. Filter for `localhost:3001` requests
4. Inspect each request's URL and query parameters

**Expected Results:**
- [ ] `/api/courses` - No `apiToken` in URL
- [ ] `/api/courses/:courseId/assignments` - No `apiToken` in URL
- [ ] `/api/courses/:courseId/assignments/:assignmentId/submissions` - No `apiToken` in URL
- [ ] `/api/proxy-file` - No `apiToken` in URL
- [ ] Browser history shows no API tokens when reviewing visited URLs

### ✅ Verify Authorization Header Present

**Steps:**
1. In Network tab, click on any API request
2. Go to "Headers" section
3. Scroll to "Request Headers"

**Expected Results:**
- [ ] `Authorization: Bearer <token>` header is present
- [ ] Token value matches your Canvas API token (not encrypted in transit)
- [ ] No other headers contain the token

---

## 3. Session Storage (Auto-Clear on Close)

### ✅ Verify Data Cleared on Browser Close

**Steps:**
1. Configure Canvas API token
2. Verify token is stored (DevTools → Application → Session Storage)
3. **Close the entire browser** (not just the tab)
4. Reopen browser and navigate to `http://localhost:5173`
5. Check Session Storage again

**Expected Results:**
- [ ] Session Storage is empty (all data cleared)
- [ ] Canvas integration shows "Not connected"
- [ ] No token or encryption key remains

**Note:** Refreshing the tab or closing just the tab will NOT clear sessionStorage. You must close the entire browser.

---

## 4. Rate Limiting

### ✅ Verify Rate Limit Enforcement

**Steps:**
1. Open browser console
2. Run this script to send 101 requests rapidly:
```javascript
for (let i = 0; i < 101; i++) {
  fetch('http://localhost:3001/api/courses', {
    headers: {
      'Authorization': 'Bearer test-token',
      'Content-Type': 'application/json'
    }
  }).then(r => console.log(`Request ${i}: ${r.status}`));
}
```

**Expected Results:**
- [ ] First ~100 requests return status 401 or 200 (depending on token validity)
- [ ] Request #101+ returns status 429 (Too Many Requests)
- [ ] Error message: "Too many requests from this IP, please try again later"
- [ ] Rate limit resets after 15 minutes

**Check Rate Limit Headers:**
```javascript
fetch('http://localhost:3001/api/courses', {
  headers: { 'Authorization': 'Bearer test' }
}).then(r => {
  console.log('RateLimit-Limit:', r.headers.get('RateLimit-Limit'));
  console.log('RateLimit-Remaining:', r.headers.get('RateLimit-Remaining'));
  console.log('RateLimit-Reset:', r.headers.get('RateLimit-Reset'));
});
```

**Expected Results:**
- [ ] `RateLimit-Limit: 100`
- [ ] `RateLimit-Remaining` decreases with each request
- [ ] `RateLimit-Reset` shows timestamp when limit resets

---

## 5. Input Validation

### ✅ Verify Invalid Parameters Rejected

**Test Invalid Course ID:**
```javascript
fetch('http://localhost:3001/api/courses/abc/assignments', {
  headers: { 'Authorization': 'Bearer test' }
}).then(r => r.json()).then(console.log);
```

**Expected Results:**
- [ ] Status: 400 Bad Request
- [ ] Error: "Invalid request parameters"

**Test Invalid Assignment ID:**
```javascript
fetch('http://localhost:3001/api/courses/123/assignments/xyz/submissions', {
  headers: { 'Authorization': 'Bearer test' }
}).then(r => r.json()).then(console.log);
```

**Expected Results:**
- [ ] Status: 400 Bad Request
- [ ] Error: "Invalid request parameters"

**Test SQL Injection Attempt:**
```javascript
fetch('http://localhost:3001/api/courses/1%20OR%201=1/assignments', {
  headers: { 'Authorization': 'Bearer test' }
}).then(r => r.json()).then(console.log);
```

**Expected Results:**
- [ ] Status: 400 Bad Request
- [ ] Injection attempt blocked by validation

**Test XSS Attempt in Body:**
```javascript
fetch('http://localhost:3001/api/courses/123/assignments/456/submissions/789', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer test',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    comment: '<script>alert("XSS")</script>',
    posted_grade: '85'
  })
}).then(r => r.json()).then(console.log);
```

**Expected Results:**
- [ ] Request accepted (validation allows strings)
- [ ] But: Script tags should be sanitized by Canvas, not executed

---

## 6. Error Sanitization

### ✅ Verify No Sensitive Info in Errors

**Test Invalid Token Error:**
```javascript
fetch('http://localhost:3001/api/courses', {
  headers: { 'Authorization': 'Bearer invalid_token_12345' }
}).then(r => r.json()).then(console.log);
```

**Expected Results:**
- [ ] Generic error message (e.g., "Failed to fetch courses")
- [ ] No Canvas API error details exposed to client
- [ ] No internal server paths or stack traces
- [ ] Server console shows detailed error (for debugging)

**Test Missing Authorization:**
```javascript
fetch('http://localhost:3001/api/courses')
  .then(r => r.json()).then(console.log);
```

**Expected Results:**
- [ ] Status: 401 Unauthorized
- [ ] Error: "Authorization required"
- [ ] No hints about header format or token structure

---

## 7. Security Headers (Helmet)

### ✅ Verify Security Headers Present

**Steps:**
1. Make any API request
2. In Network tab, click the request
3. Go to "Headers" → "Response Headers"

**Expected Results:**
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-Powered-By` header is **absent** (not `Express`)
- [ ] No `Strict-Transport-Security` header (HSTS disabled for HTTP)

---

## 8. CORS Configuration

### ✅ Verify CORS Restrictions

**Test Allowed Origin:**
```javascript
// Run from http://localhost:5173 console
fetch('http://localhost:3001/api/courses', {
  headers: { 'Authorization': 'Bearer test' }
}).then(r => console.log('Status:', r.status));
```

**Expected Results:**
- [ ] Request succeeds (CORS allows localhost:5173)
- [ ] `Access-Control-Allow-Origin: http://localhost:5173` header present

**Test Blocked Origin (Manual Test):**
1. Create a simple HTML file on a different origin (e.g., `file://` or `http://localhost:8080`)
2. Try to fetch `http://localhost:3001/api/courses`

**Expected Results:**
- [ ] CORS error in console: "blocked by CORS policy"
- [ ] Request fails due to origin mismatch

---

## 9. Clear All Data Feature

### ✅ Verify Data Deletion

**Steps:**
1. Configure Canvas API token
2. Verify token exists in sessionStorage
3. Click "Setup" → "Clear All Data"
4. Confirm deletion in dialog
5. Check sessionStorage again

**Expected Results:**
- [ ] All sessionStorage entries cleared (including `canvas_api_token` and `_ek`)
- [ ] Canvas integration shows "Not connected"
- [ ] User must re-enter token to use Canvas features

---

## 10. Privacy Notice

### ✅ Verify Documentation Accuracy

**Steps:**
1. Click "Setup" → "Privacy & Security"
2. Read through the privacy notice

**Expected Results:**
- [ ] Describes AES-256 encryption ✓
- [ ] Mentions sessionStorage (not localStorage) ✓
- [ ] Explains Authorization headers ✓
- [ ] Lists rate limiting ✓
- [ ] Shows data is only sent to localhost server and Canvas ✓
- [ ] Explains automatic deletion on browser close ✓
- [ ] No mention of HTTPS (since we use HTTP for localhost) ✓

---

## 11. End-to-End Token Flow

### ✅ Complete Token Lifecycle Test

**Steps:**
1. **Store:** Enter Canvas API token → Save
2. **Encrypt:** Verify encrypted in sessionStorage
3. **Use:** Fetch courses/assignments
4. **Verify Headers:** Check Authorization header in Network tab
5. **Clear:** Use "Clear All Data"
6. **Confirm:** Verify sessionStorage empty

**Expected Results:**
- [ ] Token never visible in plaintext in storage
- [ ] Token never appears in URLs
- [ ] Token sent in Authorization header
- [ ] Token cleared on demand
- [ ] No token remnants after clearing

---

## 12. Browser History Safety

### ✅ Verify No Token Leakage

**Steps:**
1. Use Canvas integration to browse courses/assignments
2. Open browser history (Ctrl+H / Cmd+Y)
3. Search for your Canvas API token value

**Expected Results:**
- [ ] Token does NOT appear in any URL in history
- [ ] URLs are clean: `http://localhost:3001/api/courses`
- [ ] No query parameters contain tokens

---

## Summary Checklist

After completing all tests above:

- [ ] All tokens are encrypted in sessionStorage
- [ ] No tokens in URLs or browser history
- [ ] Authorization headers used for all API requests
- [ ] Rate limiting prevents abuse (100 req/15min)
- [ ] Input validation rejects malformed requests
- [ ] Error messages sanitized (no sensitive info leaked)
- [ ] Security headers present (helmet)
- [ ] CORS restricted to localhost:5173
- [ ] Clear All Data feature works correctly
- [ ] Privacy Notice is accurate and helpful
- [ ] Session data auto-clears on browser close
- [ ] HTTP used for localhost (no unnecessary HTTPS overhead)

---

## Failed Tests

If any tests fail, document below:

### Test Name:
**Issue:**
**Expected:**
**Actual:**
**Fix:**

---

## Security Audit Summary

**Auditor:**
**Date:**
**Overall Status:** ☐ Pass ☐ Fail ☐ Needs Revision
**Notes:**
