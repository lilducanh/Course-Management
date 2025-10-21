const express = require('express');
const router = express.Router();
const { viewNhanVien,addNhanVien , updateNhanVien  , deleteNhanVien , viewKhoaHocTheoNhanVien } = require('../controllers/NhanvienController');

router.get('/nhan_vien', viewNhanVien);

router.post('/nhan_vien', addNhanVien);

router.put('/nhan_vien/:ma_nhan_su', updateNhanVien);

router.delete('/nhan_vien/:ma_nhan_su', deleteNhanVien);

router.get('/nhan_vien/khoa_hoc/:ma_nhan_su', viewKhoaHocTheoNhanVien);

module.exports = router;
