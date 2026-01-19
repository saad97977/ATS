"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationDocumentTitleController_1 = require("../../controllers/organization/organizationDocumentTitleController");
const router = (0, express_1.Router)();
router.get('/', organizationDocumentTitleController_1.organizationDocumentTitleController.getAll);
router.get('/:id', organizationDocumentTitleController_1.organizationDocumentTitleController.getById);
router.post('/', organizationDocumentTitleController_1.organizationDocumentTitleController.create);
router.patch('/:id', organizationDocumentTitleController_1.organizationDocumentTitleController.update);
router.delete('/:id', organizationDocumentTitleController_1.organizationDocumentTitleController.delete);
exports.default = router;
//# sourceMappingURL=organizationDocumentTitleRoutes.js.map