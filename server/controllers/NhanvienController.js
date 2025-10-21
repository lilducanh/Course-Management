const pool = require('../db');

const safeGetConn = async () => {
  if (pool.getConnection) {
    return await pool.getConnection();
  }
  return pool;
};

const viewNhanVien = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM nhan_su ORDER BY ma_nhan_su');
    return res.status(200).json({
      message: 'Lấy danh sách nhân viên thành công',
      tong_so_nhan_vien: rows.length,
      danh_sach: rows
    });
  } catch (error) {
    console.error('Lỗi khi xem nhân viên:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};


const addNhanVien = async (req, res) => {
  const {
    ho,
    ten,
    chuc_danh,
    phong_ban,
    ban,
    ngay_sinh,
    email,
    so_dien_thoai
  } = req.body;

  if (!ho || !ten || !email) {
    return res.status(400).json({ message: 'Thiếu thông tin bắt buộc: ho, ten, email' });
  }

  let conn;
  try {
    conn = await safeGetConn();

    // Generate new ma_nhan_su: NV001, NV002, etc.
    const [maxRow] = await conn.execute('SELECT MAX(CAST(SUBSTRING(ma_nhan_su, 3) AS UNSIGNED)) AS max_num FROM nhan_su WHERE ma_nhan_su LIKE "NV%"');
    const maxNum = maxRow[0].max_num || 0;
    const newNum = maxNum + 1;
    const ma_nhan_su = `NV${String(newNum).padStart(3, '0')}`;

    // Check if email already exists
    const [existing] = await conn.execute(
      'SELECT ma_nhan_su FROM nhan_su WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      if (conn.release) conn.release();
      return res.status(400).json({ message: 'Email đã tồn tại' });
    }

    await conn.execute(
      `INSERT INTO nhan_su (ma_nhan_su, ho, ten, chuc_danh, phong_ban, ban, ngay_sinh, email, so_dien_thoai)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ma_nhan_su,
        ho,
        ten,
        chuc_danh || null,
        phong_ban || null,
        ban || null,
        ngay_sinh || null,
        email,
        so_dien_thoai || null
      ]
    );

    if (conn.release) conn.release();
    return res.status(201).json({ message: 'Thêm nhân viên thành công', ma_nhan_su });
  } catch (err) {
    if (conn && conn.release) { try { conn.release(); } catch(_) {} }
    console.error('addNhanVien error:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};

const updateNhanVien = async (req, res) => {
  const { ma_nhan_su } = req.params;
  const {
    ho,
    ten,
    chuc_danh,
    phong_ban,
    ban,
    ngay_sinh,
    email,
    so_dien_thoai
  } = req.body;

  if (!ho || !ten || !email) {
    return res.status(400).json({ message: 'Thiếu thông tin bắt buộc: ho, ten, email' });
  }

  let conn;
  try {
    conn = await safeGetConn();

    // Check if email is taken by another employee
    const [existing] = await conn.execute(
      'SELECT ma_nhan_su FROM nhan_su WHERE email = ? AND ma_nhan_su <> ?',
      [email, ma_nhan_su]
    );
    if (existing.length > 0) {
      if (conn.release) conn.release();
      return res.status(400).json({ message: 'Email đã được sử dụng bởi nhân viên khác' });
    }

    const [rows] = await conn.execute('SELECT * FROM nhan_su WHERE ma_nhan_su = ?', [ma_nhan_su]);
    if (rows.length === 0) {
      if (conn.release) conn.release();
      return res.status(404).json({ message: 'Nhân viên không tồn tại' });
    }

    await conn.execute(
      `UPDATE nhan_su SET ho = ?, ten = ?, chuc_danh = ?, phong_ban = ?, ban = ?, ngay_sinh = ?, email = ?, so_dien_thoai = ?
       WHERE ma_nhan_su = ?`,
      [
        ho,
        ten,
        chuc_danh || null,
        phong_ban || null,
        ban || null,
        ngay_sinh || null,
        email,
        so_dien_thoai || null,
        ma_nhan_su
      ]
    );

    if (conn.release) conn.release();
    return res.json({ message: 'Cập nhật nhân viên thành công' });
  } catch (err) {
    if (conn && conn.release) { try { conn.release(); } catch(_) {} }
    console.error('updateNhanVien error:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};

const deleteNhanVien = async (req, res) => {
  const { ma_nhan_su } = req.params;

  let conn;
  try {
    conn = await safeGetConn();

    const [rows] = await conn.execute('SELECT * FROM nhan_su WHERE ma_nhan_su = ?', [ma_nhan_su]);
    if (rows.length === 0) {
      if (conn.release) conn.release();
      return res.status(404).json({ message: 'Nhân viên không tồn tại' });
    }

    await conn.execute('DELETE FROM nhan_su WHERE ma_nhan_su = ?', [ma_nhan_su]);

    if (conn.release) conn.release();
    return res.json({ message: 'Xóa nhân viên thành công' });
  } catch (err) {
    if (conn && conn.release) { try { conn.release(); } catch(_) {} }
    console.error('deleteNhanVien error:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};
const viewKhoaHocTheoNhanVien = async (req, res) => {
  const { ma_nhan_su } = req.params;

  try {
    const sql = `
      SELECT 
        kh.ma_khoa_hoc,
        kh.ten_khoa_hoc,
        kh.mo_ta,
        kh.ngay_bat_dau,
        kh.ngay_ket_thuc,
        kh.bat_buoc,
        kh.suc_chua_toi_da,
        kh.so_buoi_hoc_moi_tuan,
        hv.ngay_dang_ky
      FROM hoc_vien hv
      JOIN khoa_hoc kh ON hv.ma_khoa_hoc = kh.ma_khoa_hoc
      WHERE hv.ma_nhan_su = ?
      ORDER BY kh.ngay_bat_dau DESC
    `;

    const [rows] = await pool.query(sql, [ma_nhan_su]);

    return res.json({
      ok: true,
      danh_sach: rows
    });

  } catch (err) {
    console.error('Lỗi khi xem khóa học theo nhân viên:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server' });
  }
};

module.exports = { addNhanVien,
                   updateNhanVien,
                   deleteNhanVien , 
                   viewNhanVien ,
                   viewKhoaHocTheoNhanVien};

