require('dotenv').config();
const validateEnv = require('./config/validateEnv');
validateEnv();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const connectDB = require('./config/db');
const initSocket = require('./config/socket');
const initCron = require('./config/cron');
const errorHandler = require('./middleware/errorHandler');
const { globalLimiter } = require('./config/rateLimiter');
require('./config/firebase');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = initSocket(server);
app.set('io', io);

app.use(helmet());

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = (process.env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
    if (!origin || origin === allowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(globalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

connectDB();
initCron();

app.get('/api/status', (req, res) => {
  res.json({
    message: 'Backend is running and ready!',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    uptime: process.uptime(),
    message: 'OK',
    timestamp: new Date().toISOString(),
    database: {
      status: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      uri: process.env.MONGO_URI?.split('@')[1] || 'N/A'
    }
  });
});

app.use('/api/admin',         require('./routes/adminRoutes'));
app.use('/api/nurses',        require('./routes/nurseRoutes'));
app.use('/api/guardians',     require('./routes/guardianRoutes'));
app.use('/api/residents',     require('./routes/residentRoutes'));
app.use('/api/assessments',   require('./routes/assessmentRoutes'));
app.use('/api/audit-logs',    require('./routes/auditRoutes'));
app.use('/api/audit-archive', require('./routes/auditArchiveRoutes'));
app.use('/api/settings',      require('./routes/settingsRoutes'));
app.use('/api/incidents',     require('./routes/incidentRoutes'));
app.use('/api/reports',       require('./routes/reportRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Started at: ${new Date().toISOString()}`);
});

const gracefulShutdown = () => {
  server.close(async () => {
    try {
      await mongoose.connection.close();
      process.exit(0);
    } catch (err) {
      console.error('Error closing MongoDB:', err);
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});