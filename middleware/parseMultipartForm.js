const parseMultipart = () => {
    return async (req, res, next) => {
        try {
            req.body = {};
            req.file = null;

            await req.multipart(async (field) => {
                if (field.file) {
                    const stream = field.file.stream;

                    const buffer = await new Promise((resolve, reject) => {
                        const chunks = [];
                        stream.on('data', (chunk) => chunks.push(chunk));
                        stream.on('error', (err) => reject(err));
                        stream.on('end', () => resolve(Buffer.concat(chunks)));
                    });

                    // Create the req.file object
                    req.file = {
                        fieldname: field.name,
                        originalname: field.file.name,
                        mimetype: field.mime_type,
                        buffer: buffer,
                        size: buffer.length
                    };

                } else {
                    req.body[field.name] = field.value;
                }
            });

        } catch (error) {
            next(error);
        }
    };
};

module.exports = {
    parseMultipart
};