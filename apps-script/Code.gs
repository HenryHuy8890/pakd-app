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
    if (body.action === 'storeMarket'){ // GĐ3a plan B: GitHub Actions kéo giá rồi đẩy vào đây
      const p = body.payload || {};
      const n = x => { const f = parseFloat(x); return isNaN(f) ? null : f; };
      return json_(writeMarketRow_({ lme: n(p.lme), shfe: n(p.shfe), smm: n(p.smm), smmMove: n(p.smmMove), usd: n(p.usd), cny: n(p.cny) }));
    }
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
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['checkDailyAlerts','fetchMarketPrices'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkDailyAlerts').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('fetchMarketPrices').timeBased().everyDays(1).atHour(12).create(); // GĐ3a: sau khi SMM công bố ~10h30 VN
  Logger.log('✓ Đã tạo lịch: checkDailyAlerts ~8h sáng, fetchMarketPrices ~12h trưa');
}

function checkDailyAlerts(){
  const alerts = [];
  try { alertCashflow_(alerts); }   catch (e){ alerts.push('⚠ Lỗi đọc dòng tiền: ' + e.message); }
  try { alertLowStock_(alerts); }   catch (e){ alerts.push('⚠ Lỗi đọc tồn kho: ' + e.message); }
  try { alertPendingPA_(alerts); }  catch (e){ alerts.push('⚠ Lỗi đọc PA GitHub: ' + e.message); }
  try { alertCIFvsMarket_(alerts); } catch (e){ alerts.push('⚠ Lỗi so giá CIF/thị trường: ' + e.message); }

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

// ═══════════════════ GĐ3a: GIÁ THỊ TRƯỜNG (LME / SHFE / SMM) + TỶ GIÁ ═══════════════════
// Nguồn chính: worthwillaluminium.com/api/price/{smm|lme|shfe} (miễn phí, JSON sạch).
// Dự phòng: LME → westmetall.com ; SHFE → shfe.com.cn .dat. SMM miễn phí chỉ có nguồn chính.
// Tỷ giá USD/CNY: XML công khai Vietcombank.
// Script properties (tùy chọn): CIF_ALERT_PCT — ngưỡng %% premium đợt mới vượt TB các đợt trước thì cảnh báo (mặc định 10).
const MARKET_SHEET = 'MARKET_PRICES';
const WW_API = 'https://www.worthwillaluminium.com/api/price/';

function fetchJson_(url){
  try {
    const txt = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).getContentText();
    return JSON.parse(txt);
  } catch (e){ return null; }
}
function wwCurrent_(kind){
  const r = fetchJson_(WW_API + kind);
  return (r && r.code === 200 && r.data && r.data.current) ? r.data.current : null;
}
// Tỷ giá USD/VND + CNY/VND. SỬA 10/06: portal Vietcombank TREO ~6 phút khi gọi từ IP Google
// (testMarketSources đo được 359s) → chuyển sang GOOGLEFINANCE (nội bộ Google, không thể bị chặn)
// qua sheet phụ ẩn FX_HELPER; dự phòng open.er-api.com. Lưu ý: tỷ giá GIỮA THỊ TRƯỜNG, lệch nhẹ giá Transfer VCB.
function fetchFxRates_(){
  // 1) GOOGLEFINANCE qua sheet phụ ẩn
  try {
    const ss = ss_();
    let sh = ss.getSheetByName('FX_HELPER');
    if (!sh){ sh = ss.insertSheet('FX_HELPER'); try { sh.hideSheet(); } catch (e){} }
    sh.getRange('A1').setFormula('=GOOGLEFINANCE("CURRENCY:USDVND")');
    sh.getRange('A2').setFormula('=GOOGLEFINANCE("CURRENCY:CNYVND")');
    sh.getRange('B1').setValue('VND/USD (GOOGLEFINANCE)'); sh.getRange('B2').setValue('VND/CNY (GOOGLEFINANCE)');
    SpreadsheetApp.flush();
    for (var i = 0; i < 10; i++){
      const usd = parseFloat(sh.getRange('A1').getValue());
      const cny = parseFloat(sh.getRange('A2').getValue());
      if (usd > 0 && cny > 0) return { usd: usd, cny: cny, src: 'GOOGLEFINANCE' };
      Utilities.sleep(1000); // chờ công thức tính xong
    }
  } catch (e){}
  // 2) Dự phòng: open.er-api.com (miễn phí, thân thiện IP Google)
  try {
    const r = fetchJson_('https://open.er-api.com/v6/latest/USD');
    if (r && r.rates && r.rates.VND){
      return { usd: r.rates.VND, cny: r.rates.CNY ? r.rates.VND / r.rates.CNY : null, src: 'er-api' };
    }
  } catch (e){}
  return { usd: null, cny: null, src: null };
}
// Dự phòng LME: bảng westmetall (cash settlement mới nhất, USD/tấn)
function fetchLMEFallback_(){
  try {
    const html = UrlFetchApp.fetch('https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Al_cash',
      { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }).getContentText();
    const m = html.match(/<td[^>]*>\s*\d{2}\.\s*\w+\s*\d{4}\s*<\/td>\s*<td[^>]*>\s*([\d,]+\.?\d*)\s*<\/td>/);
    return m ? parseFloat(m[1].replace(/,/g, '')) : null;
  } catch (e){ return null; }
}
// Dự phòng SHFE: file .dat công khai (close của hợp đồng nhôm gần nhất, CNY/tấn)
function fetchSHFEFallback_(){
  try {
    for (var back = 0; back < 2; back++){ // chỉ lùi 2 ngày — tránh treo lâu
      const d = new Date(Date.now() - back * 86400000);
      const ds = Utilities.formatDate(d, 'GMT+8', 'yyyyMMdd');
      const r = fetchJson_('https://www.shfe.com.cn/data/tradedata/future/dailydata/kx' + ds + '.dat');
      if (!r || !r.o_curinstrument) continue;
      const al = r.o_curinstrument.filter(x => String(x.PRODUCTID).indexOf('al_f') === 0 && x.CLOSEPRICE > 0);
      if (al.length) return parseFloat(al[0].CLOSEPRICE);
    }
  } catch (e){}
  return null;
}

// Chạy hằng ngày ~12h trưa VN (sau khi SMM công bố 10:30 VN). Ghi/cập nhật 1 dòng/ngày.
// CHỐNG TIMEOUT (sửa 10/06): một số nguồn có thể TREO khi gọi từ máy chủ Google (chặn IP datacenter),
// mỗi request treo ~60s → quá giới hạn 6 phút. Giải pháp: quỹ thời gian — hết quỹ thì BỎ QUA nguồn
// còn lại và ghi những gì đã lấy được. Chạy testMarketSources để biết đích danh nguồn nào treo.
function fetchMarketPrices(){
  const t0 = Date.now();
  const leftMs = () => 270000 - (Date.now() - t0); // quỹ 4.5 phút (chừa 1.5 phút an toàn)
  const step = (name, fn) => {
    if (leftMs() < 75000){ Logger.log('⏭ BỎ QUA ' + name + ' — hết quỹ thời gian'); return null; }
    const s = Date.now();
    try {
      const v = fn();
      Logger.log((v != null ? '✓ ' : '✗ ') + name + ' (' + Math.round((Date.now() - s) / 1000) + 's)');
      return v;
    } catch (e){ Logger.log('✗ ' + name + ' lỗi: ' + e.message + ' (' + Math.round((Date.now() - s) / 1000) + 's)'); return null; }
  };
  const fx   = step('Tỷ giá (GOOGLEFINANCE)', fetchFxRates_) || { usd: null, cny: null };
  const smm  = step('SMM (worthwill)',  function(){ return wwCurrent_('smm'); });
  const lme  = step('LME (worthwill)',  function(){ return wwCurrent_('lme'); });
  const shfe = step('SHFE (worthwill)', function(){ return wwCurrent_('shfe'); });
  let lmeCash   = lme  ? parseFloat(lme.average || lme.end) : null;
  let shfeClose = shfe ? parseFloat(shfe.close_price || shfe.settlement_price) : null;
  if (lmeCash == null)   lmeCash   = step('LME dự phòng (westmetall)',  fetchLMEFallback_);
  if (shfeClose == null) shfeClose = step('SHFE dự phòng (shfe.com.cn)', fetchSHFEFallback_);
  const smmAvg  = smm ? parseFloat(smm.average)   : null;
  const smmMove = smm ? parseFloat(smm.move || 0) : null;
  writeMarketRow_({ lme: lmeCash, shfe: shfeClose, smm: smmAvg, smmMove: smmMove, usd: fx.usd, cny: fx.cny });
  Logger.log('KẾT QUẢ: LME=' + lmeCash + ' SHFE=' + shfeClose + ' SMM=' + smmAvg + ' USD=' + fx.usd + ' CNY=' + fx.cny + ' — tổng ' + Math.round((Date.now() - t0) / 1000) + 's');
}

// Ghi/cập nhật dòng giá của HÔM NAY vào tab MARKET_PRICES (giữ giá trị cũ nếu giá mới null)
function writeMarketRow_(v){
  const ss = ss_();
  let sh = ss.getSheetByName(MARKET_SHEET);
  if (!sh){
    sh = ss.insertSheet(MARKET_SHEET);
    sh.appendRow(['date', 'lme_usd', 'shfe_cny', 'smm_cny', 'smm_move', 'smm_usd', 'usd_vnd', 'cny_vnd', 'fetched_at']);
    sh.setFrozenRows(1);
  }
  const smmUsd = (v.smm != null && v.usd && v.cny) ? Math.round(v.smm * v.cny / v.usd * 10) / 10 : null;
  const today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  let row = [today, v.lme, v.shfe, v.smm, v.smmMove, smmUsd, v.usd, v.cny, Utilities.formatDate(new Date(), 'GMT+7', 'HH:mm')];
  const last = sh.getLastRow();
  if (last > 1 && String(sh.getRange(last, 1).getValue()).slice(0, 10) === today){
    // cùng ngày → ghi đè, nhưng KHÔNG xóa giá trị cũ bằng null (nguồn tạm chết vẫn giữ số buổi trước)
    const old = sh.getRange(last, 1, 1, row.length).getValues()[0];
    row = row.map(function(x, i){ return (x == null || x === '') ? old[i] : x; });
    sh.getRange(last, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
  return { ok: true, msg: 'Đã ghi giá ngày ' + today };
}

// ═══ R2: BACKFILL lịch sử giá các ngày TRƯỚC hôm nay (chạy tay 1 lần) ═══
// Lấy mảng historical từ API worthwill (smm/lme/shfe), điền các ngày còn thiếu vào MARKET_PRICES.
// Lưu ý: smm_usd các ngày cũ quy đổi bằng TỶ GIÁ HIỆN TẠI (xấp xỉ — đủ tốt để nhìn xu hướng premium).
function backfillMarketHistory(){
  const get = kind => { const r = fetchJson_(WW_API + kind); return (r && r.data && r.data.historical) ? r.data.historical : []; };
  const smmH = get('smm'), lmeH = get('lme'), shfeH = get('shfe');
  const fx = fetchFxRates_();
  const num = v => { const f = parseFloat(String(v).replace(/,/g, '')); return isNaN(f) ? null : f; };
  const byDate = {};
  smmH.forEach(h => { const d = String(h.date).slice(0, 10); if (!d) return; (byDate[d] = byDate[d] || {}).smm = num(h.average); byDate[d].smmMove = num(h.move); });
  lmeH.forEach(h => { const d = String(h.date).slice(0, 10); if (!d) return; (byDate[d] = byDate[d] || {}).lme = num(h.average || h.end); });
  shfeH.forEach(h => { const d = String(h.date).slice(0, 10); if (!d) return; (byDate[d] = byDate[d] || {}).shfe = num(h.close_price || h.settlement_price); });

  const ss = ss_();
  let sh = ss.getSheetByName(MARKET_SHEET);
  if (!sh){
    sh = ss.insertSheet(MARKET_SHEET);
    sh.appendRow(['date', 'lme_usd', 'shfe_cny', 'smm_cny', 'smm_move', 'smm_usd', 'usd_vnd', 'cny_vnd', 'fetched_at']);
    sh.setFrozenRows(1);
  }
  const existing = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(r => {
    const d = r[0] instanceof Date ? Utilities.formatDate(r[0], 'GMT+7', 'yyyy-MM-dd') : String(r[0]).slice(0, 10);
    existing[d] = true;
  });
  const dates = Object.keys(byDate).sort().slice(-200); // tối đa 200 ngày gần nhất
  const newRows = [];
  dates.forEach(d => {
    if (existing[d]) return;
    const v = byDate[d];
    const smmUsd = (v.smm != null && fx.usd && fx.cny) ? Math.round(v.smm * fx.cny / fx.usd * 10) / 10 : null;
    newRows.push([d, v.lme || null, v.shfe || null, v.smm || null, v.smmMove || null, smmUsd, fx.usd, fx.cny, 'backfill']);
  });
  if (newRows.length) sh.getRange(sh.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  // sắp xếp lại theo ngày tăng dần
  if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort({ column: 1, ascending: true });
  Logger.log('✓ Backfill xong: thêm ' + newRows.length + ' ngày (SMM lịch sử có ' + smmH.length + ' bản ghi từ API)');
}

// CHẨN ĐOÁN: chạy hàm này để biết nguồn nào sống/chết/treo từ máy chủ Google (xem Nhật ký thực thi)
function testMarketSources(){
  const tests = [
    ['Tỷ giá GOOGLEFINANCE', function(){ const r = fetchFxRates_(); return r && r.usd ? 'USD=' + r.usd + ' CNY=' + Math.round(r.cny) + ' (' + r.src + ')' : null; }],
    ['SMM (worthwill)',     function(){ const r = wwCurrent_('smm');  return r ? r.date + ' avg=' + r.average : null; }],
    ['LME (worthwill)',     function(){ const r = wwCurrent_('lme');  return r ? r.date + ' avg=' + r.average : null; }],
    ['SHFE (worthwill)',    function(){ const r = wwCurrent_('shfe'); return r ? r.date + ' close=' + r.close_price : null; }],
    ['LME westmetall',      function(){ return fetchLMEFallback_(); }],
    ['SHFE shfe.com.cn',    function(){ return fetchSHFEFallback_(); }],
  ];
  tests.forEach(function(tt){
    const s = Date.now();
    try {
      const v = tt[1]();
      Logger.log((v != null ? '✓ SỐNG  ' : '✗ KHÔNG DỮ LIỆU  ') + tt[0] + ' → ' + v + ' (' + Math.round((Date.now() - s) / 1000) + 's)');
    } catch (e){
      Logger.log('✗ LỖI  ' + tt[0] + ': ' + e.message + ' (' + Math.round((Date.now() - s) / 1000) + 's)');
    }
  });
}

// App đọc giá: GET <url>?action=market&secret=...  → {ok, rows:[{date,lme_usd,...}]} (mới nhất TRƯỚC)
function doGet(e){
  const p = (e && e.parameter) || {};
  if (p.secret !== props_().getProperty('SECRET')) return json_({ ok: false, error: 'Sai mã bí mật' });
  if (p.action === 'market'){
    const sh = ss_().getSheetByName(MARKET_SHEET);
    if (!sh || sh.getLastRow() < 2) return json_({ ok: true, rows: [] });
    const data = sh.getDataRange().getValues();
    const H = data[0];
    const n = Math.min(parseInt(p.n) || 30, data.length - 1);
    const rows = data.slice(-n).reverse().map(r => { const o = {}; H.forEach((h, i) => o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], 'GMT+7', 'yyyy-MM-dd') : r[i]); return o; });
    return json_({ ok: true, rows: rows });
  }
  return json_({ ok: false, error: 'Action không hợp lệ' });
}

// 4) R2: Premium ĐỘNG theo quy cách — cảnh báo khi premium đợt CIF MỚI NHẤT của 1 quy cách
// cao hơn premium TRUNG BÌNH các đợt trước của CHÍNH quy cách đó > CIF_ALERT_PCT % (mặc định 10).
// premium_i = priceFC_i − SMM quy đổi USD tại ngày đợt i (đọc tab MARKET_PRICES — cần backfill).
function alertCIFvsMarket_(alerts){
  const sh = ss_().getSheetByName(MARKET_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  const md = sh.getDataRange().getValues();
  const Hm = md[0];
  const cD = Hm.indexOf('date'), cS = Hm.indexOf('smm_usd');
  if (cD < 0 || cS < 0) return;
  const smmSeries = [];
  for (var i = 1; i < md.length; i++){
    const d = md[i][cD] instanceof Date ? Utilities.formatDate(md[i][cD], 'GMT+7', 'yyyy-MM-dd') : String(md[i][cD]).slice(0, 10);
    const v = parseFloat(md[i][cS]);
    if (d && !isNaN(v) && v > 0) smmSeries.push({ d: d, v: v });
  }
  if (!smmSeries.length) return;
  smmSeries.sort(function(a, b){ return a.d < b.d ? -1 : 1; });
  const smmAt = function(iso){ var best = null; for (var x = 0; x < smmSeries.length; x++){ if (smmSeries[x].d <= iso) best = smmSeries[x].v; else break; } return best != null ? best : smmSeries[0].v; };

  const ui = sheetByGid_(GID_UPDATED_IMPORT).getDataRange().getValues();
  const Hu = ui[0];
  const uD = colIdx_(Hu, ['updatedate', 'update date', 'ngaycapnhat']),
        uA = colIdx_(Hu, ['alloy', 'mac']), uT = colIdx_(Hu, ['temper']),
        uMin = colIdx_(Hu, ['minthick', 'min thick']), uMax = colIdx_(Hu, ['maxthick', 'max thick']),
        uF = colIdx_(Hu, ['pricefc', 'price fc', 'giacif']);
  if (uF < 0 || uD < 0) return;
  const toIso = function(v){
    if (v instanceof Date) return Utilities.formatDate(v, 'GMT+7', 'yyyy-MM-dd');
    const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : null;
  };
  const groups = {};
  for (var r = 1; r < ui.length; r++){
    const cif = parseFloat(ui[r][uF]) || 0; if (cif <= 0) continue;
    const iso = toIso(ui[r][uD]); if (!iso) continue;
    const key = [ui[r][uA], ui[r][uT], ui[r][uMin], ui[r][uMax]].join('|');
    (groups[key] = groups[key] || []).push({ iso: iso, cif: cif, label: ui[r][uA] + ' ' + ui[r][uT] + ' ' + ui[r][uMin] + '-' + ui[r][uMax] + 'mm' });
  }
  const pct = parseFloat(props_().getProperty('CIF_ALERT_PCT')) || 10;
  const over = [];
  Object.keys(groups).forEach(function(key){
    const es = groups[key].sort(function(a, b){ return a.iso < b.iso ? -1 : 1; });
    if (es.length < 2) return; // cần ít nhất 2 đợt mới so được xu hướng
    const prems = es.map(function(e){ return e.cif - smmAt(e.iso); });
    const last = prems[prems.length - 1];
    const prior = prems.slice(0, -1);
    const avg = prior.reduce(function(a, b){ return a + b; }, 0) / prior.length;
    if (avg > 0 && (last - avg) / avg * 100 > pct){
      over.push(es[es.length - 1].label + ': premium đợt mới <b>' + Math.round(last) + ' $/t</b> vs TB trước ' + Math.round(avg) + ' $/t (+' + ((last - avg) / avg * 100).toFixed(1) + '%)');
    }
  });
  if (over.length) alerts.push('📈 <b>' + over.length + ' quy cách bị NCC tăng premium &gt;' + pct + '%</b> so các đợt trước:<br>• ' + over.join('<br>• '));
}

// ── HÀM DÒ NHANH: chạy hàm này đầu tiên khi gặp "lỗi không xác định".
// Nếu CHÍNH NÓ cũng lỗi → vấn đề ở phiên đăng nhập/hạ tầng Google, KHÔNG phải code.
function testNhanh(){
  Logger.log('✓ Apps Script chạy bình thường lúc ' + new Date());
  Logger.log('✓ Đọc được spreadsheet: ' + ss_().getName());
}
