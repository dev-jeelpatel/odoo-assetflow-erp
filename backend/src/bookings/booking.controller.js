const asyncHandler = require('../utils/asyncHandler');
const bookingService = require('./booking.service');

const createBooking = asyncHandler(async (req, res) => {
  res.status(201).json({ booking: await bookingService.createBooking(req.body, req) });
});

const listBookings = asyncHandler(async (req, res) => {
  res.json(await bookingService.listBookings(req.query));
});

const getBooking = asyncHandler(async (req, res) => {
  res.json({ booking: await bookingService.getBooking(req.params.id) });
});

const rescheduleBooking = asyncHandler(async (req, res) => {
  res.json({ booking: await bookingService.rescheduleBooking(req.params.id, req.body, req) });
});

const cancelBooking = asyncHandler(async (req, res) => {
  res.json({ booking: await bookingService.cancelBooking(req.params.id, req) });
});

module.exports = { createBooking, listBookings, getBooking, rescheduleBooking, cancelBooking };
