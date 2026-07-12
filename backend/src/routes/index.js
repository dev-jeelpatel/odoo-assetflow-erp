const { Router } = require('express');
const authRoutes = require('../auth/auth.routes');
const organizationRoutes = require('../organizations/organization.routes');
const assetRoutes = require('../assets/asset.routes');
const allocationRoutes = require('../allocations/allocation.routes');
const bookingRoutes = require('../bookings/booking.routes');
const maintenanceRoutes = require('../maintenance/maintenance.routes');
const auditRoutes = require('../audits/audit.routes');
const notificationRoutes = require('../notifications/notification.routes');
const logRoutes = require('../logs/log.routes');
const reportRoutes = require('../reports/report.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/organization', organizationRoutes);
router.use('/assets', assetRoutes);
router.use('/allocations', allocationRoutes);
router.use('/bookings', bookingRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/audits', auditRoutes);
router.use('/notifications', notificationRoutes);
router.use('/logs', logRoutes);
router.use('/reports', reportRoutes);

module.exports = router;
