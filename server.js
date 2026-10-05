const express = require('express');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const db = require('./src/config/db'); 

dotenv.config();

const app = express();

app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3000;

const authRoutes = require('./src/routes/authRoutes');

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy and running!'
  });
});

app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});





