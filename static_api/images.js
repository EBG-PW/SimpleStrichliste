const Joi = require('joi');
const HyperExpress = require('hyper-express');
const { limiter } = require('@middleware/limiter');
const { readImage } = require('@lib/imageStore');
const sharp = require('sharp')
const router = new HyperExpress.Router();

// Generate Clean 512x512 with black circle in center
const defaultImage = sharp({
    create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
})
    .composite([{
        input: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="256" fill="black" /></svg>'
        ),
        blend: 'over'
    }])
    .jpeg({ quality: 90 })
    .toBuffer();

const uuidCheck = Joi.object({
    route: Joi.string().valid('items').required(),
    uuid: Joi.string().guid({ version: 'uuidv4' }).required(),
});

router.get('/:route/:uuid', limiter(1), async (req, res) => {
    const { route, uuid } = await uuidCheck.validateAsync(req.params);

    const stream = await readImage(route, uuid, 'webp', true);

    res.header('Cache-Control', 'public, max-age=172800');
    stream.pipe(res);
});

module.exports = router;