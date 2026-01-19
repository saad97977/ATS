// ==========================================
// 2. AUTH CONTROLLER (authController.ts)
// ==========================================
import { Request, Response } from 'express';
import { loginUser as loginUserService, verifyToken } from '../../services/authService';

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields: email, password',
      });
    }

    // Login user
    const loginResponse = await loginUserService({ email, password });

    res.status(200).json(loginResponse);
  } catch (err: any) {
    console.error(err);

    // Handle authentication errors
    if (err.message === 'Invalid email or password') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (err.message === 'User role not found') {
      return res.status(500).json({ error: 'User configuration error' });
    }

    res.status(500).json({ error: 'Internal Server Error' });
  }
};


export const validateToken = async (req: Request, res: Response) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Return whole decoded payload
    res.status(200).json({ valid: true, user: decoded });
  
  } catch (err: any) {
    console.error(err);

    if (err.message === 'Token is not valid') {
      return res.status(401).json({ error: 'Token is not valid' });
    }

    res.status(401).json({ error: 'Authentication failed' });
  }
};