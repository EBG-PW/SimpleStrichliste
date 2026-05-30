const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
}).any();

const parseMultipart = () => {
    return (req, res, next) => {
        upload(req, res, (error) => {
            if (error) return next(error);

            const parsedBody = req.body || {};
            req.body = {};
            req.file = null;

            for (const [key, value] of Object.entries(parsedBody)) {
                req.body[key] = Array.isArray(value) ? value.at(-1) : value;
            }

            req.file = req.files?.[0] || null;
            return next();
        });
    };
};

module.exports = {
    parseMultipart
};
