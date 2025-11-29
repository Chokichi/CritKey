import { useState } from 'react';
import {
  Drawer,
  Box,
  IconButton,
  Divider,
  Stack,
} from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';
import CanvasIntegration from './CanvasIntegration';
import SetupDrawer from './SetupDrawer';

const SideDrawer = () => {
  const [open, setOpen] = useState(false);

  const handleToggle = () => {
    setOpen(!open);
  };

  return (
    <>
      {/* Tab button on left edge */}
      <IconButton
        onClick={handleToggle}
        sx={{
          position: 'fixed',
          left: open ? 400 : 0,
          top: 'calc(50% + 60px)', // Account for header height
          transform: 'translateY(-50%)',
          zIndex: 1301,
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: '0 8px 8px 0',
          width: 40,
          height: 80,
          boxShadow: 2,
          '&:hover': {
            backgroundColor: 'primary.dark',
          },
          transition: 'left 0.3s ease',
        }}
      >
        {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </IconButton>

      {/* Drawer */}
      <Drawer
        anchor="left"
        open={open}
        variant="persistent"
        PaperProps={{
          sx: {
            width: 400,
            zIndex: 1300,
            boxShadow: 4,
            top: '120px', // Account for header height
            height: 'calc(100vh - 170px)', // Subtract header (~120px) and footer (~50px)
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
      >
        <Box sx={{ p: 2, flex: 1, overflow: 'auto', minHeight: 0 }}>
          <Stack spacing={2}>
            <CanvasIntegration />
            <Divider />
            <SetupDrawer />
          </Stack>
        </Box>
      </Drawer>
    </>
  );
};

export default SideDrawer;

