const { Router } = require('express');
const controller = require('./booking.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { createBookingSchema, rescheduleBookingSchema, listBookingsQuerySchema } = require('./booking.validation');

const router = Router();

router.use(authenticate);

router.get('/', validate(listBookingsQuerySchema, 'query'), controller.listBookings);
router.get('/:id', controller.getBooking);
router.post('/', authorize('EMPLOYEE', 'DEPARTMENT_HEAD'), validate(createBookingSchema), controller.createBooking);
router.patch('/:id/reschedule', validate(rescheduleBookingSchema), controller.rescheduleBooking);
router.patch('/:id/cancel', controller.cancelBooking);

module.exports = router;
