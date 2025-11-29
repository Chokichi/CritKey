# CritKey Pro Server

Backend server for CritKey Pro Canvas integration. This server acts as a proxy between the frontend and Canvas LMS API to handle authentication and CORS issues.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Configure your Canvas API base URL in `.env`:
   - For Canvas Cloud: `https://canvas.instructure.com/api/v1`
   - For custom Canvas instance: `https://your-school.instructure.com/api/v1`

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:3001` by default.

## API Endpoints

### GET `/api/courses`
Fetch all courses for the authenticated user.

**Query Parameters:**
- `apiToken` (required): Canvas API token

### GET `/api/courses/:courseId/assignments`
Fetch all assignments for a course.

**Query Parameters:**
- `apiToken` (required): Canvas API token

### GET `/api/courses/:courseId/assignments/:assignmentId/submissions`
Fetch all submissions for an assignment.

**Query Parameters:**
- `apiToken` (required): Canvas API token

### GET `/api/courses/:courseId/assignments/:assignmentId/submissions/:userId`
Fetch a specific submission.

**Query Parameters:**
- `apiToken` (required): Canvas API token

### PUT `/api/courses/:courseId/assignments/:assignmentId/submissions/:userId`
Update a submission (post grade and feedback).

**Body:**
```json
{
  "apiToken": "your-token",
  "posted_grade": "85/100",
  "comment": "Feedback text here"
}
```

### GET `/api/proxy-file`
Proxy file downloads to handle CORS.

**Query Parameters:**
- `url` (required): File URL to download
- `apiToken` (required): Canvas API token

## Getting a Canvas API Token

1. Log in to Canvas
2. Go to **Account > Settings**
3. Scroll down to **Approved Integrations**
4. Click **+ New Access Token**
5. Give it a description (e.g., "CritKey Pro")
6. Copy the generated token (you won't be able to see it again!)

## Security Notes

- The API token is sent as a query parameter or in the request body. In production, consider using a more secure authentication method.
- Never commit your `.env` file or API tokens to version control.
- The server should only be accessible from localhost in development.

