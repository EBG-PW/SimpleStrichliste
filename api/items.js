const { verifyRequest } = require('@middleware/verifyRequest');
const { parseMultipart } = require('@middleware/parseMultipartForm');
const { limiter } = require('@middleware/limiter');
const { checkPermission } = require('@lib/permissions');
const { createItem, getItemByUUID, updateItemByUUID, getItemsAndCategories, getTotalInventoryValue, deleteItem, getItemsRestocking, updateItemsBought } = require('@lib/sqlite/items');
const { checkIfSettingTrue } = require('@lib/sqlite/settings');
const Joi = require('@lib/sanitizer');
const { writeImage, deleteImage } = require('@lib/imageStore');
const { verifyBufferIsJPG, convertToWebp } = require('@lib/utils');
const { InvalidRouteInput } = require('@lib/errors');
const HyperExpress = require('hyper-express');
const gategories_conf = require('@config/categories');
const router = new HyperExpress.Router();

/* Plugin info*/
const PluginName = 'Items'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const searchSchema = Joi.object({
    query: Joi.fullysanitizedString().min(1).max(100).default('')
});

const newItemSchema = Joi.object({
    name: Joi.fullysanitizedString().min(3).max(100).required(),
    price: Joi.number().positive().required(),
    stock: Joi.number().integer().min(0).required(),
    targetStock: Joi.number().integer().min(0).required(),
    packSize: Joi.number().integer().min(1).required(),
    packPrice: Joi.number().positive().min(1).required(),
    category: Joi.fullysanitizedString().valid(...Object.keys(gategories_conf)).required()
});

const uuidItemArraySchema = Joi.object({
    items: Joi.array().items(Joi.object({
        uuid: Joi.string().uuid().required(),
        amount: Joi.number().integer().min(1).required()
    })).min(1).required()
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
    const query = await searchSchema.validateAsync(req.query);
    const flatItemsAndCategories = await getItemsAndCategories(query.query);
    const totalInventoryValue = await getTotalInventoryValue();

    const groupedItems = flatItemsAndCategories.reduce((acc, currentItem) => {
        const category = currentItem.category_name;

        if (!acc[category]) acc[category] = [];

        if (currentItem.uuid) {
            const { category_name, ...itemData } = currentItem;
            acc[category].push(itemData);
        }

        return acc;
    }, {});

    res.json({ groupedItems, totalInventoryValue });
});

router.delete('/uuid', verifyRequest('web.admin.items.write'), limiter(4), async (req, res) => {
    const uuid = await Joi.string().uuid().validateAsync(req.params.uuid);
    const db_delete_restult = await deleteItem(uuid);
    if (db_delete_restult) deleteImage('items', uuid, 'webp');

    res.json({ message: "Succsess" })
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

/**
 * User route to get all items that need restocking, only if the restocking feature is enabled
 */
router.get('/restocking/list', verifyRequest('web.user.restock.read'), limiter(4), async (req, res) => {
    const hasPermission = checkPermission(req.user.permissions, 'web.admin.restock.read');
    if (hasPermission.result) {
        const restockingItems = await getItemsRestocking();
        res.json(restockingItems);
    } else {
        const restockingEnabled = await checkIfSettingTrue('USER_SHOPPINGLIST_ACTIVE');
        if (!restockingEnabled) return res.status(503).json({ error: 'Restocking feature is disabled' });

        const restockingItems = await getItemsRestocking();
        res.json(restockingItems);
    }
});

router.post('restocking/complete', verifyRequest('web.user.restock.write'), limiter(4), async (req, res) => {
    const body = await uuidItemArraySchema.validateAsync(await req.json());
    const hasPermission = checkPermission(req.user.permissions, 'web.admin.restock.write');
    if (hasPermission.result) {
        const {awardedAmount, totalAwardedPrice} = updateItemsBought(body.items, req.user.user_data.uuid);
        res.json({ message: 'Items marked as restocked', awardedAmount, finalBalance: totalAwardedPrice });
    } else {
        const restockingEnabled = await checkIfSettingTrue('USER_SHOPPINGLIST_ACTIVE');
        if (!restockingEnabled) return res.status(503).json({ error: 'Restocking feature is disabled' });

        const {awardedAmount, totalAwardedPrice} = updateItemsBought(body.items, req.user.user_data.uuid);
        res.json({ message: 'Items marked as restocked', awardedAmount, finalBalance: totalAwardedPrice });
    }
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

