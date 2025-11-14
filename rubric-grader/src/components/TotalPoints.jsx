import { Paper, Stack, Typography, Box } from '@mui/material';
import useRubricStore from '../store/rubricStore';

const TotalPoints = () => {
  const { getTotalPoints, currentRubric } = useRubricStore();

  if (!currentRubric) {
    return null;
  }

  const { earned, possible } = getTotalPoints();
  const percentage = possible > 0 ? ((earned / possible) * 100).toFixed(1) : 0;

  return (
    <Paper
      elevation={2}
      sx={{
        p: 1.5,
        mb: 2,
        backgroundColor: 'primary.main',
        color: 'primary.contrastText',
      }}
    >
      <Stack spacing={1}>
        <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
          Total Score
        </Typography>
        <Box>
          <Typography variant="h3" component="span" fontWeight="bold">
            {earned}
          </Typography>
          <Typography variant="h5" component="span" sx={{ opacity: 0.8 }}>
            {' '}/ {possible}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {percentage}%
        </Typography>
      </Stack>
    </Paper>
  );
};

export default TotalPoints;

