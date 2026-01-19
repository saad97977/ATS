"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    console.error(`[${new Date().toISOString()}] Error:`, {
        statusCode,
        message,
        path: req.path,
        method: req.method,
    });
    res.status(statusCode).json({
        success: false,
        error: message,
        statusCode,
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errorHandler.js.map