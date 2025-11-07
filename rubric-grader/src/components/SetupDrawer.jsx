import { useState } from 'react';
import {
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Divider,
} from '@mui/material';
import { Settings as SettingsIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import CourseSelector from './CourseSelector';
import RubricSelector from './RubricSelector';
import CSVImport from './CSVImport';

const SetupDrawer = () => {
  const [expanded, setExpanded] = useState(true);

  return (
    <Box sx={{ mb: 3 }}>
      <Accordion 
        expanded={expanded} 
        onChange={(e, isExpanded) => setExpanded(isExpanded)}
        sx={{ 
          '&:before': {
            display: 'none',
          },
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            '& .MuiAccordionSummary-content': {
              alignItems: 'center',
            },
          }}
        >
          <SettingsIcon sx={{ mr: 1, color: 'text.secondary' }} />
          <Typography variant="subtitle1">
            Setup
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ py: 1 }}>
            <CourseSelector />
            <RubricSelector />
            <Divider sx={{ my: 2 }} />
            <CSVImport />
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default SetupDrawer;

