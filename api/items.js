const { verifyRequest } = require('@middleware/verifyRequest');
const { parseMultipart } = require('@middleware/parseMultipartForm');
const { limiter } = require('@middleware/limiter');
const { createItem } = require('@lib/sqlite/items');
const Joi = require('@lib/sanitizer');
const { writeImage } = require('@lib/imageStore');
const { verifyBufferIsJPG, convertToWebp } = require('@lib/utils');
const { InvalidRouteInput } = require('@lib/errors');
const HyperExpress = require('hyper-express');
const gategories_conf = require('@config/categories');
const router = new HyperExpress.Router();

/* Plugin info*/
const PluginName = 'Items'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const newItemSchema = Joi.object({
    name: Joi.string().min(3).max(100).required(),
    price: Joi.number().positive().required(),
    stock: Joi.number().integer().min(0).required(),
    targetStock: Joi.number().integer().min(0).required(),
    packSize: Joi.number().integer().min(1).required(),
    packPrice: Joi.number().integer().min(1).required(),
    category: Joi.string().valid(...Object.keys(gategories_conf)).required()
});

router.post('/', verifyRequest('web.admin.items.write'), parseMultipart(), limiter(10), async (req, res) => {
    const body = await newItemSchema.validateAsync(req.body);
    const validImage = await verifyBufferIsJPG(req.file.buffer, 512, 512);
    if (!validImage) throw new InvalidRouteInput('Invalid Image');

    const webpImage = await convertToWebp(req.file.buffer, { quality: 75, lossless: false, effort: 4 });
    
    const itemUUID = await createItem(body);
    await writeImage(webpImage, 'items', itemUUID, 'webp');
    res.status(201).json(itemUUID);
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

