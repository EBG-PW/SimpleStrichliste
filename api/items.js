const { verifyRequest } = require('@middleware/verifyRequest');
const { parseMultipart } = require('@middleware/parseMultipartForm');
const { limiter } = require('@middleware/limiter');
const { createItem, getItemByUUID, updateItemByUUID, getItemsAndCategories } = require('@lib/sqlite/items');
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

router.get('/grouped', verifyRequest('web.admin.items.read'), limiter(4), async (req, res) => {
    const flatItemsAndCategories = await getItemsAndCategories();

    const groupedItems = flatItemsAndCategories.reduce((acc, currentItem) => {
        const category = currentItem.category_name;

        if (!acc[category]) acc[category] = [];

        if (currentItem.uuid) {
            const { category_name, ...itemData } = currentItem;
            acc[category].push(itemData);
        }

        return acc;
    }, {});

    res.json(groupedItems);
});

router.get('/:uuid', verifyRequest('web.admin.items.read'), limiter(4), async (req, res) => {
    const uuid = await Joi.string().uuid().validateAsync(req.params.uuid);
    const item = await getItemByUUID(uuid);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    res.json(item);
});

router.put('/:uuid', verifyRequest('web.admin.items.write'), parseMultipart(), limiter(10), async (req, res) => {
    const uuid = await Joi.string().uuid().validateAsync(req.params.uuid);
    const body = await newItemSchema.validateAsync(req.body);

    // Image is only in the request if it was modified
    if (req.file) {
        const validImage = await verifyBufferIsJPG(req.file.buffer, 512, 512);
        if (!validImage) throw new InvalidRouteInput('Invalid Image');

        const webpImage = await convertToWebp(req.file.buffer, { quality: 75, lossless: false, effort: 4 });

        await writeImage(webpImage, 'items', uuid, 'webp');
    }

    await updateItemByUUID(uuid, body);

    res.status(200).json(uuid);
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

