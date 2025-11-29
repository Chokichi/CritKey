import { useState, useRef, useEffect } from 'react';
import { Paper, Box, IconButton, Stack, Typography } from '@mui/material';
import { DragIndicator, Minimize, Close, Launch as LaunchIcon } from '@mui/icons-material';
import { getRubricWindowState, saveRubricWindowState } from '../utils/localStorage';

const DOCK_THRESHOLD = 50; // pixels from edge to trigger docking
const HEADER_HEIGHT = 120;
const FOOTER_HEIGHT = 50;

const formatPoints = (points) => {
  const value = Number(points) || 0;
  return Number.isInteger(value) ? value : value.toFixed(2);
};

const DockableRubricWindow = ({ title, children, onClose, onDockChange, pdfViewerRef, criterionInfo }) => {
  // Load saved state
  const savedState = getRubricWindowState();

  // Validate position is within screen bounds
  const validatePosition = (pos, windowSize, screenWidth, screenHeight) => {
    const maxX = screenWidth - windowSize.width;
    const maxY = screenHeight - (HEADER_HEIGHT + FOOTER_HEIGHT);

    // Check if window is significantly off-screen (more than 50px off)
    const isOffScreenRight = pos.x > screenWidth - 50;
    const isOffScreenBottom = pos.y > screenHeight - 50;
    const isOffScreenLeft = pos.x + windowSize.width < 50;
    const isOffScreenTop = pos.y < -50;

    if (isOffScreenRight || isOffScreenBottom || isOffScreenLeft || isOffScreenTop) {
      // Window is off-screen, return null to trigger auto-dock
      return null;
    }

    // Window is partially visible, constrain it within bounds
    return {
      x: Math.max(0, Math.min(pos.x, maxX)),
      y: Math.max(0, Math.min(pos.y, maxY)),
    };
  };

  const getInitialState = () => {
    const defaultSize = { width: 600, height: 600 };
    const defaultPosition = { x: Math.max(50, window.innerWidth - 650), y: 100 };

    if (savedState) {
      const savedSize = savedState.size || defaultSize;
      const savedPosition = savedState.position || defaultPosition;

      // Validate the saved position is within screen bounds
      const validatedPosition = validatePosition(
        savedPosition,
        savedSize,
        window.innerWidth,
        window.innerHeight
      );

      // If position is off-screen, auto-dock to right
      if (!validatedPosition) {
        return {
          docked: 'right',
          position: defaultPosition,
          size: savedSize,
        };
      }

      return {
        docked: savedState.docked || null,
        position: validatedPosition,
        size: savedSize,
      };
    }
    return {
      docked: null,
      position: defaultPosition,
      size: defaultSize,
    };
  };

  const [docked, setDocked] = useState(getInitialState().docked);
  const [position, setPosition] = useState(getInitialState().position);
  const [size, setSize] = useState(getInitialState().size);
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
    height: window.innerHeight - (HEADER_HEIGHT + FOOTER_HEIGHT),
  });

  // Save state whenever it changes
  useEffect(() => {
    saveRubricWindowState({
      docked,
      position,
      size,
    });
  }, [docked, position, size]);

  // Notify parent of dock changes
  useEffect(() => {
    if (onDockChange) {
      onDockChange(docked);
    }
  }, [docked, onDockChange]);

  // Handle window resize - check if rubric is now off-screen or at edge
  useEffect(() => {
    const handleResize = () => {
      if (docked) return; // Don't adjust if docked

      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      // Check if window is at or past the right edge
      const isAtRightEdge = position.x + size.width >= screenWidth - 10;
      const isAtLeftEdge = position.x <= 10;
      const isAtTopEdge = position.y <= HEADER_HEIGHT + 10;
      const isAtBottomEdge = position.y + size.height >= screenHeight - FOOTER_HEIGHT - 10;

      // Auto-dock if window is pushed to any edge during resize
      if (isAtRightEdge || isAtLeftEdge || isAtTopEdge || isAtBottomEdge) {
        console.log('[Rubric Window] Window at edge after resize, auto-docking');
        // Dock to the edge it's closest to
        if (isAtRightEdge) {
          setDocked('right');
        } else if (isAtLeftEdge) {
          setDocked('left');
        } else if (isAtTopEdge) {
          setDocked('top');
        } else {
          setDocked('right'); // Default to right if at bottom
        }
        return;
      }

      // Check if completely off-screen
      const validatedPosition = validatePosition(
        position,
        size,
        screenWidth,
        screenHeight
      );

      // If window is off-screen after resize, auto-dock to right
      if (!validatedPosition) {
        console.log('[Rubric Window] Window is off-screen after resize, auto-docking to right');
        setDocked('right');
      } else if (validatedPosition.x !== position.x || validatedPosition.y !== position.y) {
        // Window is partially off-screen, adjust position
        console.log('[Rubric Window] Adjusting position to stay on screen');
        setPosition(validatedPosition);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, size, docked]);

  // Get PDF viewer bounds for docking detection
  const getPdfViewerBounds = () => {
    if (!pdfViewerRef?.current) {
      // Fallback to full viewport minus header/footer
      return {
        left: 0,
        right: window.innerWidth,
        top: HEADER_HEIGHT,
        bottom: window.innerHeight - FOOTER_HEIGHT,
      };
    }
    const rect = pdfViewerRef.current.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  };

  // Check if window should dock based on position
  const checkDocking = (x, y, width, height) => {
    const bounds = getPdfViewerBounds();

    // Check left edge - window's right edge near PDF viewer's left edge
    if (Math.abs(x + width - bounds.left) <= DOCK_THRESHOLD && 
        y >= bounds.top - 50 && y + height <= bounds.bottom + 50) {
      return 'left';
    }
    // Check right edge - window's left edge near PDF viewer's right edge
    if (Math.abs(x - bounds.right) <= DOCK_THRESHOLD && 
        y >= bounds.top - 50 && y + height <= bounds.bottom + 50) {
      return 'right';
    }
    // Check top edge - window's bottom edge near PDF viewer's top edge
    if (Math.abs(y + height - bounds.top) <= DOCK_THRESHOLD && 
        x >= bounds.left - 50 && x + width <= bounds.right + 50) {
      return 'top';
    }

    return null;
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    
    const rect = windowRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
    
    // If docked, undock when starting to drag
    if (docked) {
      setDocked(null);
    }
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
        const maxY = window.innerHeight - (HEADER_HEIGHT + FOOTER_HEIGHT);

        setSize({ width: newWidth, height: newHeight });
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      } else if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        // Check for docking
        const newDocked = checkDocking(newX, newY, size.width, size.height);
        
        if (newDocked) {
          setDocked(newDocked);
          // Position window at the edge
          const bounds = getPdfViewerBounds();
          if (newDocked === 'left') {
            setPosition({ x: bounds.left, y: bounds.top });
          } else if (newDocked === 'right') {
            setPosition({ x: bounds.right - size.width, y: bounds.top });
          } else if (newDocked === 'top') {
            setPosition({ x: bounds.left, y: bounds.top });
          }
        } else {
          // Keep window within viewport
          // When minimized, we don't know the exact width (it's auto), so just ensure it's visible
          const maxX = isMinimized ? window.innerWidth - 100 : window.innerWidth - size.width;
          const maxY = window.innerHeight - (HEADER_HEIGHT + FOOTER_HEIGHT);

          setPosition({
            x: Math.max(0, Math.min(newX, maxX)),
            y: Math.max(0, Math.min(newY, maxY)),
          });
        }
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
  }, [isDragging, isResizing, resizeDirection, dragOffset, resizeStart, isMinimized, size, docked, pdfViewerRef]);

  const getResizeCursor = (direction) => {
    if (direction.includes('right') && direction.includes('bottom')) return 'nwse-resize';
    if (direction.includes('right') && direction.includes('top')) return 'nesw-resize';
    if (direction.includes('left') && direction.includes('bottom')) return 'nesw-resize';
    if (direction.includes('left') && direction.includes('top')) return 'nwse-resize';
    if (direction.includes('right') || direction.includes('left')) return 'ew-resize';
    if (direction.includes('top') || direction.includes('bottom')) return 'ns-resize';
    return 'default';
  };

  // If docked, render as a panel (handled by parent layout)
  if (docked) {
    return null; // Parent will render the docked panel
  }

  // Floating window
  return (
    <Paper
      ref={windowRef}
      elevation={8}
      sx={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: isMinimized ? 'auto' : size.width,
        height: isMinimized ? 'auto' : size.height,
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1300,
        cursor: isDragging ? 'grabbing' : (isResizing ? getResizeCursor(resizeDirection) : 'default'),
        transition: isMinimized ? 'none' : (isResizing ? 'none' : 'none'),
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
            {isMinimized && criterionInfo ? (
              <Typography variant="subtitle2" fontWeight="bold" sx={{ whiteSpace: 'nowrap' }}>
                Criterion ({criterionInfo.currentIndex + 1}/{criterionInfo.total}) - {formatPoints(criterionInfo.earned)}/{formatPoints(criterionInfo.possible)}pts | Total: {formatPoints(criterionInfo.totalEarned)}/{formatPoints(criterionInfo.totalPossible)}
              </Typography>
            ) : (
              <Typography variant="subtitle1" fontWeight="bold">
                {title}
              </Typography>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} className="no-drag">
            <IconButton
              size="small"
              onClick={() => {
                const newMinimized = !isMinimized;
                setIsMinimized(newMinimized);
                // Auto-undock when minimizing to free up PDF space
                if (newMinimized && docked) {
                  setDocked(null);
                }
              }}
              sx={{ color: 'inherit' }}
              title={isMinimized ? 'Expand' : 'Collapse'}
            >
              <Minimize />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => {
                // Auto-expand when docking
                if (isMinimized) {
                  setIsMinimized(false);
                }
                // Dock to right by default
                setDocked('right');
              }}
              sx={{ color: 'inherit' }}
              title="Dock to Side"
            >
              <LaunchIcon />
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

      {/* Content - keep mounted but hidden to preserve state */}
      <Box
        className="no-drag"
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
          {/* Corners */}
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
              '&:hover': { backgroundColor: 'primary.main', opacity: 0.5 },
            }}
          />
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
              '&:hover': { backgroundColor: 'primary.main', opacity: 0.5 },
            }}
          />
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
              '&:hover': { backgroundColor: 'primary.main', opacity: 0.5 },
            }}
          />
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
              '&:hover': { backgroundColor: 'primary.main', opacity: 0.5 },
            }}
          />
        </>
      )}
    </Paper>
  );
};

export default DockableRubricWindow;

