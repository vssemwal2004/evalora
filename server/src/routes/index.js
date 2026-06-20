const express = require('express');
const assessmentQuestionRoutes = require('./assessmentQuestion.routes');
const assessmentProctorRoutes = require('./assessmentProctor.routes');
const assessmentRoutes = require('./assessment.routes');
const assessmentStudentRoutes = require('./assessmentStudent.routes');
const authRoutes = require('./auth.routes');
const courseRoutes = require('./course.routes');
const dashboardRoutes = require('./dashboard.routes');
const healthRoutes = require('./health.routes');
const libraryRoutes = require('./library.routes');
const superAdminRoutes = require('./superAdmin.routes');
const studentExamRoutes = require('./studentExam.routes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/courses', courseRoutes);
router.use('/assessments', assessmentRoutes);
router.use('/assessments/:assessmentId/proctors', assessmentProctorRoutes);
router.use('/assessments/:assessmentId/questions', assessmentQuestionRoutes);
router.use('/assessments/:assessmentId/students', assessmentStudentRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/library', libraryRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/student', studentExamRoutes);

module.exports = router;
