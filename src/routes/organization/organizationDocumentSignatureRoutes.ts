import { Router } from 'express';
import * as signatureController from '../../controllers/organization/organizationDocumentSignature';

const router = Router();

router.patch('/signatures/:signatureId/reject', signatureController.rejectSignature);
router.post('/documents/:documentId/signatures', signatureController.createDocumentSignature);
router.get('/documents/:documentId/signatures', signatureController.getDocumentSignatures);
router.get('/signatures/:signatureId/verify', signatureController.verifySignature);
router.get('/documents/:documentId/audit-trail', signatureController.getSignatureAuditTrail);
router.post('/documents/:documentId/request-signature', signatureController.requestSignature);
router.get('/signatures/:signatureId/image', signatureController.getSignatureImage);

export default router;
