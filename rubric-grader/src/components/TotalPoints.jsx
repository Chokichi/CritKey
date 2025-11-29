import { Paper, Stack, Typography, Box, Alert } from '@mui/material';
import useRubricStore from '../store/rubricStore';
import useCanvasStore from '../store/canvasStore';

const TotalPoints = () => {
  const { getTotalPoints, currentRubric } = useRubricStore();
  const { selectedSubmission, selectedAssignment } = useCanvasStore();

  if (!currentRubric) {
    return null;
  }

  const { earned, possible } = getTotalPoints();
  const percentage = possible > 0 ? ((earned / possible) * 100).toFixed(1) : 0;

  // Determine submission state
  const hasCanvasGrade = selectedSubmission?.canvasGrade && 
                         !selectedSubmission?.isAutoGradedZero &&
                         !selectedSubmission?.stagedGrade;
  const hasStagedGrade = selectedSubmission?.stagedGrade !== null && 
                         selectedSubmission?.stagedGrade !== undefined;
  const hasRubricScore = selectedSubmission?.rubricScore !== null && 
                         selectedSubmission?.rubricScore !== undefined;

  // Determine color and message
  let backgroundColor = 'primary.main';
  let message = null;
  let displayScore = earned;
  let displayPossible = possible;

  if (hasStagedGrade) {
    // Green for staged (ready to upload)
    backgroundColor = 'success.main';
    message = 'Feedback generated, waiting for upload.';
  } else if (hasCanvasGrade) {
    // Orange/warning for existing Canvas grade
    backgroundColor = 'warning.main';
    // Parse Canvas grade to show
    const canvasGradeStr = selectedSubmission.canvasGrade;
    if (canvasGradeStr && canvasGradeStr.includes('/')) {
      const [canvasEarned, canvasPossible] = canvasGradeStr.split('/').map(s => parseFloat(s.trim()));
      if (!isNaN(canvasEarned) && !isNaN(canvasPossible)) {
        displayScore = canvasEarned;
        displayPossible = canvasPossible;
      }
    }
    message = 'Warning: Student already has a grade posted on Canvas';
  } else if (hasRubricScore) {
    // Blue (default) for rubric graded but not staged
    backgroundColor = 'primary.main';
  } else {
    // Blue (default) for ungraded
    backgroundColor = 'primary.main';
  }

  return (
    <Paper
      elevation={2}
      sx={{
        p: 1.5,
        mb: 2,
        backgroundColor: backgroundColor,
        color: 'primary.contrastText',
      }}
    >
      <Stack spacing={1}>
        <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
          Total Score
        </Typography>
        <Box>
          <Typography variant="h3" component="span" fontWeight="bold">
            {displayScore}
          </Typography>
          <Typography variant="h5" component="span" sx={{ opacity: 0.8 }}>
            {' '}/ {displayPossible}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {displayPossible > 0 ? ((displayScore / displayPossible) * 100).toFixed(1) : 0}%
        </Typography>
        {message && (
          <Alert 
            severity={hasStagedGrade ? 'success' : 'warning'} 
            sx={{ 
              mt: 1,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'inherit',
              '& .MuiAlert-icon': {
                color: 'inherit',
              },
            }}
          >
            <Typography variant="caption">
              {message}
            </Typography>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
};

export default TotalPoints;

