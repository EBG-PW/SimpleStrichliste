// const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { countUsers, createUser, createAdminUser } = require('@lib/sqlite/users');
const Joi = require('@lib/sanitizer');
const bcrypt = require('bcrypt');
const HyperExpress = require('hyper-express');
const router = new HyperExpress.Router();


/* Plugin info*/
const PluginName = 'Users'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const userSchema = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    email: Joi.string().email().required(),
    username: Joi.string().min(3).max(30).required(),
    password: Joi.string().min(8).max(56).required(),
});

router.get('/hasUsers', limiter(10), async (req, res) => {
    const usercount = await countUsers();
    if (usercount > 0) {
        return res.json({ hasUsers: true });
    }
    return res.json({ hasUsers: false });
});

router.post('/admin', limiter(20), async (req, res) => {
    const body = await userSchema.validateAsync(await req.json());
    const usercount = await countUsers();
    if (usercount > 0) {
        return res.status(409).json({ error: 'Not available' });
    }

    const password_hash = await bcrypt.hash(body.password, parseInt(process.env.SALTROUNDS));
    try {
        await createAdminUser(body.name, body.email, body.username, password_hash);
        return res.status(201).json({ message: 'Admin user created successfully' });
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        throw error;
    }
});

router.post('/', limiter(20), async (req, res) => {
    const body = await userSchema.validateAsync(await req.json());

    const password_hash = await bcrypt.hash(body.password, parseInt(process.env.SALTROUNDS));
    try {
        await createUser(body.name, body.email, body.username, password_hash);
        return res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        throw error;
    }
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};

