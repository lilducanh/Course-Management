const express = require('express');
const router = express.Router();
const { viewHocVienTheoKhoa, addHocVien, getNhanSuChuaDangKy, updateHocVien, deleteHocVien } = require('../controllers/HocVienController');

// GET /api/khoa_hoc/:ma_khoa_hoc/hoc_vien?page=1&page_size=20&q=tu-khoa
router.get('/khoa_hoc/:ma_khoa_hoc/hoc_vien', viewHocVienTheoKhoa);

// GET /api/khoa_hoc/:ma_khoa_hoc/nhan_su_chua_dang_ky?q=tu-khoa
router.get('/khoa_hoc/:ma_khoa_hoc/nhan_su_chua_dang_ky', getNhanSuChuaDangKy);

// POST /api/khoa_hoc/:ma_khoa_hoc/hoc_vien
router.post('/khoa_hoc/:ma_khoa_hoc/hoc_vien', addHocVien);

// PUT /api/khoa_hoc/:ma_khoa_hoc/hoc_vien/:ma_hoc_vien
router.put('/khoa_hoc/:ma_khoa_hoc/hoc_vien/:ma_hoc_vien', updateHocVien);

// DELETE /api/khoa_hoc/:ma_khoa_hoc/hoc_vien/:ma_hoc_vien
router.delete('/khoa_hoc/:ma_khoa_hoc/hoc_vien/:ma_hoc_vien', deleteHocVien);

module.exports = router;