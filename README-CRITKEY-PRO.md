# CritKey Pro - Canvas Integration

CritKey Pro extends CritKey with Canvas LMS integration, allowing you to grade assignments directly from Canvas with a built-in PDF viewer.

## Features

- **Canvas API Integration**: Connect to Canvas LMS to fetch courses, assignments, and student submissions
- **PDF Viewer**: Built-in PDF viewer with zoom controls for viewing student submissions
- **Quick Navigation**: Keyboard shortcuts to quickly move between student submissions
- **Direct Grade Submission**: Submit grades and feedback directly back to Canvas
- **Auto-Advance**: Automatically move to the next submission after submitting a grade

## Setup

### 1. Backend Server

The backend server acts as a proxy between the frontend and Canvas API to handle authentication and CORS.

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your Canvas API base URL if needed
npm start
```

The server will run on `http://localhost:3001` by default.

### 2. Frontend

```bash
cd rubric-grader
npm install
npm run dev
```

### 3. Canvas API Token

1. Log in to Canvas
2. Go to **Account > Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Give it a description (e.g., "CritKey Pro")
6. Copy the generated token

### 4. Connect to Canvas

1. In the CritKey Pro interface, find the **Canvas Integration** panel
2. Enter your Canvas API token
3. Adjust the Canvas API Base URL if using a custom Canvas instance
4. Click **Save & Connect**
5. Select a course, then an assignment
6. Submissions with PDF attachments will automatically load

## Usage

### Layout

The interface is divided into three panels:

- **Left Panel**: Canvas integration, rubric setup, and total points
- **Middle Panel**: PDF viewer (appears when a submission is selected)
- **Right Panel**: Rubric grading interface and feedback generator

### Keyboard Shortcuts

**Rubric Grading:**
- `1-9`: Select rubric level
- `N` or `→`: Next criterion
- `P` or `←`: Previous criterion
- `C`: Focus comment field
- `Esc`: Unfocus comment field

**Submission Navigation:**
- `Ctrl+Shift+→` (Mac: `Cmd+Shift+→`): Next submission
- `Ctrl+Shift+←` (Mac: `Cmd+Shift+←`): Previous submission

**Actions:**
- `Ctrl+Enter` (Mac: `Cmd+Enter`): Generate feedback
- `Ctrl+R` (Mac: `Cmd+R`): Reset rubric for next assignment

### PDF Viewer Controls

- **Zoom In/Out**: Use the zoom slider or +/- buttons
- **Reset Zoom**: Click the reset zoom button
- **Page Navigation**: Use arrow buttons to navigate between pages
- **Submission Navigation**: Use the left/right arrow buttons at the top to switch between students

### Grading Workflow

1. **Select Course & Assignment**: Use the Canvas Integration panel to select a course and assignment
2. **View Submission**: The first submission's PDF will automatically load in the PDF viewer
3. **Grade with Rubric**: Use keyboard shortcuts or click to select rubric levels and add comments
4. **Generate Feedback**: Press `Ctrl+Enter` or click "Generate Feedback"
5. **Submit to Canvas**: Click "Submit to Canvas" in the feedback dialog
6. **Auto-Advance**: After submitting, the app will automatically move to the next submission and reset the rubric

## Architecture

### Backend (`/server`)

- Express.js server
- Proxies Canvas API requests
- Handles file downloads for CORS
- Endpoints for courses, assignments, submissions, and grade submission

### Frontend (`/rubric-grader`)

- **Canvas Store** (`src/store/canvasStore.js`): Manages Canvas state and API calls
- **PDF Viewer** (`src/components/PDFViewer.jsx`): PDF.js-based viewer with zoom controls
- **Canvas Integration** (`src/components/CanvasIntegration.jsx`): UI for connecting to Canvas and selecting courses/assignments
- **Feedback Generator**: Extended to support Canvas grade submission

## Development

### Running Both Servers

You'll need both the backend server and frontend dev server running:

**Terminal 1 (Backend):**
```bash
cd server
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd rubric-grader
npm run dev
```

### Environment Variables

The backend server uses a `.env` file for configuration:

```
CANVAS_API_BASE=https://canvas.instructure.com/api/v1
PORT=3001
```

For custom Canvas instances, change `CANVAS_API_BASE` to your school's Canvas URL.

## Security Features

CritKey Pro implements multiple layers of security to protect your Canvas API token:

### Token Protection

**AES-256 Encryption**
- All Canvas API tokens are encrypted using military-grade AES-256 encryption before storage
- Encryption key is generated per browser session and stored separately
- Prevents trivial token theft via browser extensions or direct storage access

**Session Storage**
- Tokens are stored in `sessionStorage` instead of persistent `localStorage`
- Data is automatically cleared when you close your browser
- Reduces the window of exposure compared to persistent storage

**Authorization Headers**
- API tokens are sent via HTTP Authorization headers (RFC 6750 Bearer token format)
- Never included in URLs or query parameters
- Prevents token leakage through browser history, server logs, or referrer headers

### Server Security

**Input Validation**
- All API endpoints validate input parameters using express-validator
- Prevents injection attacks and malformed requests
- Rejects invalid course IDs, assignment IDs, and user IDs

**Rate Limiting**
- 100 requests per 15 minutes per IP address
- Prevents brute force attacks and API abuse
- Returns clear rate limit headers for monitoring

**Error Sanitization**
- Detailed error messages logged server-side only
- Generic error messages returned to clients
- Prevents information leakage about server internals

**Security Headers (Helmet)**
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Hides X-Powered-By header
- Prevents common web vulnerabilities

**CORS Configuration**
- Restricted to `http://localhost:5173` (Vite dev server)
- Blocks unauthorized cross-origin requests
- Can be configured via `FRONTEND_URL` environment variable

### User Controls

**Privacy Notice**
- Access via "Privacy & Security" button in Setup
- Explains what data is collected and how it's protected
- Details encryption, storage, and data usage policies

**Clear All Data**
- Accessible via Setup drawer
- Immediately deletes all encrypted session data
- Use if you suspect token compromise or before sharing your device

### Best Practices

✅ **DO:**
- Generate a dedicated Canvas API token for CritKey Pro
- Regenerate your token if you suspect it's been compromised
- Close your browser when done grading to clear session data
- Use the "Clear All Data" feature before sharing your device

❌ **DON'T:**
- Share your Canvas API token with anyone
- Commit your token or `.env` files to version control
- Use the same token across multiple applications
- Leave your browser open unattended with CritKey Pro running

### Localhost Security Note

This application is designed for **localhost-only** use. Since all traffic stays on your machine:
- HTTP is used instead of HTTPS (no network to intercept)
- The backend server should never be exposed to the network
- All security measures focus on preventing token theft from storage/logs rather than network attacks

For production deployment, you would need to add:
- HTTPS with valid SSL certificates
- Proper authentication (OAuth 2.0)
- Database-backed session management
- Additional network security measures

## Troubleshooting

**"Failed to fetch courses"**
- Check that your API token is correct
- Verify the Canvas API base URL is correct for your instance
- Ensure the backend server is running on port 3001

**PDF not loading**
- Check browser console for CORS errors
- Verify the submission has a PDF attachment
- Ensure the backend server is running and can proxy the file

**Grade submission fails**
- Verify you have permission to grade the assignment in Canvas
- Check that the assignment allows grade submission via API
- Review the browser console for error messages

