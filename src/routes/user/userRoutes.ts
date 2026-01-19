import { Router } from 'express';
import { getAllUsers, getUserById, registerUser, updateUserAdminStatus, updateUserStatus } from '../../controllers/user/userController';
import { loginUser, validateToken  } from '../../controllers/user/authController';
import { authenticateToken, authorizeRole } from '../../middleware/authMiddleware';


const router = Router();


router.post('/login', loginUser);
router.get('/validate', validateToken);
router.post('/register', registerUser);


// router.get('/', getAllUsers);
router.get('/', authenticateToken, authorizeRole('HCM_USER'), getAllUsers);

router.get('/:id', getUserById);
router.patch('/:id/admin', authenticateToken, authorizeRole('HCM_USER','MANAGER'), updateUserAdminStatus);
router.patch('/:id/status', updateUserStatus);



export default router;


