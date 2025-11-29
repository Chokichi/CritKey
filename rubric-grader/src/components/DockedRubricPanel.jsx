import { useState, useRef, useEffect } from 'react';
import { Paper, Box, Typography, Stack, IconButton } from '@mui/material';
import { Launch as LaunchIcon, Minimize } from '@mui/icons-material';

const formatPoints = (points) => {
  const value = Number(points) || 0;
  return Number.isInteger(value) ? value : value.toFixed(2);
};

const DockedRubricPanel = ({
  docked,
  width,
  height,
  onWidthChange,
  onHeightChange,
  onUndock,
  children,
  criterionInfo
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const panelRef = useRef(null);
  
  const MIN_WIDTH = 300;
  const MIN_HEIGHT = 200;
  const MAX_WIDTH = window.innerWidth * 0.5;
  const MAX_HEIGHT = window.innerHeight * 0.6;

  const handleResizeMouseDown = (e, direction) => {
    e.stopPropagation();
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: width,
      height: height,
    });
    setIsResizing(direction);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;

      if (isResizing === 'right' && (docked === 'left' || docked === 'right')) {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.width + deltaX));
        onWidthChange(newWidth);
      } else if (isResizing === 'left' && docked === 'right') {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.width - deltaX));
        onWidthChange(newWidth);
      } else if (isResizing === 'bottom' && docked === 'top') {
        const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStart.height + deltaY));
        onHeightChange(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, docked, onWidthChange, onHeightChange]);

  const getResizeCursor = (direction) => {
    if (direction === 'right' || direction === 'left') return 'ew-resize';
    if (direction === 'bottom') return 'ns-resize';
    return 'default';
  };

  return (
    <Paper
      ref={panelRef}
      elevation={4}
      sx={{
        width: docked === 'left' || docked === 'right' ? width : '100%',
        height: docked === 'top' ? height : '100%',
        minWidth: docked === 'left' || docked === 'right' ? MIN_WIDTH : undefined,
        minHeight: docked === 'top' ? MIN_HEIGHT : undefined,
        maxWidth: docked === 'left' || docked === 'right' ? '50%' : undefined,
        maxHeight: docked === 'top' ? '60%' : undefined,
        display: 'flex',
        flexDirection: 'column',
        borderRight: docked === 'left' ? 1 : 0,
        borderLeft: docked === 'right' ? 1 : 0,
        borderBottom: docked === 'top' ? 1 : 0,
        borderColor: 'divider',
        overflow: 'hidden',
        position: docked === 'top' ? 'absolute' : 'relative',
        top: docked === 'top' ? 0 : undefined,
        left: docked === 'top' ? 0 : undefined,
        right: docked === 'top' ? 0 : undefined,
        zIndex: docked === 'top' ? 100 : undefined,
        flexShrink: 0,
      }}
    >
      {/* Title Bar */}
      <Box
        sx={{
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          p: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {isMinimized && criterionInfo ? (
          <Typography variant="subtitle2" fontWeight="bold" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Criterion ({criterionInfo.currentIndex + 1}/{criterionInfo.total}) - {formatPoints(criterionInfo.earned)}/{formatPoints(criterionInfo.possible)}pts | Total: {formatPoints(criterionInfo.totalEarned)}/{formatPoints(criterionInfo.totalPossible)}
          </Typography>
        ) : (
          <Typography variant="subtitle1" fontWeight="bold">
            Rubric Grader
          </Typography>
        )}
        <Stack direction="row" spacing={0.5}>
          <IconButton
            size="small"
            onClick={() => {
              const newMinimized = !isMinimized;
              setIsMinimized(newMinimized);
              // Auto-undock when minimizing to free up PDF space
              if (newMinimized && onUndock) {
                onUndock();
              }
            }}
            sx={{ color: 'inherit' }}
            title={isMinimized ? 'Expand' : 'Collapse'}
          >
            <Minimize />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (onUndock) {
                onUndock();
              }
            }}
            sx={{ color: 'inherit' }}
            title="Undock"
          >
            <LaunchIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Content - keep mounted but hidden to preserve state */}
      <Box
        sx={{
          p: 2,
          overflow: 'auto',
          flex: 1,
          minHeight: 0,
          maxHeight: '100%',
          display: isMinimized ? 'none' : 'block',
        }}
      >
        {children}
      </Box>

      {/* Resize Handles */}
      {(docked === 'left' || docked === 'right') && (
        <Box
          onMouseDown={(e) => handleResizeMouseDown(e, docked === 'left' ? 'right' : 'left')}
          sx={{
            position: 'absolute',
            [docked === 'left' ? 'right' : 'left']: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: 'ew-resize',
            zIndex: 10,
            '&:hover': {
              backgroundColor: 'primary.main',
              opacity: 0.5,
            },
          }}
        />
      )}
      {docked === 'top' && (
        <Box
          onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            cursor: 'ns-resize',
            zIndex: 10,
            '&:hover': {
              backgroundColor: 'primary.main',
              opacity: 0.5,
            },
          }}
        />
      )}
    </Paper>
  );
};

export default DockedRubricPanel;

