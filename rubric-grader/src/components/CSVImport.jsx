import { useState, useRef } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Upload as UploadIcon, Download as DownloadIcon } from '@mui/icons-material';
import { parseCanvasRubricCSV, generateTemplateCSV } from '../utils/csvParser';
import useRubricStore from '../store/rubricStore';

const CSVImport = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);
  
  const { importRubric, currentCourse } = useRubricStore();

  const handleFile = async (file) => {
    if (!file) return;

    if (!currentCourse) {
      setError('Please select a course first');
      return;
    }

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const rubric = await parseCanvasRubricCSV(file);
      importRubric(rubric);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(`Error parsing CSV: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    handleFile(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleDownloadTemplate = () => {
    const csvContent = generateTemplateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'rubric-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Paper
        elevation={isDragging ? 8 : 2}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        sx={{
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          border: isDragging ? '2px dashed #1976d2' : '2px dashed #ccc',
          backgroundColor: isDragging ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: '#1976d2',
            backgroundColor: 'rgba(25, 118, 210, 0.04)',
          },
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {isLoading ? (
          <CircularProgress />
        ) : (
          <>
            <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              Import Canvas Rubric CSV
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Drag and drop a CSV file here, or click to select
            </Typography>
          </>
        )}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Rubric imported successfully!
        </Alert>
      )}

      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleDownloadTemplate}
          size="small"
        >
          Download Template CSV
        </Button>
      </Box>
    </Box>
  );
};

export default CSVImport;

