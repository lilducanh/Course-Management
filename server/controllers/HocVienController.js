const pool = require('../db');


const viewHocVienTheoKhoa = async (req, res) => {
  const { ma_khoa_hoc } = req.params;
  const page = parseInt(req.query.page) || 1;
  const page_size = parseInt(req.query.page_size) || 20;
  const q = req.query.q ? req.query.q.trim() : '';

  try {
    const offset = (page - 1) * page_size;

    // Câu SQL: JOIN để lấy thông tin nhân sự (tên, email...)
    const sql = `
      SELECT 
        hv.ma_hoc_vien,
        hv.ma_nhan_su,
        hv.ma_khoa_hoc,
        hv.ngay_dang_ky,
        ns.ho,
        ns.ten,
        ns.email,
        ns.chuc_danh,
        ns.phong_ban,
        ns.ban,
        ns.so_dien_thoai
      FROM hoc_vien hv
      JOIN nhan_su ns ON ns.ma_nhan_su = hv.ma_nhan_su
      WHERE hv.ma_khoa_hoc = ?
        AND (ns.ho LIKE ? OR ns.ten LIKE ? OR ns.email LIKE ? OR ns.phong_ban LIKE ?)
      ORDER BY ns.ho, ns.ten
      LIMIT ${parseInt(page_size)} OFFSET ${parseInt(offset)}
    `;

    // Truyền đúng số lượng tham số (5 cái LIKE)
    const like = `%${q}%`;
    const [rows] = await pool.query(sql, [
      ma_khoa_hoc,
      like, like, like, like
    ]);

    return res.json({
      ok: true,
      page,
      page_size,
      count: rows.length,
      data: rows
    });

  } catch (err) {
    console.error('Lỗi khi xem học viên theo khóa:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server' });
  }
};

const getNhanSuChuaDangKy = async (req, res) => {
  const { ma_khoa_hoc } = req.params;
  const q = req.query.q ? req.query.q.trim() : '';

  try {
    // Lấy nhân viên chưa đăng ký khóa học này
    const sql = `
      SELECT 
        ns.ma_nhan_su,
        ns.ho,
        ns.ten,
        ns.email,
        ns.chuc_danh,
        ns.phong_ban,
        ns.ban,
        ns.so_dien_thoai
      FROM nhan_su ns
      WHERE NOT EXISTS (
        SELECT 1 FROM hoc_vien hv WHERE hv.ma_nhan_su = ns.ma_nhan_su AND hv.ma_khoa_hoc = ?
      )
      AND (ns.ho LIKE ? OR ns.ten LIKE ? OR ns.email LIKE ? OR ns.phong_ban LIKE ?)
      ORDER BY ns.ho, ns.ten
    `;

    const like = `%${q}%`;
    const [rows] = await pool.query(sql, [
      ma_khoa_hoc,
      like, like, like, like
    ]);

    return res.json({
      ok: true,
      data: rows
    });

  } catch (err) {
    console.error('Lỗi khi lấy nhân viên chưa đăng ký:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server' });
  }
};

const addHocVien = async (req, res) => {
  const { ma_khoa_hoc } = req.params;
  const { ma_nhan_su, ngay_dang_ky } = req.body;

  if (!ma_nhan_su || !ngay_dang_ky) {
    return res.status(400).json({ message: 'Vui lòng cung cấp ma_nhan_su và ngay_dang_ky' });
  }

  try {
    // Kiểm tra khóa học tồn tại
    const [khoaHoc] = await pool.query('SELECT ma_khoa_hoc FROM khoa_hoc WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);
    if (khoaHoc.length === 0) {
      return res.status(404).json({ message: 'Khóa học không tồn tại' });
    }

    // Kiểm tra nhân sự tồn tại
    const [nhanSu] = await pool.query('SELECT ma_nhan_su FROM nhan_su WHERE ma_nhan_su = ?', [ma_nhan_su]);
    if (nhanSu.length === 0) {
      return res.status(404).json({ message: 'Nhân sự không tồn tại' });
    }

    // Kiểm tra đã đăng ký chưa
    const [existing] = await pool.query('SELECT ma_hoc_vien FROM hoc_vien WHERE ma_nhan_su = ? AND ma_khoa_hoc = ?', [ma_nhan_su, ma_khoa_hoc]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Nhân sự đã đăng ký khóa học này' });
    }

    // Lấy lịch học của khóa học này
    const [lichHocMoi] = await pool.query('SELECT thu, gio_bat_dau, gio_ket_thuc FROM lich_dao_tao WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);

    // Lấy danh sách khóa học mà nhân viên đã đăng ký (không bao gồm khóa này)
    const [khoaHocDaDangKy] = await pool.query(`
      SELECT kh.ma_khoa_hoc, kh.ten_khoa_hoc, ld.thu, ld.gio_bat_dau, ld.gio_ket_thuc
      FROM hoc_vien hv
      JOIN khoa_hoc kh ON hv.ma_khoa_hoc = kh.ma_khoa_hoc
      JOIN lich_dao_tao ld ON kh.ma_khoa_hoc = ld.ma_khoa_hoc
      WHERE hv.ma_nhan_su = ? AND hv.ma_khoa_hoc != ?
    `, [ma_nhan_su, ma_khoa_hoc]);

    // Kiểm tra trùng lịch
    const conflicts = [];
    for (const lichMoi of lichHocMoi) {
      for (const lichCu of khoaHocDaDangKy) {
        if (lichMoi.thu === lichCu.thu) {
          // Kiểm tra giờ trùng
          if (
            (lichMoi.gio_bat_dau < lichCu.gio_ket_thuc && lichMoi.gio_ket_thuc > lichCu.gio_bat_dau) ||
            (lichCu.gio_bat_dau < lichMoi.gio_ket_thuc && lichCu.gio_ket_thuc > lichMoi.gio_bat_dau)
          ) {
            conflicts.push({
              ma_khoa_hoc: lichCu.ma_khoa_hoc,
              ten_khoa_hoc: lichCu.ten_khoa_hoc,
              thu: lichMoi.thu,
              gio_bat_dau: lichMoi.gio_bat_dau,
              gio_ket_thuc: lichMoi.gio_ket_thuc
            });
          }
        }
      }
    }

    if (conflicts.length > 0) {
      return res.status(400).json({
        message: 'Lịch học trùng với các khóa học khác mà nhân viên đã đăng ký',
        khoa_hoc_trung: conflicts
      });
    }

    // Sinh mã học viên tăng dần: HV001, HV002, ...
    const [maxResult] = await pool.query('SELECT MAX(CAST(SUBSTRING(ma_hoc_vien, 3) AS UNSIGNED)) AS max_num FROM hoc_vien');
    const maxNum = maxResult[0].max_num || 0;
    const nextNum = maxNum + 1;
    const ma_hoc_vien = 'HV' + String(nextNum).padStart(3, '0');

    // Thêm học viên
    await pool.query(
      'INSERT INTO hoc_vien (ma_hoc_vien, ma_nhan_su, ma_khoa_hoc, ngay_dang_ky) VALUES (?, ?, ?, ?)',
      [ma_hoc_vien, ma_nhan_su, ma_khoa_hoc, ngay_dang_ky]
    );

    return res.status(201).json({
      message: 'Thêm học viên thành công',
      ma_hoc_vien: ma_hoc_vien
    });

  } catch (err) {
    console.error('Lỗi khi thêm học viên:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};

const updateHocVien = async (req, res) => {
  const { ma_khoa_hoc, ma_hoc_vien } = req.params;
  const { ngay_dang_ky } = req.body;

  if (!ngay_dang_ky) {
    return res.status(400).json({ message: 'Vui lòng cung cấp ngay_dang_ky' });
  }

  try {
    // Kiểm tra học viên tồn tại trong khóa học
    const [existing] = await pool.query('SELECT ma_hoc_vien FROM hoc_vien WHERE ma_hoc_vien = ? AND ma_khoa_hoc = ?', [ma_hoc_vien, ma_khoa_hoc]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Học viên không tồn tại trong khóa học này' });
    }

    // Cập nhật
    await pool.query(
      'UPDATE hoc_vien SET ngay_dang_ky = ? WHERE ma_hoc_vien = ?',
      [ngay_dang_ky, ma_hoc_vien]
    );

    return res.json({ message: 'Cập nhật học viên thành công' });

  } catch (err) {
    console.error('Lỗi khi cập nhật học viên:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};

const deleteHocVien = async (req, res) => {
  const { ma_khoa_hoc, ma_hoc_vien } = req.params;

  try {
    // Kiểm tra học viên tồn tại trong khóa học
    const [existing] = await pool.query('SELECT ma_hoc_vien FROM hoc_vien WHERE ma_hoc_vien = ? AND ma_khoa_hoc = ?', [ma_hoc_vien, ma_khoa_hoc]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Học viên không tồn tại trong khóa học này' });
    }

    // Xóa
    await pool.query('DELETE FROM hoc_vien WHERE ma_hoc_vien = ?', [ma_hoc_vien]);

    return res.json({ message: 'Xóa học viên thành công' });

  } catch (err) {
    console.error('Lỗi khi xóa học viên:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};

module.exports = { viewHocVienTheoKhoa, getNhanSuChuaDangKy, addHocVien, updateHocVien, deleteHocVien };