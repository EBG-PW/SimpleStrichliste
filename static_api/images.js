const Joi = require('joi');
const HyperExpress = require('hyper-express');
const { limiter } = require('@middleware/limiter');
const { readImage } = require('@lib/imageStore');
const sharp = require('sharp')
const router = new HyperExpress.Router();

// Generate 512x512 gray image with question mark
const defaultImage = sharp({
    create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 128, g: 128, b: 128, alpha: 1 }
    }
})
.composite([
    {
        input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
                <rect width="512" height="512" fill="gray"/>
                <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="320" fill="white" font-family="Arial, Helvetica, sans-serif">?</text>
            </svg>`
        ),
        blend: 'over'
    }
])
.webp({ quality: 70 })
.toBuffer();

const uuidCheck = Joi.object({
    route: Joi.string().valid('items').required(),
    uuid: Joi.string().guid({ version: 'uuidv4' }).required(),
});

router.get('/:route/:uuid', limiter(1), async (req, res) => {
    const { route, uuid } = await uuidCheck.validateAsync(req.params);
    try {
        const stream = await readImage(route, uuid, 'webp', true);
        res.header('Cache-Control', 'public, max-age=172800');
    stream.pipe(res);
    } catch (error) {
        const defimg = await defaultImage;
        res.header('Cache-Control', 'public, max-age=3600');
        res.type('jpeg').send(defimg);
        return;
    }
});

module.exports = router;