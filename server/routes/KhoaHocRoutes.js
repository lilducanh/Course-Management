const express  = require('express');
const router = express.Router();
const { addKhoaHoc , 
       viewKhoaHoc,
       updateKhoaHoc,
       deleteKhoaHoc
    } = require('../controllers/KhoaHocController');

router.post('/khoa_hoc', addKhoaHoc);

router.get('/khoa_hoc', viewKhoaHoc);

router.put('/khoa_hoc/:ma_khoa_hoc', updateKhoaHoc);

router.delete('/khoa_hoc/:ma_khoa_hoc', deleteKhoaHoc);

module.exports = router;