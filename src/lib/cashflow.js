// ─── CASH FLOW HELPERS ───────────────────────────────────────
// MA TRẬN NGANG: hàng = hạng mục (có cột KEY), cột = tuần (ĐẦU KỲ, TUẦN 21..52).
// Tag dòng tiền chuẩn = cân đối Mua–Bán. Số dư cân đối lũy kế tự tính:
//   TổngChi = CHI_HD + CHI_DD + CHI_KHAC + CHI_NOI
//   TổngThu = THU_CN + THU_DT + THU_KHAC
//   Ròng    = TổngThu − TổngChi ; SốDư[n] = SốDư[n-1] + Ròng[n]
// Nhận CSV THÔ (text). Ma trận ngang có nhiều cột trùng tên (các "Tháng …"),
// nên KHÔNG dùng object-by-header; tự tách thành lưới 2 chiều giữ nguyên cột.
const parseCashFlowCSV=(csvText)=>{
  const pn=(v)=>{if(v==null||v==='') return null;const s=String(v).replace(/[^0-9.,\-]/g,'');if(s==='')return null;const p=parseFloat(s.replace(/\./g,'').replace(/,/g,'.'));return isNaN(p)?null:p;};
  const norm=(s)=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
  // Tách 1 dòng CSV thành mảng ô, tôn trọng ô bọc dấu ngoặc kép
  const splitLine=(line)=>{
    const out=[];let cur='';let inQ=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ; }
      else if(ch===','&&!inQ){ out.push(cur);cur=''; }
      else cur+=ch;
    }
    out.push(cur);
    return out.map(c=>c.replace(/\r/g,'').trim());
  };
  if(!csvText||typeof csvText!=='string') return [];
  const grid=csvText.replace(/\r\n/g,'\n').split('\n').filter(l=>l.length>0).map(splitLine);
  if(grid.length===0) return [];
  // Xác định hàng tiêu đề tuần: hàng nào chứa nhiều ô "TUẦN xx"
  let weekRowIdx=-1;
  for(let i=0;i<Math.min(grid.length,5);i++){
    const cnt=grid[i].filter(c=>/tuan/.test(norm(c))).length;
    if(cnt>=3){weekRowIdx=i;break;}
  }
  if(weekRowIdx<0) weekRowIdx=0;
  const weekHeader=grid[weekRowIdx];
  // map cột -> {tuan, isDauKy}
  const colInfo=weekHeader.map(c=>{
    const n=norm(c);
    if(n.startsWith('dauky')) return {dauky:true,label:'ĐẦU KỲ'};
    const m=String(c).match(/(\d+)/);
    if(/tuan/.test(n)&&m) return {tuan:'Tuần '+String(parseInt(m[1])).padStart(2,'0'),week:parseInt(m[1])};
    return null;
  });
  // hàng tháng (ngay trên hàng tuần, nếu có) để gán nhãn tháng
  const monthHeader=weekRowIdx>0?grid[weekRowIdx-1]:[];
  // cột KEY: tìm cột header = 'KEY'
  let keyCol=weekHeader.findIndex(c=>norm(c)==='key');
  if(keyCol<0) keyCol=1; // mặc định cột 2
  // gom các hàng dữ liệu theo KEY
  const byKey={};
  for(let i=weekRowIdx+1;i<grid.length;i++){
    const key=norm(grid[i][keyCol]);
    if(!key) continue;
    byKey[key]=grid[i];
  }
  const cell=(key,colIdx)=>{const r=byKey[norm(key)];return r?pn(r[colIdx]):null;};
  // duyệt qua các cột tuần, dựng bản ghi mỗi tuần
  const out=[];let lastThang='';
  // Đầu kỳ hạn mức (cột ĐẦU KỲ) để cộng dồn fallback nếu GSheet thiếu giá trị
  const dauKyCol=colInfo.findIndex(c=>c&&c.dauky);
  let prevHD=dauKyCol>=0?(cell('hm_hd',dauKyCol)||0):0;
  let prevDD=dauKyCol>=0?(cell('hm_dd',dauKyCol)||0):0;
  colInfo.forEach((ci,colIdx)=>{
    if(!ci||ci.dauky) return;
    const thangRaw=String(monthHeader[colIdx]||'').trim();
    const thang=thangRaw||lastThang; if(thang)lastThang=thang;
    const chiHD=cell('chi_hd',colIdx)||0;
    const chiDD=cell('chi_dd',colIdx)||0;
    const chiKhac=cell('chi_khac',colIdx)||0;
    const chiNoi=cell('chi_noi',colIdx)||0;
    const thuCN=cell('thu_cn',colIdx)||0;
    const thuDT=cell('thu_dt',colIdx)||0;
    const thuKhac=cell('thu_khac',colIdx)||0;
    const tongChi=(cell('tongchi',colIdx)!=null?cell('tongchi',colIdx):(chiHD+chiDD+chiKhac+chiNoi));
    const tongThu=(cell('tongthu',colIdx)!=null?cell('tongthu',colIdx):(thuCN+thuDT+thuKhac));
    const rong=tongThu-tongChi;
    // ── TỔNG HẠN MỨC = HD + ĐĐ (cân đối nguồn lực mua–bán) ──
    // Công thức gốc: HD[n]=HD[n-1]−chiHD−chiKhác−muaNội+TổngThu ; ĐĐ[n]=ĐĐ[n-1]−chiĐĐ
    // Ưu tiên ĐỌC THẲNG dòng HANMUC/HM_HD/HM_DD đã tính trong GSheet; nếu trống thì tự cộng dồn.
    let hmHD=cell('hm_hd',colIdx);
    let hmDD=cell('hm_dd',colIdx);
    if(hmHD==null) hmHD=prevHD-chiHD-chiKhac-chiNoi+tongThu;
    if(hmDD==null) hmDD=prevDD-chiDD;
    prevHD=hmHD; prevDD=hmDD;
    let hanMuc=cell('hanmuc',colIdx);
    if(hanMuc==null) hanMuc=hmHD+hmDD;   // Tổng hạn mức
    const khuyet=String(byKey['cb_khuyet']?byKey['cb_khuyet'][colIdx]:'').trim()!=='';
    out.push({
      thang,tuan:ci.tuan,week:ci.week,
      nhapNgoai:chiHD+chiDD,
      chiHD,chiDD,muaNoi:chiNoi,chiKhac,
      tongChi,
      thuCN,thuDT,thuKhac,tongThu,
      rong,
      hmHD,hmDD,
      hanMuc, balance:hanMuc,    // balance = Tổng hạn mức (âm = tuần hụt dòng)
      tongMua:tongChi,
      dtTM:thuDT,
      thieuThuNo:khuyet,
    });
  });
  return out;
};
const getCurrentISOWeek=()=>{
  const now=new Date();
  const d=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
  const dayNum=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-dayNum);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const wk=Math.ceil((((d-yearStart)/86400000)+1)/7);
  return wk;
};
const getCurrentWeekLabel=()=>`Tuần ${String(getCurrentISOWeek()).padStart(2,'0')}`;
const normWeek=(s)=>parseInt(String(s||'').replace(/[^0-9]/g,''))||0;
const matchWeekLabel=(a,b)=>normWeek(a)===normWeek(b);


export {getCurrentISOWeek,getCurrentWeekLabel,matchWeekLabel,normWeek,parseCashFlowCSV};
