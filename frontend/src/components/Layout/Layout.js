import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
  Badge,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  VideoCall,
  Assignment,
  Assessment,
  Schedule,
  People,
  EventNote,
  Person,
  Logout,
  Description,
  AdminPanelSettings,
  CheckCircle,
  SupervisorAccount,
  Settings as SettingsIcon,
  Notifications,
} from '@mui/icons-material';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const drawerWidth = 260;

const candidateMenuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/candidate/dashboard' },
  { text: 'Start Interview', icon: <VideoCall />, path: '/candidate/interview-selection' },
  { text: 'Assessments', icon: <Assignment />, path: '/candidate/assessments' },
  { text: 'My Reports', icon: <Description />, path: '/candidate/reports' },
  { text: 'Profile', icon: <Person />, path: '/candidate/profile' },
];

const hrMenuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/hr/dashboard' },
  { text: 'Candidates', icon: <People />, path: '/hr/candidates' },
  { text: 'Slot Management', icon: <Schedule />, path: '/hr/slots' },
  { text: 'Evaluations', icon: <Assessment />, path: '/hr/evaluations' },
];

const adminMenuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/admin/dashboard' },
  { text: 'User Management', icon: <SupervisorAccount />, path: '/admin/users' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/admin/settings' },
];

function Layout({ userType }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [notiAnchorEl, setNotiAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  const fetchNotifications = async () => {
    try {
      const response = await api.get(`/api/notifications/${user.id}`);
      setNotifications(response.data || []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const isAssessmentMode = location.pathname.startsWith('/candidate/ai-interview');

  if (isAssessmentMode) {
    return (
      <Box sx={{ minHeight: '100vh', width: '100%', bgcolor: '#f8fafc' }}>
        <Outlet />
      </Box>
    );
  }

  const menuItems = userType === 'admin' ? adminMenuItems : userType === 'hr' ? hrMenuItems : candidateMenuItems;

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuClick = (path) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleProfileMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleNotiOpen = (event) => {
    setNotiAnchorEl(event.currentTarget);
  };

  const handleNotiClose = () => {
    setNotiAnchorEl(null);
  };

  const handleMarkAsRead = async (notiId) => {
    try {
      await api.post(`/api/notifications/read/${notiId}`);
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const drawer = (
    <Box>
      <Toolbar sx={{ px: 2 }}>
        <Typography
          variant="h6"
          noWrap
          component="div"
          onClick={() => navigate('/')}
          sx={{ fontWeight: 700, color: 'primary.main', cursor: 'pointer' }}
        >
          Speak2HR
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => handleMenuClick(item.path)}
              selected={location.pathname === item.path}
              sx={{
                borderRadius: 2,
                '&.Mui-selected': {
                  backgroundColor: 'primary.light',
                  color: 'white',
                  '& .MuiListItemIcon-root': {
                    color: 'white',
                  },
                  '&:hover': {
                    backgroundColor: 'primary.main',
                  },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          backgroundColor: 'white',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          
          <IconButton onClick={handleNotiOpen} color="inherit" sx={{ mr: 2 }}>
            <Badge badgeContent={notifications.filter(n => !n.is_read).length} color="error">
              <Notifications />
            </Badge>
          </IconButton>
          <Menu
            anchorEl={notiAnchorEl}
            open={Boolean(notiAnchorEl)}
            onClose={handleNotiClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { width: 320, maxHeight: 400, mt: 1, borderRadius: 3 } }}
          >
            <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Notifications</Typography>
              {notifications.filter(n => !n.is_read).length > 0 && (
                <Typography 
                  variant="caption" 
                  color="primary" 
                  sx={{ cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    notifications.forEach(n => !n.is_read && handleMarkAsRead(n.id));
                    handleNotiClose();
                  }}
                >
                  Mark all read
                </Typography>
              )}
            </Box>
            <Divider />
            {notifications.length === 0 ? (
              <MenuItem disabled sx={{ py: 2, justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No notifications yet
                </Typography>
              </MenuItem>
            ) : (
              notifications.map((noti) => (
                <MenuItem 
                  key={noti.id} 
                  onClick={() => {
                    handleMarkAsRead(noti.id);
                    handleNotiClose();
                  }}
                  sx={{ 
                    whiteSpace: 'normal',
                    py: 1.5,
                    bgcolor: noti.is_read ? 'transparent' : 'rgba(79, 70, 229, 0.04)',
                    borderBottom: '1px solid rgba(226, 232, 240, 0.6)'
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: noti.is_read ? 400 : 600, fontSize: '0.85rem' }}>
                      {noti.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {new Date(noti.timestamp).toLocaleDateString()} {new Date(noti.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                </MenuItem>
              ))
            )}
          </Menu>

          <IconButton onClick={handleProfileMenuOpen} sx={{ p: 0 }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleProfileMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem disabled>
              <Typography variant="body2">{user?.email}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <Logout fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: '64px',
          minHeight: 'calc(100vh - 64px)',
          backgroundColor: 'background.default',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}

export default Layout;
