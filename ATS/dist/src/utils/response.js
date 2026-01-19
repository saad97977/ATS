"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendError = exports.sendSuccess = void 0;
const sendSuccess = (res, data, statusCode = 200, message) => {
    res.status(statusCode).json({
        success: true,
        data,
        statusCode,
    });
};
exports.sendSuccess = sendSuccess;
const sendError = (res, error, statusCode = 500, errors) => {
    const response = {
        success: false,
        error,
        statusCode,
    };
    if (errors) {
        response.errors = errors;
    }
    res.status(statusCode).json(response);
};
exports.sendError = sendError;
//# sourceMappingURL=response.js.map