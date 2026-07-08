require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
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
 const DB_URI = process.env.MONGODB_URI;

if (!DB_URI) {
    console.error("❌ MONGODB_URI missing in .env");
    process.exit(1);
}
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
  allImagePublicIds: {
  type: [String],
  default: []
},
  colors: [String],
  sizes: [String],
  stock: {
  type: Number,
  default: 0
},
sku: {
  type: String,
  default: ""
},
featured: {
  type: Boolean,
  default: false
},
trending: {
  type: Boolean,
  default: false
}
}, {
  timestamps: true
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

function validateProduct(data, isUpdate = false) {
    const errors = [];

    if (!isUpdate || data.name !== undefined) {
        if (!data.name || data.name.trim().length < 3) {
            errors.push("Product name must be at least 3 characters.");
        }
    }

    if (!isUpdate || data.price !== undefined) {
        const price = Number(data.price);
        if (isNaN(price) || price < 0) {
            errors.push("Price must be a valid positive number.");
        }
    }

    if (!isUpdate || data.category !== undefined) {
        const categories = ["women", "men", "kids", "jewelry"];

        if (!categories.includes(data.category)) {
            errors.push("Invalid category selected.");
        }
    }

    return errors;
}

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
       const errors = validateProduct(req.body);

if (errors.length) {
    return res.status(400).json({
        success: false,
        errors
    });
}
    const imageUrls = await Promise.all(req.files.map(file =>
      new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: "zaib_collection_products" }, (err, result) => {
          if (err) return reject(err);
          resolve({
    url: result.secure_url,
    public_id: result.public_id
});
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
      allImages: uploadedImages.map(img => img.url),
allImagePublicIds: uploadedImages.map(img => img.public_id),
imageUrl: uploadedImages[0].url
    });

    await newProduct.save();
    res.status(201).json({ success: true, message: "Product uploaded successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    const {
      name,
      category,
      price,
      oldPrice,
      details,
      statusTag,
      colors,
      sizes,
      stock,
      sku,
      featured,
      trending
    } = req.body;

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        category,
        price,
        oldPrice,
        details,
        statusTag,
        colors: Array.isArray(colors)
          ? colors
          : (colors || "").split(",").map(c => c.trim()).filter(Boolean),
        sizes: Array.isArray(sizes)
          ? sizes
          : (sizes || "").split(",").map(s => s.trim()).filter(Boolean),
        stock: Number(stock || 0),
        sku: sku || "",
        featured: featured === true || featured === "true",
        trending: trending === true || trending === "true"
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.delete("/api/products/:id", async (req, res) => {
    try {

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        if (product.allImagePublicIds?.length) {

            await Promise.all(
                product.allImagePublicIds.map(publicId =>
                    cloudinary.uploader.destroy(publicId)
                )
            );

        }

        await Product.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: "Product and images deleted successfully"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

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
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
}
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
app.use((err, req, res, next) => {
    console.error(err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error"
    });
});
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
