const ALLOYS=["A1050","A1052","A1060","A3003","A3003 CT","A3105","A5052","A5083","A6061","A6063"];
const TEMPERS=["H14","H16","H18","H24","H32","H34","H111","O","T5","T6"];
const THICKS=["0.4","0.5","0.6","0.7","0.8","0.9","1.0","1.2","1.5","2.0","2.5","3.0","4.0","5.0","6.0"];
const WIDTHS=["600","800","1000","1200","1220","1250","1500","1524","2000"];
const LENGTHS=["C","1000","1200","2000","2400","2500","3000","4000","6000","Custom"];

const coatingFromGSheet=(val)=>{
  if(!val) return 'KP';
  const v=String(val).trim().toUpperCase();
  if(v==='1E'||v==='PE'||v==='YES'||v==='1'||v==='TRUE') return '1E';
  return 'KP';
};
const coatingShort=(c)=>c==='1E'?'PE':'NOPE';

const GSHEET_INVENTORY="https://docs.google.com/spreadsheets/d/1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU/export?format=csv&gid=0";
const GSHEET_MINSTOCK="https://docs.google.com/spreadsheets/d/1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU/export?format=csv&gid=1080747466";
const GSHEET_LIMITS="https://docs.google.com/spreadsheets/d/1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU/export?format=csv&gid=1995461192";
const GSHEET_UPDATED_IMPORT="https://docs.google.com/spreadsheets/d/1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU/export?format=csv&gid=1371908903";
const GSHEET_FLOOR_HISTORY="https://docs.google.com/spreadsheets/d/1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU/export?format=csv&gid=1904019501";
// MonthlyRevenue: CSV export trực tiếp từ sheet gid=478887656
const GSHEET_MONTHLY_REVENUE="https://docs.google.com/spreadsheets/d/1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU/export?format=csv&gid=478887656";
const GSHEET_CASHFLOW="https://docs.google.com/spreadsheets/d/1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU/export?format=csv&gid=127496102";
// PO đã ký: tab gid=2015387961 — 1 dòng = 1 (PO × SKU)
const GSHEET_PO="https://docs.google.com/spreadsheets/d/1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU/export?format=csv&gid=2015387961";

const skuKey=r=>`${r.alloy}|${r.temper}|${r.thickness}|${r.width}|${r.length}|${r.coating||'KP'}`;
// Chuẩn hóa 1 thành phần kích thước để so khớp (vd "2.0"=="2"; "C"/"Coil"/"cuộn" => "C")
const normDim=v=>{
  const s=String(v==null?'':v).trim().toUpperCase();
  if(s===''||s==='C'||s==='COIL'||s==='CUON'||s==='CUỘN') return 'C';
  const f=parseFloat(s.replace(',','.'));
  return isNaN(f)?s:String(f);
};
// Khóa SKU đã chuẩn hóa — dùng để khớp PO với tồn kho dù định dạng khác nhau ("2.0" vs "2")
const skuKeyNorm=r=>`${String(r.alloy||'').trim().toUpperCase()}|${String(r.temper||'').trim().toUpperCase()}|${normDim(r.thickness)}|${normDim(r.width)}|${normDim(r.length)}|${(r.coating||'KP')}`;
// Chuẩn hóa ĐỘ DÀY: số nguyên tự thêm ".0" (1→"1.0", 2→"2.0"), giữ nguyên số lẻ (0.33, 2.5).
// Dùng cho cả dữ liệu copy-paste từ GSheet lẫn nhập tay, để người nhập không phải gõ ".0".
const normThick=v=>{
  const s=String(v==null?'':v).trim().replace(',','.');
  if(s==='') return '';
  const f=parseFloat(s);
  if(isNaN(f)) return s;                 // giữ nguyên nếu không phải số
  return Number.isInteger(f)?f.toFixed(1):String(f);  // 2 → "2.0", 0.33 → "0.33"
};
const skuLabel=r=>`${r.alloy} ${r.temper}  ${r.thickness}x${r.width}x${r.length} [${coatingShort(r.coating||'KP')}]`;

const uid=()=>Date.now()+Math.random();
const fv=v=>(isNaN(v)||!isFinite(v))?'0':new Intl.NumberFormat('vi-VN').format(Math.round(v));
const fu=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:1}).format(v||0);
const pn=s=>parseFloat(String(s).replace(/\./g,'').replace(/,/g,''))||0;
const fpct=(v,dec=2)=>v==null?'—':(v>=0?'+':'')+v.toFixed(dec)+'%';

function parseCsv(text){
  const lines=text.trim().split('\n');
  if(lines.length<2) return [];
  const headers=lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/\r/g,'').replace(/\s+/g,''));
  return lines.slice(1).map(line=>{
    const vals=[];let cur='',inQ=false;
    for(let c of line){
      if(c==='"') inQ=!inQ;
      else if(c===','&&!inQ){vals.push(cur.trim().replace(/\r/g,''));cur='';}
      else cur+=c;
    }
    vals.push(cur.trim().replace(/\r/g,''));
    const obj={};
    headers.forEach((h,i)=>obj[h]=(vals[i]||'').replace(/^"|"$/g,'').trim());
    return obj;
  }).filter(r=>Object.values(r).some(v=>v!==''));
}
async function fetchCsv(url){
  const res=await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCsv(await res.text());
}
// ── Parse dữ liệu PO đã ký (tab gid=2015387961) ──
// Lấy giá trị theo nhiều biến thể tên cột (bỏ dấu, bỏ ký tự đặc biệt) cho linh hoạt
const COMBINING=new RegExp('[\\u0300-\\u036f]','g');
const stripVN=s=>String(s||'').normalize('NFD').replace(COMBINING,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]/g,'');
const poGet=(row,cands)=>{
  // row keys đã được parseCsv hạ thấp & bỏ space; ta so khớp bằng stripVN cả 2 phía
  const map={}; Object.keys(row).forEach(k=>{map[stripVN(k)]=row[k];});
  for(const c of cands){const v=map[stripVN(c)];if(v!=null&&String(v).trim()!=='') return String(v).trim();}
  return '';
};
const poNum=v=>{const f=parseFloat(String(v).replace(/[^0-9.\-]/g,''));return isNaN(f)?0:f;};
function parsePOData(rows){
  return rows.map(r=>{
    const alloy=poGet(r,['Mác','Mac','alloy']).toUpperCase();
    if(!alloy) return null;
    const temper=poGet(r,['Temper']).toUpperCase();
    const coatRaw=poGet(r,['Phủ','Phu','coating']);
    const coating=(coatRaw.toUpperCase()==='1E'||coatRaw.toUpperCase()==='PE')?'1E':'KP';
    const thickness=normThick(poGet(r,['Dày','Day','thickness']));
    const width=poGet(r,['Rộng','Rong','width']);
    const length=poGet(r,['Dài','Dai','length'])||'C';
    const ordered=poNum(poGet(r,['TL đặt (kg)','TLđặt','TL đặt','ordered','tldat']));
    const delivered=poNum(poGet(r,['TL đã giao (kg)','TLđãgiao','delivered','tldagiao']));
    // Ưu tiên cột "Tồn chưa giao" (G). Nếu trống → fallback = đặt − đã giao (>=0)
    const remRaw=poGet(r,['Tồn chưa giao (kg)','Tồnchưagiao','Tonchuagiao','remaining','tonchuagiao']);
    let remaining=remRaw!==''?poNum(remRaw):Math.max(ordered-delivered,0);
    if(remaining<0) remaining=0;
    return {
      supplier:poGet(r,['Khách hàng','KhachHang','customer','Nhà CC','NhaCC','supplier'])||'?',
      po:poGet(r,['Số PO','SoPO','po'])||'?',
      poDate:poGet(r,['Ngày PO','NgayPO','date']),
      alloy,temper,coating,thickness,width,length,
      ordered,delivered,remaining,
      price:poNum(poGet(r,['Đơn giá (đ/kg)','Đơngiá','price'])),
      key:skuKeyNorm({alloy,temper,thickness,width,length,coating}),
    };
  }).filter(Boolean);
}
// CashFlow là ma trận ngang (nhiều cột trùng tên) → cần CSV thô, không parse thành object
async function fetchText(url){
  const res=await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ── Parse ngày định dạng VN (dd/mm/yyyy hoặc d/m/yyyy) → timestamp ──
const parseVNDate=s=>{
  if(!s) return 0;
  const parts=String(s).trim().split('/');
  if(parts.length!==3) return 0;
  const [d,m,y]=parts.map(Number);
  if(!d||!m||!y) return 0;
  return new Date(y,m-1,d).getTime();
};

// ── Lọc UpdatedImportPrice: chỉ giữ ngày gần hôm nay nhất ──
const filterLatestUIP=rows=>{
  if(!rows||rows.length===0) return rows;
  const today=Date.now();
  const dates=rows.map(r=>parseVNDate(r.updateDate)).filter(d=>d>0&&d<=today+86400000);
  if(dates.length===0) return rows;
  const latestDate=Math.max(...dates);
  const latestDay=new Date(latestDate).toDateString();
  const filtered=rows.filter(r=>{
    const d=parseVNDate(r.updateDate);
    return d>0&&new Date(d).toDateString()===latestDay;
  });
  return filtered.length>0?filtered:rows;
};

// ── Lọc UpdatedImportPrice: lấy ngày mới nhất của TUẦN TRƯỚC ──
const filterPrevWeekUIP=rows=>{
  if(!rows||rows.length===0) return [];
  const today=new Date();
  // Tìm ngày đầu tuần hiện tại (thứ 2)
  const dow=today.getDay(); // 0=CN
  const daysSinceMonday=dow===0?6:dow-1;
  const thisMonday=new Date(today);thisMonday.setHours(0,0,0,0);thisMonday.setDate(today.getDate()-daysSinceMonday);
  const prevWeekEnd=new Date(thisMonday.getTime()-1); // Chủ nhật tuần trước cuối ngày
  const prevWeekStart=new Date(prevWeekEnd);prevWeekStart.setDate(prevWeekEnd.getDate()-6);prevWeekStart.setHours(0,0,0,0);
  const start=prevWeekStart.getTime();const end=prevWeekEnd.getTime();
  // Lọc các rows trong tuần trước
  const inPrevWeek=rows.filter(r=>{const d=parseVNDate(r.updateDate);return d>=start&&d<=end;});
  if(inPrevWeek.length===0) return [];
  // Lấy ngày cuối cùng trong tuần trước (ngày mới nhất)
  const maxD=Math.max(...inPrevWeek.map(r=>parseVNDate(r.updateDate)));
  const maxDay=new Date(maxD).toDateString();
  return inPrevWeek.filter(r=>new Date(parseVNDate(r.updateDate)).toDateString()===maxDay);
};

// Việc 1 đợt 2: tính bước duyệt kế tiếp theo quy trình tuần tự.
// approvers: danh sách [{id,order,...}] đã sort; approvals: [{id,decision}] đã xử lý.
// Trả về: {done, rejected, nextApprover} — nextApprover=null nếu đã xong hoặc đã bị từ chối.
// Bước duyệt của 1 người theo luồng: flow='buy'→stepBuy, 'floor'→stepFloor. 0/trống = không tham gia.
// Tương thích ngược: nếu chưa có stepBuy/stepFloor thì dùng `order` cho luồng 'buy'.
const stepOf=(ap,flow)=>{
  if(flow==='floor') return parseInt(ap.stepFloor)||0;
  const sb=ap.stepBuy;
  if(sb!==undefined&&sb!==null&&sb!=='') return parseInt(sb)||0;
  return parseInt(ap.order)||0; // fallback dữ liệu cũ
};
// SHA-256 (browser native) — module scope để mọi useCallback dùng được, tránh TDZ.
const sha256=async(text)=>{
  const enc=new TextEncoder().encode(text);
  const buf=await crypto.subtle.digest('SHA-256',enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
};

// ── PIN + SALT (GĐ1) ──────────────────────────────────────────
// Salt cố định của app: chống tra bảng hash sẵn (rainbow table) cho PIN 4-8 số.
const PIN_SALT='PAKD-HD-ALU-2026-v1';
const hashPin=async(pin)=>sha256(PIN_SALT+'|'+pin);
// So khớp PIN với hash đã lưu — chấp nhận cả hash CŨ (chưa salt) để người duyệt hiện tại không bị khóa.
const pinMatches=async(pin,storedHash)=>{
  if(!storedHash) return false;
  if((await hashPin(pin))===storedHash) return true;
  return (await sha256(pin))===storedHash; // tương thích hash cũ
};
// Tìm người duyệt theo PIN (thử hash mới có salt trước, rồi hash cũ).
const findByPin=async(list,pin)=>{
  const salted=await hashPin(pin); const legacy=await sha256(pin);
  return (list||[]).find(a=>a.pinHash===salted||a.pinHash===legacy)||null;
};
// Tiến trình duyệt theo luồng (mặc định 'buy'). Chỉ tính người có step>0.
// SỬA #2 (R3): Bước CAO NHẤT của luồng = người quyết định cuối.
//  • Người bước cao nhất ký → XONG ngay (bỏ qua mọi bước còn lại).
//  • Người bước thấp ký → chuyển lên bước CAO HƠN gần nhất chưa ký, cho tới bước cao nhất.
//  • Người trình/ký ở bước N → bỏ qua các bước < N; người kế tiếp là bước nhỏ nhất > (bước cao nhất đã ký).
const approvalProgress=(approvers,approvals,flow='buy')=>{
  const apvs=(approvers||[]).filter(a=>stepOf(a,flow)>0).slice().sort((a,b)=>stepOf(a,flow)-stepOf(b,flow));
  const acts=approvals||[];
  const rejected=acts.some(a=>a.decision==='rejected');
  if(rejected) return {done:false,rejected:true,nextApprover:null,chain:apvs,maxStep:null,topSigned:null};
  if(apvs.length===0) return {done:false,rejected:false,nextApprover:null,chain:apvs,empty:true,maxStep:null,topSigned:null};
  const maxStep=Math.max(...apvs.map(a=>stepOf(a,flow)));         // bước cao nhất của luồng
  // Bước cao nhất ĐÃ KÝ duyệt
  const signedSteps=acts.filter(a=>a.decision==='approved').map(a=>{
    const ap=(approvers||[]).find(x=>x.id===a.id);
    return ap?stepOf(ap,flow):(parseInt(a.step)||0);
  }).filter(s=>s>0);
  const topSigned=signedSteps.length?Math.max(...signedSteps):0;
  // XONG khi bước cao nhất của luồng đã ký
  if(topSigned>=maxStep) return {done:true,rejected:false,nextApprover:null,chain:apvs,maxStep,topSigned,empty:false};
  // Chưa xong → người kế tiếp = bước NHỎ NHẤT > topSigned (bỏ qua mọi bước <= topSigned)
  const next=apvs.find(ap=>stepOf(ap,flow)>topSigned&&!acts.some(a=>a.id===ap.id&&a.decision==='approved'));
  return {done:false,rejected:false,nextApprover:next||null,chain:apvs,maxStep,topSigned,empty:false};
};

const weightedAvg=rows=>{
  const qty=rows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
  const val=rows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
  return qty>0?val/qty:0;
};

const groupBySku=rows=>{
  const map={};
  rows.forEach(r=>{
    const k=skuKey(r);
    if(!map[k]) map[k]={key:k,label:skuLabel(r),alloy:r.alloy,temper:r.temper,thickness:r.thickness,width:r.width,length:r.length,coating:r.coating||'KP',inStock:[],inTransit:[]};
    if(r.status==='IN_STOCK') map[k].inStock.push(r); else map[k].inTransit.push(r);
  });
  return Object.values(map);
};

// ─────────────────────────────────────────────────────────────
// FLOOR PRICE LOGIC v5.7 (Cập nhật 9.5%)
// ─────────────────────────────────────────────────────────────
const calcFloorForSku=(costBasisRaw, inputs)=>{
  const {finCostPct:finFixed, opsCostPct, creditMode, lendingRate, customCreditDays, storageCostPct, baseFinCostPct}=inputs;
  let creditCostRate=0;
  if(creditMode==='fixed') creditCostRate=(finFixed||0)/100;
  else if(creditMode==='credit') creditCostRate=(lendingRate||0)/100*(customCreditDays||0)/365;

  const storageRate = (storageCostPct != null ? storageCostPct : 2) / 100;
  const baseFinRate = (baseFinCostPct != null ? baseFinCostPct : 1.5) / 100;
  
  const totalCostRate = storageRate + baseFinRate + creditCostRate + (opsCostPct||0)/100;
  const floorPrice = costBasisRaw*(1+totalCostRate);
  
  return{floorPrice, creditCostRate, totalCostRate, storageRate, baseFinRate};
};

const findUpdatedImportPrice=(sku,updatedPrices,exchangeRate)=>{
  if(!updatedPrices||updatedPrices.length===0) return null;
  const thick=parseFloat(sku.thickness)||0;
  const match=updatedPrices.find(p=>p.alloy===sku.alloy&&p.temper===sku.temper&&thick>=parseFloat(p.minThick||0)&&thick<=parseFloat(p.maxThick||999));
  if(!match) return null;
  // Chưa nhập tỷ giá (≤0) → KHÔNG quy đổi VND (tránh hiện số vô nghĩa như "4")
  const exRate=parseFloat(exchangeRate)||0;
  const priceVNDperKg=exRate>0?((parseFloat(match.priceFC)||0)/1000*exRate*(parseFloat(match.importCoef)||1)):0;
  return{
    priceFC:parseFloat(match.priceFC)||0,
    importCoef:parseFloat(match.importCoef)||1,
    priceVNDperKg,
    note:match.note||'',
    updateDate:match.updateDate||match.updatedate||'',
    competitorPrice:parseFloat(match.competitorprice||match.competitorPrice||0)||0,
    competitorFloorPrice:parseFloat(match.competitorfloorprice||match.competitorFloorPrice||0)||0,
  };
};

const calcFloorPricePerSku=(skuGroup,updatedImportMatch,inputs)=>{
  const stockRows=skuGroup.inStock;
  const transitRows=skuGroup.inTransit;
  const qtyStock=stockRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
  const qtyTransit=transitRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
  const totalQty=qtyStock+qtyTransit;

  // Giá vốn bình quân gốc (Thuần)
  const avgCostStockRaw=weightedAvg(stockRows.map(r=>({qtyKg:parseFloat(r.qtyKg)||0,avgCost:parseFloat(r.avgCost)||0})));
  const avgCostTransitRaw=weightedAvg(transitRows.map(r=>({qtyKg:parseFloat(r.qtyKg)||0,avgCost:parseFloat(r.avgCost)||0})));

  let costBasisPhysicalRaw=0;
  if(totalQty>0){
    costBasisPhysicalRaw=(qtyStock*avgCostStockRaw+qtyTransit*avgCostTransitRaw)/totalQty;
  }

  const newImportPriceVND=updatedImportMatch?updatedImportMatch.priceVNDperKg:null;

  const {floorPrice,creditCostRate,totalCostRate,storageRate,baseFinRate}=calcFloorForSku(costBasisPhysicalRaw,inputs);

  const addCore=(inputs.marginCore||0)/100;
  const addLoyal=(inputs.marginLoyal||1)/100;
  const addNew=(inputs.marginNew||2)/100;
  const priceCore=floorPrice*(1+addCore);
  const priceLoyal=floorPrice*(1+addLoyal);
  const priceNew=floorPrice*(1+addNew);

  return{
    alloy:skuGroup.alloy,temper:skuGroup.temper,
    thickness:skuGroup.thickness,width:skuGroup.width,
    length:skuGroup.length,coating:skuGroup.coating,
    skuKey:skuGroup.key,skuLabel:skuGroup.label,
    costBasisPhysical: costBasisPhysicalRaw, // Giá vốn thuần
    avgCostStockRaw,
    avgCostTransitRaw,
    totalQty,qtyStock,qtyTransit,
    floorAbsolute:floorPrice,finCostRate:creditCostRate,totalCostRate,storageRate,baseFinRate,
    newImportPriceVND,updatedImportMatch,
    priceCore,priceLoyal,priceNew,
    competitorPrice:updatedImportMatch?.competitorPrice||0,
    competitorFloorPrice:updatedImportMatch?.competitorFloorPrice||0,
  };
};

// ─────────────────────────────────────────────────────────────
// MANAGEMENT VIEW
// ─────────────────────────────────────────────────────────────
const DEFAULT_MGMT_GROUPS=[
  {id:'g1',label:'A1050 H14 0.2–0.49mm',alloy:'A1050',temper:'',minThick:0.2,maxThick:0.49},
  {id:'g2',label:'A1050 H14 0.5–0.99mm',alloy:'A1050',temper:'',minThick:0.5,maxThick:0.99},
  {id:'g3',label:'A1050 H14 1.0–6.0mm', alloy:'A1050',temper:'',minThick:1.0,maxThick:6.0},
  {id:'g4',label:'A3003 H14 1.0–5.0mm', alloy:'A3003',temper:'H14',minThick:1.0,maxThick:5.0},
  {id:'g5',label:'A3003 H16 1.0–5.0mm', alloy:'A3003',temper:'H16',minThick:1.0,maxThick:5.0},
  {id:'g6',label:'A5052 (tất cả)',        alloy:'A5052',temper:'',minThick:0,maxThick:99},
];

const calcMgmtGroups=(floorPriceData,groups,excludedSkus,poByKey,excludePOFloor)=>{
  // qty hiệu dụng = totalQty − PO chưa giao (nếu bật loại bỏ PO), không âm
  const effQ=(r)=>{
    if(!excludePOFloor||!poByKey) return r.totalQty;
    const rem=(poByKey[skuKeyNorm(r)]||{}).remaining||0;
    return Math.max((r.totalQty||0)-rem,0);
  };
  return groups.map(g=>{
    const excluded=(excludedSkus&&excludedSkus[g.id])||[];
    const matching=floorPriceData.filter(r=>{
      if(r.alloy!==g.alloy) return false;
      if(g.temper&&r.temper!==g.temper) return false;
      const t=parseFloat(r.thickness)||0;
      return t>=g.minThick&&t<=g.maxThick;
    });
    // active = chưa bị loại
    const active=matching.filter(r=>!excluded.includes(r.skuKey));
    if(active.length===0) return{...g,skus:matching.length,activeSkus:0,totalQty:0,avgCost:0,avgNewImportPrice:0,avgFloor:0,avgCore:0,avgLoyal:0,avgNew:0,avgCompPrice:0,avgCompFloor:0};
    const totalQty=active.reduce((s,r)=>s+effQ(r),0);
    const wa=(field)=>{
      const tot=active.reduce((s,r)=>s+effQ(r)*(r[field]||0),0);
      return totalQty>0?tot/totalQty:0;
    };
    return{
      ...g,
      skus:matching.length,
      activeSkus:active.length,
      totalQty,
      avgCost:wa('costBasisPhysical'),
      avgNewImportPrice:wa('newImportPriceVND'),
      avgFloor:wa('floorAbsolute'),
      avgCore:wa('priceCore'),
      avgLoyal:wa('priceLoyal'),
      avgNew:wa('priceNew'),
      avgCompPrice:wa('competitorPrice'),
      avgCompFloor:wa('competitorFloorPrice'),
    };
  });
};

// ─────────────────────────────────────────────────────────────
// OTHER CALCS
// ─────────────────────────────────────────────────────────────
const calcInvoice=(products,exRate)=>{const usd=products.reduce((s,p)=>s+(p.qtyKg/1000)*p.priceFC,0);return{invoiceUSD:usd,invoiceVND:usd*exRate};};
const calcLanded=(invoiceVND,totalKg,inp)=>{
  const mgmt=invoiceVND*(inp.managementFee/100),tax=invoiceVND*(inp.importTax/100);
  const freight=Math.max(0,inp.freightTotal),proc=inp.processingCost*totalKg;
  const total=invoiceVND+mgmt+tax+freight+proc;
  return{mgmt,tax,freight,proc,landedVND:total,landedPerKg:totalKg>0?total/totalKg:0};
};
const calcFinance=(invoiceVND,land,totalKg,inp)=>{
  const days=inp.leadTime+inp.holdingTime;let fin=0;
  if(inp.paymentMethod==='TT') fin=(invoiceVND+land.tax+land.freight)*(inp.capitalCostPercent/100)*(days/365);
  else fin=invoiceVND*(inp.lcOpenFee/100)+invoiceVND*(inp.lcInterest/100)*(inp.lcDays/365)+(invoiceVND*inp.lcMargin/100+land.tax+land.freight)*(inp.capitalCostPercent/100)*(days/365);
  return{finVND:fin,finPerKg:totalKg>0?fin/totalKg:0};
};
const calcProductBreakdown=(products,land,fin,totalKg,inp)=>products.map(p=>{
  const ratio=totalKg>0?p.qtyKg/totalKg:0;
  const invVND=(p.qtyKg/1000)*p.priceFC*inp.exchangeRate;
  const mgmt=invVND*(inp.managementFee/100),tax=invVND*(inp.importTax/100);
  const freight=land.freight*ratio,proc=inp.processingCost*p.qtyKg;
  const finRow=fin.finVND*ratio,landedRow=invVND+mgmt+tax+freight+proc;
  const physPerKg=p.qtyKg>0?landedRow/p.qtyKg:0;
  return{...p,invVND,landedRow,finRow,physPerKg,econPerKg:physPerKg+(p.qtyKg>0?finRow/p.qtyKg:0)};
});
const findSellPrice=(purchaseRow,sellingPrices)=>{
  const{alloy,temper,thickness,width,length,coating}=purchaseRow;const coat=coating||'KP';
  // 1. Khớp hoàn toàn
  const full=sellingPrices.find(s=>s.alloy===alloy&&s.temper===temper&&(s.thickness||'')===(thickness||'')&&(s.width||'')===(width||'')&&(s.length||'')===(length||'')&&(s.coating||'KP')===coat);
  if(full) return{price:full.sellCost||full.price||0,label:`${full.alloy} ${full.temper}`,comment:full.comment||''};
  // 2. Khớp từng phần: nếu sp để trống trường nào → bỏ qua trường đó (wildcard)
  const partial=sellingPrices.find(s=>{
    if((s.alloy||'')!==alloy) return false;
    if(s.temper&&s.temper!==temper) return false;
    if(s.thickness&&(s.thickness!==thickness)) return false;
    if(s.width&&(s.width!==width)) return false;
    if(s.length&&(s.length!==length)) return false;
    if((s.coating||'KP')!==coat) return false;
    return true;
  });
  if(partial) return{price:partial.sellCost||partial.price||0,label:'partial-match',comment:partial.comment||''};
  const byATC=sellingPrices.find(s=>s.alloy===alloy&&s.temper===temper&&(s.coating||'KP')===coat&&!s.thickness&&!s.width&&!s.length);
  if(byATC) return{price:byATC.sellCost||byATC.price||0,label:'fallback',comment:byATC.comment||''};
  return null;
};
// ── Wildcard expand: mở rộng 1 product có trường trống thành nhiều dòng theo inventory ──
const expandWildcardProducts=(products,inventory)=>{
  const skuGroups=groupBySku(inventory);
  const expanded=[];
  products.forEach(p=>{
    const hasBlank=!p.thickness||!p.width||!p.length||!p.temper;
    if(!hasBlank){expanded.push(p);return;}
    // Tìm tất cả SKU inventory khớp với các trường đã điền
    const matches=skuGroups.filter(g=>{
      if(g.alloy!==p.alloy) return false;
      if(p.temper&&g.temper!==p.temper) return false;
      if(p.thickness&&g.thickness!==p.thickness) return false;
      if(p.width&&g.width!==p.width) return false;
      if(p.length&&g.length!==p.length) return false;
      if(p.coating&&(g.coating||'KP')!==(p.coating||'KP')) return false;
      return true;
    });
    if(matches.length===0){expanded.push(p);return;}
    // Tổng tồn kho của các SKU khớp để chia tỷ lệ KL
    const totalMatchQty=matches.reduce((s,g)=>{
      const rows=[...g.inStock,...g.inTransit];
      return s+rows.reduce((ss,r)=>ss+(parseFloat(r.qtyKg)||0),0);
    },0);
    matches.forEach(g=>{
      const rows=[...g.inStock,...g.inTransit];
      const grpQty=rows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
      // Phân bổ KL theo tỷ lệ tồn kho, nếu tồn = 0 chia đều
      const ratio=totalMatchQty>0?grpQty/totalMatchQty:1/matches.length;
      expanded.push({...p,id:p.id+'_'+g.key,thickness:g.thickness,width:g.width,length:g.length,temper:g.temper,coating:g.coating||'KP',qtyKg:Math.round(p.qtyKg*ratio),_wildcardParent:p.id,_wildcardLabel:p.alloy+(p.temper?` ${p.temper}`:' (tất cả temper)')+` (tất cả độ dày)`});
    });
  });
  return expanded;
};

const calcSkuBlend=(inventory,purchaseRows,sellingPrices,inputs,minStockMap,maxStockMap)=>{
  const skuGroups=groupBySku(inventory);
  return purchaseRows.map(p=>{
    const k=skuKey(p),grp=skuGroups.find(g=>g.key===k);
    const stockRows=grp?grp.inStock:[],transitRows=grp?grp.inTransit:[];
    const allExisting=[...stockRows,...transitRows];
    const avgCurrent=weightedAvg(allExisting),avgStock=weightedAvg(stockRows),avgTransit=weightedAvg(transitRows);
    const qtyStock=stockRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
    const qtyTransit=transitRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
    const qtyExisting=qtyStock+qtyTransit;
    // II.2 fix: GV BQ sau nhập dùng giá về kho thực (CIF*TG*(1+QL%)/1000)
    const veKhoPerKg=p.priceFC>0&&inputs.exchangeRate>0
      ?(p.priceFC*inputs.exchangeRate*(1+(inputs.managementFee||0)/100))/1000
      :p.physPerKg||0;
    const newRow={qtyKg:p.qtyKg,avgCost:veKhoPerKg};
    const totalExistingValue=allExisting.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
    const totalNewValue=p.qtyKg*veKhoPerKg;
    const qtyAfter=qtyExisting+p.qtyKg; // Đẩy lên trước
	const avgAfter=qtyAfter>0?(totalExistingValue+totalNewValue)/qtyAfter:veKhoPerKg;
    const finPerKg=p.qtyKg>0?p.finRow/p.qtyKg:0;
    const custFin=avgAfter*(inputs.lendingRate/100)*(inputs.customerCreditDays/365);
    const spResult=findSellPrice(p,sellingPrices);
    const sellPrice=spResult?spResult.price:0;
    const hasSellPrice=!!spResult&&sellPrice>0;
    const riskCost=sellPrice*(inputs.businessRiskPercent/100);
    const breakEven=avgAfter+finPerKg+custFin+riskCost;
    const realProfitPerKg=hasSellPrice?sellPrice-avgAfter:null;
    const profitPct=hasSellPrice&&avgAfter>0?((sellPrice-avgAfter)/avgAfter*100):null;
    const isRisk=hasSellPrice?sellPrice<breakEven:false;
    const grossProfitVND=hasSellPrice?realProfitPerKg*p.qtyKg:null;
    const minStock=minStockMap[k]||0;const maxStock=maxStockMap[k]||null;
    const available=qtyAfter;const stockRatio=minStock>0?available/minStock:999;
    const stockStatus=maxStock!==null&&available>maxStock?'OVER':stockRatio<0.8?'LOW':stockRatio>2?'EXCESS':'OK';
    return{...p,skuKey:k,skuLbl:skuLabel(p),avgCurrent,avgStock,avgTransit,qtyStock,qtyTransit,qtyExisting,avgAfter,veKhoPerKg,qtyAfter,breakEven,custFin,sellPrice,hasSellPrice,realProfitPerKg,profitPct,grossProfitVND,isRisk,minStock,maxStock,available,stockRatio,stockStatus};
  });
};
const calcInventoryValue=(inventoryRows)=>inventoryRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
const calcAlloySummary=(inventory,finPerKg,inputs,purchaseRows)=>{
  const alloyMap={};
  inventory.forEach(r=>{
    const a=r.alloy;const qty=parseFloat(r.qtyKg)||0;const cost=parseFloat(r.avgCost)||0;
    if(!alloyMap[a]) alloyMap[a]={alloy:a,totalKg:0,totalCostValue:0,coatedKg:0,plainKg:0,coatedCostValue:0,plainCostValue:0};
    alloyMap[a].totalKg+=qty;alloyMap[a].totalCostValue+=qty*cost;
    if((r.coating||'KP')==='1E'){alloyMap[a].coatedKg+=qty;alloyMap[a].coatedCostValue+=qty*cost;}
    else{alloyMap[a].plainKg+=qty;alloyMap[a].plainCostValue+=qty*cost;}
  });
  const allRows=inventory.map(r=>({qtyKg:parseFloat(r.qtyKg)||0,avgCost:parseFloat(r.avgCost)||0}));
  const globalKg=allRows.reduce((s,r)=>s+r.qtyKg,0);
  const globalCostValue=allRows.reduce((s,r)=>s+r.qtyKg*r.avgCost,0);
  // Tách Trong kho (IN_STOCK) và Đi đường (IN_TRANSIT) để hiển thị KPI chi tiết
  const inStockRows=inventory.filter(r=>(r.status||'IN_STOCK').toUpperCase()==='IN_STOCK');
  const inTransitRows=inventory.filter(r=>(r.status||'').toUpperCase()==='IN_TRANSIT');
  const stockKg=inStockRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
  const transitKg=inTransitRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
  const stockCostValue=inStockRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
  const transitCostValue=inTransitRows.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
  const globalAvg=weightedAvg(allRows);
  const globalCoatedKg=inventory.filter(r=>(r.coating||'KP')==='1E').reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
  const globalPlainKg=inventory.filter(r=>(r.coating||'KP')!=='1E').reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
  const globalCoatedCostValue=inventory.filter(r=>(r.coating||'KP')==='1E').reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
  const globalPlainCostValue=inventory.filter(r=>(r.coating||'KP')!=='1E').reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
  const purchaseAlloyMap={};
  (purchaseRows||[]).forEach(p=>{const a=p.alloy;if(!purchaseAlloyMap[a]) purchaseAlloyMap[a]={qtyKg:0,totalCost:0};purchaseAlloyMap[a].qtyKg+=p.qtyKg;purchaseAlloyMap[a].totalCost+=p.qtyKg*(p.physPerKg||0);});
  const alloyStats=Object.values(alloyMap).map(g=>{
    const avgBefore=g.totalKg>0?g.totalCostValue/g.totalKg:0;
    const pa=purchaseAlloyMap[g.alloy]||{qtyKg:0,totalCost:0};
    const totalAfterKg=g.totalKg+pa.qtyKg;const totalAfterValue=g.totalCostValue+pa.totalCost;
    const avgAfter=totalAfterKg>0?totalAfterValue/totalAfterKg:avgBefore;
    const custFin=avgAfter*(inputs.lendingRate/100)*(inputs.customerCreditDays/365);
    const breakEven=avgAfter+(finPerKg||0)+custFin;
    return{alloy:g.alloy,totalKg:g.totalKg,totalCostValue:g.totalCostValue,coatedKg:g.coatedKg,plainKg:g.plainKg,coatedCostValue:g.coatedCostValue,plainCostValue:g.plainCostValue,avgBefore,avgAfter,breakEven};
  });
  const allPRows=Object.values(purchaseAlloyMap);
  const globalAfterKg=globalKg+allPRows.reduce((s,p)=>s+p.qtyKg,0);
  const globalAfterValue=globalCostValue+allPRows.reduce((s,p)=>s+p.totalCost,0);
  const globalAvgAfter=globalAfterKg>0?globalAfterValue/globalAfterKg:globalAvg;
  const globalBreakEven=globalAvgAfter*(1+(inputs.businessRiskPercent||0)/100)+(finPerKg||0);
  return{alloyStats,globalKg,globalCostValue,globalAvg,globalAvgAfter,globalBreakEven,globalAfterKg,globalAfterValue,globalCoatedKg,globalPlainKg,globalCoatedCostValue,globalPlainCostValue,stockKg,transitKg,stockCostValue,transitCostValue};
};
const calcLimitsWarnings=(limitsData,inventory)=>{
  const globalCostValue=calcInventoryValue(inventory);
  const totalKg=inventory.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
  const lim=limitsData[0]||{};
  const totalCreditMin=lim.totalCreditMin||0,totalCreditMax=lim.totalCreditMax||0;
  const inventoryMinKg=lim.inventoryMinKg||0,inventoryMaxKg=lim.inventoryMaxKg||0;
  const apLimit=lim.accountsPayableLimit||0,actualAP=lim.actualAccountsPayable||0;
  const totalUsed=globalCostValue+actualAP;
  const warnOverKg=inventoryMaxKg>0&&totalKg>inventoryMaxKg;
  const warnUnderKg=inventoryMinKg>0&&totalKg<inventoryMinKg;
  const warnOverAP=apLimit>0&&actualAP>apLimit;
  const warnUnderCredit=totalCreditMin>0&&totalUsed<totalCreditMin;
  const warnOverCredit=totalCreditMax>0&&totalUsed>totalCreditMax;
  return{lim,globalCostValue,totalKg,actualAP,apLimit,totalUsed,totalCreditMin,totalCreditMax,inventoryMinKg,inventoryMaxKg,warnOverKg,warnUnderKg,warnOverAP,warnUnderCredit,warnOverCredit,totalAlerts:[warnOverKg,warnUnderKg,warnOverAP,warnUnderCredit,warnOverCredit].filter(Boolean).length};
};

// ─── DEFAULT DATA ─────────────────────────────────────────────
const defInventory=[
  {id:1,alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'1E',status:'IN_STOCK',qtyKg:2986,avgCost:92820},
  {id:2,alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'1E',status:'IN_TRANSIT',qtyKg:10000,avgCost:101466},
  {id:3,alloy:'A1050',temper:'H14',thickness:'0.8',width:'1200',length:'C',coating:'1E',status:'IN_STOCK',qtyKg:5000,avgCost:95000},
  {id:4,alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'KP',status:'IN_STOCK',qtyKg:3000,avgCost:90000},
];
const defMinStock=[
  {id:1,alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'1E',minStockKg:31000,maxStockKg:50000},
  {id:2,alloy:'A1050',temper:'H14',thickness:'0.8',width:'1200',length:'C',coating:'1E',minStockKg:15000,maxStockKg:null},
  {id:3,alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'KP',minStockKg:10000,maxStockKg:30000},
];
const defSP=[
];
const defLimits=[{id:1,totalCreditMin:5000000000,totalCreditMax:15000000000,inventoryMinVND:2000000000,inventoryMaxVND:8000000000,inventoryMinKg:20000,inventoryMaxKg:80000,accountsPayableLimit:7000000000,actualAccountsPayable:5500000000}];
const defProducts=[
  {id:1,alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'1E',qtyKg:12000,priceFC:3870},
  {id:2,alloy:'A1050',temper:'H14',thickness:'0.8',width:'1200',length:'C',coating:'1E',qtyKg:5000,priceFC:3870},
];
const defUpdatedImport=[
  {id:1,updateDate:'30/03/2026',alloy:'A1050',temper:'H14',minThick:0.2,maxThick:0.49,priceFC:3940,note:'CIF HPH',importCoef:1.015,competitorPrice:103000,competitorFloorPrice:100500},
  {id:2,updateDate:'30/03/2026',alloy:'A1050',temper:'H14',minThick:0.5,maxThick:0.99,priceFC:3925,note:'CIF HPH',importCoef:1.015,competitorPrice:102500,competitorFloorPrice:100000},
  {id:3,updateDate:'30/03/2026',alloy:'A1050',temper:'H14',minThick:1.0,maxThick:6.0, priceFC:3910,note:'CIF HPH',importCoef:1.015,competitorPrice:102000,competitorFloorPrice:99500},
  {id:4,updateDate:'30/03/2026',alloy:'A3003',temper:'H14',minThick:1.0,maxThick:3.0, priceFC:3980,note:'CIF HPH',importCoef:1.015,competitorPrice:105000,competitorFloorPrice:102000},
  {id:5,updateDate:'30/03/2026',alloy:'A5052',temper:'H32',minThick:1.0,maxThick:99.0,priceFC:4090,note:'CIF HPH',importCoef:1.015,competitorPrice:109000,competitorFloorPrice:106000},
];
const defInputs={
  supplierName:'',creator:'Nguyễn Văn A',
  supplierPaymentTerms:'', // SỬA #1 (R7): phương thức thanh toán của NCC (nhập tay, độc lập T/T-L/C)
  paymentMethod:'TT',capitalCostPercent:7.8,
  lcMargin:10,lcDays:90,lcOpenFee:0.2,lcInterest:5.8,
  exchangeRate:0,managementFee:1.5,
  leadTime:0,holdingTime:0,
  freightTotal:45000000,importTax:0,processingCost:0,
  businessRiskPercent:1.5,customerCreditDays:30,lendingRate:7.8,
  marginCore:0,marginLoyal:1,marginNew:2,
  opsCostPct:4.5,
  creditMode:'fixed',
  customCreditDays:30,
  storageCostPct: 2.0,
  baseFinCostPct: 1.5,
  finCostPct: 1.5, // Được dùng như Chi phí Công Nợ (CN) trong mode fixed
};

export {ALLOYS,PIN_SALT,hashPin,pinMatches,findByPin,COMBINING,DEFAULT_MGMT_GROUPS,GSHEET_CASHFLOW,GSHEET_FLOOR_HISTORY,GSHEET_INVENTORY,GSHEET_LIMITS,GSHEET_MINSTOCK,GSHEET_MONTHLY_REVENUE,GSHEET_PO,GSHEET_UPDATED_IMPORT,LENGTHS,TEMPERS,THICKS,WIDTHS,approvalProgress,calcAlloySummary,calcFinance,calcFloorForSku,calcFloorPricePerSku,calcInventoryValue,calcInvoice,calcLanded,calcLimitsWarnings,calcMgmtGroups,calcProductBreakdown,calcSkuBlend,coatingFromGSheet,coatingShort,defInputs,defInventory,defLimits,defMinStock,defProducts,defSP,defUpdatedImport,expandWildcardProducts,fetchCsv,fetchText,filterLatestUIP,filterPrevWeekUIP,findSellPrice,findUpdatedImportPrice,fpct,fu,fv,groupBySku,normDim,normThick,parseCsv,parsePOData,parseVNDate,pn,poGet,poNum,sha256,skuKey,skuKeyNorm,skuLabel,stepOf,stripVN,uid,weightedAvg};
