const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const app = express();

mongoose.connect('mongodb://localhost:/kv-dairy', { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// User Schema
const userSchema = new mongoose.Schema({
    email: String,
    password: String, // Store password in plain text
    name: String,
    phone: String,
    address: String,
    profilePhoto: String,
    role: { type: String, default: 'user' }, // 'user' or 'admin'
    orders: [{
        products: [{ name: String, quantity: Number, price: Number, image: String }],
        date: Date,
        address: String,
        total: Number,
        paymentStatus: { type: String, default: 'Not Done' } // 'Done' or 'Not Done'
    }]
});

const User = mongoose.model('User', userSchema);

// Middleware to pass common data to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.error = req.session.error || null;
    res.locals.success = req.session.success || null;
    req.session.error = null;
    req.session.success = null;
    next();
});

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.session.error = 'Access denied. Admins only.';
    res.redirect('/admin/login');
};

// Routes
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        }
        res.redirect('/dashboard');
    } else {
        res.render('login');
    }
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        req.session.error = 'User already exists, please login.';
        return res.redirect('/signup');
    }

    const user = new User({
        email,
        password, // Store password in plain text
        role: 'user' // Default role is 'user'
    });
    await user.save();
    
    req.session.success = 'Signup successful, please login.';
    res.redirect('/');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log('Login attempt:', { email, password });

    const user = await User.findOne({ email });
    console.log('User found:', user);

    if (!user) {
        console.log('User not found for email:', email);
        req.session.error = 'User not available, please sign up.';
        return res.redirect('/');
    }

    console.log('Comparing passwords:', { stored: user.password, provided: password });
    if (user.password === password) {
        req.session.user = user;
        console.log('Login successful for user:', email);
        if (user.role === 'admin') {
            console.log('Redirecting to admin dashboard');
            res.redirect('/admin/dashboard');
        } else {
            console.log('Redirecting to user dashboard');
            res.redirect('/dashboard');
        }
    } else {
        console.log('Invalid password for user:', email);
        req.session.error = 'Invalid email or password.';
        res.redirect('/');
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard');

    const user = await User.findById(req.session.user._id).lean();
    if (!user) {
        req.session.destroy();
        return res.redirect('/');
    }
    req.session.user = user;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let recentOrders = user.orders
        .filter(order => new Date(order.date) > thirtyDaysAgo)
        .map(order => ({
            ...order,
            date: new Date(order.date)
        }));

    // Sorting logic
    const { sortBy } = req.query;
    if (sortBy) {
        switch (sortBy) {
            case 'date-asc':
                recentOrders.sort((a, b) => a.date - b.date);
                break;
            case 'date-desc':
                recentOrders.sort((a, b) => b.date - a.date);
                break;
            case 'product-asc':
                recentOrders.sort((a, b) => a.products[0]?.name.localeCompare(b.products[0]?.name));
                break;
            case 'product-desc':
                recentOrders.sort((a, b) => b.products[0]?.name.localeCompare(a.products[0]?.name));
                break;
            case 'paid':
                recentOrders.sort((a, b) => a.paymentStatus === 'Paid' ? -1 : 1);
                break;
            case 'unpaid':
                recentOrders.sort((a, b) => a.paymentStatus === 'Not Paid' ? -1 : 1);
                break;
        }
    }

    const unpaidOrders = recentOrders.filter(order => order.paymentStatus === 'Not Paid');
    const totalAmount = unpaidOrders.reduce((sum, order) => sum + order.total, 0);

    res.render('dashboard', { 
        user: req.session.user,
        recentOrders,
        totalAmount
    });
});

app.get('/profile', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.render('profile', { user: req.session.user });
});

app.post('/profile', upload.single('profilePhoto'), async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { name, phone, address } = req.body;
    const updateData = { name, phone, address };
    
    if (req.file) {
        updateData.profilePhoto = `/uploads/${req.file.filename}`;
    }

    const user = await User.findByIdAndUpdate(req.session.user._id, updateData, { new: true });
    req.session.user = user;
    res.redirect('/dashboard');
});

app.post('/order', async (req, res) => {
    if (!req.session.user) {
        console.log('No user in session, redirecting to login');
        return res.redirect('/');
    }

    // Fetch the latest user data from the database
    const user = await User.findById(req.session.user._id);
    if (!user) {
        console.log('User not found in database, destroying session');
        req.session.destroy();
        return res.redirect('/');
    }

    // Log the user data for debugging
    console.log('User data from DB:', {
        id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone
    });

    // Check if mandatory profile details (name and phone) are updated
    if (!user.name || !user.phone) {
        console.log('Profile incomplete: name or phone missing');
        return res.status(400).json({
            success: false,
            message: 'Please update your profile with name and mobile number before placing an order.'
        });
    }

    const { products, address } = req.body;
    console.log('Placing order for user:', user.email);
    console.log('Order details:', { products, address });

    const total = products.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    const updatedUser = await User.findByIdAndUpdate(
        req.session.user._id,
        {
            $push: {
                orders: {
                    products,
                    date: new Date(),
                    address,
                    total,
                    paymentStatus: 'Not Paid'
                }
            }
        },
        { new: true }
    );

    console.log('Updated user with new order:', updatedUser);
    req.session.user = updatedUser; // Update session with latest data
    res.json({ success: true });
});

// Admin Routes
app.get('/admin/login', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin-login');
});

app.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
        req.session.error = 'Admin not found.';
        return res.redirect('/admin/login');
    }

    if (user.role !== 'admin') {
        req.session.error = 'Access denied. Admins only.';
        return res.redirect('/admin/login');
    }

    if (user.password === password) { // Compare passwords directly
        req.session.user = user;
        res.redirect('/admin/dashboard');
    } else {
        req.session.error = 'Invalid email or password.';
        res.redirect('/admin/login');
    }
});

app.get('/admin/dashboard', isAdmin, async (req, res) => {
    const users = await User.find({ role: 'user' }).lean();
    let allOrders = users.flatMap(user => 
        user.orders.map(order => ({
            ...order,
            userId: user._id,
            userEmail: user.email,
            userName: user.name || 'Unknown'
        }))
    );

    // Sorting logic
    const { sortBy } = req.query;
    if (sortBy) {
        switch (sortBy) {
            case 'date-asc':
                allOrders.sort((a, b) => new Date(a.date) - new Date(b.date));
                break;
            case 'date-desc':
                allOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
                break;
            case 'product-asc':
                allOrders.sort((a, b) => a.products[0]?.name.localeCompare(b.products[0]?.name));
                break;
            case 'product-desc':
                allOrders.sort((a, b) => b.products[0]?.name.localeCompare(a.products[0]?.name));
                break;
            case 'paid':
                allOrders.sort((a, b) => a.paymentStatus === 'Paid' ? -1 : 1);
                break;
            case 'unpaid':
                allOrders.sort((a, b) => a.paymentStatus === 'Not Paid' ? -1 : 1);
                break;
            case 'user-asc':
                allOrders.sort((a, b) => a.userName.localeCompare(b.userName));
                break;
            case 'user-desc':
                allOrders.sort((a, b) => b.userName.localeCompare(a.userName));
                break;
        }
    }

    res.render('admin-dashboard', { orders: allOrders });
});

app.post('/admin/update-payment/:userId/:orderId', isAdmin, async (req, res) => {
    const { userId, orderId } = req.params;
    const { paymentStatus } = req.body;
    console.log('Updating payment status:', { userId, orderId, paymentStatus });

    // Ensure paymentStatus is either "Paid" or "Not Paid"
    if (!['Paid', 'Not Paid'].includes(paymentStatus)) {
        console.log('Invalid payment status:', paymentStatus);
        return res.status(400).send('Invalid payment status');
    }

    const result = await User.updateOne(
        { _id: userId, 'orders._id': orderId },
        { $set: { 'orders.$.paymentStatus': paymentStatus } }
    );
    console.log('Update result:', result);

    res.redirect('/admin/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
