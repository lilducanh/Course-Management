const dotenv = require('dotenv');
// load .env from current folder; if important vars missing, try the parent folder
dotenv.config();
const express = require('express');
const cors = require('cors');
const { dayjs, toMySQLWeekday, dateRangeInclusive, formatDateVN } = require('./utils/listday');

const connection = require('./db');
const patch = require('path');


const app = express();
const port = process.env.PORT || 3000;




app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));


app.use(express.static(patch.join(__dirname, '../client')));

app.get('/healthz', (req, res) => res.send('OK'));


app.get('/', (req, res) => res.sendFile(patch.join(__dirname, '../client/nhanvien.html')));

app.get('/dbtest', async (req, res) => {
  try {
    const [rows] = await connection.query('SELECT 1 AS ok');
    res.json({ ok: true, result: rows });
  } catch (err) {
    console.error('DB error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


const KhoaHocRoutes = require('./routes/KhoaHocRoutes');
app.use('/api', KhoaHocRoutes);

const HocVienRoutes = require('./routes/HocVienRoutes');
app.use('/api', HocVienRoutes);

const NhanvienRoutes = require('./routes/NhanvienRoutes');
app.use('/api', NhanvienRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
