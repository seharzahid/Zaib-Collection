const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary setup
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB connection
const DB_URI = process.env.MONGODB_URI || "mongodb+srv://seharkhan2028_db_user:qHl5SfLATd6q1H3e@cluster0.0nh3tgc.mongodb.net/zaib_collection?retryWrites=true&w=majority";

mongoose.connect(DB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000
}).then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ DB Error:", err));

// Schemas
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  oldPrice: Number,
  details: String,
  category: String,
  statusTag: { type: String, default: "normal" },
  imageUrl: String,
  allImages: [String],
  colors: [String],
  sizes: [String]
});

const reviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  rating: { type: Number, min: 1, max: 5 },
  comment: String,
  createdAt: { type: Date, default: Date.now },
  approved: { type: Boolean, default: true }
});

const Product = mongoose.model('Product', productSchema);
const Review = mongoose.model('Review', reviewSchema);

// APIs
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({}).lean();
    res.json(products.map(p => ({
      id: p._id,
      name: p.name,
      price: p.price,
      oldPrice: p.oldPrice,
      details: p.details,
      category: p.category,
      statusTag: p.statusTag,
      imageUrl: p.imageUrl,
      allImages: p.allImages || [],
      colors: p.colors || [],
      sizes: p.sizes || []
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ success: false, message: "At least one image required." });
    }

    const imageUrls = await Promise.all(req.files.map(file =>
      new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: "zaib_collection_products" }, (err, result) => {
          if (err) return reject(err);
          resolve(result.secure_url);
        }).end(file.buffer);
      })
    ));

    const newProduct = new Product({
      name: req.body.name,
      category: req.body.category,
      statusTag: req.body.statusTag,
      price: req.body.price,
      oldPrice: req.body.oldPrice || null,
      details: req.body.details,
      colors: (req.body.colors || "").split(',').map(c => c.trim()).filter(Boolean),
      sizes: (req.body.sizes || "").split(',').map(s => s.trim()).filter(Boolean),
      allImages: imageUrls,
      imageUrl: imageUrls[0]
    });

    await newProduct.save();
    res.status(201).json({ success: true, message: "Product uploaded successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reviews
app.post('/api/reviews', async (req, res) => {
  try {
    const { productId, name, rating, comment } = req.body;
    if (!productId || !name || !rating) return res.status(400).json({ success: false, message: "Missing fields" });

    const review = new Review({ productId, name, rating, comment });
    await review.save();
    res.status(201).json({ success: true, message: "Review added" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reviews/:productId', async (req, res) => {
  try {
    const reviews = await Review.find({ productId: req.params.productId, approved: true }).sort({ createdAt: -1 }).lean();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'seharkhan2028@gmail.com', pass: 'mcyh ojqa hjro xhil' }
});

app.post('/api/place-order', (req, res) => {
  const { name, city, cart, total, paymentMethod } = req.body;
  const mailOptions = {
    from: 'seharkhan2028@gmail.com',
    to: 'seharkhan2028@gmail.com',
    subject: `New Order from ${name} (${city})`,
    text: `Order Details:\n${JSON.stringify(cart)}\nTotal: Rs. ${total}\nPayment: ${paymentMethod}`
  };

  transporter.sendMail(mailOptions, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: "Order placed & email sent!" });
  });
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
