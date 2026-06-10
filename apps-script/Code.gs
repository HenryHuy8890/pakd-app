/**
 * PAKD MUA — GĐ2: Ghi 2 chiều GSheet + Email cảnh báo sáng
 * ─────────────────────────────────────────────────────────
 * CÀI ĐẶT (làm 1 lần, xem HuongDan_SuaCode.md mục GĐ2):
 * 1. Mở Google Sheet dữ liệu → Tiện ích mở rộng → Apps Script → dán file này.
 * 2. Project Settings → Script properties, thêm:
 *    - SECRET        : mã bí mật tự đặt (vd chuỗi 20 ký tự ngẫu nhiên) — PHẢI trùng với ô "Mã bí mật" trong app
 *    - ALERT_EMAILS  : email nhận cảnh báo, cách nhau dấu phẩy (vd sep@hdsteel.vn,huy@hdsteel.vn)
 *    - GH_OWNER      : tên user GitHub (cho cảnh báo PA chờ duyệt) — bỏ trống nếu chưa dùng
 *    - GH_REPO       : pakd-data
 *    - GH_TOKEN      : fine-grained token CHỈ quyền đọc Contents repo pakd-data
 * 3. Chạy hàm setupTriggers 1 lần (nút ▶) → cấp quyền → tự tạo lịch 8h sáng.
 * 4. Deploy → New deployment → Web app: Execute as ME, Access: ANYONE → copy URL dán vào app.
 */

const SHEET_ID = '1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU';
const GID_INVENTORY = 0;
const GID_MINMAX    = 1080747466;
const GID_PO        = 2015387961;
const GID_CASHFLOW  = 127496102;
const AUDIT_SHEET   = 'AUDIT_LOG';

// ───────────────────────── Tiện ích chung ─────────────────────────
function props_(){ return PropertiesService.getScriptProperties(); }
function ss_(){ return SpreadsheetApp.openById(SHEET_ID); }
function sheetByGid_(gid){
  const sh = ss_().getSheets().find(s => s.getSheetId() === gid);
  if (!sh) throw new Error('Không tìm thấy sheet gid=' + gid);
  return sh;
}
// bỏ dấu tiếng Việt + thường hóa + chỉ giữ a-z0-9 (giống stripVN trong app)
function norm_(s){
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
}
// chuẩn hóa số đo (1.0 → "1", 1200 → "1200") giống normDim trong app
function normDim_(v){
  const f = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  if (isNaN(f)) return norm_(v);
  return String(f);
}
function skuKey_(o){
  return [norm_(o.alloy), norm_(o.temper), normDim_(o.thickness), normDim_(o.width),
          normDim_(o.length), norm_(o.coating || 'KP')].join('|');
}
// tìm chỉ số cột theo danh sách tên ứng viên (đã norm)
function colIdx_(headers, cands){
  const hs = headers.map(norm_);
  for (var i = 0; i < cands.length; i++){
    const j = hs.indexOf(norm_(cands[i]));
    if (j >= 0) return j;
  }
  return -1;
}
function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────── AUDIT LOG (lưu vết mọi thao tác ghi) ───────────────────
function audit_(by, action, detail, oldVal, newVal){
  const ss = ss_();
  let sh = ss.getSheetByName(AUDIT_SHEET);
  if (!sh){
    sh = ss.insertSheet(AUDIT_SHEET);
    sh.appendRow(['Thời gian', 'Người (PIN)', 'Hành động', 'Chi tiết', 'Giá trị cũ', 'Giá trị mới']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), by || '?', action, detail || '', String(oldVal == null ? '' : oldVal), String(newVal == null ? '' : newVal)]);
}

// ───────────────────────── WEB APP: ghi 2 chiều ─────────────────────────
function doPost(e){
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err){ return json_({ ok: false, error: 'Body không phải JSON' }); }

  if (!body.secret || body.secret !== props_().getProperty('SECRET')){
    return json_({ ok: false, error: 'Sai mã bí mật' });
  }
  const by = String(body.by || '?').slice(0, 60); // tên người đã định danh bằng PIN trong app

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (err){ return json_({ ok: false, error: 'Sheet đang bận, thử lại sau' }); }

  try {
    if (body.action === 'ping') return json_({ ok: true, msg: 'PAKD Apps Script sẵn sàng' });
    if (body.action === 'markBuyReqDone')    return json_(markBuyReqDone_(body.payload || {}, by));
    if (body.action === 'updatePODelivered') return json_(updatePODelivered_(body.payload || {}, by));
    return json_({ ok: false, error: 'Action không hợp lệ: ' + body.action });
  } catch (err){
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// Đánh dấu đề xuất mua ĐÃ XỬ LÝ = XÓA ô "yêu cầu mua" + "tuần yêu cầu" (giữ vết trong AUDIT_LOG)
function markBuyReqDone_(p, by){
  const sh = sheetByGid_(GID_MINMAX);
  const data = sh.getDataRange().getValues();
  const H = data[0];
  const cA = colIdx_(H, ['mac', 'alloy']), cT = colIdx_(H, ['temper']),
        cD = colIdx_(H, ['day', 'thickness']), cR = colIdx_(H, ['rong', 'width']),
        cL = colIdx_(H, ['dai', 'length']), cP = colIdx_(H, ['phu', 'coating']),
        cReq = colIdx_(H, ['yeucaumua', 'yeu cau mua']),
        cWeek = colIdx_(H, ['tuanyeucau', 'tuan yeu cau']);
  if (cReq < 0) return { ok: false, error: 'Sheet Min/Max không có cột yeucaumua' };

  const want = skuKey_(p);
  for (var i = 1; i < data.length; i++){
    const row = data[i];
    const key = skuKey_({ alloy: row[cA], temper: row[cT], thickness: row[cD],
                          width: row[cR], length: row[cL], coating: coat_(row[cP]) });
    if (key !== want) continue;
    const oldReq = row[cReq], oldWeek = cWeek >= 0 ? row[cWeek] : '';
    if (String(oldReq).trim() === '') return { ok: false, error: 'Mã này không có đề xuất mua (có thể đã xử lý rồi — bấm Sync)' };
    sh.getRange(i + 1, cReq + 1).clearContent();
    if (cWeek >= 0) sh.getRange(i + 1, cWeek + 1).clearContent();
    audit_(by, 'XỬ LÝ ĐỀ XUẤT MUA', skuLabel_(p), 'yêu cầu=' + oldReq + ' tuần=' + oldWeek, '(đã xóa)');
    return { ok: true, msg: 'Đã xóa đề xuất mua của ' + skuLabel_(p) };
  }
  return { ok: false, error: 'Không tìm thấy SKU ' + skuLabel_(p) + ' trong sheet Min/Max' };
}

// Cập nhật "TL đã giao (kg)" của 1 dòng PO (tìm theo Số PO + SKU)
function updatePODelivered_(p, by){
  const sh = sheetByGid_(GID_PO);
  const data = sh.getDataRange().getValues();
  const H = data[0];
  const cPO = colIdx_(H, ['sopo', 'so po', 'po']),
        cA = colIdx_(H, ['mac', 'alloy']), cT = colIdx_(H, ['temper']),
        cD = colIdx_(H, ['day', 'thickness']), cR = colIdx_(H, ['rong', 'width']),
        cL = colIdx_(H, ['dai', 'length']), cP = colIdx_(H, ['phu', 'coating']),
        cOrd = colIdx_(H, ['tldat', 'tl dat (kg)', 'tl dat']),
        cDel = colIdx_(H, ['tldagiao', 'tl da giao (kg)', 'tl da giao']),
        cRem = colIdx_(H, ['tonchuagiao', 'ton chua giao (kg)', 'ton chua giao']);
  if (cPO < 0 || cDel < 0) return { ok: false, error: 'Sheet PO thiếu cột Số PO / TL đã giao' };

  const newDel = parseFloat(p.delivered);
  if (isNaN(newDel) || newDel < 0) return { ok: false, error: 'TL đã giao không hợp lệ' };
  const want = skuKey_(p);
  for (var i = 1; i < data.length; i++){
    const row = data[i];
    if (norm_(row[cPO]) !== norm_(p.po)) continue;
    const key = skuKey_({ alloy: row[cA], temper: row[cT], thickness: row[cD],
                          width: row[cR], length: row[cL], coating: coat_(row[cP]) });
    if (key !== want) continue;
    const oldDel = row[cDel];
    const ordered = cOrd >= 0 ? (parseFloat(row[cOrd]) || 0) : 0;
    if (ordered > 0 && newDel > ordered) return { ok: false, error: 'TL đã giao (' + newDel + ') lớn hơn TL đặt (' + ordered + ')' };
    sh.getRange(i + 1, cDel + 1).setValue(newDel);
    // Cột "Tồn chưa giao": chỉ ghi đè nếu KHÔNG phải công thức
    if (cRem >= 0 && sh.getRange(i + 1, cRem + 1).getFormula() === ''){
      sh.getRange(i + 1, cRem + 1).setValue(Math.max(ordered - newDel, 0));
    }
    audit_(by, 'CẬP NHẬT TL ĐÃ GIAO', 'PO ' + p.po + ' — ' + skuLabel_(p), oldDel, newDel);
    return { ok: true, msg: 'PO ' + p.po + ': TL đã giao ' + oldDel + ' → ' + newDel + ' kg' };
  }
  return { ok: false, error: 'Không tìm thấy PO ' + p.po + ' + SKU ' + skuLabel_(p) };
}

function coat_(v){ const u = String(v || '').toUpperCase(); return (u === '1E' || u === 'PE') ? '1E' : 'KP'; }
function skuLabel_(o){ return [o.alloy, o.temper, o.thickness + 'x' + o.width + 'x' + o.length, o.coating].join(' '); }

// ───────────────────────── CẢNH BÁO SÁNG 8H ─────────────────────────
function setupTriggers(){
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'checkDailyAlerts') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkDailyAlerts').timeBased().everyDays(1).atHour(8).create();
  Logger.log('✓ Đã tạo lịch chạy checkDailyAlerts mỗi ngày ~8h sáng');
}

function checkDailyAlerts(){
  const alerts = [];
  try { alertCashflow_(alerts); }   catch (e){ alerts.push('⚠ Lỗi đọc dòng tiền: ' + e.message); }
  try { alertLowStock_(alerts); }   catch (e){ alerts.push('⚠ Lỗi đọc tồn kho: ' + e.message); }
  try { alertPendingPA_(alerts); }  catch (e){ alerts.push('⚠ Lỗi đọc PA GitHub: ' + e.message); }

  if (alerts.length === 0){ Logger.log('Không có cảnh báo — không gửi email.'); return; }
  const to = props_().getProperty('ALERT_EMAILS');
  if (!to){ Logger.log('Chưa cấu hình ALERT_EMAILS'); return; }
  const d = new Date();
  const subject = '⚠ PAKD cảnh báo sáng ' + Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy') + ' (' + alerts.length + ' mục)';
  const htmlBody = '<div style="font-family:Arial,sans-serif;font-size:14px">'
    + '<h3 style="color:#b91c1c">Cảnh báo PAKD Mua — ' + Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy HH:mm') + '</h3>'
    + '<ul><li>' + alerts.join('</li><li>') + '</li></ul>'
    + '<p style="color:#64748b;font-size:12px">Email tự động từ Google Apps Script (GĐ2). Mở app để xử lý.</p></div>';
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: htmlBody });
}

// 1) Tuần hiện tại hụt dòng (TỔNG HẠN MỨC < 0) — đọc ma trận ngang theo cột KEY
function alertCashflow_(alerts){
  const data = sheetByGid_(GID_CASHFLOW).getDataRange().getValues();
  // tìm hàng header tuần (có ô "TUẦN n")
  let weekRow = -1;
  for (var i = 0; i < Math.min(data.length, 15); i++){
    if (data[i].some(c => /tuan\s*\d+/.test(norm_(String(c)).replace(/(\d)/, ' $1')) || /^tuan\d+$/.test(norm_(c)))){ weekRow = i; break; }
  }
  if (weekRow < 0) throw new Error('không thấy hàng TUẦN');
  let keyCol = data[weekRow].findIndex(c => norm_(c) === 'key');
  if (keyCol < 0) keyCol = 1;
  const byKey = {};
  for (var r = weekRow + 1; r < data.length; r++){ const k = norm_(data[r][keyCol]); if (k) byKey[k] = data[r]; }
  // tuần ISO hiện tại
  const now = new Date(); const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const week = Math.ceil((((tmp - new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
  // cột của tuần hiện tại
  let col = -1;
  data[weekRow].forEach((c, j) => { const m = norm_(c).match(/^tuan(\d+)$/); if (m && parseInt(m[1]) === week) col = j; });
  if (col < 0) return; // sheet chưa có tuần này
  const num = v => { const f = parseFloat(String(v).replace(/\./g, '').replace(/,/g, '.')); return isNaN(f) ? null : f; };
  let hanMuc = byKey['hanmuc'] ? num(byKey['hanmuc'][col]) : null;
  if (hanMuc == null){
    const hd = byKey['hm_hd'] ? num(byKey['hm_hd'][col]) : null;
    const dd = byKey['hm_dd'] ? num(byKey['hm_dd'][col]) : null;
    if (hd != null || dd != null) hanMuc = (hd || 0) + (dd || 0);
  }
  if (hanMuc != null && hanMuc < 0){
    alerts.push('🔴 <b>Tuần ' + week + ' HỤT DÒNG ' + (Math.abs(hanMuc) / 1e9).toFixed(2) + ' tỷ</b> (TỔNG HẠN MỨC âm) — cân nhắc hoãn chi / đẩy thu.');
  }
}

// 2) SKU tồn (kho + đang về) dưới Min
function alertLowStock_(alerts){
  const inv = sheetByGid_(GID_INVENTORY).getDataRange().getValues();
  const Hi = inv[0];
  const iA = colIdx_(Hi, ['alloy', 'mac']), iT = colIdx_(Hi, ['temper']), iD = colIdx_(Hi, ['thickness', 'day']),
        iR = colIdx_(Hi, ['width', 'rong']), iL = colIdx_(Hi, ['length', 'dai']), iP = colIdx_(Hi, ['coating', 'phu']),
        iQ = colIdx_(Hi, ['qtykg', 'qty kg']), iS = colIdx_(Hi, ['status']);
  const stockByKey = {};
  for (var r = 1; r < inv.length; r++){
    const row = inv[r]; if (!row[iA]) continue;
    const key = skuKey_({ alloy: row[iA], temper: row[iT], thickness: row[iD], width: row[iR], length: row[iL], coating: coat_(row[iP]) });
    const q = parseFloat(row[iQ]) || 0;
    const st = norm_(iS >= 0 ? row[iS] : 'instock');
    if (!stockByKey[key]) stockByKey[key] = { stock: 0, transit: 0 };
    if (st.indexOf('transit') >= 0) stockByKey[key].transit += q; else stockByKey[key].stock += q;
  }
  const mm = sheetByGid_(GID_MINMAX).getDataRange().getValues();
  const Hm = mm[0];
  const mA = colIdx_(Hm, ['mac', 'alloy']), mT = colIdx_(Hm, ['temper']), mD = colIdx_(Hm, ['day', 'thickness']),
        mR = colIdx_(Hm, ['rong', 'width']), mL = colIdx_(Hm, ['dai', 'length']), mP = colIdx_(Hm, ['phu', 'coating']),
        mMin = colIdx_(Hm, ['minstockkg', 'min stock kg']);
  const low = [];
  for (var r2 = 1; r2 < mm.length; r2++){
    const row2 = mm[r2]; if (!row2[mA]) continue;
    const min = parseFloat(row2[mMin]) || 0; if (min <= 0) continue;
    const key2 = skuKey_({ alloy: row2[mA], temper: row2[mT], thickness: row2[mD], width: row2[mR], length: row2[mL], coating: coat_(row2[mP]) });
    const s = stockByKey[key2] || { stock: 0, transit: 0 };
    if (s.stock + s.transit < min){
      low.push(skuLabel_({ alloy: row2[mA], temper: row2[mT], thickness: row2[mD], width: row2[mR], length: row2[mL], coating: row2[mP] })
        + ': tồn ' + Math.round(s.stock) + ' + đang về ' + Math.round(s.transit) + ' &lt; Min ' + Math.round(min) + ' kg');
    }
  }
  if (low.length) alerts.push('📦 <b>' + low.length + ' SKU dưới tồn Min</b>:<br>• ' + low.slice(0, 15).join('<br>• ') + (low.length > 15 ? '<br>… và ' + (low.length - 15) + ' mã nữa' : ''));
}

// 3) PA mua chờ duyệt quá 24h (đọc repo pakd-data /plans qua GitHub API)
function alertPendingPA_(alerts){
  const P = props_();
  const owner = P.getProperty('GH_OWNER'), repo = P.getProperty('GH_REPO'), token = P.getProperty('GH_TOKEN');
  if (!owner || !repo || !token) return; // chưa cấu hình → bỏ qua mục này
  const gh = path => JSON.parse(UrlFetchApp.fetch('https://api.github.com/repos/' + owner + '/' + repo + '/' + path,
    { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, muteHttpExceptions: false }).getContentText());
  let files;
  try { files = gh('contents/plans'); } catch (e){ return; } // chưa có thư mục plans
  const pend = [];
  (files || []).filter(f => f.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 20).forEach(f => {
    try {
      const pa = JSON.parse(UrlFetchApp.fetch(f.download_url).getContentText());
      if (pa.status !== 'pending') return;
      const ageH = (Date.now() - new Date(pa.savedAt).getTime()) / 3600000;
      if (ageH >= 24) pend.push(f.name + ' — trình bởi ' + (pa.requestedBy || '?') + ', chờ ' + Math.floor(ageH) + 'h');
    } catch (e){}
  });
  if (pend.length) alerts.push('⏳ <b>' + pend.length + ' PA mua chờ duyệt quá 24h</b>:<br>• ' + pend.join('<br>• '));
}
