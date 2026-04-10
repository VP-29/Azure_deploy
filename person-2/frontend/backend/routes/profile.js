import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  res.json({
    message: 'Protected profile data',
    user: req.user
  });
});

export default router;