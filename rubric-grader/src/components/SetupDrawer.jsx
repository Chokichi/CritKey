import { useMemo, useState } from 'react';
import {
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Alert,
} from '@mui/material';
import { Settings as SettingsIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import useRubricStore from '../store/rubricStore';
import CourseSelector from './CourseSelector';
import RubricSelector from './RubricSelector';
import CSVImport from './CSVImport';
import { generateCanvasCSV } from '../utils/csvParser';

const SetupDrawer = () => {
  const [expanded, setExpanded] = useState(true);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [selectedRubricNames, setSelectedRubricNames] = useState([]);

  const { availableRubrics, currentCourse } = useRubricStore();

  const sortedRubrics = useMemo(() => {
    return [...availableRubrics].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableRubrics]);

  const handleToggleRubric = (rubricName) => () => {
    setSelectedRubricNames((prev) =>
      prev.includes(rubricName)
        ? prev.filter((name) => name !== rubricName)
        : [...prev, rubricName]
    );
  };

  const handleCloseDownload = () => {
    setDownloadOpen(false);
  };

  const handleOpenDownload = () => {
    setSelectedRubricNames(sortedRubrics.map((rubric) => rubric.name));
    setDownloadOpen(true);
  };

  const handleDownload = () => {
    if (selectedRubricNames.length === 0) return;

    const rubricsToExport = sortedRubrics.filter((rubric) =>
      selectedRubricNames.includes(rubric.name)
    );

    if (rubricsToExport.length === 0) return;

    const csv = generateCanvasCSV(rubricsToExport);
    if (!csv) return;

    const formatLocalDate = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const timestamp = formatLocalDate();

    let filename = `rubrics_export_${timestamp}.csv`;

    if (rubricsToExport.length === 1) {
      const rubricName = rubricsToExport[0].name || 'rubric';
      filename = `${rubricName.replace(/\s+/g, '_')}_${timestamp}.csv`;
    } else if (rubricsToExport.length > 1) {
      filename = `rubrics_${rubricsToExport.length}_items_${timestamp}.csv`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadOpen(false);
  };

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
            <Button
              fullWidth
              variant="outlined"
              sx={{ mt: 1 }}
              onClick={handleOpenDownload}
              disabled={sortedRubrics.length === 0}
            >
              Download Rubrics
            </Button>
            <Divider sx={{ my: 2 }} />
            <CSVImport />
          </Box>
        </AccordionDetails>
      </Accordion>

      <Dialog
        open={downloadOpen}
        onClose={handleCloseDownload}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Select rubrics to download</DialogTitle>
        <DialogContent dividers>
          {sortedRubrics.length === 0 ? (
            <Alert severity="info">
              No rubrics available to download. Import or create a rubric first.
            </Alert>
          ) : (
            <FormGroup>
              {sortedRubrics.map((rubric) => (
                <FormControlLabel
                  key={rubric.name}
                  control={
                    <Checkbox
                      checked={selectedRubricNames.includes(rubric.name)}
                      onChange={handleToggleRubric(rubric.name)}
                    />
                  }
                  label={rubric.name}
                />
              ))}
            </FormGroup>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDownload}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDownload}
            disabled={selectedRubricNames.length === 0}
          >
            Download Selected
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SetupDrawer;

