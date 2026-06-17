const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const app = express();
const mongoose = require('mongoose');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// Cloudinary Setup
// ✅ CLOUDINARY CONFIGURATION FOR VERCEL
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
// ====== MONGODB LIVE DATABASE CONNECTION ======
const DB_URI = "mongodb+srv://seharkhan2028_db_user:qHl5SfLATd6q1H3e@cluster0.0nh3tgc.mongodb.net/zaib_collection?retryWrites=true&w=majority";

mongoose.connect(DB_URI)
    .then(() => console.log("🚀 MongoDB Cloud Database Connected Successfully!"))
    .catch(err => {
        console.error("❌ Database Connection Error:", err);
        // Agar cloud database connect na ho sake toh crash hone ke bajaye error logs mein show ho
    });
// MongoDB Schema (Tijoori ka structure ke data kaise save hoga)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    oldPrice: { type: Number, default: null },
    details: { type: String, default: "" },
    category: { type: String, required: true },
    statusTag: { type: String, default: "normal" },
    imageUrl: { type: String, default: "" },
    allImages: [String]
});

// Model banana
const Product = mongoose.model('Product', productSchema);

// 1. Get All Products from MongoDB Live Database
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find({});
        const formattedProducts = products.map(p => ({
            id: p._id.toString(),
            name: p.name,
            price: p.price,
            oldPrice: p.oldPrice,
            details: p.details,
            category: p.category,
            statusTag: p.statusTag,
            imageUrl: p.imageUrl,
            allImages: p.allImages
        }));
        res.json(formattedProducts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. Multer ko batayein ke 'images' ke naam se maximum 5 files accept karey
app.post('/api/products', upload.array('images', 5), async (req, res) => {
    try {
        // Agar user ne koi image upload nahi ki
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: "Kam az kam ek image zaroor upload karein." });
        }

        // 2. Saari images ko loop chala kar Cloudinary par upload karne ka tareeqa
        const uploadPromises = req.files.map(file => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: "zaib_collection_products" },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result.secure_url); // Upload hone ke baad image ka secure link milega
                    }
                );
                stream.end(file.buffer); // Memory storage se buffer read karna
            });
        });

        // Saari images upload hone ka intezar karein
        const imageUrls = await Promise.all(uploadPromises);

        // 3. Database mein product save karein (imageUrls array save hoga)
        const newProduct = new Product({
            name: req.body.name,
            category: req.body.category,
            statusTag: req.body.statusTag,
            price: req.body.price,
            oldPrice: req.body.oldPrice || null,
            details: req.body.details,
            images: imageUrls // ✅ Ab yahan saari tasveeron ke links ka array save ho jayega!
        });

        await newProduct.save();
        res.status(201).json({ success: true, message: "Product kamyabi se upload ho gaya hai!" });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
    }
});

// 3. Delete Product from MongoDB permanent
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Product.findByIdAndDelete(id); 
        res.json({ success: true, message: "Product deleted from database successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const nodemailer = require('nodemailer'); // Yeh line file ke sab se upar check kar lein agar pehle se nahi hai

// Nodemailer Transporter Setup (Gmail Configuration)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'seharkhan2028@gmail.com',
        pass: 'mcyh ojqa hjro xhil' // Aap ka generate kiya hua password yahan lag gaya hai
    }
});

// 4. Checkout / Place Order API (Yeh customer ka data email par bhejta hai)
app.post('/api/place-order', (req, res) => {
    const { name, phone, phone2, city, province, address, cart, subtotal, delivery, total } = req.body;

    // Cart items ko email mein behtareen tareeqe se dekhane ke liye HTML list banana
    let cartItemsHTML = '';
    for (const item in cart) {
        cartItemsHTML += `<li><strong>${item}</strong> — Quantity: ${cart[item].quantity} | Price: Rs. ${cart[item].price * cart[item].quantity}</li>`;
    }

    // Email ka khoobsurat design aur structure
    const mailOptions = {
        from: 'seharkhan2028@gmail.com',
        to: 'seharkhan2028@gmail.com', // Aap ko khud hi apni email par order received hoga
        subject: `🚨 New Order Received from ${name} (${city})`,
        html: `
            <div style="font-family: sans-serif; border: 1px solid #8b7355; padding: 20px; border-radius: 8px; max-width: 600px;">
                <h2 style="color: #8b7355; text-align: center; border-bottom: 2px solid #8b7355; padding-bottom: 10px;">Zaib Collection - New Order</h2>
                
                <h3>👤 Customer Details:</h3>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Phone 1:</strong> ${phone}</p>
                <p><strong>Phone 2 (Optional):</strong> ${phone2 || 'N/A'}</p>
                <p><strong>City:</strong> ${city}</p>
                <p><strong>Province:</strong> ${province}</p>
                <p><strong>Complete Address:</strong> ${address}</p>
                
                <hr style="border: 0; border-top: 1px solid #eee;">
                
                <h3>🛍️ Order Summary:</h3>
                <ul>${cartItemsHTML}</ul>
                
                <hr style="border: 0; border-top: 1px solid #eee;">
                
                <h3>💰 Bill Breakdown:</h3>
                <p><strong>Subtotal:</strong> Rs. ${subtotal}</p>
                <p><strong>Delivery Charges:</strong> Rs. ${delivery}</p>
                <h3 style="color: #b45309;">Total Payable (COD): Rs. ${total}</h3>
                
                <p style="font-size: 12px; color: #777; text-align: center; margin-top: 30px;">Order generated live from your full-stack application.</p>
            </div>
        `
    };

    // Email bhejne ka process
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Nodemailer Error:", error);
            return res.status(500).json({ success: false, message: "Email sending failed: " + error.message });
        }
        console.log("Email sent successfully: " + info.response);
        res.json({ success: true, message: "Order placed and email sent successfully!" });
    });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});