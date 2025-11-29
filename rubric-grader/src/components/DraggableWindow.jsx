import { useState, useRef, useEffect } from 'react';
import { Paper, Box, IconButton, Stack, Typography } from '@mui/material';
import { DragIndicator, Minimize, Close } from '@mui/icons-material';

const DraggableWindow = ({ title, children, onClose }) => {
  // Calculate initial position - top-right area, accounting for header
  const getInitialPosition = () => ({
    x: Math.max(50, window.innerWidth - 650),
    y: 100,
  });
  
  const [position, setPosition] = useState(getInitialPosition);
  const [size, setSize] = useState({ width: 600, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  const windowRef = useRef(null);
  
  const MIN_WIDTH = 300;
  const MIN_HEIGHT = 200;
  
  const getMaxDimensions = () => ({
    width: window.innerWidth - 100,
    height: window.innerHeight - 170,
  });

  // Handle window resize to keep window in viewport
  useEffect(() => {
    const handleResize = () => {
      if (!isDragging && !isResizing && windowRef.current) {
        const maxX = window.innerWidth - (isMinimized ? MIN_WIDTH : size.width);
        const maxY = window.innerHeight - 170;
        
        setPosition((prev) => ({
          x: Math.max(0, Math.min(prev.x, maxX)),
          y: Math.max(0, Math.min(prev.y, maxY)),
        }));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDragging, isResizing, isMinimized, size.width]);

  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    
    const rect = windowRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  };

  const handleResizeMouseDown = (e, direction) => {
    e.stopPropagation();
    const rect = windowRef.current.getBoundingClientRect();
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      posX: position.x,
      posY: position.y,
    });
    setResizeDirection(direction);
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizing && resizeDirection) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = resizeStart.posX;
        let newY = resizeStart.posY;

        const maxDims = getMaxDimensions();
        
        // Handle horizontal resizing
        if (resizeDirection.includes('right')) {
          newWidth = Math.max(MIN_WIDTH, Math.min(maxDims.width, resizeStart.width + deltaX));
        }
        if (resizeDirection.includes('left')) {
          const widthChange = resizeStart.width - Math.max(MIN_WIDTH, Math.min(maxDims.width, resizeStart.width - deltaX));
          newWidth = resizeStart.width - widthChange;
          newX = resizeStart.posX + widthChange;
        }

        // Handle vertical resizing
        if (resizeDirection.includes('bottom')) {
          newHeight = Math.max(MIN_HEIGHT, Math.min(maxDims.height, resizeStart.height + deltaY));
        }
        if (resizeDirection.includes('top')) {
          const heightChange = resizeStart.height - Math.max(MIN_HEIGHT, Math.min(maxDims.height, resizeStart.height - deltaY));
          newHeight = resizeStart.height - heightChange;
          newY = resizeStart.posY + heightChange;
        }

        // Keep window within viewport
        const maxX = window.innerWidth - newWidth;
        const maxY = window.innerHeight - 170;

        setSize({ width: newWidth, height: newHeight });
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      } else if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        // Keep window within viewport (account for header ~120px and footer ~50px)
        const maxX = window.innerWidth - (isMinimized ? MIN_WIDTH : size.width);
        const maxY = window.innerHeight - 170;

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeDirection(null);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, resizeDirection, dragOffset, resizeStart, isMinimized, size.width]);

  const getResizeCursor = (direction) => {
    if (direction.includes('right') && direction.includes('bottom')) return 'nwse-resize';
    if (direction.includes('right') && direction.includes('top')) return 'nesw-resize';
    if (direction.includes('left') && direction.includes('bottom')) return 'nesw-resize';
    if (direction.includes('left') && direction.includes('top')) return 'nwse-resize';
    if (direction.includes('right') || direction.includes('left')) return 'ew-resize';
    if (direction.includes('top') || direction.includes('bottom')) return 'ns-resize';
    return 'default';
  };

  return (
    <Paper
      ref={windowRef}
      elevation={8}
      sx={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: isMinimized ? MIN_WIDTH : size.width,
        height: isMinimized ? 'auto' : size.height,
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1300,
        cursor: isDragging ? 'grabbing' : (isResizing ? getResizeCursor(resizeDirection) : 'default'),
        transition: isMinimized ? 'width 0.2s ease' : (isResizing ? 'none' : 'none'),
      }}
    >
      {/* Title Bar */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          p: 1,
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <DragIndicator />
            <Typography variant="subtitle1" fontWeight="bold">
              {title}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} className="no-drag">
            <IconButton
              size="small"
              onClick={() => setIsMinimized(!isMinimized)}
              sx={{ color: 'inherit' }}
            >
              <Minimize />
            </IconButton>
            {onClose && (
              <IconButton
                size="small"
                onClick={onClose}
                sx={{ color: 'inherit' }}
              >
                <Close />
              </IconButton>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* Content */}
      {!isMinimized && (
        <Box
          className="no-drag"
          sx={{
            p: 2,
            overflow: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {children}
        </Box>
      )}

      {/* Resize Handles */}
      {!isMinimized && (
        <>
          {/* Top edge */}
          <Box
            onMouseDown={(e) => handleResizeMouseDown(e, 'top')}
            sx={{
              position: 'absolute',
              top: 0,
              left: 12,
              right: 12,
              height: 4,
              cursor: 'ns-resize',
              zIndex: 10,
              '&:hover': {
                backgroundColor: 'primary.main',
                opacity: 0.5,
              },
            }}
          />
          {/* Bottom edge */}
          <Box
            onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 12,
              right: 12,
              height: 4,
              cursor: 'ns-resize',
              zIndex: 10,
              '&:hover': {
                backgroundColor: 'primary.main',
                opacity: 0.5,
              },
            }}
          />
          {/* Left edge */}
          <Box
            onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
            sx={{
              position: 'absolute',
              left: 0,
              top: 12,
              bottom: 12,
              width: 4,
              cursor: 'ew-resize',
              zIndex: 10,
              '&:hover': {
                backgroundColor: 'primary.main',
                opacity: 0.5,
              },
            }}
          />
          {/* Right edge */}
          <Box
            onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
            sx={{
              position: 'absolute',
              right: 0,
              top: 12,
              bottom: 12,
              width: 4,
              cursor: 'ew-resize',
              zIndex: 10,
              '&:hover': {
                backgroundColor: 'primary.main',
                opacity: 0.5,
              },
            }}
          />
          {/* Top-left corner */}
          <Box
            onMouseDown={(e) => handleResizeMouseDown(e, 'top-left')}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 12,
              height: 12,
              cursor: 'nwse-resize',
              zIndex: 2,
              '&:hover': {
                backgroundColor: 'primary.main',
                opacity: 0.5,
              },
            }}
          />
          {/* Top-right corner */}
          <Box
            onMouseDown={(e) => handleResizeMouseDown(e, 'top-right')}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 12,
              height: 12,
              cursor: 'nesw-resize',
              zIndex: 2,
              '&:hover': {
                backgroundColor: 'primary.main',
                opacity: 0.5,
              },
            }}
          />
          {/* Bottom-left corner */}
          <Box
            onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-left')}
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 12,
              height: 12,
              cursor: 'nesw-resize',
              zIndex: 2,
              '&:hover': {
                backgroundColor: 'primary.main',
                opacity: 0.5,
              },
            }}
          />
          {/* Bottom-right corner */}
          <Box
            onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-right')}
            sx={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 12,
              height: 12,
              cursor: 'nwse-resize',
              zIndex: 2,
              '&:hover': {
                backgroundColor: 'primary.main',
                opacity: 0.5,
              },
            }}
          />
        </>
      )}
    </Paper>
  );
};

export default DraggableWindow;

