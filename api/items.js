const { verifyRequest } = require('@middleware/verifyRequest');
const { parseMultipart } = require('@middleware/parseMultipartForm');
const { limiter } = require('@middleware/limiter');
const { checkPermission } = require('@lib/permissions');
const { createItem, clearExpiredDiscountByUUID, getActiveDiscounts, getItemByUUID, getItemBuyers, updateItemByUUID, getItemsAndCategories, getTotalInventoryValue, deleteItem, getItemsRestocking, updateItemsBought } = require('@lib/sqlite/items');
const { getNotificationSubscribers } = require('@lib/sqlite/userNotifications');
const { NOTIFICATION_TYPES, sendNotification } = require('@lib/notifications');
const { checkIfSettingTrue } = require('@lib/sqlite/settings');
const Joi = require('@lib/sanitizer');
const { writeImage, deleteImage } = require('@lib/imageStore');
const { verifyBufferIsJPG, convertToWebp } = require('@lib/utils');
const { InvalidRouteInput } = require('@lib/errors');
const express = require('ultimate-express');
const gategories_conf = require('@config/categories');
const router = new express.Router();

/* Plugin info*/
const PluginName = 'Items'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const searchSchema = Joi.object({
    query: Joi.fullysanitizedString().min(1).max(100).default('')
});

const buyerSearchSchema = Joi.object({
    search: Joi.fullysanitizedString().allow('').max(100).default(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
});

const newItemSchema = Joi.object({
    name: Joi.fullysanitizedString().min(3).max(100).required(),
    price: Joi.number().positive().required(),
    stock: Joi.number().integer().min(0).required(),
    targetStock: Joi.number().integer().min(0).required(),
    packSize: Joi.number().integer().min(1).required(),
    packPrice: Joi.number().positive().min(1).required(),
    category: Joi.fullysanitizedString().valid(...Object.keys(gategories_conf)).required(),
    discountPrice: Joi.number().positive().allow('', null).optional(),
    discountUntil: Joi.string().isoDate().allow('', null).optional()
});

const discountNotificationSchema = Joi.object({
    items: Joi.array().items(Joi.string().uuid()).min(1).max(100).unique().required()
});

const uuidItemArraySchema = Joi.object({
    items: Joi.array().items(Joi.object({
        uuid: Joi.string().uuid().required(),
        amount: Joi.number().integer().min(1).required()
    })).min(1).required()
});

const validateUUID = Joi.object({
    uuid: Joi.string().uuid().required()
});

const validateDiscount = (item) => {
    const hasPrice = item.discountPrice !== '' && item.discountPrice !== null && item.discountPrice !== undefined;
    const hasUntil = item.discountUntil !== '' && item.discountUntil !== null && item.discountUntil !== undefined;

    if (hasPrice !== hasUntil) {
        return 'Discount price and expiration must both be set';
    }
    if (hasPrice && item.discountPrice >= item.price) {
        return 'Discount price must be lower than the regular price';
    }
    if (hasUntil && new Date(item.discountUntil).getTime() <= Date.now()) {
        return 'Discount expiration must be in the future';
    }
    return null;
};

router.post('/', verifyRequest('web.admin.items.write'), parseMultipart(), limiter(10), async (req, res) => {
    const body = await newItemSchema.validateAsync(req.body);
    const discountError = validateDiscount(body);
    if (discountError) return res.status(400).json({ error: discountError });
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

router.get('/buyers/:uuid', verifyRequest('web.admin.items.read'), limiter(4), async (req, res) => {
    const params = await validateUUID.validateAsync(req.params);
    const query = await buyerSearchSchema.validateAsync(req.query);
    const item = await getItemByUUID(params.uuid);

    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { buyers, total } = getItemBuyers(params.uuid, query.search, query.page, query.limit);
    res.json({
        item: {
            uuid: item.uuid,
            name: item.name,
        },
        buyers,
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
        },
    });
});

router.get('/discounts', verifyRequest('web.admin.items.read'), limiter(4), async (req, res) => {
    return res.json({ discounts: getActiveDiscounts() });
});

router.post('/discounts/notify', verifyRequest('web.admin.items.write'), limiter(2), async (req, res) => {
    const body = await discountNotificationSchema.validateAsync(req.body);
    const selected = getActiveDiscounts().filter((item) => body.items.includes(item.uuid));
    if (selected.length !== body.items.length) {
        return res.status(400).json({ error: 'One or more discounts are no longer active' });
    }

    const message = JSON.stringify({ items: selected });
    const subscribers = getNotificationSubscribers('discount', 'email', true);
    await Promise.all(subscribers.map((user) =>
        sendNotification(user.id, 0, NOTIFICATION_TYPES.DISCOUNTS, message, user)
    ));

    return res.json({ queued: subscribers.length, discounts: selected.length });
});

router.get('/:uuid', verifyRequest('web.admin.items.read'), limiter(4), async (req, res) => {
    const params = await validateUUID.validateAsync(req.params);
    clearExpiredDiscountByUUID(params.uuid);
    const item = await getItemByUUID(params.uuid);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    res.json(item);
});

router.put('/:uuid', verifyRequest('web.admin.items.write'), parseMultipart(), limiter(10), async (req, res) => {
    const params = await validateUUID.validateAsync(req.params);
    const body = await newItemSchema.validateAsync(req.body);
    const discountError = validateDiscount(body);
    if (discountError) return res.status(400).json({ error: discountError });

    // Image is only in the request if it was modified
    if (req.file) {
        const validImage = await verifyBufferIsJPG(req.file.buffer, 512, 512);
        if (!validImage) throw new InvalidRouteInput('Invalid Image');

        const webpImage = await convertToWebp(req.file.buffer, { quality: 75, lossless: false, effort: 4 });

        await writeImage(webpImage, 'items', params.uuid, 'webp');
    }

    await updateItemByUUID(params.uuid, body);

    res.status(200).json(params.uuid);
});

router.delete('/:uuid', verifyRequest('web.admin.items.write'), limiter(4), async (req, res) => {
    const params = await validateUUID.validateAsync(req.params);
    const db_delete_result = await deleteItem(params.uuid);
    if (db_delete_result) deleteImage('items', params.uuid, 'webp');
    res.json({ message: "Success" })
});

/**
 * User route to get all items that need restocking, only if the restocking feature is enabled
 */
router.get('/restocking/list', verifyRequest('web.user.restock.read'), limiter(4), async (req, res) => {
    // Admins always have access to the restocking list, regular users only if the feature is enabled
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

router.post('/restocking/complete', verifyRequest('web.user.restock.write'), limiter(4), async (req, res) => {
    const body = await uuidItemArraySchema.validateAsync(req.body);
    // Admins always have access to the restocking list, regular users only if the feature is enabled
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

