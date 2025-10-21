const pool = require('../db');

const safeGetConn = async () => {
  if (pool.getConnection) {
    return await pool.getConnection();
  }
  return pool;
};


const addKhoaHoc = async (req, res) => {
    const {
        ten_khoa_hoc,
        mo_ta,
        ngay_bat_dau,
        ngay_ket_thuc,
        bat_buoc,
        suc_chua_toi_da,
        so_buoi_hoc_moi_tuan,
        lich_hoc
    } = req.body;

    if (!ten_khoa_hoc || !ngay_bat_dau || !ngay_ket_thuc || !suc_chua_toi_da || !lich_hoc || lich_hoc.length === 0) {
        return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin khóa học và lịch học' });
    }

    if (new Date(ngay_bat_dau) > new Date(ngay_ket_thuc)) {
        return res.status(400).json({ message: 'Ngày kết thúc phải sau ngày bắt đầu' });
    }

    if (so_buoi_hoc_moi_tuan !== lich_hoc.length) {
        return res.status(400).json({ message: 'Số buổi học mỗi tuần không khớp với số lịch học' });
    }

    for (const lich of lich_hoc) {
        if (!lich.thu || !lich.gio_bat_dau || !lich.gio_ket_thuc || !lich.dia_diem) {
            return res.status(400).json({ message: 'Thông tin lịch học không đầy đủ' });
        }
        if (lich.gio_bat_dau >= lich.gio_ket_thuc) {
            return res.status(400).json({ message: `Giờ kết thúc phải sau giờ bắt đầu cho lịch học ${lich.thu}` });
        }
    }

    let conn; // dedicated connection for transaction
    try {
        // Try to get a dedicated connection from pool if available
        if (pool.getConnection) {
            conn = await pool.getConnection();
        } else {
            // fallback to using pool directly (no dedicated connection)
            conn = pool;
        }

        // Tự sinh mã khóa học
        let ma_khoa_hoc;
        let attempts = 0;
        do {
            ma_khoa_hoc = 'KH' + String(Date.now()).slice(-6) + (attempts > 0 ? attempts : '');
            attempts++;
        } while (attempts < 10); // retry up to 10 times if collision

        // Kiểm tra mã khóa học đã tồn tại (unlikely but safe)
        const [existingKhoaHoc] = await conn.execute('SELECT ma_khoa_hoc FROM khoa_hoc WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);
        if (existingKhoaHoc.length > 0) {
            if (conn.release) conn.release();
            return res.status(500).json({ message: 'Không thể tạo mã khóa học duy nhất' });
        }

        // Kiểm tra trùng lịch học với các khóa khác
        for (const lich of lich_hoc) {
            const [conflicts] = await conn.execute(`
                SELECT kh.ma_khoa_hoc, kh.ten_khoa_hoc, ld.thu, ld.gio_bat_dau, ld.gio_ket_thuc
                FROM khoa_hoc kh
                JOIN lich_dao_tao ld ON kh.ma_khoa_hoc = ld.ma_khoa_hoc
                WHERE ld.thu = ? 
                AND kh.ngay_bat_dau <= ? AND kh.ngay_ket_thuc >= ?
                AND (
                    (ld.gio_bat_dau <= ? AND ld.gio_ket_thuc >= ?) OR
                    (ld.gio_bat_dau <= ? AND ld.gio_ket_thuc >= ?) OR
                    (ld.gio_bat_dau >= ? AND ld.gio_ket_thuc <= ?)
                )
            `, [
                lich.thu,
                ngay_ket_thuc,
                ngay_bat_dau,
                lich.gio_ket_thuc,
                lich.gio_bat_dau,
                lich.gio_bat_dau,
                lich.gio_ket_thuc,
                lich.gio_bat_dau,
                lich.gio_ket_thuc
            ]);

            // if (conflicts.length > 0) {
            //     if (conn.release) conn.release();
            //     return res.status(400).json({
            //         message: `Lịch học ${lich.thu} (${lich.gio_bat_dau}-${lich.gio_ket_thuc}) trùng với khóa học ${conflicts[0].ten_khoa_hoc}`
            //     });
            // }
        }

        // Nếu có phương thức beginTransaction trên connection thì dùng transaction
        const useTransaction = typeof conn.beginTransaction === 'function';
        if (useTransaction) await conn.beginTransaction();

        try {
            // Thêm vào bảng khoa_hoc
            await conn.execute(
                `INSERT INTO khoa_hoc (ma_khoa_hoc, ten_khoa_hoc, mo_ta, ngay_bat_dau, ngay_ket_thuc, bat_buoc, suc_chua_toi_da, so_buoi_hoc_moi_tuan)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ma_khoa_hoc,
                    ten_khoa_hoc,
                    mo_ta || null,
                    ngay_bat_dau,
                    ngay_ket_thuc,
                    bat_buoc ? 1 : 0,
                    suc_chua_toi_da,
                    so_buoi_hoc_moi_tuan
                ]
            );

            // Thêm vào bảng lich_dao_tao
            for (const lich of lich_hoc) {
                await conn.execute(
                    `INSERT INTO lich_dao_tao (ma_khoa_hoc, thu, gio_bat_dau, gio_ket_thuc, dia_diem)
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        ma_khoa_hoc,
                        lich.thu,
                        lich.gio_bat_dau,
                        lich.gio_ket_thuc,
                        lich.dia_diem
                    ]
                );
            }

            if (useTransaction) {
                await conn.commit();
            }

            // Sau khi commit: lấy lại lịch học vừa thêm và danh sách tất cả khóa học
            const [newSchedules] = await conn.execute(
                'SELECT  ma_khoa_hoc, thu, gio_bat_dau, gio_ket_thuc, dia_diem FROM lich_dao_tao WHERE ma_khoa_hoc = ?',
                [ma_khoa_hoc]
            );

            const [allKhoaHoc] = await conn.execute(
                'SELECT ma_khoa_hoc, ten_khoa_hoc, mo_ta, ngay_bat_dau, ngay_ket_thuc, bat_buoc, suc_chua_toi_da, so_buoi_hoc_moi_tuan FROM khoa_hoc'
            );

            // Log ra console
            console.log(`Lịch học mới cho ${ma_khoa_hoc}:`, newSchedules);
            console.log('Danh sách tất cả khóa học:', allKhoaHoc);

            if (conn.release) conn.release();
            return res.status(201).json({
                message: 'Thêm khóa học thành công',
                ma_khoa_hoc: ma_khoa_hoc,
                lich_hoc_da_them: newSchedules,
                danh_sach_khoa_hoc: allKhoaHoc
            });
        } catch (innerErr) {
            if (useTransaction) {
                try { await conn.rollback(); } catch (_) {}
            }
            if (conn.release) conn.release();
            throw innerErr;
        }
    } catch (error) {
        if (conn && conn.release) {
            try { conn.release(); } catch (_) {}
        }
        console.error('Lỗi khi thêm khóa học:', error);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};


 const viewKhoaHoc = async (req, res) => {
    try {
        // Lấy danh sách tất cả khóa học kèm lịch học
        const [rows] = await pool.execute(`
            SELECT 
                kh.ma_khoa_hoc,
                kh.ten_khoa_hoc,
                kh.mo_ta,
                kh.ngay_bat_dau,
                kh.ngay_ket_thuc,
                kh.bat_buoc,
                kh.suc_chua_toi_da,
                kh.so_buoi_hoc_moi_tuan,
                ld.ma_lich,
                ld.thu,
                ld.gio_bat_dau,
                ld.gio_ket_thuc,
                ld.dia_diem
            FROM khoa_hoc kh
            LEFT JOIN lich_dao_tao ld 
                ON kh.ma_khoa_hoc = ld.ma_khoa_hoc
            ORDER BY kh.ma_khoa_hoc, 
                     FIELD(ld.thu, 'Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật');
        `);

        // Gom nhóm dữ liệu: mỗi khóa học gồm nhiều lịch học
        const khoaHocMap = {};
        for (const row of rows) {
            if (!khoaHocMap[row.ma_khoa_hoc]) {
                khoaHocMap[row.ma_khoa_hoc] = {
                    ma_khoa_hoc: row.ma_khoa_hoc,
                    ten_khoa_hoc: row.ten_khoa_hoc,
                    mo_ta: row.mo_ta,
                    ngay_bat_dau: row.ngay_bat_dau,
                    ngay_ket_thuc: row.ngay_ket_thuc,
                    bat_buoc: !!row.bat_buoc,
                    suc_chua_toi_da: row.suc_chua_toi_da,
                    so_buoi_hoc_moi_tuan: row.so_buoi_hoc_moi_tuan,
                    lich_hoc: []
                };
            }

            if (row.thu) {
                khoaHocMap[row.ma_khoa_hoc].lich_hoc.push({
                    ma_lich: row.ma_lich,
                    thu: row.thu,
                    gio_bat_dau: row.gio_bat_dau,
                    gio_ket_thuc: row.gio_ket_thuc,
                    dia_diem: row.dia_diem
                });
            }
        }

        const danhSach = Object.values(khoaHocMap);

        return res.status(200).json({
            message: 'Lấy danh sách khóa học thành công',
            tong_so_khoa_hoc: danhSach.length,
            danh_sach: danhSach
        });
    } catch (error) {
        console.error('Lỗi khi xem khóa học:', error);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};

const updateKhoaHoc = async (req, res) => {
  const ma_khoa_hoc = req.params.ma_khoa_hoc;
  const {
    ten_khoa_hoc,
    mo_ta,
    ngay_bat_dau,
    ngay_ket_thuc,
    bat_buoc,
    suc_chua_toi_da,
    so_buoi_hoc_moi_tuan,
    lich_hoc // optional: if omitted, keep old schedules
  } = req.body;

  let conn;
  try {
    conn = await safeGetConn();

    const [rows] = await conn.execute('SELECT * FROM khoa_hoc WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);
    if (rows.length === 0) {
      if (conn.release) conn.release();
      return res.status(404).json({ message: 'Khóa học không tồn tại' });
    }
    const current = rows[0];

    const [currentLichRows] = await conn.execute('SELECT thu, gio_bat_dau, gio_ket_thuc, dia_diem FROM lich_dao_tao WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);
    const currentLich = currentLichRows || [];

    // Merge values: if undefined keep current
    const finalTen = (typeof ten_khoa_hoc === 'undefined') ? current.ten_khoa_hoc : ten_khoa_hoc;
    const finalMoTa = (typeof mo_ta === 'undefined') ? current.mo_ta : mo_ta;
    const finalNgayBD = (typeof ngay_bat_dau === 'undefined') ? current.ngay_bat_dau : ngay_bat_dau;
    const finalNgayKT = (typeof ngay_ket_thuc === 'undefined') ? current.ngay_ket_thuc : ngay_ket_thuc;
    const finalBatBuoc = (typeof bat_buoc === 'undefined' || bat_buoc === null) ? !!current.bat_buoc : !!bat_buoc;
    const finalSucChua = (typeof suc_chua_toi_da === 'undefined' || suc_chua_toi_da === null) ? current.suc_chua_toi_da : parseInt(suc_chua_toi_da, 10);

    let finalLich = currentLich;
    const clientProvidedLich = (typeof lich_hoc !== 'undefined');
    if (clientProvidedLich) {
      if (!Array.isArray(lich_hoc) || lich_hoc.length === 0) {
        if (conn.release) conn.release();
        return res.status(400).json({ message: 'Nếu gửi lich_hoc phải là mảng và không rỗng' });
      }
      finalLich = lich_hoc;
    }

    // Auto-sync so_buoi_hoc_moi_tuan when schedules changed, otherwise keep current unless client provided count
    let finalSoBuoi;
    if (typeof so_buoi_hoc_moi_tuan === 'undefined' || so_buoi_hoc_moi_tuan === null) {
      if (clientProvidedLich) {
        finalSoBuoi = finalLich.length;
      } else {
        finalSoBuoi = current.so_buoi_hoc_moi_tuan || finalLich.length;
      }
    } else {
      finalSoBuoi = parseInt(so_buoi_hoc_moi_tuan, 10);
    }

    if (finalSoBuoi !== finalLich.length) {
      if (conn.release) conn.release();
      return res.status(400).json({ message: 'Số buổi học mỗi tuần không khớp với số lịch học' });
    }

    if (new Date(finalNgayBD) > new Date(finalNgayKT)) {
      if (conn.release) conn.release();
      return res.status(400).json({ message: 'Ngày kết thúc phải sau ngày bắt đầu' });
    }

    for (const lich of finalLich) {
      if (!lich.thu || !lich.gio_bat_dau || !lich.gio_ket_thuc || !lich.dia_diem) {
        if (conn.release) conn.release();
        return res.status(400).json({ message: 'Thông tin lịch học không đầy đủ' });
      }
      if (lich.gio_bat_dau >= lich.gio_ket_thuc) {
        if (conn.release) conn.release();
        return res.status(400).json({ message: `Giờ kết thúc phải sau giờ bắt đầu cho lịch học ${lich.thu}` });
      }
    }

    // conflict check against other courses based on final dates & schedules
    // for (const lich of finalLich) {
    //   const [conflicts] = await conn.execute(
    //     `SELECT kh.ma_khoa_hoc, kh.ten_khoa_hoc FROM khoa_hoc kh
    //      JOIN lich_dao_tao ld ON kh.ma_khoa_hoc = ld.ma_khoa_hoc
    //      WHERE ld.thu = ?
    //        AND kh.ma_khoa_hoc <> ?
    //        AND kh.ngay_bat_dau <= ? AND kh.ngay_ket_thuc >= ?
    //        AND (
    //          (ld.gio_bat_dau <= ? AND ld.gio_ket_thuc >= ?) OR
    //          (ld.gio_bat_dau <= ? AND ld.gio_ket_thuc >= ?) OR
    //          (ld.gio_bat_dau >= ? AND ld.gio_ket_thuc <= ?)
    //        ) LIMIT 1`,
    //     [
    //       lich.thu,
    //       ma_khoa_hoc,
    //       finalNgayKT,
    //       finalNgayBD,
    //       lich.gio_ket_thuc, lich.gio_bat_dau,
    //       lich.gio_bat_dau, lich.gio_ket_thuc,
    //       lich.gio_bat_dau, lich.gio_ket_thuc
    //     ]
    //   );
    //   if (conflicts.length > 0) {
    //     if (conn.release) conn.release();
    //     return res.status(400).json({ message: `Lịch học ${lich.thu} (${lich.gio_bat_dau}-${lich.gio_ket_thuc}) trùng với khóa ${conflicts[0].ten_khoa_hoc}` });
    //   }
    // }

    const useTx = typeof conn.beginTransaction === 'function';
    if (useTx) await conn.beginTransaction();

    try {
      await conn.execute(
        `UPDATE khoa_hoc SET ten_khoa_hoc = ?, mo_ta = ?, ngay_bat_dau = ?, ngay_ket_thuc = ?, bat_buoc = ?, suc_chua_toi_da = ?, so_buoi_hoc_moi_tuan = ?
         WHERE ma_khoa_hoc = ?`,
        [
          finalTen,
          (typeof finalMoTa === 'undefined') ? null : finalMoTa,
          finalNgayBD,
          finalNgayKT,
          finalBatBuoc ? 1 : 0,
          (typeof finalSucChua === 'undefined' || finalSucChua === null) ? null : finalSucChua,
          finalSoBuoi,
          ma_khoa_hoc
        ]
      );

      if (clientProvidedLich) {
        // Perform fine-grained sync: UPDATE existing ma_lich, INSERT new rows, DELETE removed rows.
        // 1) load current schedules with primary key
        const [curRows] = await conn.execute('SELECT ma_lich, thu, gio_bat_dau, gio_ket_thuc, dia_diem FROM lich_dao_tao WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);
        const curMap = new Map(curRows.map(r => [String(r.ma_lich), r]));

        const toUpdate = [];
        const toInsert = [];
        const keepIds = new Set();

        for (const lich of finalLich) {
          if (lich.ma_lich && curMap.has(String(lich.ma_lich))) {
            toUpdate.push({ ...lich, ma_lich: String(lich.ma_lich) });
            keepIds.add(String(lich.ma_lich));
          } else {
            toInsert.push(lich);
          }
        }

        const toDeleteIds = curRows.filter(r => !keepIds.has(String(r.ma_lich))).map(r => r.ma_lich);

        // delete dependent attendance rows for schedules to be removed
        if (toDeleteIds.length > 0) {
          const placeholders = toDeleteIds.map(() => '?').join(',');
          await conn.execute(
            `DELETE dd FROM diem_danh dd WHERE dd.ma_lich IN (${placeholders})`,
            toDeleteIds
          );
          await conn.execute(
            `DELETE FROM lich_dao_tao WHERE ma_lich IN (${placeholders})`,
            toDeleteIds
          );
        }

        // apply updates
        for (const u of toUpdate) {
          await conn.execute(
            `UPDATE lich_dao_tao SET thu = ?, gio_bat_dau = ?, gio_ket_thuc = ?, dia_diem = ? WHERE ma_lich = ?`,
            [u.thu, u.gio_bat_dau, u.gio_ket_thuc, u.dia_diem, u.ma_lich]
          );
        }

        // insert new rows
        for (const ins of toInsert) {
          await conn.execute(
            `INSERT INTO lich_dao_tao (ma_khoa_hoc, thu, gio_bat_dau, gio_ket_thuc, dia_diem)
             VALUES (?, ?, ?, ?, ?)`,
            [ma_khoa_hoc, ins.thu, ins.gio_bat_dau, ins.gio_ket_thuc, ins.dia_diem]
          );
        }
      }

      if (useTx) await conn.commit();

      const [khoa] = await conn.execute('SELECT ma_khoa_hoc, ten_khoa_hoc, mo_ta, ngay_bat_dau, ngay_ket_thuc, bat_buoc, suc_chua_toi_da, so_buoi_hoc_moi_tuan FROM khoa_hoc WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);
     const [schedules] = await conn.execute('SELECT ma_lich, thu, gio_bat_dau, gio_ket_thuc, dia_diem FROM lich_dao_tao WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);

      if (conn.release) conn.release();
      return res.json({ message: 'Cập nhật khóa học thành công', khoa: khoa[0], lich_hoc: schedules });
    } catch (inner) {
      if (useTx) { try { await conn.rollback(); } catch(_){} }
      if (conn.release) conn.release();
      throw inner;
    }
  } catch (err) {
    if (conn && conn.release) { try { conn.release(); } catch(_){} }
    console.error('updateKhoaHoc error:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};


const deleteKhoaHoc = async (req, res) => {
    const ma_khoa_hoc = req.params.ma_khoa_hoc;
    let conn;
    try {
        conn = pool.getConnection ? await pool.getConnection() : pool;

        // Kiểm tra tồn tại
        const [exist] = await conn.execute('SELECT ma_khoa_hoc FROM khoa_hoc WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);
        if (exist.length === 0) {
            if (conn.release) conn.release();
            return res.status(404).json({ message: 'Khóa học không tồn tại' });
        }

        const useTransaction = typeof conn.beginTransaction === 'function';
        if (useTransaction) await conn.beginTransaction();

        try {
            // Xóa học viên liên quan (nếu cần) hoặc chỉ xóa lich_dao_tao trước
            await conn.execute('DELETE FROM lich_dao_tao WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);
            await conn.execute('DELETE FROM khoa_hoc WHERE ma_khoa_hoc = ?', [ma_khoa_hoc]);

            if (useTransaction) await conn.commit();
            if (conn.release) conn.release();
            return res.json({ message: 'Xóa khóa học thành công' });
        } catch (innerErr) {
            if (useTransaction) { try { await conn.rollback(); } catch(_){} }
            if (conn.release) conn.release();
            throw innerErr;
        }
    } catch (err) {
        if (conn && conn.release) { try { conn.release(); } catch(_){} }
        console.error('Lỗi khi xóa khóa học:', err);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};

module.exports = { addKhoaHoc , viewKhoaHoc , updateKhoaHoc , deleteKhoaHoc };