import React from 'react';
const {useState,useEffect,useRef,useMemo,useCallback,Component}=React;
import Chart from 'chart.js/auto';
import {ALLOYS,COMBINING,DEFAULT_MGMT_GROUPS,GSHEET_CASHFLOW,GSHEET_FLOOR_HISTORY,GSHEET_INVENTORY,GSHEET_LIMITS,GSHEET_MINSTOCK,GSHEET_MONTHLY_REVENUE,GSHEET_PO,GSHEET_UPDATED_IMPORT,LENGTHS,TEMPERS,THICKS,WIDTHS,approvalProgress,findByPin,hashPin,pinMatches,calcAlloySummary,calcFinance,calcFloorPricePerSku,calcInvoice,calcLanded,calcLimitsWarnings,calcMgmtGroups,calcProductBreakdown,calcSkuBlend,coatingFromGSheet,defInputs,defInventory,defLimits,defMinStock,defProducts,defSP,defUpdatedImport,expandWildcardProducts,fetchCsv,fetchText,filterLatestUIP,filterPrevWeekUIP,findUpdatedImportPrice,fu,fv,groupBySku,normThick,parseCsv,parsePOData,parseVNDate,pn,sha256,skuKey,skuKeyNorm,skuLabel,stepOf,stripVN,uid,weightedAvg} from './lib/core';
import {getCurrentWeekLabel,matchWeekLabel,parseCashFlowCSV} from './lib/cashflow';
import {FilterBar,Ic,LimitBar,SkuLabelCell,SkuSel} from './components/ui';
import {CashFlowTab} from './components/CashFlowTab';
import {ApprovalModal,ApproverAddForm,PinPromptModal,PinSetupForm} from './components/pin';
// ─── APP ──────────────────────────────────────────────────────
const App=()=>{
  const [tab,setTab]=useState('main');
  const [inputs,setInputs]=useState(defInputs);
  const [products,setProducts]=useState(defProducts);
  const [inventory,setInvs]=useState(defInventory);
  const [minStockRows,setMinStockRows]=useState(defMinStock);
  const [sellingPrices,setSP]=useState(defSP);
  const [limitsData,setLimitsData]=useState(defLimits);
  const [updatedImportPrices,setUpdatedImportPrices]=useState(()=>filterLatestUIP(defUpdatedImport));
  const [allRawImportPrices,setAllRawImportPrices]=useState(defUpdatedImport); // unfiltered for prev-week calc
  const [scenarios,setScenarios]=useState(()=>{try{const s=localStorage.getItem('pakd_scenarios');return s?JSON.parse(s):[];}catch(e){return [];}});
  const [invFilter,setInvFilter]=useState({status:'ALL',alloy:'ALL',coating:'ALL',stockAlert:'ALL',search:'',costMin:'',costMax:''});
  const [invGroupView,setInvGroupView]=useState(false);   // SỬA #5 (R6): bật bảng gom theo SKU
  const [invGroupMinKg,setInvGroupMinKg]=useState('');    // SỬA #5 (R6): lọc SKU có tổng KL ≥ ngưỡng
  const [msFilter,setMsFilter]=useState({alloy:'ALL',coating:'ALL',stockAlert:'ALL',search:'',onlyBuyReq:false});
  const [spFilter,setSpFilter]=useState({alloy:'ALL',coating:'ALL',search:''});
  const [fpFilter,setFpFilter]=useState({alloy:'ALL',coating:'ALL',search:'',thickMin:'',thickMax:''});
  const [fpView,setFpView]=useState('mgmt'); // SỬA #3: mặc định vào Chế độ Quản lý khi mở tab Giá sàn
  const [mgmtGroups,setMgmtGroups]=useState(DEFAULT_MGMT_GROUPS);
  const [mgmtFloorOverride,setMgmtFloorOverride]=useState({});
  // SỬA #4: Nháp local cho tab Giá sàn (localStorage, tải lại y nguyên) — giống PAKD Mua
  const [floorDrafts,setFloorDrafts]=useState(()=>{try{return JSON.parse(localStorage.getItem('pakd_floor_drafts')||'[]');}catch(e){return [];}});
  const [floorDraftModalOpen,setFloorDraftModalOpen]=useState(false);
  const [expandedMgmtGroups,setExpandedMgmtGroups]=useState({});
  const [excludedMgmtSkus,setExcludedMgmtSkus]=useState({});
  const [pdfSignerName,setPdfSignerName]=useState('');
  const [dbStatus,setDbStatus]=useState({loading:false,error:null,lastSync:null,source:'local'});
  const [floorHistory,setFloorHistory]=useState(()=>{try{const s=localStorage.getItem('pakd_floor_history');return s?JSON.parse(s):[];}catch(e){return [];}});
  const [histFilter,setHistFilter]=useState({group:'ALL',dateFrom:'',dateTo:''});
  const [monthlyRevenue,setMonthlyRevenue]=useState([]);
  const [cashFlowData,setCashFlowData]=useState([]);
  const [cfMode,setCFMode]=useState('auto');
  const [cfManualWeek,setCFManualWeek]=useState('');
  // PO đã ký
  const [poData,setPoData]=useState([]);
  const [poFilter,setPoFilter]=useState({supplier:'ALL',search:'',onlyShort:false});
  const [excludePO,setExcludePO]=useState(false);          // tab Tồn kho: trừ TL PO chưa giao
  const [excludePOFloor,setExcludePOFloor]=useState(false); // tab Giá sàn: trừ TL PO khỏi tính giá
  const [excludePOMs,setExcludePOMs]=useState(false);       // SỬA #6 (R6): tab Min/Max: trừ TL PO chưa giao khỏi tồn hiện tại

  // ═══════════════════════════════════════════════════════
  // GITHUB CLOUD STORAGE - Lưu PA mua lên repo GitHub Private
  // ═══════════════════════════════════════════════════════
  const [ghConfig,setGhConfig]=useState(()=>{
    try{const s=localStorage.getItem('pakd_gh_config');return s?JSON.parse(s):{owner:'',repo:'pakd-data',token:'',branch:'main'};}
    catch(e){return {owner:'',repo:'pakd-data',token:'',branch:'main'};}
  });
  const [ghStatus,setGhStatus]=useState({loading:false,error:null,lastAction:null,configOpen:false,plansList:[],loadOpen:false});
  // Trạng thái xác thực GitHub — gate cho cả app
  const [ghVerified,setGhVerified]=useState(false);
  const [ghVerifying,setGhVerifying]=useState(false);
  const [ghUser,setGhUser]=useState(null); // {login, name}
  const [ghBlockedScreen,setGhBlockedScreen]=useState(true); // hiển thị màn login lần đầu
  // Ref để các useCallback luôn đọc giá trị mới nhất (tránh stale closure)
  const ghVerifiedRef=useRef(false);
  useEffect(()=>{ghVerifiedRef.current=ghVerified;},[ghVerified]);
  // Verify token bằng cách gọi GitHub API /user
  const verifyGithubToken=useCallback(async(silent=false)=>{
    if(!ghConfig.owner||!ghConfig.token||!ghConfig.repo){
      if(!silent) alert('⚠ Chưa nhập đủ thông tin GitHub (Username, Repo, Token)');
      setGhVerified(false);
      return false;
    }
    setGhVerifying(true);
    try{
      // Gọi /user để verify token + lấy thông tin user
      const r1=await fetch('https://api.github.com/user',{headers:{'Authorization':`Bearer ${ghConfig.token}`,'Accept':'application/vnd.github+json'}});
      if(!r1.ok) throw new Error(`Token không hợp lệ (HTTP ${r1.status})`);
      const userInfo=await r1.json();
      // Verify access vào repo
      const r2=await fetch(`https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}`,{headers:{'Authorization':`Bearer ${ghConfig.token}`,'Accept':'application/vnd.github+json'}});
      if(!r2.ok) throw new Error(`Không có quyền truy cập repo ${ghConfig.owner}/${ghConfig.repo} (HTTP ${r2.status})`);
      setGhUser({login:userInfo.login,name:userInfo.name||userInfo.login,avatar:userInfo.avatar_url});
      setGhVerified(true);
      setGhBlockedScreen(false);
      setGhVerifying(false);
      if(!silent) alert(`✓ Xác thực GitHub thành công!\nUser: ${userInfo.login}\nRepo: ${ghConfig.owner}/${ghConfig.repo}`);
      return true;
    }catch(e){
      setGhVerified(false);
      setGhUser(null);
      setGhVerifying(false);
      if(!silent) alert(`❌ Lỗi xác thực GitHub:\n${e.message}\n\nKiểm tra lại:\n- Username + Repo có đúng?\n- Token có quyền truy cập repo này?\n- Token còn hạn?`);
      return false;
    }
  },[ghConfig]);
  // Tự verify khi mở app (nếu đã có config)
  useEffect(()=>{
    if(ghConfig.token&&ghConfig.owner&&ghConfig.repo){
      verifyGithubToken(true);
    }
    // eslint-disable-next-line
  },[]);
  const saveGhConfig=useCallback((cfg)=>{
    setGhConfig(cfg);
    try{localStorage.setItem('pakd_gh_config',JSON.stringify(cfg));}catch(e){}
  },[]);
  // Helper: gọi GitHub API
  const ghAPI=useCallback(async(method,path,body)=>{
    if(!ghConfig.owner||!ghConfig.token) throw new Error('Chưa cấu hình GitHub. Nhấn ⚙️ Cấu hình GitHub trước.');
    const url=`https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/${path}`;
    const opts={method,headers:{'Authorization':`Bearer ${ghConfig.token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}};
    if(body) opts.body=JSON.stringify(body);
    const res=await fetch(url,opts);
    if(!res.ok){const txt=await res.text();throw new Error(`GitHub ${res.status}: ${txt.substring(0,200)}`);}
    return res.json();
  },[ghConfig]);
  // Ref để truy cập `result` (vốn được khai báo sau) mà không vi phạm TDZ
  const resultRef=useRef(null);
  const mgmtDataRef=useRef(null); // SỬA #4: tránh TDZ khi saveFloorLocal đọc mgmtData (khai báo sau)
  // LƯU LOCAL: lưu PA nháp vào localStorage (KHÔNG đẩy GitHub). Thay tab Scenarios cũ.
  const savePALocal=useCallback(async()=>{
    const r=resultRef.current;
    const nameDefault=`PA ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}`;
    const label=window.prompt('💾 Đặt tên bản nháp (lưu trên máy này):',nameDefault);
    if(label===null) return;
    try{
      const drafts=JSON.parse(localStorage.getItem('pakd_local_drafts')||'[]');
      drafts.unshift({
        id:'d'+Date.now(),
        label:label.trim()||nameDefault,
        savedAt:new Date().toISOString(),
        inputs,products,sellingPrices,
        snapshot:{totalKg:r?r.totalKg:0,totalVND:r?r.invoiceVND:0,totalGrossProfit:r?r.totalGrossProfit:0},
      });
      localStorage.setItem('pakd_local_drafts',JSON.stringify(drafts.slice(0,100)));
      setLocalDrafts(drafts.slice(0,100));
      alert('✓ Đã lưu nháp trên máy này (localStorage). Mở bằng nút "💾 Nháp Local".');
    }catch(e){ alert('❌ Lỗi lưu nháp: '+e.message); }
  },[inputs,products,sellingPrices]);

  // SỬA #4: Lưu nháp Giá sàn vào localStorage (KHÔNG đẩy GitHub). Tải lại y nguyên trạng thái tab Sàn.
  const saveFloorLocal=useCallback(()=>{
    const nameDefault=`Sàn ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}`;
    const label=window.prompt('💾 Đặt tên bản nháp Giá sàn (lưu trên máy này):',nameDefault);
    if(label===null) return;
    try{
      const md=mgmtDataRef.current||[];
      const publishedCount=md.filter(g=>g.publishedFloor&&g.skus>0).length;
      const drafts=JSON.parse(localStorage.getItem('pakd_floor_drafts')||'[]');
      drafts.unshift({
        id:'f'+Date.now(),
        label:label.trim()||nameDefault,
        savedAt:new Date().toISOString(),
        // Toàn bộ state cần để dựng lại tab Sàn y nguyên:
        inputs,products,
        mgmtFloorOverride,excludedMgmtSkus,excludePOFloor,
        snapshot:{groupsCount:md.length,publishedCount,exchangeRate:inputs.exchangeRate},
      });
      localStorage.setItem('pakd_floor_drafts',JSON.stringify(drafts.slice(0,100)));
      setFloorDrafts(drafts.slice(0,100));
      alert('✓ Đã lưu nháp Giá sàn trên máy này. Mở lại bằng nút "🗂 Nháp Sàn".');
    }catch(e){ alert('❌ Lỗi lưu nháp Sàn: '+e.message); }
  },[inputs,products,mgmtFloorOverride,excludedMgmtSkus,excludePOFloor]);

  // SỬA #4: Tải lại 1 nháp Giá sàn về app
  const loadFloorLocal=useCallback((d)=>{
    if(d.inputs) setInputs(d.inputs);
    if(d.products) setProducts(d.products);
    setMgmtFloorOverride(d.mgmtFloorOverride||{});
    setExcludedMgmtSkus(d.excludedMgmtSkus||{});
    setExcludePOFloor(!!d.excludePOFloor);
    setFloorDraftModalOpen(false);
    setTab('floor');setFpView('mgmt');
    alert('✓ Đã tải nháp Sàn "'+d.label+'" — vào Chế độ Quản lý.');
  },[]);

  // SỬA #4 (R2): Tải 1 PA Sàn từ luồng duyệt VÀO THẲNG dữ liệu giá sàn hiện tại (tỷ giá, cờ trừ PO, Sàn ban hành).
  const loadFloorSubmissionToApp=useCallback((d,fileName)=>{
    if(!d){alert('⚠ Không có dữ liệu để tải.');return;}
    // 1. Tỷ giá
    if(d.exchangeRate!=null) setInputs(p=>({...p,exchangeRate:d.exchangeRate}));
    // 2. Cờ trừ TL có PO
    setExcludePOFloor(!!d.excludePOFloor);
    // 3. Sàn ban hành (mgmtFloorOverride). Ưu tiên field đã lưu; nếu thiếu (file cũ) → dựng từ groups.
    let ov=d.mgmtFloorOverride;
    if(!ov||typeof ov!=='object'){
      ov={};
      (d.groups||[]).forEach(g=>{ if(g.id!=null&&g.publishedFloor) ov[g.id]=g.publishedFloor; });
    }
    setMgmtFloorOverride(ov||{});
    setFloorStatus(p=>({...p,viewOpen:false}));
    setTab('floor');setFpView('mgmt');
    alert(`✓ Đã tải Sàn ${d.weekLabel||fileName||''} vào màn hình.\n• Tỷ giá: ${d.exchangeRate?Number(d.exchangeRate).toLocaleString('vi-VN'):'—'}\n• Trừ TL có PO: ${d.excludePOFloor?'CÓ':'KHÔNG'}\n• Đã nạp ${Object.keys(ov||{}).length} nhóm Sàn ban hành.`);
  },[]);

  // List các PA đã lưu (kèm fetch metadata: status, requestedBy, requestNote)
  const listPAsFromGithub=useCallback(async()=>{
    setGhStatus(p=>({...p,loading:true,error:null}));
    try{
      const data=await ghAPI('GET','contents/plans');
      const files=(data||[]).filter(f=>f.name.endsWith('.json')).sort((a,b)=>b.name.localeCompare(a.name));
      // Fetch nội dung từng file để lấy metadata (giới hạn 30 file mới nhất để tránh chậm)
      const filesWithMeta=await Promise.all(files.slice(0,30).map(async f=>{
        try{
          const fileData=await ghAPI('GET',`contents/plans/${f.name}`);
          const content=decodeURIComponent(escape(atob(fileData.content.replace(/\n/g,''))));
          const payload=JSON.parse(content);
          return{
            ...f,
            _status:payload.status||'pending',
            _requestedBy:payload.requestedBy||payload.savedBy||'?',
            _requestNote:payload.requestNote||'',
            _approvedBy:payload.approvedBy||null,
            _approvedAt:payload.approvedAt||null,
            _savedAt:payload.savedAt||null,
            _totalVND:payload.snapshot?.totalVND||0,
            _totalKg:payload.snapshot?.totalKg||0,
            _approvals:Array.isArray(payload.approvals)?payload.approvals:[],
          };
        }catch(e){
          return{...f,_status:'error',_requestedBy:'?',_requestNote:'(không đọc được nội dung)'};
        }
      }));
      setGhStatus(p=>({...p,loading:false,plansList:filesWithMeta,loadOpen:true}));
    }catch(e){
      setGhStatus(p=>({...p,loading:false,error:e.message,plansList:[]}));
      alert(`❌ Lỗi khi tải danh sách PA:\n${e.message}`);
    }
  },[ghAPI]);
  // Load 1 PA về app
  const loadPAFromGithub=useCallback(async(file)=>{
    setGhStatus(p=>({...p,loading:true,error:null}));
    try{
      const data=await ghAPI('GET',`contents/plans/${file.name}`);
      const content=decodeURIComponent(escape(atob(data.content.replace(/\n/g,''))));
      const payload=JSON.parse(content);
      if(payload.inputs) setInputs(payload.inputs);
      if(payload.products) setProducts(payload.products);
      // SỬA #3 (R6): khôi phục Giá bán KH (sellingPrices) để sếp tải PA thấy đủ giá bán theo SKU
      if(Array.isArray(payload.sellingPrices)&&payload.sellingPrices.length>0) setSP(payload.sellingPrices);
      setLoadedApprovals(Array.isArray(payload.approvals)?payload.approvals:[]);
      setGhStatus(p=>({...p,loading:false,lastAction:`✓ Đã tải ${file.name}`,loadOpen:false}));
      const statusTxt=payload.status==='approved'?`\n✓ Trạng thái: ĐÃ DUYỆT bởi ${payload.approvedBy||'?'} lúc ${payload.approvedAt||'?'}`:payload.status==='rejected'?`\n✗ Trạng thái: TỪ CHỐI`:`\n⏳ Trạng thái: CHỜ DUYỆT`;
      const noteTxt=payload.requestNote?`\n📝 Ghi chú yêu cầu: ${payload.requestNote}`:'';
      alert(`✓ Tải PA thành công!\nFile: ${file.name}\nNgày lưu: ${payload.savedAt}\nNgười lưu: ${payload.savedBy}${noteTxt}${statusTxt}`);
    }catch(e){
      setGhStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi tải PA:\n${e.message}`);
    }
  },[ghAPI]);

  // Duyệt/Từ chối PA — cập nhật status trong file (yêu cầu PIN)
  const reviewPA=useCallback(async(file,newStatus,note)=>{
    const verbTxt=newStatus==='approved'?'duyệt':'từ chối';
    // Mở modal nhập PIN trước
    const serverHash=pinStatus.hashOnServer||await loadPinHash();
    if(!serverHash){
      if(!window.confirm('⚠ Chưa có PIN duyệt được thiết lập.\nNhấn OK để mở màn thiết lập PIN lần đầu.\nNhấn Cancel để hủy duyệt.')) return;
      setPinStatus(p=>({...p,setupOpen:true,pendingAction:{type:'PA',file,newStatus,note}}));
      return;
    }
    const pin=await askPin(`🔐 NHẬP PIN ĐỂ ${verbTxt.toUpperCase()} PA — File: ${file.name}`);
    if(!pin) return;
    const ok=await verifyPin(pin);
    if(!ok){alert('❌ PIN SAI. Không có quyền duyệt PA.');return;}
    const reviewerName='Giám đốc (PIN xác thực ✓)';
    setGhStatus(p=>({...p,loading:true,error:null}));
    try{
      // 1. Lấy file hiện tại để có SHA và nội dung
      const data=await ghAPI('GET',`contents/plans/${file.name}`);
      const content=decodeURIComponent(escape(atob(data.content.replace(/\n/g,''))));
      const payload=JSON.parse(content);
      // 2. Cập nhật trạng thái
      payload.status=newStatus;
      payload.approvedBy=reviewerName.trim();
      payload.approvedAt=new Date().toISOString();
      if(note) payload.approveNote=note;
      // 3. Ghi lại file (cần SHA của file cũ)
      const newContentB64=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
      await ghAPI('PUT',`contents/plans/${file.name}`,{
        message:`${newStatus==='approved'?'✓ Duyệt':'✗ Từ chối'} PA ${file.name} bởi ${reviewerName.trim()}`,
        content:newContentB64,
        sha:data.sha,
        branch:ghConfig.branch||'main',
      });
      setGhStatus(p=>({...p,loading:false,lastAction:`✓ Đã ${verbTxt} ${file.name}`}));
      alert(`✓ Đã ${verbTxt} PA: ${file.name}\nNgười ${verbTxt}: ${reviewerName.trim()}`);
      // Refresh danh sách
      const list=await ghAPI('GET','contents/plans');
      const files=(list||[]).filter(f=>f.name.endsWith('.json')).sort((a,b)=>b.name.localeCompare(a.name));
      setGhStatus(p=>({...p,plansList:files}));
    }catch(e){
      setGhStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi ${verbTxt}:\n${e.message}`);
    }
  },[ghAPI,ghConfig.branch]);


  // ═══════════════════════════════════════════════════════
  // WORKFLOW GIÁ SÀN — Pending → Approved → History (theo TUẦN)
  // ═══════════════════════════════════════════════════════
  const [floorStatus,setFloorStatus]=useState({
    loading:false,error:null,lastAction:null,
    viewOpen:false,            // Modal danh sách Sàn pending/approved
    selectedFile:null,         // File đang xem chi tiết
    selectedData:null,         // Nội dung file đang xem
    pendingList:[],            // Files trong /floor/pending/
    approvedList:[],           // Files trong /floor/approved/
    history:[],                // Nội dung file /floor/history.json
    historyOpen:false,         // Modal xem history
    activeTab:'pending',       // pending | approved
    expandFloorKey:null,       // SỬA #2: key (folder+name) của file đang mở chi tiết trong modal duyệt
    expandedIdx:null,          // dùng cho modal Lịch sử
  });

  // ═══════════════════════════════════════════════════════
  // PIN DUYỆT — Xác thực giám đốc khi phê duyệt
  // ═══════════════════════════════════════════════════════
  const [pinStatus,setPinStatus]=useState({
    loading:false,error:null,
    hashOnServer:null,        // hash PIN đang lưu trên GitHub
    setupOpen:false,          // mở modal thiết lập PIN lần đầu
    verifyOpen:false,         // mở modal nhập PIN khi duyệt
    pendingAction:null,       // {type:'PA'|'FLOOR', file, newStatus}
  });
  // ── Việc 1: Danh sách người duyệt (lưu /config/approvers.json) ──
  // Mỗi người: {id, name, role, order, pinHash}. Quy trình tuần tự theo `order`.
  const [approvers,setApprovers]=useState([]);     // mảng người duyệt
  const [apvSha,setApvSha]=useState(null);          // sha file để cập nhật
  const [apvStatus,setApvStatus]=useState({loading:false,error:null,manageOpen:false});
  // approvals của PA đang tải (để in vào A4); modal cho ý kiến
  const [loadedApprovals,setLoadedApprovals]=useState([]);
  const [approveModal,setApproveModal]=useState({open:false,file:null,approver:null});
  // Nháp local (localStorage) — thay tab Scenarios
  const [localDrafts,setLocalDrafts]=useState(()=>{try{return JSON.parse(localStorage.getItem('pakd_local_drafts')||'[]');}catch(e){return [];}});
  const [draftModalOpen,setDraftModalOpen]=useState(false);
  // Modal nhập PIN ẩn chữ (thay window.prompt). askPin trả Promise<string|null>.
  const [pinPrompt,setPinPrompt]=useState({open:false,message:'',resolve:null});
  const pinResolveRef=useRef(null);
  const askPin=useCallback((message)=>new Promise(resolve=>{
    pinResolveRef.current=resolve;
    setPinPrompt({open:true,message,resolve});
  }),[]);
  const closePinPrompt=useCallback((val)=>{
    setPinPrompt({open:false,message:'',resolve:null});
    if(pinResolveRef.current){pinResolveRef.current(val);pinResolveRef.current=null;}
  },[]);
  // Helper: hash chuỗi bằng SHA-256 (browser native)
  // sha256 đã chuyển lên module scope (xem gần stepOf) để tránh TDZ trong các useCallback phía trên.
  // Tải hash PIN từ GitHub (nếu có)
  const loadPinHash=useCallback(async()=>{
    if(!ghConfig.owner||!ghConfig.token) return null;
    try{
      const data=await ghAPI('GET','contents/config/approver.json');
      const content=decodeURIComponent(escape(atob(data.content.replace(/\n/g,''))));
      const obj=JSON.parse(content);
      setPinStatus(p=>({...p,hashOnServer:obj.pinHash||null}));
      return obj.pinHash||null;
    }catch(e){
      // File chưa tồn tại → null
      setPinStatus(p=>({...p,hashOnServer:null}));
      return null;
    }
  },[ghAPI,ghConfig.owner,ghConfig.token]);
  // Thiết lập PIN lần đầu (lưu file /config/approver.json)
  const setupPin=useCallback(async(pin1,pin2,setupBy)=>{
    if(pin1!==pin2){alert('❌ 2 PIN không khớp');return false;}
    if(!/^\d{4,8}$/.test(pin1)){alert('❌ PIN phải là 4-8 chữ số');return false;}
    setPinStatus(p=>({...p,loading:true,error:null}));
    try{
      const hash=await hashPin(pin1);
      const payload={
        pinHash:hash,
        setupBy:setupBy||'?',
        setupAt:new Date().toISOString(),
        note:'PIN này KHÔNG đổi được qua app. Muốn đặt lại: xóa file này trên GitHub rồi mở app lần đầu.',
      };
      const contentB64=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
      // Check nếu đã có file rồi → từ chối (chỉ đặt 1 lần)
      let sha=null;
      try{const existing=await ghAPI('GET','contents/config/approver.json');sha=existing.sha;}catch(e){}
      if(sha){alert('❌ PIN đã được thiết lập trước đó. Muốn đặt lại: vào GitHub xóa file /config/approver.json rồi mở app lại.');setPinStatus(p=>({...p,loading:false}));return false;}
      const body={message:`Thiết lập PIN duyệt lần đầu bởi ${setupBy||'?'}`,content:contentB64,branch:ghConfig.branch||'main'};
      await ghAPI('PUT','contents/config/approver.json',body);
      setPinStatus(p=>({...p,loading:false,hashOnServer:hash,setupOpen:false}));
      alert('✓ Đã thiết lập PIN duyệt thành công!\nTừ giờ mọi phê duyệt cần nhập PIN này.');
      return true;
    }catch(e){
      setPinStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi thiết lập PIN:\n${e.message}`);
      return false;
    }
  },[ghAPI,ghConfig.branch]);
  // Xác thực PIN
  const verifyPin=useCallback(async(pin)=>{
    const serverHash=pinStatus.hashOnServer||await loadPinHash();
    if(!serverHash){alert('⚠ Chưa thiết lập PIN duyệt. Vui lòng vào ⚙️ → "Thiết lập PIN" trước.');return false;}
    return await pinMatches(pin,serverHash);
  },[pinStatus.hashOnServer,loadPinHash]);

  // ════ VIỆC 1: QUẢN LÝ NGƯỜI DUYỆT (/config/approvers.json) ════
  // Tải danh sách người duyệt từ GitHub
  const loadApprovers=useCallback(async()=>{
    if(!ghConfig.owner||!ghConfig.token) return [];
    try{
      const data=await ghAPI('GET','contents/config/approvers.json');
      const content=decodeURIComponent(escape(atob(data.content.replace(/\n/g,''))));
      const obj=JSON.parse(content);
      const list=(obj.approvers||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0));
      setApprovers(list); setApvSha(data.sha||null);
      return list;
    }catch(e){ setApprovers([]); setApvSha(null); return []; }
  },[ghAPI,ghConfig.owner,ghConfig.token]);

  // TRÌNH DUYỆT — SỬA #3b,c (R3): người trình TỰ NHẬN DIỆN BẰNG PIN, ký bước CỦA MÌNH (không buộc bước 1).
  const submitPAToGithub=useCallback(async()=>{
    const apList=approvers.length?approvers:await loadApprovers();
    const prog0=approvalProgress(apList,[],'buy');
    if(prog0.empty){alert('⚠ Chưa thiết lập người duyệt cho luồng MUA. Vào ⚙️ GitHub → "Quản lý người duyệt", đặt Bước duyệt luồng MUA cho ít nhất 1 người.');return;}
    // 1. Nhập PIN → tự nhận diện người trình
    const pin=await askPin('🔐 Nhập PIN của bạn để TRÌNH duyệt PA (hệ thống tự nhận diện bạn là ai):');
    if(pin===null) return;
    const me=await findByPin(apList,pin);
    if(!me){alert('❌ PIN không khớp người duyệt nào. Không trình được.');return;}
    if(stepOf(me,'buy')<=0){alert(`⚠ Bạn (${me.name}) không nằm trong luồng duyệt MUA (chưa đặt Bước duyệt luồng MUA).`);return;}
    // 2. Ý kiến đề xuất
    const opinion=window.prompt(`📝 Ý kiến đề xuất của ${me.name} (${me.role} — bước ${stepOf(me,'buy')}):\n\nVí dụ: "Đề xuất mua, giá CIF tốt, cần hàng gấp."`);
    if(opinion===null) return;
    setGhStatus(p=>({...p,loading:true,error:null}));
    try{
      const now=new Date();
      const pad=n=>String(n).padStart(2,'0');
      const fname=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}.json`;
      const r=resultRef.current;
      // Người trình ký bước CỦA MÌNH → các bước < bước này bị bỏ qua.
      const approvals=[{step:stepOf(me,'buy'),id:me.id,name:me.name,role:me.role,decision:'approved',opinion:(opinion||'').trim(),at:now.toISOString(),isSubmitter:true}];
      const prog2=approvalProgress(apList,approvals,'buy');
      const payload={
        savedAt:now.toISOString(),savedBy:me.name,requestedBy:me.name,requestedByStep:stepOf(me,'buy'),
        requestNote:(opinion||'').trim()||null,version:'PAKD 7.9',flow:'buy',
        status:prog2.done?'approved':'pending',
        approvals,approvedBy:prog2.done?me.name:null,approvedAt:prog2.done?now.toISOString():null,approveNote:null,
        inputs,products,sellingPrices,
        snapshot:{inventoryCount:inventory.length,totalKg:r?r.totalKg:0,totalVND:r?r.invoiceVND:0,totalGrossProfit:r?r.totalGrossProfit:0}
      };
      const contentB64=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
      await ghAPI('PUT',`contents/plans/${fname}`,{message:`Trình duyệt PA ${fname} — ${me.name} ký bước ${stepOf(me,'buy')}`,content:contentB64,branch:ghConfig.branch||'main'});
      setGhStatus(p=>({...p,loading:false,lastAction:`✓ Đã trình duyệt ${fname}`}));
      alert(`✓ ĐÃ TRÌNH DUYỆT!\nFile: ${fname}\nBạn: ${me.name} (đã ký bước ${stepOf(me,'buy')}).\n${prog2.done?'🎉 Đủ cấp luôn (bạn là bước cao nhất).':'⏳ Chuyển bước kế: '+(prog2.nextApprover?prog2.nextApprover.name+' ('+prog2.nextApprover.role+')':'?')+'.'}`);
    }catch(e){
      setGhStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi trình duyệt:\n${e.message}`);
    }
  },[ghAPI,inputs,products,sellingPrices,inventory,ghConfig.branch,approvers,loadApprovers,askPin,sha256]);

  // ── Ghi 1 lượt ý kiến/duyệt vào approvals[] của PA — SỬA #3c (R3): TỰ NHẬN DIỆN người ký BẰNG PIN ──
  // decision: 'approved'|'rejected'; opinion: ý kiến; pin: PIN của người đang ký (hệ thống tự biết là ai + bước mấy).
  const submitApproval=useCallback(async(file,decision,opinion,pin)=>{
    const apList=approvers.length?approvers:await loadApprovers();
    // Tự nhận diện người ký qua PIN
    const ap=await findByPin(apList,pin);
    if(!ap){alert('❌ PIN không khớp người duyệt nào.');return false;}
    if(stepOf(ap,'buy')<=0){alert(`⚠ Bạn (${ap.name}) không nằm trong luồng duyệt MUA (chưa đặt Bước duyệt luồng MUA).`);return false;}
    const approverId=ap.id;
    setGhStatus(p=>({...p,loading:true,error:null}));
    try{
      const data=await ghAPI('GET',`contents/plans/${file.name}`);
      const content=decodeURIComponent(escape(atob(data.content.replace(/\n/g,''))));
      const payload=JSON.parse(content);
      const approvals=Array.isArray(payload.approvals)?payload.approvals:[];
      // chặn ký trùng & ký sai thứ tự
      if(approvals.some(a=>a.id===approverId&&a.decision==='approved')){alert('⚠ Người này đã ký duyệt rồi.');setGhStatus(p=>({...p,loading:false}));return false;}
      const flow=payload.flow||'buy';
      const prog=approvalProgress(apList,approvals,flow);
      if(prog.rejected){alert('⚠ PA đã bị từ chối ở bước trước.');setGhStatus(p=>({...p,loading:false}));return false;}
      if(prog.done){alert('✓ PA đã được duyệt đủ cấp (bước cao nhất đã ký) rồi.');setGhStatus(p=>({...p,loading:false}));return false;}
      // SỬA #4 (R6): CHỈ bước CAO NHẤT (Giám đốc) được TỪ CHỐI. Bước giữa chỉ duyệt/cho ý kiến.
      if(decision==='rejected'&&stepOf(ap,flow)<(prog.maxStep||0)){
        alert(`⚠ Bạn (${ap.name} · bước ${stepOf(ap,flow)}) chỉ có quyền DUYỆT/cho ý kiến, KHÔNG được từ chối.\nChỉ người ở bước cao nhất (bước ${prog.maxStep}) mới được bác phương án.`);
        setGhStatus(p=>({...p,loading:false}));return false;
      }
      // SỬA #2 (R3): cho phép ký nếu bước của người này > bước cao nhất đã ký (được nhảy bước, bỏ qua bước thấp hơn).
      // Chặn nếu bước người này <= bước đã ký (đã bị vượt qua → không cần ý kiến nữa).
      if(decision==='approved'){
        const myStep=stepOf(ap,flow);
        if(myStep<=(prog.topSigned||0)){
          alert(`⚠ Bước của bạn (${myStep}) đã được vượt qua (bước cao nhất đã ký: ${prog.topSigned}). Không cần ý kiến nữa.`);setGhStatus(p=>({...p,loading:false}));return false;
        }
      }
      approvals.push({step:stepOf(ap,flow),id:ap.id,name:ap.name,role:ap.role,decision,opinion:(opinion||'').trim(),at:new Date().toISOString()});
      payload.approvals=approvals;
      // cập nhật status tổng
      const prog2=approvalProgress(apList,approvals,flow);
      payload.status=prog2.rejected?'rejected':prog2.done?'approved':'pending';
      payload.approvedBy=prog2.done?(prog2.chain||[]).map(a=>a.name).join(' → '):null;
      payload.approvedAt=prog2.done?new Date().toISOString():null;
      const newContentB64=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
      await ghAPI('PUT',`contents/plans/${file.name}`,{
        message:`${decision==='approved'?'✓ '+ap.role+' duyệt':'✗ '+ap.role+' từ chối'} PA ${file.name} (${ap.name})`,
        content:newContentB64,sha:data.sha,branch:ghConfig.branch||'main',
      });
      setGhStatus(p=>({...p,loading:false,lastAction:`✓ ${ap.name} đã ${decision==='approved'?'duyệt':'từ chối'}`}));
      alert(`✓ Đã ghi ý kiến của ${ap.name} (${ap.role}).\n${prog2.done?'🎉 PA ĐÃ DUYỆT ĐỦ CÁC CẤP':prog2.rejected?'✗ PA bị từ chối':'⏳ Chuyển bước tiếp theo'}`);
      await listPAsFromGithub();
      return true;
    }catch(e){
      setGhStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi ghi ý kiến:\n${e.message}`);
      return false;
    }
  },[approvers,loadApprovers,sha256,ghAPI,ghConfig.branch,listPAsFromGithub]);
  // Ghi danh sách người duyệt lên GitHub
  const saveApprovers=useCallback(async(list)=>{
    const payload={version:1,updatedAt:new Date().toISOString(),approvers:list};
    const contentB64=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
    const body={message:`Cập nhật danh sách người duyệt (${list.length} người)`,content:contentB64,branch:ghConfig.branch||'main'};
    if(apvSha) body.sha=apvSha;
    const res=await ghAPI('PUT','contents/config/approvers.json',body);
    setApvSha(res.content?.sha||null);
  },[ghAPI,ghConfig.branch,apvSha]);
  // Người có quyền quản trị: cờ isAdmin=true HOẶC vai trò chứa "giám đốc"/"quản trị" (tương thích cũ)
  const isAdminPerson=useCallback((a)=>{
    if(a&&a.isAdmin) return true;
    const r=stripVN(a&&a.role||'');
    return r.includes('giamdoc')||r.includes('quantri')||r.includes('admin');
  },[]);
  // Xác thực PIN quản trị: khớp PIN của BẤT KỲ người nào là quản trị.
  // Trả {ok, by}. Nếu danh sách trống → ok=true (khởi tạo người đầu tiên).
  const verifyAdminPin=useCallback(async(pin)=>{
    const list=approvers.length?approvers:await loadApprovers();
    if(list.length===0) return {ok:true,by:'(khởi tạo)'};
    const admins=list.filter(a=>isAdminPerson(a));
    const pool=admins.length>0?admins:list; // chưa ai là admin → chấp nhận PIN bất kỳ ai (tránh khóa cứng)
    const matched=await findByPin(pool,pin);
    return {ok:!!matched,by:matched?matched.name:null};
  },[approvers,loadApprovers,isAdminPerson,sha256]);

  // Thêm 1 người duyệt mới. opts={name,role,pin,isAdmin,stepBuy,stepFloor}. Cần PIN quản trị (trừ người đầu tiên).
  const addApprover=useCallback(async(opts)=>{
    const {name,role,pin}=opts;
    const isAdmin=!!opts.isAdmin;
    const stepBuy=parseInt(opts.stepBuy)||0;
    const stepFloor=parseInt(opts.stepFloor)||0;
    if(!name||!name.trim()||!role||!role.trim()){alert('❌ Nhập đủ Tên và Vai trò');return false;}
    if(!/^\d{4,8}$/.test(pin)){alert('❌ PIN phải là 4–8 chữ số');return false;}
    const cur=approvers.length?approvers:await loadApprovers();
    // Khóa quản trị: nếu đã có người trong danh sách → cần PIN của Giám đốc/Quản trị
    if(cur.length>0){
      const adminPin=await askPin('🔐 Cần quyền QUẢN TRỊ. Nhập PIN của Giám đốc / Quản trị để THÊM người duyệt:');
      if(adminPin===null) return false;
      const chk=await verifyAdminPin(adminPin);
      if(!chk.ok){alert('❌ PIN quản trị SAI. Không có quyền thêm người duyệt.');return false;}
    }
    const id=name.trim().toLowerCase().normalize('NFD').replace(COMBINING,'').replace(/[^a-z0-9]/g,'')+'_'+Date.now().toString(36).slice(-4);
    setApvStatus(p=>({...p,loading:true,error:null}));
    try{
      const pinHash=await hashPin(pin);
      const maxOrder=cur.reduce((m,a)=>Math.max(m,a.order||0),0);
      const next=[...cur,{id,name:name.trim(),role:role.trim(),order:maxOrder+1,pinHash,isAdmin,stepBuy,stepFloor}];
      await saveApprovers(next);
      setApprovers(next);
      setApvStatus(p=>({...p,loading:false}));
      alert(`✓ Đã thêm: ${name.trim()} (${role.trim()})${isAdmin?' · Quản trị':''}${stepBuy?' · Mua bước '+stepBuy:''}${stepFloor?' · Sàn bước '+stepFloor:''}`);
      return true;
    }catch(e){ setApvStatus(p=>({...p,loading:false,error:e.message})); alert('❌ Lỗi: '+e.message); return false; }
  },[approvers,loadApprovers,saveApprovers,sha256,verifyAdminPin]);
  // Xóa 1 người duyệt — cần PIN quản trị
  const removeApprover=useCallback(async(id)=>{
    const cur=approvers.length?approvers:await loadApprovers();
    const target=cur.find(a=>a.id===id);
    const adminPin=await askPin(`🔐 Cần quyền QUẢN TRỊ. Nhập PIN của Giám đốc / Quản trị để XÓA: ${target?target.name+' ('+target.role+')':''}`);
    if(adminPin===null) return;
    const chk=await verifyAdminPin(adminPin);
    if(!chk.ok){alert('❌ PIN quản trị SAI. Không có quyền xóa người duyệt.');return;}
    setApvStatus(p=>({...p,loading:true,error:null}));
    try{
      const next=cur.filter(a=>a.id!==id).sort((a,b)=>(a.order||0)-(b.order||0)).map((a,i)=>({...a,order:i+1}));
      await saveApprovers(next); setApprovers(next);
      setApvStatus(p=>({...p,loading:false}));
      alert(`✓ Đã xóa (xác nhận bởi ${chk.by}).`);
    }catch(e){ setApvStatus(p=>({...p,loading:false,error:e.message})); alert('❌ Lỗi: '+e.message); }
  },[approvers,loadApprovers,saveApprovers,verifyAdminPin]);
  // Sửa bước duyệt / cờ quản trị của 1 người (cần PIN quản trị). patch={stepBuy?,stepFloor?,isAdmin?}
  const updateApproverFields=useCallback(async(id,patch)=>{
    const adminPin=await askPin('🔐 Cần quyền QUẢN TRỊ để đổi bước duyệt / quyền. Nhập PIN Giám đốc / Quản trị:');
    if(adminPin===null) return;
    const chk=await verifyAdminPin(adminPin);
    if(!chk.ok){alert('❌ PIN quản trị SAI.');return;}
    setApvStatus(p=>({...p,loading:true,error:null}));
    try{
      const cur=approvers.length?approvers:await loadApprovers();
      const next=cur.map(a=>a.id===id?{...a,...patch}:a);
      await saveApprovers(next); setApprovers(next);
      setApvStatus(p=>({...p,loading:false}));
    }catch(e){ setApvStatus(p=>({...p,loading:false,error:e.message})); alert('❌ Lỗi: '+e.message); }
  },[approvers,loadApprovers,saveApprovers,verifyAdminPin]);
  // Xác thực PIN của 1 người duyệt cụ thể (theo id)
  const verifyApproverPin=useCallback(async(id,pin)=>{
    const list=approvers.length?approvers:await loadApprovers();
    const ap=list.find(a=>a.id===id);
    if(!ap){alert('⚠ Không tìm thấy người duyệt');return false;}
    return await pinMatches(pin,ap.pinHash);
  },[approvers,loadApprovers,sha256]);
  // Tự tải danh sách người duyệt khi đã xác thực GitHub
  useEffect(()=>{ if(ghVerified) loadApprovers(); },[ghVerified,loadApprovers]);
  // Helper: lấy tuần ISO label "2026-W21" từ Date
  const getWeekLabel=(d)=>{
    const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    const dayNum=dt.getUTCDay()||7;
    dt.setUTCDate(dt.getUTCDate()+4-dayNum);
    const yearStart=new Date(Date.UTC(dt.getUTCFullYear(),0,1));
    const wk=Math.ceil((((dt-yearStart)/86400000)+1)/7);
    return `${dt.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
  };

  // GỬI Giá sàn → /floor/pending/ — SỬA #3 (R2): xác định người gửi BẰNG PIN (tự biết là ai + bước mấy), ký luôn bước đó.
  const submitFloorToGithub=useCallback(async(mgmtDataLocal)=>{
    const publishedGroups=(mgmtDataLocal||[]).filter(g=>g.publishedFloor&&g.skus>0);
    if(publishedGroups.length===0){alert('⚠ Chưa có nhóm nào ban hành Sàn. Hãy nhập Sàn ban hành trước.');return;}
    // 0. Nạp người duyệt + kiểm tra có luồng Sàn
    const apList=approvers.length?approvers:await loadApprovers();
    const prog0=approvalProgress(apList,[],'floor');
    if(prog0.empty){
      alert('⚠ Chưa thiết lập người duyệt cho luồng GIÁ SÀN.\nVào ⚙️ GitHub → "Quản lý người duyệt", đặt "Bước duyệt luồng Giá sàn" (B1, B2…) cho ít nhất 1 người.');
      return;
    }
    // 1. Nhập PIN để tự nhận diện người gửi (KHÔNG hỏi tên nữa)
    const pin=await askPin('🔐 Nhập PIN của bạn để gửi duyệt Sàn (hệ thống tự nhận diện bạn là ai):');
    if(pin===null) return;
    const me=await findByPin(apList,pin);
    if(!me){alert('❌ PIN không khớp người duyệt nào. Không gửi được.');return;}
    if(stepOf(me,'floor')<=0){
      alert(`⚠ Bạn (${me.name}) không nằm trong luồng duyệt Giá sàn (chưa đặt Bước duyệt luồng Giá sàn). Không thể gửi.`);
      return;
    }
    // 2. Hỏi ghi chú (gắn với bước của người gửi)
    const note=prompt(`📝 Ghi chú yêu cầu duyệt Sàn (bạn: ${me.name} — bước ${stepOf(me,'floor')}):\n\nVí dụ: "Sàn cho tuần 21, áp dụng từ Thứ 2"`);
    if(note===null) return;
    setFloorStatus(p=>({...p,loading:true,error:null}));
    try{
      const now=new Date();
      const weekLabel=getWeekLabel(now);
      const pad=n=>String(n).padStart(2,'0');
      const timestamp=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`;
      const fname=`${weekLabel}_${timestamp}.json`;
      const path=`contents/floor/pending/${fname}`;
      // Người gửi KÝ LUÔN bước của mình → các bước sau không cần ý kiến lại của người này
      const approvals=[{step:stepOf(me,'floor'),id:me.id,name:me.name,role:me.role,decision:'approved',opinion:(note||'').trim(),at:now.toISOString(),isSubmitter:true}];
      const prog1=approvalProgress(apList,approvals,'floor');
      const payload={
        weekLabel,
        savedAt:now.toISOString(),
        savedBy:me.name,
        requestedBy:me.name,
        requestedByStep:stepOf(me,'floor'),
        requestNote:(note||'').trim()||null,
        status:prog1.done?'approved':'pending',
        approvedBy:prog1.done?me.name:null,
        approvedAt:prog1.done?now.toISOString():null,
        approvals,
        exchangeRate:inputs.exchangeRate,
        storageCostPct:inputs.storageCostPct??2,
        baseFinCostPct:inputs.baseFinCostPct??1.5,
        opsCostPct:inputs.opsCostPct,
        creditMode:inputs.creditMode,
        excludePOFloor:!!excludePOFloor,
        mgmtFloorOverride,
        groupsCount:publishedGroups.length,
        groups:publishedGroups.map(g=>({
          id:g.id,label:g.label,alloy:g.alloy,temper:g.temper,
          minThick:g.minThick,maxThick:g.maxThick,
          skus:g.skus,totalQty:g.totalQty,avgCost:g.avgCost,
          autoFloor:g.avgFloor,publishedFloor:g.publishedFloor,
          corePrice:g.corePrice,loyalPrice:g.loyalPrice,newPrice:g.newPrice,
          avgCompPrice:g.avgCompPrice,avgCompFloor:g.avgCompFloor,
        })),
      };
      // Nếu đủ cấp luôn (chỉ 1 bước Sàn) → ghi thẳng vào /floor/approved/ + history
      const targetPath=prog1.done?`contents/floor/approved/${fname}`:path;
      const contentB64=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
      await ghAPI('PUT',targetPath,{
        message:`📤 ${me.name} gửi${prog1.done?'+duyệt đủ cấp':''} Sàn ${weekLabel} (${publishedGroups.length} nhóm)`,
        content:contentB64,
        branch:ghConfig.branch||'main',
      });
      if(prog1.done){
        // append history luôn
        let historyArr=[];let historySha=null;
        try{
          const hd=await ghAPI('GET','contents/floor/history.json');
          historySha=hd.sha;
          const hc=decodeURIComponent(escape(atob(hd.content.replace(/\n/g,''))));
          const hobj=JSON.parse(hc);
          historyArr=Array.isArray(hobj)?hobj:(hobj.entries||[]);
        }catch(e){}
        historyArr.unshift({weekLabel,approvedAt:payload.approvedAt,approvedBy:payload.approvedBy,requestedBy:payload.requestedBy,requestNote:payload.requestNote,groupsCount:payload.groupsCount,groups:payload.groups,exchangeRate:payload.exchangeRate,approvals,sourceFile:fname});
        const histB64=btoa(unescape(encodeURIComponent(JSON.stringify(historyArr,null,2))));
        const histBody={message:`📚 Append history: Sàn ${weekLabel}`,content:histB64,branch:ghConfig.branch||'main'};
        if(historySha) histBody.sha=historySha;
        await ghAPI('PUT','contents/floor/history.json',histBody);
      }
      setFloorStatus(p=>({...p,loading:false,lastAction:`✓ Đã gửi Sàn ${weekLabel}`}));
      alert(`✓ Đã gửi Sàn ${weekLabel}!\nBạn: ${me.name} (đã ký bước ${stepOf(me,'floor')}).\n${prog1.done?'🎉 Đủ cấp — đã ban hành luôn.':'⏳ Chuyển bước kế tiếp: '+(prog1.nextApprover?prog1.nextApprover.name+' ('+prog1.nextApprover.role+')':'?')+'.'}`);
    }catch(e){
      setFloorStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi gửi Sàn:\n${e.message}`);
    }
  },[ghAPI,inputs,ghConfig.branch,approvers,loadApprovers,askPin,excludePOFloor,mgmtFloorOverride]);

  // Tải danh sách Sàn pending + approved (Giám đốc xem)
  const listFloorSubmissions=useCallback(async()=>{
    setFloorStatus(p=>({...p,loading:true,error:null}));
    try{
      // pending
      let pendingFiles=[];
      try{
        const p1=await ghAPI('GET','contents/floor/pending');
        pendingFiles=(p1||[]).filter(f=>f.name.endsWith('.json')).sort((a,b)=>b.name.localeCompare(a.name));
      }catch(e){/* folder chưa có */}
      // approved
      let approvedFiles=[];
      try{
        const a1=await ghAPI('GET','contents/floor/approved');
        approvedFiles=(a1||[]).filter(f=>f.name.endsWith('.json')).sort((a,b)=>b.name.localeCompare(a.name));
      }catch(e){/* folder chưa có */}
      // Fetch meta (limit 20 mỗi folder)
      const fetchMeta=async(arr,folder)=>Promise.all(arr.slice(0,20).map(async f=>{
        try{
          const d=await ghAPI('GET',`contents/floor/${folder}/${f.name}`);
          const content=decodeURIComponent(escape(atob(d.content.replace(/\n/g,''))));
          const obj=JSON.parse(content);
          return{...f,_data:obj};
        }catch(e){return{...f,_data:null};}
      }));
      const [pMeta,aMeta]=await Promise.all([fetchMeta(pendingFiles,'pending'),fetchMeta(approvedFiles,'approved')]);
      setFloorStatus(p=>({...p,loading:false,pendingList:pMeta,approvedList:aMeta,viewOpen:true,activeTab:'pending',selectedFile:null,selectedData:null}));
    }catch(e){
      setFloorStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi tải danh sách Sàn:\n${e.message}`);
    }
  },[ghAPI]);

  // SỬA #1 (R4): XÓA 1 PA MUA trên GitHub — cần PIN QUẢN TRỊ / Giám đốc.
  const deletePAFromGithub=useCallback(async(file)=>{
    if(!window.confirm(`🗑 Xóa vĩnh viễn phương án MUA này?\n\nFile: ${file.name}\n\nKhông thể hoàn tác.`)) return;
    const adminPin=await askPin('🔐 Cần PIN QUẢN TRỊ / Giám đốc để XÓA phương án MUA:');
    if(adminPin===null) return;
    const chk=await verifyAdminPin(adminPin);
    if(!chk.ok){alert('❌ PIN quản trị SAI — không có quyền xóa.');return;}
    setGhStatus(p=>({...p,loading:true,error:null}));
    try{
      const data=await ghAPI('GET',`contents/plans/${file.name}`);
      await ghAPI('DELETE',`contents/plans/${file.name}`,{
        message:`🗑 Xóa PA Mua ${file.name} (xác nhận bởi ${chk.by||'quản trị'})`,
        sha:data.sha,branch:ghConfig.branch||'main',
      });
      setGhStatus(p=>({...p,loading:false,lastAction:`🗑 Đã xóa ${file.name}`}));
      alert(`🗑 Đã xóa PA Mua: ${file.name}\n(Xác nhận: ${chk.by||'quản trị'})`);
      await listPAsFromGithub();
    }catch(e){
      setGhStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi xóa PA:\n${e.message}`);
    }
  },[ghAPI,ghConfig.branch,askPin,verifyAdminPin,listPAsFromGithub]);

  // SỬA #1 (R4): XÓA 1 PA SÀN trên GitHub (pending hoặc approved) — cần PIN QUẢN TRỊ / Giám đốc.
  const deleteFloorSubmission=useCallback(async(file,folder)=>{
    if(!window.confirm(`🗑 Xóa vĩnh viễn phương án GIÁ SÀN này?\n\nFile: ${file.name}\nThư mục: ${folder}\n\nKhông thể hoàn tác.`)) return;
    const adminPin=await askPin('🔐 Cần PIN QUẢN TRỊ / Giám đốc để XÓA phương án SÀN:');
    if(adminPin===null) return;
    const chk=await verifyAdminPin(adminPin);
    if(!chk.ok){alert('❌ PIN quản trị SAI — không có quyền xóa.');return;}
    setFloorStatus(p=>({...p,loading:true,error:null}));
    try{
      const data=await ghAPI('GET',`contents/floor/${folder}/${file.name}`);
      await ghAPI('DELETE',`contents/floor/${folder}/${file.name}`,{
        message:`🗑 Xóa Sàn ${file.name} (${folder}, xác nhận bởi ${chk.by||'quản trị'})`,
        sha:data.sha,branch:ghConfig.branch||'main',
      });
      setFloorStatus(p=>({...p,loading:false,lastAction:`🗑 Đã xóa ${file.name}`}));
      alert(`🗑 Đã xóa PA Sàn: ${file.name}\n(Xác nhận: ${chk.by||'quản trị'})`);
      await listFloorSubmissions();
    }catch(e){
      setFloorStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi xóa Sàn:\n${e.message}`);
    }
  },[ghAPI,ghConfig.branch,askPin,verifyAdminPin,listFloorSubmissions]);

  // Duyệt 1 file Sàn pending → chuyển sang approved + append vào history.json
  // SỬA #1: Duyệt Sàn dùng hệ PIN nhiều người (approvers.json) — ký TUẦN TỰ theo Bước duyệt luồng Sàn (stepFloor), giống luồng Mua.
  const reviewFloorSubmission=useCallback(async(file,folder,newStatus)=>{
    const verbTxt=newStatus==='approved'?'duyệt':'từ chối';
    // 0. Nạp danh sách người duyệt + xác định bước Sàn
    const apList=approvers.length?approvers:await loadApprovers();
    // 1. Lấy file hiện tại để biết đã ai ký
    setFloorStatus(p=>({...p,loading:true,error:null}));
    let data,payload;
    try{
      data=await ghAPI('GET',`contents/floor/${folder}/${file.name}`);
      const content=decodeURIComponent(escape(atob(data.content.replace(/\n/g,''))));
      payload=JSON.parse(content);
    }catch(e){
      setFloorStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Không đọc được file Sàn:\n${e.message}`);return;
    }
    const approvalsArr=Array.isArray(payload.approvals)?payload.approvals:[];
    const prog=approvalProgress(apList,approvalsArr,'floor');
    if(prog.empty){
      setFloorStatus(p=>({...p,loading:false}));
      alert('⚠ Chưa thiết lập người duyệt cho luồng GIÁ SÀN.\nVào ⚙️ GitHub → "Quản lý người duyệt", đặt "Bước duyệt luồng Giá sàn" (B1, B2…) cho ít nhất 1 người.');
      return;
    }
    if(prog.rejected){
      setFloorStatus(p=>({...p,loading:false}));
      alert('⚠ Sàn này đã bị từ chối ở bước trước.');return;
    }
    if(prog.done){
      setFloorStatus(p=>({...p,loading:false}));
      alert('✓ Sàn này đã được duyệt đủ cấp (bước cao nhất đã ký) rồi.');return;
    }
    // 2. SỬA #3c (R3): TỰ NHẬN DIỆN người ký BẰNG PIN (không buộc đúng "next"). Bước cao hơn được duyệt vượt.
    const pin=await askPin(`🔐 Nhập PIN của bạn để ${verbTxt.toUpperCase()} Sàn (hệ thống tự nhận diện bạn là ai & bước):`);
    if(pin===null){setFloorStatus(p=>({...p,loading:false}));return;}
    const signer=await findByPin(apList,pin);
    if(!signer){setFloorStatus(p=>({...p,loading:false}));alert('❌ PIN không khớp người duyệt nào.');return;}
    const myStep=stepOf(signer,'floor');
    if(myStep<=0){setFloorStatus(p=>({...p,loading:false}));alert(`⚠ Bạn (${signer.name}) không nằm trong luồng duyệt SÀN.`);return;}
    // SỬA #4 (R6): CHỈ bước CAO NHẤT được TỪ CHỐI/BÁC. Bước giữa chỉ duyệt.
    if(newStatus==='rejected'&&myStep<(prog.maxStep||0)){
      setFloorStatus(p=>({...p,loading:false}));
      alert(`⚠ Bạn (${signer.name} · bước ${myStep}) chỉ có quyền DUYỆT, KHÔNG được bác.\nChỉ người ở bước cao nhất (bước ${prog.maxStep}) mới được bác Sàn.`);return;
    }
    if(newStatus==='approved'&&myStep<=(prog.topSigned||0)){
      setFloorStatus(p=>({...p,loading:false}));
      alert(`⚠ Bước của bạn (${myStep}) đã được vượt qua (bước cao nhất đã ký: ${prog.topSigned}). Không cần ý kiến nữa.`);return;
    }
    if(approvalsArr.some(a=>a.id===signer.id&&a.decision==='approved')){
      setFloorStatus(p=>({...p,loading:false}));alert(`⚠ ${signer.name} đã ký duyệt Sàn này rồi.`);return;
    }
    // 3. Nhập ý kiến
    let opinion='';
    {
      const op=window.prompt(newStatus==='approved'?`📝 Ý kiến của ${signer.name} (${signer.role} · bước ${myStep}) khi duyệt Sàn:\n\nVí dụ: "Đồng ý giá sàn tuần này."`:`📝 Lý do ${signer.name} (${signer.role}) BÁC Sàn này:`);
      if(op===null){setFloorStatus(p=>({...p,loading:false}));return;}
      opinion=op;
    }
    try{
      // 4. Ghi 1 lượt ký vào approvals[]
      approvalsArr.push({step:myStep,id:signer.id,name:signer.name,role:signer.role,decision:newStatus,opinion:(opinion||'').trim(),at:new Date().toISOString()});
      payload.approvals=approvalsArr;
      const prog2=approvalProgress(apList,approvalsArr,'floor');
      payload.status=prog2.rejected?'rejected':prog2.done?'approved':'pending';
      payload.approvedBy=prog2.done?(prog2.chain||[]).map(a=>a.name).join(' → '):null;
      payload.approvedAt=prog2.done?new Date().toISOString():null;

      if(prog2.done){
        // ĐỦ CẤP → chuyển sang /floor/approved/ + append history
        const newContentB64=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
        await ghAPI('PUT',`contents/floor/approved/${file.name}`,{
          message:`✓ Duyệt đủ cấp Sàn ${file.name} (${payload.approvedBy})`,
          content:newContentB64,branch:ghConfig.branch||'main',
        });
        if(folder==='pending'){
          await ghAPI('DELETE',`contents/floor/pending/${file.name}`,{
            message:`Xóa pending sau khi duyệt đủ cấp: ${file.name}`,
            sha:data.sha,branch:ghConfig.branch||'main',
          });
        }
        // Append vào /floor/history.json
        let historyArr=[];let historySha=null;
        try{
          const hd=await ghAPI('GET','contents/floor/history.json');
          historySha=hd.sha;
          const hc=decodeURIComponent(escape(atob(hd.content.replace(/\n/g,''))));
          const hobj=JSON.parse(hc);
          historyArr=Array.isArray(hobj)?hobj:(hobj.entries||[]);
        }catch(e){/* chưa có history */}
        historyArr.unshift({
          weekLabel:payload.weekLabel,
          approvedAt:payload.approvedAt,
          approvedBy:payload.approvedBy,
          requestedBy:payload.requestedBy,
          requestNote:payload.requestNote,
          groupsCount:payload.groupsCount,
          groups:payload.groups,
          exchangeRate:payload.exchangeRate,
          approvals:approvalsArr,
          sourceFile:file.name,
        });
        const histB64=btoa(unescape(encodeURIComponent(JSON.stringify(historyArr,null,2))));
        const histBody={message:`📚 Append vào history.json: Sàn ${payload.weekLabel}`,content:histB64,branch:ghConfig.branch||'main'};
        if(historySha) histBody.sha=historySha;
        await ghAPI('PUT','contents/floor/history.json',histBody);
        alert(`✓ ${signer.name} đã ký bước cuối.\n🎉 Sàn ${payload.weekLabel} ĐÃ DUYỆT ĐỦ CẤP.\n→ Chuyển /floor/approved/ + append history (${historyArr.length} bản).`);
      }else{
        // Chưa đủ cấp (hoặc bị bác) → ghi lại tại chỗ
        const newContentB64=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
        await ghAPI('PUT',`contents/floor/${folder}/${file.name}`,{
          message:`${newStatus==='approved'?'✓ '+signer.role+' duyệt bước '+stepOf(signer,'floor'):'✗ '+signer.role+' bác'} Sàn ${file.name} (${signer.name})`,
          content:newContentB64,sha:data.sha,branch:ghConfig.branch||'main',
        });
        if(prog2.rejected){
          alert(`✗ ${signer.name} đã BÁC Sàn ${payload.weekLabel}.`);
        }else{
          alert(`✓ ${signer.name} (${signer.role}) đã ký duyệt bước ${stepOf(signer,'floor')}.\n⏳ Chuyển bước kế tiếp: ${prog2.nextApprover?prog2.nextApprover.name+' ('+prog2.nextApprover.role+')':'?'}.`);
        }
      }
      // Refresh danh sách (giữ file đang xem nếu còn ở pending)
      await listFloorSubmissions();
    }catch(e){
      setFloorStatus(p=>({...p,loading:false,error:e.message}));
      alert(`❌ Lỗi khi ${verbTxt}:\n${e.message}`);
    }
  },[ghAPI,ghConfig.branch,listFloorSubmissions,approvers,loadApprovers,sha256,askPin]);

  // Xem chi tiết 1 file Sàn
  const viewFloorSubmission=useCallback(async(file,folder)=>{
    setFloorStatus(p=>({...p,loading:true,error:null}));
    try{
      const d=await ghAPI('GET',`contents/floor/${folder}/${file.name}`);
      const content=decodeURIComponent(escape(atob(d.content.replace(/\n/g,''))));
      const obj=JSON.parse(content);
      setFloorStatus(p=>({...p,loading:false,selectedFile:{...file,_folder:folder},selectedData:obj}));
    }catch(e){
      setFloorStatus(p=>({...p,loading:false,error:e.message}));
    }
  },[ghAPI]);

  // Tải history.json về xem ở tab Lịch sử + ĐỔ VÀO floorHistory state để bảng chi tiết hiển thị
  const loadFloorHistoryFromGithub=useCallback(async(silent=false)=>{
    setFloorStatus(p=>({...p,loading:true,error:null}));
    try{
      const d=await ghAPI('GET','contents/floor/history.json');
      const content=decodeURIComponent(escape(atob(d.content.replace(/\n/g,''))));
      const arr=JSON.parse(content);
      const safeArr=Array.isArray(arr)?arr:[];
      // Map history entry → format floorHistory cũ (issuedDate, issuedTime, issuedBy, groups, ...)
      const mapped=safeArr.map(h=>{
        const dt=h.approvedAt?new Date(h.approvedAt):null;
        return{
          id:h.weekLabel+'_'+(h.approvedAt||''),
          weekLabel:h.weekLabel,
          issuedDate:dt?dt.toLocaleDateString('vi-VN'):'',
          issuedTime:dt?dt.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'',
          issuedISO:h.approvedAt,
          issuedBy:h.requestedBy||'?',
          approvedBy:h.approvedBy||'?',
          requestNote:h.requestNote||'',
          exchangeRate:h.exchangeRate||0,
          groups:h.groups||[],
        };
      });
      setFloorHistory(mapped);
      try{localStorage.setItem('pakd_floor_history',JSON.stringify(mapped));}catch(e){}
      // SỬA #2 (R6): silent=true (gọi từ Sync All) → KHÔNG mở modal, chỉ nạp dữ liệu.
      setFloorStatus(p=>({...p,loading:false,history:safeArr,historyOpen:silent?p.historyOpen:true,lastAction:`✓ Đã tải ${safeArr.length} bản từ history.json`}));
    }catch(e){
      // silent → nuốt lỗi (vd chưa có file history.json), không bật modal
      setFloorStatus(p=>({...p,loading:false,error:silent?p.error:e.message,history:silent?p.history:[],historyOpen:silent?p.historyOpen:true}));
    }
  },[ghAPI]);

  // Báo cáo Tồn kho theo tháng: ô điền tay (lưu localStorage)
  // Cấu trúc: {"03/2026":{tonCuoi:500000000, muaTrongThang:300000000, hmCap:1000000000}, ...}
  const [monthlyManualData,setMonthlyManualData]=useState(()=>{
    try{const s=localStorage.getItem('pakd_monthly_manual');return s?JSON.parse(s):{};}catch(e){return {};}
  });
  const setMonthlyManualField=useCallback((thang,field,val)=>{
    setMonthlyManualData(p=>{
      const next={...p,[thang]:{...(p[thang]||{}),[field]:val}};
      try{localStorage.setItem('pakd_monthly_manual',JSON.stringify(next));}catch(e){}
      return next;
    });
  },[]);
  const chartRef=useRef(null);const chartInst=useRef(null);
  const setInp=useCallback((f,v)=>setInputs(p=>({...p,[f]:v})),[]);

  const minStockMap=useMemo(()=>{const m={};minStockRows.forEach(r=>{m[skuKey(r)]=parseFloat(r.minStockKg)||0;});return m;},[minStockRows]);
  const maxStockMap=useMemo(()=>{const m={};minStockRows.forEach(r=>{const v=r.maxStockKg;m[skuKey(r)]=(v===null||v===undefined||v==='')?null:(parseFloat(v)||null);});return m;},[minStockRows]);

  const syncGoogleSheet=useCallback(async(which='all')=>{
    // 🔐 BẢO MẬT: Chặn sync GSheet nếu chưa verify GitHub (đọc qua ref để không stale)
    if(!ghVerifiedRef.current){
      alert('🔐 BẢO MẬT: Bạn cần xác thực GitHub trước khi đồng bộ dữ liệu.\n\nNhấn ⚙️ GitHub ở góc phải header để cấu hình + xác thực token.');
      return;
    }
    setDbStatus(p=>({...p,loading:true,error:null}));
    try{
      // Mỗi fetch luôn trả {type,data,err} — kể cả khi lỗi — để biết chính xác nguồn nào hỏng
      const wrap=(type,p)=>p.then(d=>({type,data:d})).catch(e=>({type,data:null,err:e?.message||'lỗi'}));
      const toFetch=[];
      if(which==='all'||which==='inv') toFetch.push(wrap('inv',fetchCsv(GSHEET_INVENTORY)));
      if(which==='all'||which==='ms') toFetch.push(wrap('ms',fetchCsv(GSHEET_MINSTOCK)));
      if(which==='all'||which==='lim') toFetch.push(wrap('lim',fetchCsv(GSHEET_LIMITS)));
      if(which==='all'||which==='uip') toFetch.push(wrap('uip',fetchCsv(GSHEET_UPDATED_IMPORT)));
      if(which==='all'||which==='fh') toFetch.push(wrap('fh',fetchCsv(GSHEET_FLOOR_HISTORY)));
      if(which==='all'||which==='cf') toFetch.push(wrap('cf',fetchText(GSHEET_CASHFLOW)));
      if(which==='all'||which==='po') toFetch.push(wrap('po',fetchCsv(GSHEET_PO)));
      const results=await Promise.allSettled(toFetch);
      // Tên nguồn dễ hiểu để báo cáo rõ ràng thay vì "Lỗi" chung chung
      const SRC_NAME={inv:'Tồn kho',ms:'Min/Max',lim:'Hạn mức',uip:'Giá nhập',fh:'Lịch sử Sàn',cf:'Dòng tiền',po:'PO đã ký'};
      const okSrc=[]; const failSrc=[];
      results.forEach(r=>{
        const{type,data,err}=r.value||{};
        if(err||!data){failSrc.push(SRC_NAME[type]||type||'?');return;}
        okSrc.push(SRC_NAME[type]||type);
        if(type==='inv'){
          const rows=data.filter(r=>r.alloy).map((r,i)=>({id:uid()+i,alloy:r.alloy||'A5052',temper:r.temper||'H32',thickness:normThick(r.thickness)||'1.0',width:r.width||'1200',length:r.length||'C',coating:coatingFromGSheet(r.coating||'KP'),status:(r.status||'IN_STOCK').toUpperCase(),qtyKg:parseFloat(r.qtykg||r.qty_kg||r['qty kg']||0),avgCost:parseFloat(r.avgcost||r.avg_cost||r['avg cost']||0),expectedDeliveryDate:(r.expecteddeliverydate||r.expected_delivery_date||r['expecteddeliverydate']||r['expected delivery date']||'').trim()}));
          if(rows.length>0) setInvs(rows);
        }
        if(type==='ms'){
          const rows=data.filter(r=>r.alloy).map((r,i)=>({id:uid()+i,alloy:r.alloy||'A5052',temper:r.temper||'H32',thickness:normThick(r.thickness)||'1.0',width:r.width||'1200',length:r.length||'Coil',coating:coatingFromGSheet(r.coating||'KP'),minStockKg:parseFloat(r.minstockkg||r.min_stock_kg||r['min stock kg']||0),maxStockKg:(()=>{const raw=r.maxstockkg||r.max_stock_kg||r['max stock kg']||'';return raw===''?null:parseFloat(raw)||null;})(),buyRequest:(r.yeucaumua||r['yeu cau mua']||r.yeu_cau_mua||'').trim(),buyRequestWeek:(r.tuanyeucau||r['tuan yeu cau']||r.tuan_yeu_cau||'').trim()}));
          if(rows.length>0) setMinStockRows(rows);
        }
        if(type==='lim'){
          const gv=(r,keys)=>{for(const k of keys){const v=r[k]||r[k.replace(/_/g,'')]||r[k.replace(/\s/g,'')];if(v!=null&&v!=='') return parseFloat(v)||0;}return 0;};
          const rows=data.filter(r=>Object.values(r).some(v=>v!=='')).map((r,i)=>({
            id:uid()+i,
            totalCreditMin:gv(r,['totalcreditmin','total_credit_min','total credit min']),
            totalCreditMax:gv(r,['totalcreditmax','total_credit_max','total credit max']),
            inventoryMinVND:gv(r,['inventoryminvnd','inventory_min_vnd','inventory min vnd']),
            inventoryMaxVND:gv(r,['inventorymaxvnd','inventory_max_vnd','inventory max vnd']),
            inventoryMinKg:gv(r,['inventoryminkg','inventory_min_kg','inventory min kg']),
            inventoryMaxKg:gv(r,['inventorymaxkg','inventory_max_kg','inventory max kg']),
            accountsPayableLimit:gv(r,['accountspayablelimit','accounts_payable_limit','accounts payable limit','aplimit','ap_limit','ap limit']),
            actualAccountsPayable:gv(r,['actualaccountspayable','actual_accounts_payable','actual accounts payable','actualap','actual_ap','actual ap']),
          }));
          if(rows.length>0) setLimitsData(rows);
        }
        if(type==='uip'){
          const rows=data.filter(r=>r.alloy).map((r,i)=>({
            id:uid()+i,
            updateDate:r.updatedate||r.update_date||r['update date']||'',
            alloy:(r.alloy||'').trim(),temper:(r.temper||'').trim(),
            minThick:parseFloat(r.minthick||r['min thick']||0),
            maxThick:parseFloat(r.maxthick||r['max thick']||99),
            priceFC:parseFloat(r.pricefc||r['price fc']||0),
            note:r.note||'',
            importCoef:parseFloat(r.importcoef||r['import coef']||1.0),
            competitorPrice:parseFloat(r.competitorprice||r['competitor price']||r.CompetitorPrice||0)||0,
            competitorFloorPrice:parseFloat(r.competitorfloorprice||r['competitor floor price']||r.CompetitorFloorPrice||0)||0,
          })).filter(r=>r.alloy&&r.priceFC>0);
          const latestRows=filterLatestUIP(rows);
          if(latestRows.length>0) setUpdatedImportPrices(latestRows);
          setAllRawImportPrices(rows);
        }
        if(type==='cf'){const parsed=parseCashFlowCSV(data);if(parsed.length>0)setCashFlowData(parsed);}
        if(type==='po'){const parsed=parsePOData(data);setPoData(parsed);}
        if(type==='fh'){
          // Parse GSheet Lịch sử Sàn — map đúng 23 cột theo thứ tự header
          const gv2=(r,keys)=>{for(const k of keys){const norm=k.toLowerCase().replace(/\s+/g,'').replace(/[()đ%\/]/g,'');const v=Object.entries(r).find(([rk])=>rk.toLowerCase().replace(/\s+/g,'').replace(/[()đ%\/]/g,'')===norm);if(v&&v[1]!='') return v[1];}return '';};
          // Group rows by issuedDate+issuedTime+issuedBy to reconstruct entry objects
          const entryMap={};
          data.filter(r=>Object.values(r).some(v=>v!=='')).forEach((r,i)=>{
            const ngay=gv2(r,['Ngày ban hành','ngaybanhành','ngay ban hanh']);
            const gio=gv2(r,['Giờ','gio']);
            const nguoi=gv2(r,['Người lập','nguoilap','nguoi lap']);
            const tygia=gv2(r,['Tỷ giá USD','tygiausd','ty gia usd']);
            const lk=gv2(r,['LK%','lk']);
            const cptc=gv2(r,['CPTC%','cptc']);
            const hdkd=gv2(r,['HĐKD%','hdkd%','hdkd']);
            const nhom=gv2(r,['Nhóm hàng','nhomhang','nhom hang']);
            const mac=gv2(r,['Mác','mac']);
            const temper=gv2(r,['Temper','temper']);
            const dayMin=gv2(r,['Dày min','daymin','day min']);
            const dayMax=gv2(r,['Dày max','daymax','day max']);
            const skus=gv2(r,['SKUs','skus']);
            const tonKho=gv2(r,['Tồn kho (kg)','tonkho','ton kho']);
            const bqGV=gv2(r,['BQ GV (đ/kg)','bqgv','bq gv']);
            const sanTD=gv2(r,['Sàn tự động (đ/kg)','santudong','san tu dong']);
            const sanBH=gv2(r,['Sàn ban hành (đ/kg)','sanbanhành','san ban hanh']);
            const cotLoi=gv2(r,['A Group (đ/kg)','agroup','a group','Cốt lõi (đ/kg)','cotloi','cot loi']);
            const thanThiet=gv2(r,['B Group (đ/kg)','bgroup','b group','Thân thiết (đ/kg)','thanthiet','than thiet']);
            const khLe=gv2(r,['C Group (đ/kg)','cgroup','c group','KH lẻ (đ/kg)','khle','kh le']);
            const bqDT=gv2(r,['BQ ĐT (đ/kg)','bqdt','bq dt']);
            const sanDT=gv2(r,['Sàn ĐT (đ/kg)','sandt','san dt']);
            if(!ngay&&!nhom) return;
            const key=`${ngay}|${gio}|${nguoi}`;
            if(!entryMap[key]){
              entryMap[key]={
                id:uid()+i,
                issuedDate:ngay,issuedTime:gio,issuedBy:nguoi,
                issuedISO:ngay?new Date().toISOString():'',
                exchangeRate:parseFloat(tygia)||0,
                storageCostPct:parseFloat(lk)||0,
                baseFinCostPct:parseFloat(cptc)||0,
                opsCostPct:parseFloat(hdkd)||0,
                groups:[],
              };
            }
            if(nhom){
              entryMap[key].groups.push({
                id:'g'+i,label:nhom,alloy:mac,temper:temper,
                minThick:parseFloat(dayMin)||0,maxThick:parseFloat(dayMax)||0,
                skus:parseInt(skus)||0,totalQty:parseFloat(tonKho)||0,
                avgCost:parseFloat(bqGV)||0,autoFloor:parseFloat(sanTD)||0,
                publishedFloor:sanBH?parseFloat(sanBH):null,
                corePrice:parseFloat(cotLoi)||0,loyalPrice:parseFloat(thanThiet)||0,newPrice:parseFloat(khLe)||0,
                avgCompPrice:parseFloat(bqDT)||0,avgCompFloor:parseFloat(sanDT)||0,
              });
            }
          });
          const parsed=Object.values(entryMap).filter(e=>e.groups.length>0);
          if(parsed.length>0){
            setFloorHistory(parsed);
            try{localStorage.setItem('pakd_floor_history',JSON.stringify(parsed));}catch(e){}
          }
        }
      });
      // Báo cáo rõ ràng: chỉ coi là LỖI khi KHÔNG nguồn nào tải được.
      // Nếu tải được ≥1 nguồn → đồng bộ thành công (kèm ghi chú nguồn nào bỏ qua, nếu có).
      let statusErr=null, statusWarn=null;
      if(okSrc.length===0){
        statusErr='Không tải được dữ liệu từ Google Sheet. Kiểm tra kết nối mạng hoặc quyền chia sẻ của Sheet.';
      }else if(failSrc.length>0){
        statusWarn='Đã đồng bộ '+okSrc.length+'/'+(okSrc.length+failSrc.length)+' nguồn. Tạm bỏ qua: '+failSrc.join(', ')+' (có thể tab trống hoặc chưa có dữ liệu).';
      }
      setDbStatus({loading:false,error:statusErr,warn:statusWarn,lastSync:new Date().toLocaleTimeString('vi-VN'),lastSyncAt:Date.now(),source:'gsheet'});
    }catch(e){setDbStatus(p=>({...p,loading:false,error:'Không kết nối được Google Sheet: '+(e.message||'lỗi mạng')}));}
    // Fetch MonthlyRevenue từ CSV export (async riêng, không block)
    try{
      try{const cfText=await fetchText(GSHEET_CASHFLOW);const cfP=parseCashFlowCSV(cfText);if(cfP.length>0)setCashFlowData(cfP);}catch(e){console.warn('CF:',e.message);}
      const resp=await fetch(GSHEET_MONTHLY_REVENUE);
      if(resp.ok){
        const text=await resp.text();
        const rows=parseCsv(text);
        // Normalize headers: Thang, MacNhom, SanLuong, DoanhThu, DonGiaBanTB
        const parsed=rows.filter(r=>Object.values(r).some(v=>v!=='')).map(r=>{
          const gv2=(keys)=>{for(const k of keys){const norm=k.toLowerCase().replace(/\s+/g,'');const found=Object.entries(r).find(([rk])=>rk.toLowerCase().replace(/\s+/g,'')===norm);if(found&&found[1]!='') return found[1];}return '';};
          const thang=gv2(['Thang','thang','Tháng','tháng']);
          const macNhom=gv2(['MacNhom','macnhom','Mác Nhóm','mac nhom','MácNhóm']);
          const sl=parseFloat((gv2(['SanLuong','sanluong','Sản Lượng','san luong'])||'').replace(/\./g,'').replace(/,/g,'.'))||0;
          const dt=parseFloat((gv2(['DoanhThu','doanhthu','Doanh Thu','doanh thu'])||'').replace(/\./g,'').replace(/,/g,'.'))||0;
          const dg=parseFloat((gv2(['DonGiaBanTB','dongiabantb','Đơn Giá Bán TB','don gia ban tb','DonGia','dongia'])||'').replace(/\./g,'').replace(/,/g,'.'))||0;
          if(!thang||!macNhom) return null;
          return{thang,macNhom,sanLuong:sl,doanhThu:dt,donGiaBanTB:dg};
        }).filter(Boolean);
        if(parsed.length>0) setMonthlyRevenue(parsed);
      }
    }catch(e2){console.warn('MonthlyRevenue fetch failed:',e2.message);}
    // SỬA #2 (R6): Sync All cũng tải Lịch sử Sàn từ CLOUD (GitHub /floor/history.json) — chế độ silent (không bật modal).
    if(which==='all'){
      try{ await loadFloorHistoryFromGithub(true); }catch(e3){console.warn('Floor history cloud:',e3.message);}
    }
  },[loadFloorHistoryFromGithub]);

  // ── GĐ1: TỰ ĐỘNG Sync All khi mở app (sau khi xác thực GitHub xong) ──
  const autoSyncedRef=useRef(false);
  useEffect(()=>{
    if(ghVerified&&!autoSyncedRef.current){
      autoSyncedRef.current=true;
      syncGoogleSheet('all');
    }
  },[ghVerified,syncGoogleSheet]);
  // Tick mỗi 30s để cập nhật nhãn "dữ liệu cách đây X phút"
  const [nowTick,setNowTick]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNowTick(Date.now()),30000);return()=>clearInterval(t);},[]);
  const syncAgeMin=dbStatus.lastSyncAt?Math.max(0,Math.round((nowTick-dbStatus.lastSyncAt)/60000)):null;
  const syncAgeLabel=syncAgeMin===null?null:(syncAgeMin<1?'vừa xong':syncAgeMin<60?`${syncAgeMin} phút trước`:`${Math.floor(syncAgeMin/60)}h${String(syncAgeMin%60).padStart(2,'0')} trước`);


  const result=useMemo(()=>{
    const totalKg=products.reduce((s,p)=>s+p.qtyKg,0);if(totalKg<=0) return null;
    // Mở rộng wildcard: SKU để trống trường → tách thành nhiều dòng theo inventory
    const expandedProducts=expandWildcardProducts(products,inventory);
    const expandedTotalKg=expandedProducts.reduce((s,p)=>s+p.qtyKg,0);
    const inv=calcInvoice(expandedProducts,inputs.exchangeRate);
    const land=calcLanded(inv.invoiceVND,expandedTotalKg,inputs);
    const fin=calcFinance(inv.invoiceVND,land,expandedTotalKg,inputs);
    const rows=calcProductBreakdown(expandedProducts,land,fin,expandedTotalKg,inputs);
    const blends=calcSkuBlend(inventory,rows,sellingPrices,inputs,minStockMap,maxStockMap);
    const allInvRows=inventory.map(r=>({qtyKg:parseFloat(r.qtyKg)||0,avgCost:parseFloat(r.avgCost)||0}));
    const newPurchRows=rows.map(r=>({qtyKg:r.qtyKg,avgCost:r.physPerKg}));
    const globalAvgBefore=weightedAvg(allInvRows);
    const globalAvgAfter=weightedAvg([...allInvRows,...newPurchRows]);
    let globalBreakEven=0;
    const totalBlendQty=blends.reduce((sum,b)=>sum+b.qtyAfter,0);
    if(totalBlendQty>0) globalBreakEven=blends.reduce((sum,b)=>sum+(b.breakEven*b.qtyAfter),0)/totalBlendQty;
    else globalBreakEven=globalAvgAfter*(1+inputs.businessRiskPercent/100)+fin.finPerKg;
    const hasRisk=blends.some(b=>b.isRisk);const hasLowStock=blends.some(b=>b.stockStatus==='LOW');
    const totalContainer=expandedTotalKg/1000;const containerOk=totalContainer>=24.5&&totalContainer<=26.5;
    const blendsWithPrice=blends.filter(b=>b.grossProfitVND!=null);
    const totalGrossProfit=blendsWithPrice.reduce((s,b)=>s+b.grossProfitVND,0);
    const totalQtyPriced=blendsWithPrice.reduce((s,b)=>s+b.qtyKg,0);
    const avgProfitPerKg=totalQtyPriced>0?totalGrossProfit/totalQtyPriced:null;
    const allPriced=blends.every(b=>b.hasSellPrice);
    const rec=!hasRisk?(totalGrossProfit>0?{txt:'✓ NÊN MUA – CÓ LÃI',cls:'tg'}:{txt:'HÒA VỐN – CÂN NHẮC',cls:'tb'}):{txt:'⚠ RỦI RO – XEM LẠI',cls:'tr'};
    return{totalKg:expandedTotalKg,...inv,...land,...fin,rows,blends,globalAvgBefore,globalAvgAfter,globalBreakEven,hasRisk,hasLowStock,rec,totalContainer,containerOk,totalGrossProfit,totalQtyPriced,avgProfitPerKg,allPriced};
  },[inputs,products,inventory,sellingPrices,minStockMap,maxStockMap]);

  // Sync resultRef cho callbacks GitHub không vi phạm TDZ
  useEffect(()=>{resultRef.current=result;},[result]);

  const reportData=useMemo(()=>calcAlloySummary(inventory,result?result.finPerKg:0,inputs,result?result.rows:[]),[inventory,result,inputs]);
  const limitsWarnings=useMemo(()=>calcLimitsWarnings(limitsData,inventory),[limitsData,inventory]);

  // ── PO đã ký: gom tổng "chưa giao" theo SKU key chuẩn hóa ──
  const poByKey=useMemo(()=>{
    const m={};
    poData.forEach(p=>{
      if(!m[p.key]) m[p.key]={remaining:0,ordered:0,delivered:0,pos:[]};
      m[p.key].remaining+=p.remaining||0;
      m[p.key].ordered+=p.ordered||0;
      m[p.key].delivered+=p.delivered||0;
      m[p.key].pos.push(p);
    });
    return m;
  },[poData]);
  const poTotalRemaining=useMemo(()=>poData.reduce((s,p)=>s+(p.remaining||0),0),[poData]);
  // Tồn kho hiện tại (IN_STOCK) + đang về (IN_TRANSIT) theo SKU key chuẩn hóa
  const stockByKey=useMemo(()=>{
    const m={};
    inventory.forEach(r=>{
      const k=skuKeyNorm(r); const q=parseFloat(r.qtyKg)||0;
      if(!m[k]) m[k]={stock:0,transit:0};
      if(String(r.status).toUpperCase()==='IN_TRANSIT') m[k].transit+=q; else m[k].stock+=q;
    });
    return m;
  },[inventory]);
  // PO làm giàu: mỗi dòng PO + đáp ứng kho/đang về + cần đặt thêm
  const poEnriched=useMemo(()=>poData.map(p=>{
    const st=stockByKey[p.key]||{stock:0,transit:0};
    const needBuy=Math.max(p.remaining-st.stock-st.transit,0);
    return {...p,inStock:st.stock,inTransit:st.transit,needBuy,coverStock:Math.min(st.stock,p.remaining),coverTransit:Math.max(Math.min(st.stock+st.transit,p.remaining)-st.stock,0)};
  }),[poData,stockByKey]);

  // ── PHÂN BỔ PO THÔNG MINH vào từng dòng tồn kho ──
  // Quy tắc: theo từng SKU, trừ TL PO chưa giao vào KHO trước (IN_STOCK), thiếu mới trừ ĐANG VỀ (IN_TRANSIT);
  // trong mỗi nhóm, ưu tiên trừ dòng GIÁ VỐN THẤP NHẤT trước (giữ hàng đắt để bán). Trả map theo id dòng tồn.
  const invAlloc=useMemo(()=>{
    const out={}; // id -> {alloc, available, origin}
    inventory.forEach(r=>{out[r.id]={alloc:0,available:parseFloat(r.qtyKg)||0,origin:parseFloat(r.qtyKg)||0};});
    if(poTotalRemaining<=0) return out;
    // gom dòng tồn theo SKU key
    const byKey={};
    inventory.forEach(r=>{const k=skuKeyNorm(r);(byKey[k]=byKey[k]||[]).push(r);});
    Object.keys(byKey).forEach(k=>{
      let rem=(poByKey[k]||{}).remaining||0;
      if(rem<=0) return;
      // sắp xếp: IN_STOCK trước IN_TRANSIT; trong mỗi loại, giá vốn thấp → cao
      const rows=byKey[k].slice().sort((a,b)=>{
        const sa=String(a.status).toUpperCase()==='IN_TRANSIT'?1:0;
        const sb=String(b.status).toUpperCase()==='IN_TRANSIT'?1:0;
        if(sa!==sb) return sa-sb;
        return (parseFloat(a.avgCost)||0)-(parseFloat(b.avgCost)||0);
      });
      rows.forEach(r=>{
        if(rem<=0) return;
        const q=parseFloat(r.qtyKg)||0;
        const take=Math.min(q,rem);
        out[r.id].alloc=take;
        out[r.id].available=q-take;
        rem-=take;
      });
    });
    return out;
  },[inventory,poByKey,poTotalRemaining]);

  const floorPriceData=useMemo(()=>{
    const skuGroups=groupBySku(inventory);
    return skuGroups.map(grp=>{
      const updMatch=findUpdatedImportPrice(grp,updatedImportPrices,inputs.exchangeRate);
      return calcFloorPricePerSku(grp,updMatch,inputs);
    }).filter(r=>r.totalQty>0||r.costBasisPhysical>0);
  },[inventory,updatedImportPrices,inputs]);

  const filteredFp=useMemo(()=>floorPriceData.filter(r=>{
    if(fpFilter.alloy!=='ALL'&&r.alloy!==fpFilter.alloy) return false;
    if(fpFilter.coating!=='ALL'&&(r.coating||'KP')!==fpFilter.coating) return false;
    if(fpFilter.search){const s=fpFilter.search.toLowerCase();if(!r.skuLabel.toLowerCase().includes(s)) return false;}
    if(fpFilter.thickMin!==''){const mn=parseFloat(fpFilter.thickMin);if(!isNaN(mn)&&parseFloat(r.thickness)<mn) return false;}
    if(fpFilter.thickMax!==''){const mx=parseFloat(fpFilter.thickMax);if(!isNaN(mx)&&parseFloat(r.thickness)>mx) return false;}
    return true;
  }),[floorPriceData,fpFilter]);

  

  // ĐẶT BIẾN NÀY LÊN TRÊN
  // I.3: Sàn trước đây — lấy từ lịch sử giá sàn (lần ban hành gần nhất)
  const lastPublishedFloorByGroup=useMemo(()=>{
    if(!floorHistory||floorHistory.length===0) return {};
    // Sort by date desc
    const sorted=[...floorHistory].sort((a,b)=>new Date(b.issuedISO||0)-new Date(a.issuedISO||0));
    const map={};
    sorted.forEach(entry=>{
      (entry.groups||[]).forEach(g=>{
        if(g.label&&g.publishedFloor&&!map[g.label]){
          map[g.label]={publishedFloor:g.publishedFloor,issuedDate:entry.issuedDate,issuedBy:entry.issuedBy};
        }
      });
    });
    return map;
  },[floorHistory]);

  const mgmtData=useMemo(()=>{
    const base=calcMgmtGroups(floorPriceData,mgmtGroups,excludedMgmtSkus,poByKey,excludePOFloor);
    return base.map(g=>{
      const ov=mgmtFloorOverride[g.id];
      // I.2: Default Sàn BH = Sàn trước nếu chưa nhập tay
      const lastHist=lastPublishedFloorByGroup[g.label];
      const publishedFloor=ov!=null&&ov>0?ov:(lastHist&&lastHist.publishedFloor>0?lastHist.publishedFloor:null);
      const baseFloor=publishedFloor||g.avgFloor;
      const corePrice=baseFloor*(1+(inputs.marginCore||0)/100);
      const loyalPrice=baseFloor*(1+(inputs.marginLoyal||1)/100);
      const newPrice=baseFloor*(1+(inputs.marginNew||2)/100);
      return{...g,publishedFloor,isDefaultFromHistory:ov==null&&!!lastHist,corePrice,loyalPrice,newPrice};
    });
  },[floorPriceData,mgmtGroups,mgmtFloorOverride,excludedMgmtSkus,lastPublishedFloorByGroup,inputs.marginCore,inputs.marginLoyal,inputs.marginNew,poByKey,excludePOFloor]);
  useEffect(()=>{mgmtDataRef.current=mgmtData;},[mgmtData]); // SỬA #4: đồng bộ ref cho saveFloorLocal

  const prevWeekImportPrices=useMemo(()=>filterPrevWeekUIP(allRawImportPrices),[allRawImportPrices]);

  const fpFooter=useMemo(()=>{
    if(filteredFp.length===0) return null;
    const totalQty=filteredFp.reduce((s,r)=>s+r.totalQty,0);
    const wa=(field)=>{const tot=filteredFp.reduce((s,r)=>s+r.totalQty*(r[field]||0),0);return totalQty>0?tot/totalQty:0;};
    return{totalQty,avgCostBasis:wa('costBasisPhysical'),avgFloor:wa('floorAbsolute'),avgCore:wa('priceCore'),avgLoyal:wa('priceLoyal'),avgNew:wa('priceNew')};
  },[filteredFp]);

  useEffect(()=>{
    if(!result||!chartRef.current) return;
    if(typeof Chart==='undefined'){console.warn('Chart.js chưa được tải - bỏ qua vẽ biểu đồ');return;}
    try{
    if(chartInst.current) chartInst.current.destroy();
    const labels=result.blends.map(b=>`${b.alloy} ${b.temper} ${b.thickness}mm`);
    chartInst.current=new Chart(chartRef.current.getContext('2d'),{type:'bar',data:{labels,datasets:[
      {label:'Về kho (lô mới)',data:result.blends.map(b=>b.physPerKg),backgroundColor:'#16a34a',borderRadius:3},
      {label:'GV BQ sau nhập',data:result.blends.map(b=>b.avgAfter),backgroundColor:'#2563eb',borderRadius:3},
      {label:'Giá bán KH',data:result.blends.map(b=>b.sellPrice||0),backgroundColor:'#15803d',borderRadius:3},
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{color:'#1e293b',font:{size:10,weight:'bold'},padding:8,usePointStyle:true}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+fv(c.parsed.y)+' đ/kg'}}},scales:{x:{grid:{color:'#e2e8f0'},ticks:{color:'#334155',font:{size:9}}},y:{grid:{color:'#e2e8f0'},beginAtZero:false,ticks:{color:'#334155',font:{size:9},callback:v=>fv(v)}}}}});
    }catch(err){console.error('Lỗi vẽ biểu đồ Chart.js:',err);}
  },[result]);

  const addProduct=()=>setProducts(p=>[...p,{id:uid(),alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'KP',qtyKg:1000,priceFC:3870}]);
  const delProduct=id=>{if(products.length>1) setProducts(p=>p.filter(r=>r.id!==id));};
  const setProduct=(id,patch)=>setProducts(p=>p.map(r=>r.id===id?{...r,...patch}:r));
  const addInv=()=>setInvs(p=>[...p,{id:uid(),alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'KP',status:'IN_STOCK',qtyKg:0,avgCost:0}]);
  const delInv=id=>setInvs(p=>p.filter(r=>r.id!==id));
  const setInv=(id,patch)=>setInvs(p=>p.map(r=>r.id===id?{...r,...patch}:r));
  const addMS=()=>setMinStockRows(p=>[...p,{id:uid(),alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'KP',minStockKg:0,maxStockKg:null}]);
  const delMS=id=>setMinStockRows(p=>p.filter(r=>r.id!==id));
  const setMS=(id,patch)=>setMinStockRows(p=>p.map(r=>r.id===id?{...r,...patch}:r));
  const addSP=()=>setSP(p=>[...p,{id:uid(),alloy:'A1050',temper:'H14',thickness:'1.0',width:'1200',length:'C',coating:'KP',sellCost:0,comment:''}]);
  const delSP=id=>setSP(p=>p.filter(r=>r.id!==id));
  const setSpR=(id,f,v)=>setSP(p=>p.map(r=>r.id===id?{...r,[f]:v}:r));
  const setLimField=(f,v)=>setLimitsData(p=>{const arr=[...p];if(arr[0]) arr[0]={...arr[0],[f]:pn(v)};return arr;});
  const saveScenario=()=>{
    if(!result) return;
    const newEntry={
      id:uid(),
      name:`${new Date().toLocaleDateString('vi-VN')} · ${products.map(p=>p.alloy+' '+p.temper).join('+')}`,
      date:new Date().toLocaleDateString('vi-VN'),
      time:new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}),
      totalKg:result.totalKg,
      invoiceUSD:result.invoiceUSD,
      globalAvgBefore:result.globalAvgBefore,
      globalAvgAfter:result.globalAvgAfter,
      globalBreakEven:result.globalBreakEven,
      hasRisk:result.hasRisk,
      totalGrossProfit:result.totalGrossProfit,
      avgProfitPerKg:result.avgProfitPerKg,
      inputs:{...inputs},
      products:[...products],
    };
    setScenarios(prev=>{
      const updated=[newEntry,...prev];
      try{localStorage.setItem('pakd_scenarios',JSON.stringify(updated));}catch(e){}
      return updated;
    });
  };

  // ── FLOOR HISTORY: lưu lịch sử ban hành giá sàn ──
  const saveFloorHistory=useCallback(()=>{
    const publishedGroups=mgmtData.filter(g=>g.publishedFloor&&g.skus>0);
    if(publishedGroups.length===0){alert('Chưa có nhóm nào ban hành Sàn. Hãy nhập Sàn ban hành trước.');return;}
    const nowISO=new Date().toISOString();
    const nowVN=new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});
    const timeVN=new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
    const entry={
      id:uid(),
      issuedDate:nowVN,
      issuedTime:timeVN,
      issuedISO:nowISO,
      issuedBy:inputs.creator||'—',
      exchangeRate:inputs.exchangeRate,
      storageCostPct:inputs.storageCostPct??2,
      baseFinCostPct:inputs.baseFinCostPct??1.5,
      opsCostPct:inputs.opsCostPct,
      creditMode:inputs.creditMode,
      groups:publishedGroups.map(g=>({
        id:g.id,label:g.label,alloy:g.alloy,temper:g.temper,
        minThick:g.minThick,maxThick:g.maxThick,
        skus:g.skus,totalQty:g.totalQty,
        avgCost:g.avgCost,
        autoFloor:g.avgFloor,
        publishedFloor:g.publishedFloor,
        corePrice:g.corePrice,
        loyalPrice:g.loyalPrice,
        newPrice:g.newPrice,
        avgCompPrice:g.avgCompPrice,
        avgCompFloor:g.avgCompFloor,
      })),
    };
    const updated=[entry,...floorHistory];
    setFloorHistory(updated);
    try{localStorage.setItem('pakd_floor_history',JSON.stringify(updated));}catch(e){}
    alert(`✅ Đã lưu lịch sử ban hành ngày ${nowVN} ${timeVN} — ${publishedGroups.length} nhóm.`);
  },[mgmtData,floorHistory,inputs]);

  // ── HELPER: tạo HTML table xuất Excel ──
  const buildExcelHTML=(titleRows,headerCols,dataRows,numericCols)=>{
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const thStyle='background:#1e3a8a;color:#ffffff;font-weight:bold;padding:6px 10px;border:1px solid #1e40af;white-space:nowrap;';
    const tdStyle='padding:5px 9px;border:1px solid #cbd5e1;vertical-align:middle;mso-number-format:"@";';
    const numStyle='padding:5px 9px;border:1px solid #cbd5e1;vertical-align:middle;text-align:right;font-family:monospace;';
    let html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:11pt;}table{border-collapse:collapse;}</style></head><body>`;
    titleRows.forEach(tr=>{
      html+=`<p style="font-weight:bold;font-size:13pt;">${esc(tr)}</p>`;
    });
    html+=`<table><thead><tr>`;
    headerCols.forEach(h=>{ html+=`<th style="${thStyle}">${esc(h)}</th>`; });
    html+=`</tr></thead><tbody>`;
    dataRows.forEach(row=>{
      html+=`<tr>`;
      row.forEach((cell,ci)=>{
        const isNum=numericCols?numericCols.has(ci):(ci>=5&&cell!==''&&!isNaN(Number(String(cell))));
        if(isNum){
          html+=`<td style="${numStyle}">${esc(cell)}</td>`;
        } else {
          // Prefix with zero-width space trick và dùng mso-number-format:"@" để Excel không convert text
          html+=`<td style="${tdStyle}" x:str>${esc(String(cell??''))}</td>`;
        }
      });
      html+=`</tr>`;
    });
    html+=`</tbody></table></body></html>`;
    return html;
  };

  // ── EXPORT: xuất báo giá sàn hiện tại ──
  const exportFloorCSV=useCallback((histEntry)=>{
    const n=v=>v!=null&&v!==''?String(Math.round(Number(v))):'';
    const source=histEntry||{
      issuedDate:new Date().toLocaleDateString('vi-VN'),
      issuedTime:new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}),
      issuedBy:inputs.creator||'-',
      exchangeRate:inputs.exchangeRate,
      storageCostPct:inputs.storageCostPct??2,
      baseFinCostPct:inputs.baseFinCostPct??1.5,
      opsCostPct:inputs.opsCostPct,
      groups:mgmtData.filter(g=>g.skus>0).map(g=>({
        label:g.label,alloy:g.alloy,temper:g.temper,
        minThick:g.minThick,maxThick:g.maxThick,
        skus:g.skus,totalQty:g.totalQty,
        avgCost:g.avgCost,autoFloor:g.avgFloor,
        publishedFloor:g.publishedFloor||'',
        corePrice:g.corePrice,loyalPrice:g.loyalPrice,newPrice:g.newPrice,
        avgCompPrice:g.avgCompPrice,avgCompFloor:g.avgCompFloor,
      })),
    };
    const titles=[
      'BANG GIA SAN BAN HANH',
      `Ngay: ${source.issuedDate} ${source.issuedTime}  |  Nguoi lap: ${source.issuedBy}  |  Ty gia: ${source.exchangeRate}  |  LK: ${source.storageCostPct}%  CPTC: ${source.baseFinCostPct}%  HDKD: ${source.opsCostPct}%`,
    ];
    const headers=['Nhom hang','Mac','Temper','Day min','Day max','SKUs','Ton kho (kg)','BQ Gia von','San tu dong','San ban hanh','Cot loi','Than thiet','KH le','BQ Doi thu','San Doi thu'];
    const dataRows=source.groups.map(g=>[
      g.label,g.alloy,g.temper||'-',g.minThick,g.maxThick,
      g.skus,g.totalQty,
      n(g.avgCost),n(g.autoFloor),n(g.publishedFloor),
      n(g.corePrice),n(g.loyalPrice),n(g.newPrice),
      g.avgCompPrice>0?n(g.avgCompPrice):'-',
      g.avgCompFloor>0?n(g.avgCompFloor):'-',
    ]);
    // cols: 0=label(text),1=alloy(text),2=temper(text),3=minThick,4=maxThick,5=skus,6=qty,7..=prices
    const numericColsFloor=new Set([3,4,5,6,7,8,9,10,11,12,13,14]);
    const html=buildExcelHTML(titles,headers,dataRows,numericColsFloor);
    const blob=new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const fname=`GiaSan_${(source.issuedDate||'').replace(/\//g,'-')}_${(source.issuedTime||'').replace(/:/g,'')}.xls`;
    a.href=url;a.download=fname;a.click();
    URL.revokeObjectURL(url);
  },[mgmtData,inputs]);

  // ── EXPORT: Ban hành giá sàn PDF (III.5) ──
  const exportFloorPDF=useCallback((histEntry,signerName)=>{
    const source=histEntry||{
      issuedDate:new Date().toLocaleDateString('vi-VN'),
      issuedTime:new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}),
      issuedBy:signerName||inputs.creator||'—',
      groups:mgmtData.filter(g=>g.skus>0&&g.publishedFloor).map(g=>({
        label:g.label,publishedFloor:g.publishedFloor,
        corePrice:g.corePrice,loyalPrice:g.loyalPrice,newPrice:g.newPrice,
      })),
    };
    if(!source.groups||source.groups.length===0){
      alert('Chưa có nhóm nào có Sàn ban hành. Hãy nhập Sàn ban hành trước.');return;
    }
    const fvn=v=>v?new Intl.NumberFormat('vi-VN').format(Math.round(v)):'—';
    const rows=source.groups.map(g=>`
      <tr>
        <td style="text-align:left;padding:9px 14px;border:1px solid #ccc;font-weight:700;">${g.label||'—'}</td>
        <td style="text-align:right;padding:9px 14px;border:1px solid #ccc;font-weight:900;color:#1a3c6e;">${fvn(g.publishedFloor)}</td>
        <td style="text-align:right;padding:9px 14px;border:1px solid #ccc;color:#1d4ed8;">${fvn(g.corePrice)}</td>
        <td style="text-align:right;padding:9px 14px;border:1px solid #ccc;color:#7c3aed;">${fvn(g.loyalPrice)}</td>
        <td style="text-align:right;padding:9px 14px;border:1px solid #ccc;color:#ea580c;">${fvn(g.newPrice)}</td>
      </tr>`).join('');
    const html=`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
    <title>Giá Sàn Ban Hành ${source.issuedDate}</title>
    <style>
      @page{size:A4 portrait;margin:22mm 18mm;}
      *{box-sizing:border-box;}
      body{font-family:'Times New Roman',Times,serif;color:#000;font-size:12pt;background:#fff;margin:0;}
      .watermark{position:fixed;top:35%;left:5%;opacity:0.06;font-size:68pt;font-weight:900;color:#000;transform:rotate(-30deg);pointer-events:none;white-space:nowrap;letter-spacing:4px;}
      .header{text-align:center;margin-bottom:16px;border-bottom:2px solid #1a3c6e;padding-bottom:12px;}
      .company{font-size:11pt;font-weight:bold;color:#1a3c6e;letter-spacing:.04em;margin-bottom:3px;}
      .dept{font-size:10pt;color:#555;margin-bottom:8px;}
      .confidential{display:inline-block;background:#fee2e2;color:#991b1b;border:1.5px solid #fca5a5;padding:4px 16px;border-radius:4px;font-size:9pt;font-weight:bold;letter-spacing:.05em;margin-bottom:8px;}
      .doc-title{font-size:17pt;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#1a3c6e;}
      .doc-subtitle{font-size:10pt;color:#444;margin-top:5px;}
      .meta{border:1px solid #ccc;border-radius:4px;padding:10px 14px;margin-bottom:14px;font-size:10pt;line-height:2;background:#f9f9f9;}
      table{width:100%;border-collapse:collapse;font-size:11pt;margin-bottom:12px;}
      th{background:#1a3c6e;color:#fff;padding:10px 14px;border:1px solid #1a3c6e;font-weight:bold;}
      tr:nth-child(even) td{background:#f4f7fb;}
      td{border:1px solid #ccc;}
      .validity{margin-top:12px;font-size:9.5pt;color:#333;font-style:italic;border-left:3px solid #1a3c6e;padding:6px 10px;background:#f8fafc;}
      .sign-section{margin-top:48px;page-break-inside:avoid;}
      .sign-row{display:flex;justify-content:space-between;text-align:center;gap:20px;}
      .sign-box{flex:1;padding:0 10px;}
      .sign-title{font-weight:bold;font-size:11pt;margin-bottom:6px;border-bottom:1px solid #555;padding-bottom:4px;}
      .sign-note{font-size:9pt;color:#666;margin-bottom:80px;font-style:italic;}
      .sign-line{border-top:1px dotted #555;padding-top:5px;font-size:10pt;}
    </style></head><body>
    <div class="watermark">TÀI LIỆU NỘI BỘ</div>
    <div class="header">
      <div class="company">CÔNG TY TNHH THÉP H&amp;D</div>
      <div class="dept">PHÒNG KINH DOANH</div>
      <div><span class="confidential">🔒 TÀI LIỆU NỘI BỘ — KHÔNG ĐƯỢC TIẾT LỘ RA BÊN NGOÀI</span></div>
      <div class="doc-title">BẢNG GIÁ SÀN BAN HÀNH</div>
      <div class="doc-subtitle">Dành cho cán bộ kinh doanh nội bộ · Ngày ban hành: <strong>${source.issuedDate}</strong></div>
    </div>
    <div class="meta">
      <strong>Ngày ban hành:</strong> ${source.issuedDate} &nbsp;${source.issuedTime}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
      <strong>Người lập:</strong> ${source.issuedBy}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
      <strong>Phòng:</strong> Kinh doanh
    </div>
    <table>
      <thead><tr>
        <th style="text-align:left;min-width:160px;">Nhóm hàng</th>
        <th style="min-width:120px;">Sàn ban hành<br/><span style="font-size:8pt;font-weight:400;">(đ/kg)</span></th>
        <th style="min-width:120px;">A Group<br/><span style="font-size:8pt;font-weight:400;">(đ/kg)</span></th>
        <th style="min-width:120px;">B Group<br/><span style="font-size:8pt;font-weight:400;">(đ/kg)</span></th>
        <th style="min-width:120px;">C Group<br/><span style="font-size:8pt;font-weight:400;">(đ/kg)</span></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="validity">⚠ <strong>Hiệu lực:</strong> Báo giá này có hiệu lực đến khi có thông báo mới từ công ty. Mọi thay đổi về giá phải được Trưởng Phòng Kinh doanh phê duyệt bằng văn bản trước khi áp dụng.</div>
    <div class="sign-section">
      <div class="sign-row">
        <div class="sign-box">
          <div class="sign-title">Người lập</div>
          <div class="sign-note">(Ký, ghi rõ họ tên)</div>
          <div class="sign-line">${source.issuedBy||'&nbsp;'}</div>
        </div>
        <div class="sign-box">
          <div class="sign-title">Trưởng Phòng Kinh Doanh</div>
          <div class="sign-note">(Ký, ghi rõ họ tên, đóng dấu)</div>
          <div class="sign-line">&nbsp;</div>
        </div>
        <div class="sign-box">
          <div class="sign-title">Giám Đốc Phê Duyệt</div>
          <div class="sign-note">(Ký, ghi rõ họ tên, đóng dấu)</div>
          <div class="sign-line">&nbsp;</div>
        </div>
      </div>
    </div>
    </body></html>`;
    const w=window.open('','_blank','width=960,height=780');
    if(w){w.document.write(html);w.document.close();setTimeout(()=>{w.print();},700);}
  },[mgmtData,inputs]);

  // ── EXPORT: xuất toàn bộ lịch sử — 23 cột đúng thứ tự để paste vào GSheet ──
  const exportHistoryCSV=useCallback(()=>{
    if(floorHistory.length===0){alert('Chua co lich su nao.');return;}
    const n=v=>v!=null&&v!==''?String(Math.round(Number(v))):'';
    const titles=['LICH SU BAN HANH GIA SAN - PAKD 7.0'];
    // Đúng 23 cột theo thứ tự yêu cầu
    const headers=[
      'Ngày ban hành','Giờ','Người lập','Tỷ giá USD','LK%','CPTC%','HĐKD%',
      'Nhóm hàng','Mác','Temper','Dày min','Dày max','SKUs','Tồn kho (kg)',
      'BQ GV (đ/kg)','Sàn tự động (đ/kg)','Sàn ban hành (đ/kg)',
      'A Group (đ/kg)','B Group (đ/kg)','C Group (đ/kg)','BQ ĐT (đ/kg)','Sàn ĐT (đ/kg)'
    ];
    const dataRows=[];
    floorHistory.forEach(e=>{
      (e.groups||[]).forEach(g=>{
        dataRows.push([
          e.issuedDate||'',          // Ngày ban hành
          e.issuedTime||'',          // Giờ
          e.issuedBy||'',            // Người lập
          e.exchangeRate||'',        // Tỷ giá USD
          e.storageCostPct||'',      // LK%
          e.baseFinCostPct||'',      // CPTC%
          e.opsCostPct||'',          // HĐKD%
          g.label||'',               // Nhóm hàng
          g.alloy||'',               // Mác
          g.temper||'',              // Temper
          g.minThick||'',            // Dày min
          g.maxThick||'',            // Dày max
          g.skus||'',                // SKUs
          g.totalQty||'',            // Tồn kho (kg)
          n(g.avgCost),              // BQ GV (đ/kg)
          n(g.autoFloor),            // Sàn tự động (đ/kg)
          n(g.publishedFloor),       // Sàn ban hành (đ/kg)
          n(g.corePrice),            // A Group (đ/kg)
          n(g.loyalPrice),           // B Group (đ/kg)
          n(g.newPrice),             // C Group (đ/kg)
          g.avgCompPrice>0?n(g.avgCompPrice):'', // BQ ĐT (đ/kg)
          g.avgCompFloor>0?n(g.avgCompFloor):'', // Sàn ĐT (đ/kg)
        ]);
      });
    });
    // cols 0-9 = text (dates, names, alloy, temper...), cols 10+ = numeric
    const numericColsHist=new Set([3,4,5,6,10,11,12,13,14,15,16,17,18,19,20,21]);
    const html=buildExcelHTML(titles,headers,dataRows,numericColsHist);
	const blob=new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8;'});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `LichSuGiaSan_PAKD.xls`;
	a.click();
URL.revokeObjectURL(url);
  },[floorHistory]);
  const uniqueInvAlloys=[...new Set(inventory.map(r=>r.alloy))];
  const uniqueSpAlloys=[...new Set(sellingPrices.map(r=>r.alloy||'').filter(Boolean))];
  const uniqueFpAlloys=[...new Set(floorPriceData.map(r=>r.alloy))];
  const uniqueMsAlloys=[...new Set(minStockRows.map(r=>r.alloy))];

  const filteredInventory=useMemo(()=>inventory.filter(r=>{
    if(invFilter.status!=='ALL'&&r.status!==invFilter.status) return false;
    if(invFilter.alloy!=='ALL'&&r.alloy!==invFilter.alloy) return false;
    if(invFilter.coating!=='ALL'&&(r.coating||'KP')!==invFilter.coating) return false;
    if(invFilter.search){const s=invFilter.search.toLowerCase();if(!skuLabel(r).toLowerCase().includes(s)) return false;}
    if(invFilter.costMin!==''){const mn=parseFloat(String(invFilter.costMin).replace(/\./g,'').replace(/,/g,''));if(!isNaN(mn)&&(parseFloat(r.avgCost)||0)<mn) return false;}
    if(invFilter.costMax!==''){const mx=parseFloat(String(invFilter.costMax).replace(/\./g,'').replace(/,/g,''));if(!isNaN(mx)&&mx>0&&(parseFloat(r.avgCost)||0)>mx) return false;}
    if(invFilter.stockAlert!=='ALL'){
      const k=skuKey(r),ms=minStockMap[k]||0,mx=maxStockMap[k]||null;
      const grpQty=inventory.filter(x=>skuKey(x)===k).reduce((s,x)=>s+(parseFloat(x.qtyKg)||0),0);
      const ratio=ms>0?grpQty/ms:null;const isOver=mx!==null&&grpQty>mx;
      if(invFilter.stockAlert==='LOW'&&!(ratio!==null&&ratio<0.8&&!isOver)) return false;
      if(invFilter.stockAlert==='NEAR'&&!(ratio!==null&&ratio>=0.8&&ratio<1&&!isOver)) return false;
      if(invFilter.stockAlert==='OK'&&!(ratio===null||ratio>=1&&!isOver)) return false;
      if(invFilter.stockAlert==='EXCESS'&&!(ratio!==null&&ratio>2&&!isOver)) return false;
      if(invFilter.stockAlert==='OVER'&&!isOver) return false;
    }
    return true;
  }),[inventory,invFilter,minStockMap,maxStockMap]);

  // SỬA #5 (R6): Gom theo SKU — mỗi SKU 1 dòng (tổng kho + đang về), trừ PO nếu đang bật, lọc theo ngưỡng KL, sắp xếp giảm dần.
  const invSkuGrouped=useMemo(()=>{
    const groups=groupBySku(inventory);
    const minKg=parseFloat(String(invGroupMinKg).replace(/\./g,'').replace(/,/g,'.'))||0;
    const rows=groups.map(g=>{
      const stockKg=g.inStock.reduce((s,x)=>s+(parseFloat(x.qtyKg)||0),0);
      const transitKg=g.inTransit.reduce((s,x)=>s+(parseFloat(x.qtyKg)||0),0);
      const gross=stockKg+transitKg;
      const allItems=[...g.inStock,...g.inTransit];
      const avgCost=weightedAvg(allItems.map(x=>({qtyKg:parseFloat(x.qtyKg)||0,avgCost:parseFloat(x.avgCost)||0})));
      // trừ PO chưa giao (dùng chung cờ excludePO của tab Tồn kho)
      const poRem=excludePO?((poByKey[skuKeyNorm(g.inStock[0]||g.inTransit[0]||g)]||{}).remaining||0):0;
      const netStock=Math.max(stockKg-poRem,0);
      const netTransit=Math.max(transitKg-Math.max(poRem-stockKg,0),0);
      const net=netStock+netTransit;
      const k=g.key;const ms=minStockMap[k]||0;const mx=maxStockMap[k];
      return {...g,stockKg,transitKg,gross,netStock,netTransit,net,poCut:gross-net,avgCost,totalVND:net*avgCost,lines:allItems.length,minStock:ms,maxStock:mx};
    })
    // áp filter alloy/coating/search giống bảng chi tiết
    .filter(g=>{
      if(invFilter.alloy!=='ALL'&&g.alloy!==invFilter.alloy) return false;
      if(invFilter.coating!=='ALL'&&(g.coating||'KP')!==invFilter.coating) return false;
      if(invFilter.search){const s=invFilter.search.toLowerCase();if(!String(g.label||'').toLowerCase().includes(s)) return false;}
      if(g.net<minKg) return false;
      return true;
    })
    .sort((a,b)=>b.net-a.net);
    return rows;
  },[inventory,invGroupMinKg,invFilter.alloy,invFilter.coating,invFilter.search,excludePO,poByKey,minStockMap,maxStockMap]);

  const filteredMs=useMemo(()=>minStockRows.filter(r=>{
    if(msFilter.alloy!=='ALL'&&r.alloy!==msFilter.alloy) return false;
    if(msFilter.coating!=='ALL'&&(r.coating||'KP')!==msFilter.coating) return false;
    if(msFilter.search){const s=msFilter.search.toLowerCase();if(!skuLabel(r).toLowerCase().includes(s)) return false;}
    if(msFilter.stockAlert!=='ALL'){
      const k=skuKey(r);const grp=groupBySku(inventory).find(g=>g.key===k);
      const curQty=grp?[...grp.inStock,...grp.inTransit].reduce((s,x)=>s+(parseFloat(x.qtyKg)||0),0):0;
      const ratio=r.minStockKg>0?curQty/r.minStockKg:null;const mx=r.maxStockKg||null;const isOver=mx!==null&&curQty>mx;
      if(msFilter.stockAlert==='LOW'&&!(ratio!==null&&ratio<0.8&&!isOver)) return false;
      if(msFilter.stockAlert==='NEAR'&&!(ratio!==null&&ratio>=0.8&&ratio<1&&!isOver)) return false;
      if(msFilter.stockAlert==='OK'&&!(ratio===null||(ratio>=1&&!isOver))) return false;
      if(msFilter.stockAlert==='EXCESS'&&!(ratio!==null&&ratio>2&&!isOver)) return false;
      if(msFilter.stockAlert==='OVER'&&!isOver) return false;
    }
    if(msFilter.onlyBuyReq&&!(String(r.buyRequest||'').trim()!=='')) return false;
    return true;
  }),[minStockRows,msFilter,inventory]);
  const msBuyReqCount=useMemo(()=>minStockRows.filter(r=>String(r.buyRequest||'').trim()!=='').length,[minStockRows]);

  const filteredSP=useMemo(()=>sellingPrices.filter(r=>{
    if(spFilter.alloy!=='ALL'&&(r.alloy||'')!==spFilter.alloy) return false;
    if(spFilter.coating!=='ALL'&&(r.coating||'KP')!==spFilter.coating) return false;
    if(spFilter.search){const s=spFilter.search.toLowerCase();if(!`${r.alloy||''} ${r.temper||''} ${r.thickness||''} ${r.width||''} ${r.length||''}`.toLowerCase().includes(s)) return false;}
    return true;
  }),[sellingPrices,spFilter]);

  // SỬA #6 (R6): helper net stock/transit theo SKU sau khi trừ PO (nếu bật excludePOMs)
  const msNetQty=(r)=>{
    const k=skuKey(r);const grp=groupBySku(inventory).find(g=>g.key===k);
    const gS=grp?grp.inStock.reduce((ss,x)=>ss+(parseFloat(x.qtyKg)||0),0):0;
    const gT=grp?grp.inTransit.reduce((ss,x)=>ss+(parseFloat(x.qtyKg)||0),0):0;
    const po=excludePOMs?((poByKey[skuKeyNorm(r)]||{}).remaining||0):0;
    const nS=Math.max(gS-po,0);const nT=Math.max(gT-Math.max(po-gS,0),0);
    return {stock:nS,transit:nT,total:nS+nT};
  };
  const filtMsTotalKg=filteredMs.reduce((s,r)=>s+msNetQty(r).total,0);
  const filtMsTotalStock=filteredMs.reduce((s,r)=>s+msNetQty(r).stock,0);
  const filtMsTotalTransit=filteredMs.reduce((s,r)=>s+msNetQty(r).transit,0);
  const filtMsTotalMin=filteredMs.reduce((s,r)=>s+(parseFloat(r.minStockKg)||0),0);
  const filtMsTotalMax=filteredMs.reduce((s,r)=>s+(r.maxStockKg?parseFloat(r.maxStockKg):0),0);
  const filtMsDelta=filtMsTotalKg-filtMsTotalMin;
  // SỬA #1 (R6): Tổng 🛒 Đề xuất mua (cộng các giá trị số trong cột buyRequest) + đếm số mã có đề xuất.
  const filtMsTotalBuyReq=filteredMs.reduce((s,r)=>{const v=parseFloat(String(r.buyRequest||'').replace(/[^\d.,-]/g,'').replace(/\./g,'').replace(/,/g,'.'))||0;return s+v;},0);
  const filtMsBuyReqRows=filteredMs.filter(r=>String(r.buyRequest||'').trim()!=='').length;

  const bg1='#f8fafc',bg2='#ffffff',bg4='#f1f5f9';
  const border1='#e2e8f0',border2='#cbd5e1';

  const creditModeLabel=inputs.creditMode==='none'?'Không CN':inputs.creditMode==='fixed'?`CN ${inputs.finCostPct}%`:`CN ${inputs.customCreditDays}N`;

  // Helper: tính % so với BQ Giá vốn
  const pctVsGV=(price, gv)=>{
    if(!gv||gv<=0||!price) return null;
    return ((price-gv)/gv*100);
  };

  return(
    <div style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <datalist id="alloy-list">{ALLOYS.map(a=><option key={a} value={a}/>)}</datalist>
      <datalist id="temper-list">{TEMPERS.map(a=><option key={a} value={a}/>)}</datalist>
      <datalist id="thick-list">{THICKS.map(a=><option key={a} value={a}/>)}</datalist>
      <datalist id="width-list">{WIDTHS.map(a=><option key={a} value={a}/>)}</datalist>
      <datalist id="length-list">{LENGTHS.map(a=><option key={a} value={a}/>)}</datalist>

      {/* ═══════════════ 🔐 LOGIN GATE — Chặn app nếu chưa xác thực GitHub ═══════════════ */}
      {ghBlockedScreen&&!ghVerified&&(
        <div style={{position:'fixed',inset:0,background:'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',color:'#fff'}}>
          <div style={{background:'#fff',color:'#0f172a',borderRadius:14,padding:'34px 38px',maxWidth:520,width:'100%',boxShadow:'0 30px 80px rgba(0,0,0,0.5)'}}>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:'3rem',marginBottom:8}}>🔐</div>
              <h2 style={{fontWeight:900,fontSize:'1.3rem',color:'#0f172a',marginBottom:6}}>Xác thực GitHub bắt buộc</h2>
              <p style={{fontSize:'.84rem',color:'#475569',fontWeight:600,lineHeight:1.5}}>
                Để bảo vệ dữ liệu kinh doanh, app PAKD yêu cầu xác thực GitHub trước khi truy cập.<br/>
                <span style={{color:'#dc2626',fontWeight:700}}>Người không có Personal Access Token sẽ không thể xem dữ liệu.</span>
              </p>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:14}}>
              <div>
                <label className="lbl">GitHub Username (chủ repo)</label>
                <input type="text" className="inp" placeholder="vd: toolaihdsteel-commits" value={ghConfig.owner} onChange={e=>setGhConfig(p=>({...p,owner:e.target.value.trim()}))}/>
              </div>
              <div>
                <label className="lbl">Tên Repo</label>
                <input type="text" className="inp" placeholder="pakd-data" value={ghConfig.repo} onChange={e=>setGhConfig(p=>({...p,repo:e.target.value.trim()}))}/>
              </div>
              <div>
                <label className="lbl">Personal Access Token</label>
                <input type="password" className="inp" placeholder="github_pat_..." value={ghConfig.token} onChange={e=>setGhConfig(p=>({...p,token:e.target.value.trim()}))} style={{fontFamily:'JetBrains Mono',fontSize:'.78rem'}}/>
              </div>
            </div>
            <button className="btn btn-solid" disabled={ghVerifying||!ghConfig.token||!ghConfig.owner} onClick={async()=>{
              const ok=await verifyGithubToken(false);
              if(ok){saveGhConfig(ghConfig);}
            }} style={{width:'100%',padding:'12px',fontSize:'.92rem',fontWeight:900,justifyContent:'center'}}>
              {ghVerifying?'⏳ Đang xác thực...':'🔓 Xác thực & vào app'}
            </button>
            <div style={{marginTop:14,fontSize:'.68rem',color:'#64748b',background:'#f1f5f9',border:'1px solid #cbd5e1',borderRadius:6,padding:'9px 12px',lineHeight:1.6}}>
              💡 <strong>Chưa có token?</strong> Liên hệ chủ app (anh Huy) để được cấp.<br/>
              🔒 Token chỉ lưu trên máy này (localStorage), không gửi đi đâu khác ngoài GitHub.
            </div>
          </div>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <div className="screen-container" style={{background:bg2,borderBottom:`1px solid ${border1}`,padding:'8px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <div style={{background:'linear-gradient(135deg,#0d9488,#2563eb)',borderRadius:'7px',width:'30px',height:'30px',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:'15px',color:'#fff',fontFamily:'JetBrains Mono'}}>P</div>
          <div>
            <div style={{fontWeight:900,fontSize:'15px',letterSpacing:'-.02em',color:'#0f172a'}}>PAKD BUY <span style={{color:'#0d9488',fontFamily:'JetBrains Mono',fontSize:'12px'}}>7.0</span></div>
            <div style={{fontSize:'11px',color:'#475569',fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em'}}>Floor Price Engine v2</div>
          </div>
          <div style={{width:'1px',height:'24px',background:border1,margin:'0 4px'}}/>
          {[
            {k:'main',l:'📊 PAKD Mua'},
            {k:'inventory',l:'📦 Tồn kho'},
            {k:'minstock',l:'📏 Min/Max'},
            {k:'floor',l:'💹 Giá Sàn'},
            {k:'cashflow',l:'💰 Dòng Tiền'},
            {k:'po',l:poData.length>0?`📑 PO (${poData.length})`:'📑 PO đã ký'},
            {k:'floorhistory',l:'🗓️ Lịch sử Sàn'},
            {k:'report',l:limitsWarnings.totalAlerts>0?`📈 BC ⚠${limitsWarnings.totalAlerts}`:'📈 Báo cáo'},
          ].map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)} className={`nav-tab ${tab===t.k?'on':''}`}
              style={t.k==='report'&&limitsWarnings.totalAlerts>0?{color:'#dc2626',borderColor:'#fca5a5'}:t.k==='floor'&&tab!=='floor'?{color:'#0d9488'}:t.k==='cashflow'&&tab!=='cashflow'?{color:'#7c3aed'}:{}}>
              {t.l}
            </button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,background:bg4,border:`1px solid ${border1}`,borderRadius:5,padding:'3px 9px',fontSize:'.68rem',fontWeight:600}}>
            <Ic.Database/>
            {dbStatus.loading?<span style={{color:'#2563eb',display:'flex',alignItems:'center',gap:4,fontWeight:700}}><div className="spinner" style={{width:12,height:12}}/> Đang tải...</span>
              :dbStatus.error?<span style={{color:'#dc2626',fontWeight:700}} title={dbStatus.error}>⚠ Lỗi kết nối</span>
              :dbStatus.warn?<span style={{color:'#16a34a',fontWeight:700}} title={dbStatus.warn}>✓ {dbStatus.lastSync}{syncAgeLabel?` · ${syncAgeLabel}`:''}</span>
              :dbStatus.lastSync?<span style={{color:'#16a34a',fontWeight:700}} title={`Đồng bộ GSheet lúc ${dbStatus.lastSync}`}>✓ {dbStatus.lastSync}{syncAgeLabel?` · ${syncAgeLabel}`:''}</span>
              :<span style={{color:'#475569',fontWeight:700}}>Local</span>}
            <button onClick={()=>syncGoogleSheet('all')} disabled={dbStatus.loading||!ghVerified} className="btn btn-ghost" style={{padding:'1px 6px',fontSize:'.65rem',gap:3,marginLeft:2}}><Ic.Refresh/> Sync All</button>
          </div>
          {result&&<span className={`tag ${result.rec.cls}`}>{result.rec.txt}</span>}
          {result&&<span className={`tag ${result.containerOk?'tg':result.totalContainer<24?'tr':'ty'}`}>📦 {result.totalContainer.toFixed(1)}T</span>}
          {result&&result.hasLowStock&&<span className="tag tr pulse"><Ic.Alert/> Thiếu hàng</span>}
          {limitsWarnings.totalAlerts>0&&<span className="tag tr pulse"><Ic.Alert/> {limitsWarnings.totalAlerts} CB</span>}
          <button className="btn btn-success btn-sm" onClick={saveScenario}><Ic.Save/> Lưu</button>
          {/* Cấu hình GitHub chung — dùng cho mọi tính năng cloud (PA, Giá sàn, ...) */}
          <button className="btn btn-ghost btn-sm" onClick={()=>setGhStatus(p=>({...p,configOpen:true}))} title={ghVerified?`✓ GitHub: ${ghUser?.login||'?'} — Click để chỉnh cấu hình`:'Cấu hình kết nối GitHub'} style={{padding:'4px 9px',fontSize:'.72rem',background:ghVerified?'#dcfce7':'#fee2e2',border:`1px solid ${ghVerified?'#86efac':'#fca5a5'}`,color:ghVerified?'#14532d':'#991b1b'}}>
            {ghVerified?`✓ GitHub: ${ghUser?.login||'?'}`:'⚠️ Chưa xác thực GitHub'}
          </button>
        </div>
      </div>

      {/* ═══ BODY ═══ */}
      <div className="screen-container" style={{flex:1,display:'flex',minHeight:0,overflow:'hidden'}}>

        {/* ════ TAB MAIN ════ */}
        {tab==='main'&&(
          <div style={{display:'flex',width:'100%',height:'100%',minHeight:0}}>
            {/* LEFT — Thông số + P&L summary */}
            <div style={{width:'242px',flexShrink:0,background:bg2,borderRight:`1px solid ${border1}`,overflowY:'auto',padding:'10px',display:'flex',flexDirection:'column',gap:'8px'}}>
              {/* Thông số nhập khẩu */}
              <div className="card">
                <div className="sh"><Ic.Ship/>Thông số nhập khẩu</div>
                <label className="lbl" style={{color:'#1d4ed8'}}>Tỷ giá USD/VND</label>
                <input className="inp mono" placeholder="⚠ Nhập tỷ giá..." style={{fontSize:'1.05rem',fontWeight:800,color:'#1d4ed8',textAlign:'right',marginBottom:inputs.exchangeRate>0?9:3,border:inputs.exchangeRate>0?undefined:'1.5px solid #f59e0b',background:inputs.exchangeRate>0?undefined:'#fffbeb'}} value={inputs.exchangeRate>0?fv(inputs.exchangeRate):''} onChange={e=>setInp('exchangeRate',pn(e.target.value))}/>
                {!(inputs.exchangeRate>0)&&<div style={{fontSize:'.62rem',color:'#b45309',fontWeight:700,marginBottom:9,lineHeight:1.4}}>⚠ Vui lòng nhập tỷ giá USD/VND để tính toán</div>}
                <div style={{marginBottom:7}}><label className="lbl" style={{color:'#6d28d9'}}>CP về kho %</label><input type="number" step=".1" className="inp inp-xs mono" style={{color:'#6d28d9',fontWeight:700}} value={inputs.managementFee} onChange={e=>setInp('managementFee',parseFloat(e.target.value)||0)}/></div>
                <div style={{display:'flex',gap:'5px',marginBottom:6}}>
                  {['TT','LC'].map(m=><button key={m} className={`status-btn ${inputs.paymentMethod===m?(m==='TT'?'s-stock':'s-transit'):'off'}`} onClick={()=>setInp('paymentMethod',m)}>{m==='TT'?'T/T':'L/C'}</button>)}
                </div>
                {inputs.paymentMethod==='LC'&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'4px',background:bg4,padding:'7px',borderRadius:'4px',border:`1px solid ${border1}`}}>
                    <div><label className="lbl">Margin%</label><input type="number" className="inp inp-xs font-semibold" value={inputs.lcMargin} onChange={e=>setInp('lcMargin',parseFloat(e.target.value)||0)}/></div>
                    <div><label className="lbl">Days</label><input type="number" className="inp inp-xs font-semibold" value={inputs.lcDays} onChange={e=>setInp('lcDays',parseInt(e.target.value)||0)}/></div>
                    <div><label className="lbl">Int%</label><input type="number" step=".1" className="inp inp-xs font-semibold" value={inputs.lcInterest} onChange={e=>setInp('lcInterest',parseFloat(e.target.value)||0)}/></div>
                  </div>
                )}
                {/* SỬA #1 (R7): NCC + Phương thức thanh toán NCC (nhập tay) + Thời gian giao hàng (hiển thị) */}
                <div style={{marginTop:8,borderTop:`1px dashed ${border1}`,paddingTop:7,display:'flex',flexDirection:'column',gap:6}}>
                  <div><label className="lbl" style={{color:'#0f766e'}}>🏭 Nhà cung cấp</label><input className="inp inp-xs" style={{fontWeight:700,color:'#0f766e'}} placeholder="Nhập tên NCC…" value={inputs.supplierName||''} onChange={e=>setInp('supplierName',e.target.value)}/></div>
                  <div><label className="lbl" style={{color:'#9333ea'}}>💳 Phương thức thanh toán (NCC)</label><input className="inp inp-xs" style={{fontWeight:700,color:'#7c3aed'}} placeholder="VD: T/T 30% trước, 70% sau 60 ngày…" value={inputs.supplierPaymentTerms||''} onChange={e=>setInp('supplierPaymentTerms',e.target.value)}/></div>
                  <div>
                    <label className="lbl" style={{color:'#1e40af'}}>🚢 Thời gian giao hàng (tuần Cont về)</label>
                    <div className="inp inp-xs mono" style={{fontWeight:800,color:'#1e40af',background:'#eff6ff',border:'1px solid #bfdbfe',display:'flex',alignItems:'center'}} title="Lấy theo 'Tuần Cont về' ở thanh công cụ (dùng tính dòng tiền) — chỉ hiển thị">{cfMode==='manual'&&cfManualWeek?cfManualWeek:getCurrentWeekLabel()}</div>
                  </div>
                </div>
                {/* II.5: Invoice, QL, CP TC summary */}
                {result&&(
                  <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4}}>
                    {[{l:'Invoice',v:result.invoiceVND,c:'#334155'},{l:`CP về kho ${inputs.managementFee}%`,v:result.mgmt,c:'#6d28d9'},{l:'CP TC',v:result.finVND,c:'#b91c1c'}].map((x,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:bg4,border:`1px solid ${border1}`,borderRadius:4,padding:'3px 8px'}}>
                        <span style={{fontSize:'.65rem',color:'#475569',fontWeight:700}}>{x.l}</span>
                        <span className="mono" style={{fontSize:'.72rem',fontWeight:800,color:x.c}}>{fv(x.v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Container */}
              {result&&(
                <div style={{background:bg4,border:`1px solid ${result.containerOk?'#bbf7d0':result.totalContainer<24?'#fca5a5':'#fde047'}`,borderRadius:6,padding:'7px 11px'}}>
                  <div style={{fontSize:'.65rem',color:'#1e293b',fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Container</div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div className="mono" style={{fontSize:'1.3rem',fontWeight:900,color:result.containerOk?'#15803d':result.totalContainer<24?'#b91c1c':'#b45309'}}>{result.totalContainer.toFixed(2)}<span style={{fontSize:'.65rem',color:'#475569',marginLeft:3}}>T</span></div>
                    <span className={`tag ${result.containerOk?'tg':result.totalContainer<24?'tr':'ty'}`}>{result.containerOk?'✓ ĐỦ':result.totalContainer<24?'THIẾU':'DƯ'}</span>
                  </div>
                  <div style={{marginTop:5}}><div className="stock-bar" style={{height:6}}><div className="stock-bar-fill" style={{width:`${Math.min((result.totalContainer/26.5)*100,100)}%`,background:result.containerOk?'#16a34a':result.totalContainer<24?'#dc2626':'#d97706'}}/></div></div>
                </div>
              )}

              {/* II.2: Lợi nhuận + Chart */}
              {result?(
                <>
                  <div style={{background:result.totalGrossProfit>0?'#f0fdf4':result.totalGrossProfit<0?'#fef2f2':'#eff6ff',border:`1px solid ${result.totalGrossProfit>0?'#86efac':result.totalGrossProfit<0?'#fca5a5':'#bfdbfe'}`,borderRadius:8,padding:'10px 11px',textAlign:'center'}}>
                    <div style={{fontSize:'.63rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5,display:'flex',alignItems:'center',justifyContent:'center',gap:4,color:result.totalGrossProfit>0?'#14532d':result.totalGrossProfit<0?'#7f1d1d':'#1e3a8a'}}><Ic.Money/> Lợi nhuận Đơn Hàng</div>
                    {result.allPriced?(
                      <>
                        <div className="mono" style={{fontSize:'1.3rem',fontWeight:900,color:result.totalGrossProfit>=0?'#15803d':'#b91c1c',lineHeight:1.1}}>{result.totalGrossProfit>=0?'+':''}{fv(result.totalGrossProfit)}</div>
                        <div style={{fontSize:'.68rem',color:'#475569',fontWeight:600,marginTop:2}}>đ · toàn bộ lô</div>
                        {(()=>{const pct=result.avgProfitPerKg!=null&&result.globalAvgAfter>0?(result.avgProfitPerKg/result.globalAvgAfter*100):null;return pct!=null?(
                          <div style={{fontSize:'.72rem',fontWeight:800,marginTop:3,color:pct>=0?'#15803d':'#b91c1c'}}>{pct>=0?'+':''}{pct.toFixed(2)}% Lãi/GV BQ</div>
                        ):null;})()}
                        <div style={{display:'flex',gap:5,justifyContent:'center',marginTop:6}}>
                          <div style={{textAlign:'center',background:'#fff',border:'1px solid #cbd5e1',borderRadius:5,padding:'4px 8px'}}>
                            <div style={{fontSize:'.57rem',color:'#475569',fontWeight:700}}>BQ lãi/kg</div>
                            <div className="mono" style={{fontSize:'.78rem',fontWeight:800,color:result.avgProfitPerKg>=0?'#15803d':'#b91c1c'}}>{result.avgProfitPerKg>=0?'+':''}{fv(result.avgProfitPerKg)}đ</div>
                          </div>
                        </div>
                      </>
                    ):<div style={{padding:'6px 0'}}><div style={{fontSize:'.78rem',color:'#b45309',fontWeight:800}}>Chưa đủ giá bán</div></div>}
                  </div>
                  <div className="chart-box" style={{height:155}}>
                    <div style={{fontSize:'.63rem',color:'#334155',fontWeight:800,textTransform:'uppercase',marginBottom:3}}>Về kho · GV BQ sau nhập · Giá bán KH</div>
                    <canvas ref={chartRef} style={{height:130}}></canvas>
                  </div>
                </>
              ):<div style={{textAlign:'center',padding:'30px 10px',color:'#64748b',fontSize:'.78rem',fontWeight:600}}>Nhập lô hàng để xem P&L</div>}
            </div>

            {/* CENTER — Lô hàng + SKU cards + Giá bán */}
            <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',background:bg1}}>
              {/* Toolbar */}
              <div style={{padding:'7px 11px',borderBottom:`1px solid ${border1}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:bg2}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                  <Ic.Ship/><span style={{fontWeight:800,fontSize:'.86rem',color:'#0f172a'}}>Lô hàng dự định mua</span>
                  <span className="tag tb">{products.length} SKU</span>
                  {result&&<span className="tag ts mono">{fv(result.totalKg)} kg</span>}
                  {result&&<span className="tag ty mono">{fu(result.invoiceUSD)}</span>}
                  {/* ─── Chọn tuần Cont về (thanh toán) — dùng cho In A4 & tab Dòng Tiền ─── */}
                  <span style={{width:1,height:18,background:'#cbd5e1',margin:'0 2px'}}/>
                  <div style={{display:'flex',alignItems:'center',gap:5,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'3px 8px'}} title="Tuần Container về cần thanh toán — dùng để In A4 dòng tiền & phân tích tab Dòng Tiền">
                    <span style={{fontSize:'.68rem',fontWeight:800,color:'#1e40af'}}>🚢 Tuần Cont về:</span>
                    <div style={{display:'flex',border:'1px solid #93c5fd',borderRadius:5,overflow:'hidden',background:'#fff'}}>
                      <button onClick={()=>setCFMode('auto')} style={{padding:'2px 8px',fontSize:'.66rem',fontWeight:800,border:'none',background:cfMode==='auto'?'#2563eb':'transparent',color:cfMode==='auto'?'#fff':'#1d4ed8',cursor:'pointer'}}>Tuần này</button>
                      <button onClick={()=>setCFMode('manual')} style={{padding:'2px 8px',fontSize:'.66rem',fontWeight:800,border:'none',background:cfMode==='manual'?'#7c3aed':'transparent',color:cfMode==='manual'?'#fff':'#7c3aed',cursor:'pointer'}}>Chọn tuần</button>
                    </div>
                    {cfMode==='manual'?(
                      <select className="inp inp-xs" style={{width:'auto',minWidth:110,padding:'2px 4px',fontSize:'.68rem'}} value={cfManualWeek} onChange={e=>setCFManualWeek(e.target.value)}>
                        <option value="">-- Chọn --</option>
                        {[...new Set(cashFlowData.map(r=>r.tuan).filter(t=>t&&String(t).trim()!==''))].map(w=><option key={w} value={w}>{w}</option>)}
                      </select>
                    ):(
                      <span className="tag tb mono" style={{fontSize:'.66rem',padding:'1px 6px'}}>{getCurrentWeekLabel()}</span>
                    )}
                    {cashFlowData.length===0&&<span title="Chưa sync dữ liệu dòng tiền — vào tab Dòng Tiền nhấn Sync CF" style={{fontSize:'.62rem',color:'#b45309',fontWeight:700}}>⚠ chưa sync</span>}
                  </div>
                </div>
                <div style={{display:'flex',gap:5,alignItems:'center'}}>
                  <button className="btn btn-ghost btn-xs" style={{background:'#eff6ff',border:'1px solid #93c5fd',color:'#1d4ed8'}}
                    onClick={()=>setProducts(prev=>prev.map(p=>{
                      const thick=parseFloat(p.thickness)||0;
                      const match=updatedImportPrices.find(u=>u.alloy===p.alloy&&u.temper===p.temper&&thick>=(parseFloat(u.minThick)||0)&&thick<=(parseFloat(u.maxThick)||999));
                      if(match&&match.priceFC>0) return{...p,priceFC:match.priceFC};
                      if(!p.thickness||!p.temper){const fallback=updatedImportPrices.find(u=>u.alloy===p.alloy&&(!p.temper||u.temper===p.temper));if(fallback&&fallback.priceFC>0) return{...p,priceFC:fallback.priceFC};}
                      return p;
                    }))}
                    title="Đồng bộ Giá CIF từ GSheet">🔄 Đồng bộ CIF</button>
                  <button className="btn btn-ghost btn-sm" onClick={addProduct}><Ic.Plus/> Thêm SKU</button>
                  {/* ─── Cloud PA ─── (chỉ thuộc tab PAKD Mua) */}
                  <span style={{width:1,height:18,background:'#cbd5e1',margin:'0 4px'}}/>
                  <button className="btn btn-ghost btn-sm" onClick={savePALocal} title="Lưu nháp PA trên máy này (không cần GitHub)" style={{padding:'4px 9px',fontSize:'.72rem',background:'#f1f5f9',border:'1px solid #cbd5e1'}}>💾 Lưu Local</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setDraftModalOpen(true)} title="Mở danh sách bản nháp đã lưu trên máy" style={{padding:'4px 9px',fontSize:'.72rem',background:'#f1f5f9',border:'1px solid #cbd5e1'}}>📁 Nháp Local{localDrafts.length>0?` (${localDrafts.length})`:''}</button>
                  <button className="btn btn-purple btn-sm" onClick={submitPAToGithub} disabled={ghStatus.loading||!ghConfig.token} title={ghConfig.token?'Trình duyệt PA — gửi vào luồng duyệt, ký bước 1':'Cần cấu hình GitHub trước (nút ⚙️ GitHub ở header)'} style={{padding:'4px 9px',fontSize:'.72rem'}}>
                    {ghStatus.loading?<div className="spinner" style={{width:11,height:11}}/>:'📤'} Trình duyệt
                  </button>
                  <button className="btn btn-teal btn-sm" onClick={listPAsFromGithub} disabled={ghStatus.loading||!ghConfig.token} title={ghConfig.token?'Xem luồng duyệt Mua (chờ duyệt + đã duyệt), duyệt bằng PIN':'Cần cấu hình GitHub trước'} style={{padding:'4px 9px',fontSize:'.72rem'}}>
                    🔄 Luồng duyệt mua
                  </button>
                  <span style={{width:1,height:18,background:'#cbd5e1',margin:'0 4px'}}/>
                  <button className="btn btn-solid btn-sm" onClick={()=>window.print()} title="In Phương án mua hàng ra giấy A4" style={{padding:'4px 9px',fontSize:'.72rem'}}><Ic.Print/> In A4</button>
                </div>
              </div>

              {/* Lô hàng dự định mua — cố định ~350px, cuộn tbody khi >5 SKU */}
              <div style={{flexShrink:0,background:bg2,borderBottom:`1px solid ${border1}`}}>
                {/* thead cố định */}
                <div style={{padding:'5px 11px 0'}}>
                  <table className="tbl" style={{tableLayout:'fixed',width:'100%'}}>
                    <colgroup>
                      <col style={{width:24}}/>
                      <col/>
                      <col style={{width:95}}/>
                      <col style={{width:90}}/>
                      <col style={{width:88}}/>
                      <col style={{width:95}}/>
                      <col style={{width:28}}/>
                    </colgroup>
                    <thead><tr>
                      <th style={{width:24}}>#</th>
                      <th style={{textAlign:'left',paddingLeft:4}}>SKU</th>
                      <th style={{width:95}}>KL kg</th>
                      <th style={{width:90}}>Giá CIF<div style={{fontSize:'.5rem',fontWeight:600,opacity:.8}}>USD/T</div></th>
                      <th style={{width:88}}>Invoice USD</th>
                      <th style={{width:95}}>Về kho đ/kg</th>
                      <th style={{width:28}}></th>
                    </tr></thead>
                  </table>
                </div>
                {/* tbody — scroll vùng này, chiều cao cố định ~5 dòng */}
                <div style={{height:205,overflowY:'auto',padding:'0 11px'}}>
                  <table className="tbl" style={{tableLayout:'fixed',width:'100%'}}>
                    <colgroup>
                      <col style={{width:24}}/>
                      <col/>
                      <col style={{width:95}}/>
                      <col style={{width:90}}/>
                      <col style={{width:88}}/>
                      <col style={{width:95}}/>
                      <col style={{width:28}}/>
                    </colgroup>
                    <tbody>
                      {products.map((p,i)=>{
                        const veKho=p.priceFC>0&&inputs.exchangeRate>0
                          ?(p.priceFC*inputs.exchangeRate*(1+(inputs.managementFee||0)/100))/1000
                          :null;
                        return(
                          <tr key={p.id}>
                            <td style={{textAlign:'center',color:'#475569',fontSize:'.72rem',fontWeight:'bold'}} className="mono">{i+1}</td>
                            <td style={{paddingLeft:4}}><SkuSel row={p} onChange={patch=>setProduct(p.id,patch)}/></td>
                            <td><input className="inp inp-xs mono" style={{textAlign:'right',color:'#15803d',fontWeight:700}} value={fv(p.qtyKg)} onChange={e=>setProduct(p.id,{qtyKg:pn(e.target.value)})}/></td>
                            <td><input type="number" className="inp inp-xs mono" style={{textAlign:'right',color:'#b45309',fontWeight:700}} value={p.priceFC} onChange={e=>setProduct(p.id,{priceFC:parseFloat(e.target.value)||0})}/></td>
                            <td className="mono" style={{textAlign:'right',paddingRight:5,color:'#1e293b',fontWeight:700,fontSize:'.76rem'}}>{fu((p.qtyKg/1000)*p.priceFC)}</td>
                            <td style={{textAlign:'right',paddingRight:5}}>
                              {veKho?<span className="mono" style={{fontSize:'.8rem',fontWeight:700,color:'#15803d'}}>{fv(veKho)}</span>:<span style={{color:'#64748b'}}>—</span>}
                            </td>
                            <td><button className="btn-danger" onClick={()=>delProduct(p.id)}><Ic.X/></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* tfoot TỔNG/BQ — luôn hiển thị bên dưới */}
                {result&&(
                  <div style={{padding:'0 11px 5px',borderTop:`1px solid ${border1}`}}>
                    <table className="tbl" style={{tableLayout:'fixed',width:'100%'}}>
                      <colgroup>
                        <col style={{width:24}}/>
                        <col/>
                        <col style={{width:95}}/>
                        <col style={{width:90}}/>
                        <col style={{width:88}}/>
                        <col style={{width:95}}/>
                        <col style={{width:28}}/>
                      </colgroup>
                      <tfoot><tr>
                        <td colSpan={2} style={{textAlign:'right',color:'#1e293b',fontSize:'.68rem',paddingRight:7}}>TỔNG / BQ</td>
                        <td className="mono" style={{textAlign:'right',paddingRight:5,color:'#15803d',fontSize:'.8rem'}}>{fv(result.totalKg)}</td>
                        <td/>
                        <td className="mono" style={{textAlign:'right',paddingRight:5,color:'#b45309',fontSize:'.8rem'}}>{fu(result.invoiceUSD)}</td>
                        <td className="mono" style={{textAlign:'right',paddingRight:5,color:'#1d4ed8',fontSize:'.8rem'}}>
                          {(()=>{
                            const totalKgProd=products.reduce((s,p)=>s+p.qtyKg,0);
                            const bqVeKho=totalKgProd>0?products.reduce((s,p)=>{
                              const vk=p.priceFC>0&&inputs.exchangeRate>0?(p.priceFC*inputs.exchangeRate*(1+(inputs.managementFee||0)/100))/1000:0;
                              return s+p.qtyKg*vk;
                            },0)/totalKgProd:0;
                            return bqVeKho>0?fv(bqVeKho)+' avg':'—';
                          })()}
                        </td>
                        <td/>
                      </tr></tfoot>
                    </table>
                  </div>
                )}
              </div>

             {/* SKU Cards - Bây giờ chiếm toàn bộ chiều rộng cột giữa */}
              <div style={{flex:1,overflowY:'auto',padding:'12px 14px'}}>
                {result?.blends?.length>0?(
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(285px,1fr))',gap:'10px'}}>
                    {result.blends.map((b,i)=>{
                      const minKg=b.minStock||0;
                      const maxKg=b.maxStock||null;
                      const curQtyAfter=b.qtyAfter||0;
                      const minRatio=minKg>0?curQtyAfter/minKg:null;
                      const isOverMax=maxKg!==null&&curQtyAfter>maxKg;
                      const minDelta=minKg>0?curQtyAfter-minKg:null;
                      const poInfo=poByKey[skuKeyNorm(b)];
                      const poRem=poInfo?poInfo.remaining:0;
                      const poList=poInfo?[...new Set(poInfo.pos.map(x=>x.po))]:[];
                      return(
                      <div key={b.skuKey+i} className={`sku-card ${isOverMax?'alert-over':b.isRisk?'warn':b.stockStatus==='LOW'?'alert-low':''}`}>
                        
                        {/* 1. Header: Tên mác và Quy cách */}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                          <div>
                            {/* Cỡ chữ cũ .83rem -> Tăng lên .95rem */}
                            <div style={{fontWeight:800,fontSize:'.95rem',color:'#0f172a'}}>{b.alloy} {b.temper}</div>
                            {/* Cỡ chữ cũ .65rem -> Tăng lên .75rem */}
                            <div style={{fontSize:'.75rem',color:'#334155',marginTop:2,fontWeight:600,fontFamily:'JetBrains Mono'}}>{b.thickness}×{b.width}×{b.length} {b.coating==='1E'?'[PE]':'[—]'}</div>
                          </div>
                          <div style={{display:'flex',gap:4,flexDirection:'column',alignItems:'flex-end'}}>
                            {/* Cỡ chữ Tags tăng từ .63rem -> .7rem */}
                            {b.hasSellPrice
                              ?<span className={`tag ${b.isRisk?'tr':b.realProfitPerKg>0?'tg':'ty'}`} style={{fontSize:'.7rem', padding:'3px 8px'}}>{b.isRisk?'⚠ LỖ':b.realProfitPerKg>0?'✓ LÃI':'≈ HÒA'}</span>
                              :<span className="tag ts" style={{fontSize:'.7rem', padding:'3px 8px'}}>Chưa có giá</span>}
                            {isOverMax&&<span className="tag tp pulse" style={{fontSize:'.7rem', padding:'3px 8px'}}>🟣 QUÁ MAX</span>}
                            {!isOverMax&&b.stockStatus==='LOW'&&<span className="tag to pulse" style={{fontSize:'.7rem', padding:'3px 8px'}}><Ic.Alert/> THIẾU MIN</span>}
                            {poRem>0&&<span className="tag" style={{fontSize:'.66rem',padding:'2px 7px',background:'#f3e8ff',color:'#6d28d9',border:'1px solid #d8b4fe',fontWeight:800}} title={'Đang nằm trong PO: '+poList.join(', ')}>📑 PO −{fv(poRem)}kg</span>}
                          </div>
                        </div>
                        
                        {/* 2. Box 3 Trạng thái kho */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px',marginBottom:8}}>
                          {[
                            {ico:'🟢',lbl:'Trong kho',qty:b.qtyStock,avg:b.avgStock,bg:'#f0fdf4',br:'#bbf7d0',vc:'#16a34a',ac:'#15803d'},
                            {ico:'🟡',lbl:'Đang về',qty:b.qtyTransit,avg:b.avgTransit,bg:'#fefce8',br:'#fef08a',vc:'#d97706',ac:'#b45309'},
                            {ico:'🔵',lbl:'Lô mới',qty:b.qtyKg,avg:b.veKhoPerKg,bg:'#eff6ff',br:'#bfdbfe',vc:'#2563eb',ac:'#1d4ed8'},
                          ].map((x,j)=>(
                            <div key={j} style={{background:x.bg,border:`1px solid ${x.br}`,borderRadius:5,padding:'6px 8px'}}>
                              {/* Cỡ chữ Tiêu đề: .58rem -> .68rem */}
                              <div style={{fontSize:'.68rem',color:x.ac,fontWeight:800,marginBottom:3}}>{x.ico} {x.lbl}</div>
                              {/* Cỡ chữ Số lượng kg: .78rem -> .9rem */}
                              <div className="mono" style={{fontSize:'.9rem',fontWeight:700,color:x.vc}}>{fv(x.qty)}<span style={{fontSize:'.65rem',marginLeft:2}}>kg</span></div>
                              {/* Cỡ chữ Giá vốn: .65rem -> .75rem */}
                              <div className="mono" style={{fontSize:'.75rem',color:x.ac,fontWeight:600,marginTop:2}}>{fv(x.avg)}</div>
                            </div>
                          ))}
                        </div>
                        
                        {/* 3. Box Tính toán Giá vốn BQ */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px',marginBottom:8}}>
                          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:5,padding:'5px 8px'}}>
                            <div style={{fontSize:'.65rem',color:'#475569',fontWeight:700}}>GV BQ HT</div>
                            <div className="mono" style={{fontSize:'.85rem',fontWeight:800,color:'#15803d',marginTop:2}}>{fv(b.avgCurrent)}</div>
                          </div>
                          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:5,padding:'5px 8px'}}>
                            <div style={{fontSize:'.65rem',color:'#475569',fontWeight:700}}>GV BQ sau nhập</div>
                            <div className="mono" style={{fontSize:'.85rem',fontWeight:800,color:'#1d4ed8',marginTop:2}}>{fv(b.avgAfter)}</div>
                          </div>
                          <div style={{background:b.hasSellPrice&&b.realProfitPerKg!=null&&b.realProfitPerKg>=0?'#f0fdf4':'#fef2f2',border:'1px solid #cbd5e1',borderRadius:5,padding:'5px 8px'}}>
                            <div style={{fontSize:'.65rem',color:'#475569',fontWeight:700}}>VNĐ/Kg</div>
                            <div className="mono" style={{fontSize:'.85rem',fontWeight:800,color:!b.hasSellPrice?'#94a3b8':b.realProfitPerKg>=0?'#15803d':'#b91c1c',marginTop:2}}>
                              {b.hasSellPrice?(b.realProfitPerKg>=0?'+':'')+fv(b.realProfitPerKg):'—'}
                            </div>
                          </div>
                        </div>
                        
                        {/* 4. Thanh trạng thái Min/Max */}
                        {minKg>0&&(
						  <div style={{marginBottom:8,background:'#f8fafc',borderRadius:5,padding:'5px 8px',border:'1px solid #e2e8f0'}}>
							<div style={{display:'flex',justifyContent:'space-between',fontSize:'.68rem',color:'#475569',fontWeight:700,marginBottom:4}}>
							  <span>Tồn sau nhập: {fv(curQtyAfter)} kg <span style={{color:'#94a3b8', fontSize:'.62rem', fontWeight:600}}>(Min: {fv(minKg)})</span></span>
							  <span style={{color:isOverMax?'#6d28d9':minRatio!==null&&minRatio<0.8?'#dc2626':minRatio!==null&&minRatio<1?'#d97706':'#15803d',fontWeight:800}}>
                                {isOverMax?`▲ quá max ${fv(curQtyAfter-(maxKg||0))}kg`:minDelta!=null?(minDelta>=0?`▲ dư +${fv(minDelta)}kg`:`▼ thiếu ${fv(Math.abs(minDelta))}kg`):''}
                              </span>
                            </div>
                            <div className="stock-bar" style={{height:5}}>
                              <div className="stock-bar-fill" style={{width:`${Math.min((minRatio||0)*100,100)}%`,background:isOverMax?'#7c3aed':minRatio<0.8?'#dc2626':minRatio<1?'#d97706':'#16a34a'}}/>
                            </div>
                          </div>
                        )}
                        
                        {/* 5. Box Tổng kết Lãi/Lỗ dưới cùng */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px',background:bg4,borderRadius:5,padding:'8px 10px',border:`1px solid ${border1}`}}>
                          <div>
                            <div style={{fontSize:'.68rem',color:'#475569',fontWeight:700,marginBottom:2}}>Tổng lãi lô</div>
                            <div className="mono" style={{fontSize:'1rem',fontWeight:900,color:!b.hasSellPrice?'#64748b':b.grossProfitVND>=0?'#15803d':'#b91c1c'}}>{b.hasSellPrice?(()=>{const v=b.grossProfitVND;const sign=v>=0?'+':'';const abs=Math.abs(v);return abs>=1e9?sign+(abs/1e9).toFixed(1)+' tỷ':abs>=1e6?sign+(abs/1e6).toFixed(1)+' tr':sign+fv(v);})():'—'}</div>
                          </div>
                          <div style={{textAlign:'center'}}>
                            <div style={{fontSize:'.68rem',color:'#475569',fontWeight:700,marginBottom:2}}>Giá sàn</div>
                            {b.hasSellPrice?<div className="mono" style={{fontSize:'1rem',fontWeight:800,color:'#15803d'}}>{fv(b.sellPrice)}</div>:<div style={{fontSize:'.75rem',color:'#64748b',fontStyle:'italic'}}>→ Lấy từ Sàn BH</div>}
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:'.68rem',color:'#475569',fontWeight:700,marginBottom:2}}>% Lãi/BQSN</div>
                            <div className="mono" style={{fontSize:'.9rem',fontWeight:800,color:b.profitPct==null?'#94a3b8':b.profitPct>=0?'#15803d':'#b91c1c'}}>
                              {b.profitPct!=null?(b.profitPct>=0?'+':'')+b.profitPct.toFixed(1)+'%':'—'}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                ):<div style={{textAlign:'center',padding:'40px',color:'#64748b',fontSize:'.82rem',fontWeight:600}}>Nhập dữ liệu lô hàng để xem phân tích SKU</div>}
              </div>
            </div>

            {/* CỘT PHẢI MỚI: GIÁ BÁN KH */}
            <div style={{width:'280px',flexShrink:0,background:bg2,borderLeft:`1px solid ${border1}`,display:'flex',flexDirection:'column'}}>
              
              {/* Header Cột Phải */}
              <div style={{padding:'10px 14px', borderBottom:`1px solid ${border1}`, background:'#f8fafc', zIndex:10}}>
                <div style={{fontWeight:900,fontSize:'.85rem',color:'#0f172a',marginBottom:4}}>🏷️ Giá bán KH</div>
                <div style={{fontSize:'.65rem',color:'#475569',fontWeight:600,marginBottom:10,lineHeight:1.4}}>
                  Quản lý giá theo SKU. Đồng bộ tự động từ lô hàng và Sàn ban hành.
                </div>
                <div style={{display:'flex',gap:5,flexDirection:'column'}}>
                  <div style={{display:'flex',gap:5}}>
                    <button className="btn btn-ghost btn-xs" style={{flex:1,background:'#eff6ff',border:'1px solid #93c5fd',color:'#1d4ed8'}}
                      onClick={()=>{
                        const newRows=[...sellingPrices];
                        products.forEach(p=>{
                          const exists=newRows.some(s=>s.alloy===p.alloy&&s.temper===p.temper&&(s.thickness||'')===(p.thickness||'')&&(s.width||'')===(p.width||'')&&(s.length||'')===(p.length||'')&&(s.coating||'KP')===(p.coating||'KP'));
                          if(!exists) newRows.push({id:uid(),alloy:p.alloy,temper:p.temper,thickness:p.thickness||'',width:p.width||'',length:p.length||'',coating:p.coating||'KP',sellCost:0,comment:''});
                        });
                        const filtered=newRows.filter(s=>{
                          const inProducts=products.some(p=>p.alloy===s.alloy&&p.temper===s.temper&&(s.thickness||'')===(p.thickness||'')&&(s.width||'')===(p.width||'')&&(s.length||'')===(p.length||'')&&(s.coating||'KP')===(p.coating||'KP'));
                          return inProducts||s.sellCost>0;
                        });
                        setSP(filtered);
                      }} title="Tạo list SKU giá bán từ lô hàng mua">🔄 Đ.bộ Lô</button>
                    
                    <button className="btn btn-ghost btn-xs" style={{flex:1,background:'#f0fdf4',border:'1px solid #86efac',color:'#14532d'}}
                      onClick={()=>{
                        setSP(prev=>prev.map(sp=>{
                          if(sp.sellCost>0) return sp;
                          const matchGroup=mgmtData.find(g=>{
                            if(g.alloy!==(sp.alloy||'')) return false;
                            if(g.temper&&g.temper!==(sp.temper||'')) return false;
                            const t=parseFloat(sp.thickness)||0;
                            return t>=g.minThick&&t<=g.maxThick&&g.publishedFloor>0;
                          });
                          if(matchGroup) return{...sp,sellCost:matchGroup.publishedFloor};
                          return sp;
                        }));
                      }} title="Lấy giá sàn ban hành điền vào ô trống">💹 Từ Sàn BH</button>
                  </div>
                  <button className="btn btn-ghost btn-xs" style={{width:'100%', justifyContent:'center'}} onClick={addSP}><Ic.Plus/> Thêm tùy chỉnh</button>
                </div>
              </div>

              {/* Danh sách Card Giá bán (Rút gọn Input) */}
              <div style={{flex:1, overflowY:'auto', padding:'12px 10px', display:'flex', flexDirection:'column', gap:'8px', background:bg1}}>
                {filteredSP.length===0 && (
                  <div style={{textAlign:'center', padding:'20px 0', color:'#94a3b8', fontSize:'.75rem', fontWeight:600}}>
                    Chưa có SKU giá bán.<br/>Nhấn <b>Đ.bộ Lô</b> để tạo tự động.
                  </div>
                )}
                {filteredSP.map((sp,i)=>{
                  const sc=sp.sellCost||sp.price||0;
                  const isWildcard=!sp.thickness||!sp.width||!sp.length||!sp.temper;
                  return (
                    <div key={sp.id} style={{background:isWildcard?'#fefce8':'#ffffff', border:`1px solid ${isWildcard?'#fde047':'#cbd5e1'}`, borderRadius:'7px', padding:'8px 10px', position:'relative', boxShadow:'0 1px 2px rgba(0,0,0,0.05)'}}>
                      <button className="btn-danger" style={{position:'absolute', top:6, right:6, padding:'2px'}} onClick={()=>delSP(sp.id)}><Ic.X/></button>
                      
                      <div style={{display:'flex', alignItems:'center', gap:4, marginBottom:4}}>
                        <span style={{fontWeight:900, color:'#0f172a', fontSize:'.85rem'}}>{sp.alloy||'---'}</span>
                        <span style={{fontWeight:700, color:'#2563eb', fontSize:'.75rem'}}>{sp.temper||'---'}</span>
                        {isWildcard&&<span className="tag ty" style={{fontSize:'.55rem', padding:'1px 4px', marginLeft:4}}>🌐 ALL</span>}
                      </div>
                      
                      <div style={{fontSize:'.72rem', color:'#475569', fontFamily:'JetBrains Mono', fontWeight:600, marginBottom:10}}>
                        {sp.thickness||'*'} × {sp.width||'*'} × {sp.length||'*'}
                        <span style={{marginLeft:6, color:(sp.coating||'KP')==='1E'?'#0f766e':'#a16207', fontWeight:800}}>
                          [{(sp.coating||'KP')==='1E'?'PE':'NOPE'}]
                        </span>
                      </div>

                      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f8fafc', borderRadius:5, padding:'5px 8px', border:'1px solid #e2e8f0'}}>
                        <span style={{fontSize:'.65rem', fontWeight:800, color:'#334155'}}>Giá sàn:</span>
                        {/* Vẫn giữ 1 ô input gọn gàng để bạn chỉnh sửa vi chỉnh nếu cần, nhưng hiển thị dạng text */}
                        <div style={{display:'flex', alignItems:'center'}}>
                          <input className="inp inp-xs mono" style={{width:90, textAlign:'right', color:'#15803d', fontWeight:900, border:'none', background:'transparent', padding:0, fontSize:'.85rem'}} value={fv(sc)} onChange={e=>setSpR(sp.id,'sellCost',pn(e.target.value))} placeholder="0"/>
                          <span style={{fontSize:'.65rem', color:'#94a3b8', fontWeight:700, marginLeft:2}}>đ/kg</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* KẾT THÚC CỘT PHẢI MỚI */}
          </div>
        )}

        {/* ════ TAB INVENTORY ════ */}
        {tab==='inventory'&&(
          <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
            <div style={{maxWidth:'1200px',margin:'0 auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>📦 Tồn kho chi tiết theo SKU + Coating</h2>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  {/* SỬA #5 (R6): Toggle Gom theo SKU */}
                  <button className={`btn btn-sm ${invGroupView?'btn-teal':'btn-ghost'}`} onClick={()=>setInvGroupView(v=>!v)} title="Gom tất cả mã cùng SKU (kho + đang về) thành 1 nhóm để xem SKU nào tồn quá nhiều" style={{border:invGroupView?undefined:'1px solid #5eead4',color:invGroupView?undefined:'#0f766e'}}>{invGroupView?'✓ Đang gom SKU':'📊 Gom theo SKU'}</button>
                  <button className={`btn btn-sm ${excludePO?'btn-purple':'btn-ghost'}`} onClick={()=>setExcludePO(v=>!v)} disabled={poData.length===0} title={poData.length===0?'Cần Sync PO trước (tab 📑 PO đã ký)':'Trừ trọng lượng PO chưa giao khỏi tồn kho để ra Khả dụng hợp lý'} style={{border:excludePO?undefined:'1px solid #c4b5fd',color:excludePO?undefined:'#6d28d9'}}>
                    {excludePO?'✓ Đang trừ PO':'➖ Loại bỏ SKU đã có PO'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>syncGoogleSheet('inv')} disabled={dbStatus.loading||!ghVerified}>{dbStatus.loading?<div className="spinner"/>:<Ic.Refresh/>} Sync</button>
                  <button className="btn btn-ghost btn-sm" onClick={addInv}><Ic.Plus/> Thêm dòng</button>
                </div>
              </div>
              {excludePO&&poData.length>0&&(()=>{
                const totStock=filteredInventory.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
                // Số THỰC trừ = tổng đã phân bổ vào các dòng trong tầm nhìn (có thể < PO nếu kho không đủ)
                const allocated=filteredInventory.reduce((s,r)=>s+((invAlloc[r.id]||{}).alloc||0),0);
                const keysInView=new Set(filteredInventory.map(r=>skuKeyNorm(r)));
                const poInView=Object.entries(poByKey).filter(([k])=>keysInView.has(k)).reduce((s,[,v])=>s+v.remaining,0);
                const shortage=Math.max(poInView-allocated,0); // PO chưa giao mà kho không đủ để dành
                const avail=totStock-allocated;
                return(
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:11}}>
                    {[
                      {l:'Tổng tồn (lọc)',v:fv(totStock)+' kg',c:'#15803d'},
                      {l:'Đã trừ cho PO',v:'− '+fv(allocated)+' kg',c:'#7c3aed'},
                      {l:'Khả dụng hợp lý',v:fv(avail)+' kg',c:avail>=0?'#1d4ed8':'#b91c1c'},
                      {l:'PO còn thiếu hàng',v:shortage>0?'⚠ '+fv(shortage)+' kg':'✓ đủ',c:shortage>0?'#b91c1c':'#15803d'},
                    ].map((x,i)=>(
                      <div key={i} className="kpi" style={{borderColor:x.c,borderLeftWidth:4}}><div className="kpi-l">{x.l}</div><div className="kpi-v" style={{color:x.c,fontSize:'.95rem'}}>{x.v}</div></div>
                    ))}
                  </div>
                );
              })()}
              <FilterBar filter={invFilter} setFilter={setInvFilter} alloys={uniqueInvAlloys} showStatus={true} showCoating={true} showStockAlert={true} total={inventory.length} filtered={filteredInventory.length}/>
              {/* Bộ lọc Giá vốn đ/kg */}
              <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:11,background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:6,padding:'7px 10px'}}>
                <span style={{fontSize:'.65rem',color:'#c2410c',fontWeight:800,display:'flex',alignItems:'center',gap:4,whiteSpace:'nowrap'}}><Ic.Filter/> 💰 Giá vốn đ/kg:</span>
                <div style={{display:'flex',alignItems:'center',gap:4,background:'#fff',border:'1px solid #fdba74',borderRadius:4,padding:'2px 8px'}}>
                  <span style={{fontSize:'.62rem',color:'#c2410c',fontWeight:700,whiteSpace:'nowrap'}}>≥ Từ:</span>
                  <input
                    className="inp inp-xs mono"
                    style={{width:90,textAlign:'right',color:'#c2410c',fontWeight:700,border:'none',padding:'2px 4px',background:'transparent'}}
                    placeholder="0"
                    value={invFilter.costMin||''}
                    onChange={e=>setInvFilter(f=>({...f,costMin:e.target.value}))}
                    onBlur={e=>{const v=pn(e.target.value);setInvFilter(f=>({...f,costMin:v>0?fv(v):''}));}}
                  />
                  <span style={{color:'#fed7aa',fontSize:'.7rem',margin:'0 2px'}}>—</span>
                  <span style={{fontSize:'.62rem',color:'#c2410c',fontWeight:700,whiteSpace:'nowrap'}}>≤ Đến:</span>
                  <input
                    className="inp inp-xs mono"
                    style={{width:90,textAlign:'right',color:'#c2410c',fontWeight:700,border:'none',padding:'2px 4px',background:'transparent'}}
                    placeholder="∞"
                    value={invFilter.costMax||''}
                    onChange={e=>setInvFilter(f=>({...f,costMax:e.target.value}))}
                    onBlur={e=>{const v=pn(e.target.value);setInvFilter(f=>({...f,costMax:v>0?fv(v):''}));}}
                  />
                </div>
                {(invFilter.costMin||invFilter.costMax)&&(
                  <button className="btn btn-xs btn-ghost" style={{borderColor:'#fdba74',color:'#c2410c'}} onClick={()=>setInvFilter(f=>({...f,costMin:'',costMax:''}))}>✕ Xóa lọc GV</button>
                )}
                {(invFilter.costMin||invFilter.costMax)&&(
                  <span style={{fontSize:'.65rem',color:'#92400e',fontWeight:700,background:'#fef3c7',border:'1px solid #fde047',borderRadius:4,padding:'2px 7px'}}>
                    🔍 GV {invFilter.costMin?`≥ ${invFilter.costMin}`:''}{invFilter.costMin&&invFilter.costMax?' và ':''}{invFilter.costMax?`≤ ${invFilter.costMax}`:''}
                  </span>
                )}
                <span style={{fontSize:'.62rem',color:'#64748b',fontWeight:600,marginLeft:'auto'}}>Lọc theo giá vốn từng dòng tồn kho</span>
              </div>
              {dbStatus.error&&<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:6,padding:'9px 13px',marginBottom:13,fontSize:'.78rem',color:'#b91c1c',fontWeight:700}}><Ic.Alert/> {dbStatus.error}</div>}
              {/* SỬA #5 (R6): BẢNG GOM THEO SKU — xem SKU nào tồn quá nhiều */}
              {invGroupView&&(()=>{
                const totNet=invSkuGrouped.reduce((s,g)=>s+g.net,0);
                const totVND=invSkuGrouped.reduce((s,g)=>s+g.totalVND,0);
                return(
                <div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:11,background:'#f0fdfa',border:'1px solid #5eead4',borderRadius:6,padding:'8px 12px'}}>
                    <span style={{fontSize:'.7rem',fontWeight:800,color:'#0f766e',whiteSpace:'nowrap'}}>📊 Gom theo SKU — lọc tổng KL ≥</span>
                    <div style={{display:'flex',alignItems:'center',gap:4,background:'#fff',border:'1px solid #5eead4',borderRadius:4,padding:'2px 8px'}}>
                      <input className="inp inp-xs mono" style={{width:100,textAlign:'right',color:'#0f766e',fontWeight:800,border:'none',background:'transparent'}} placeholder="0" value={invGroupMinKg} onChange={e=>setInvGroupMinKg(e.target.value)} onBlur={e=>{const v=pn(e.target.value);setInvGroupMinKg(v>0?fv(v):'');}}/>
                      <span style={{fontSize:'.62rem',color:'#0f766e',fontWeight:700}}>kg</span>
                    </div>
                    {invGroupMinKg&&<button className="btn btn-xs btn-ghost" style={{borderColor:'#5eead4',color:'#0f766e'}} onClick={()=>setInvGroupMinKg('')}>✕ Xóa lọc</button>}
                    {excludePO&&poData.length>0&&<span style={{fontSize:'.62rem',color:'#7c3aed',fontWeight:700}}>· đã trừ PO</span>}
                    <span style={{fontSize:'.66rem',color:'#475569',fontWeight:700,marginLeft:'auto'}}>{invSkuGrouped.length} SKU · tổng {fv(totNet)} kg</span>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table className="tbl" style={{background:bg2,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                      <thead>
                        <tr>
                          <th>#</th><th style={{textAlign:'left',paddingLeft:5}}>SKU (nhóm chính)</th>
                          <th style={{width:75}}>Số dòng</th>
                          <th style={{width:130}}>Tổng KL kg<div style={{fontSize:'.52rem',fontWeight:600,opacity:.85}}>🟢 kho · 🟡 đang về</div></th>
                          <th style={{width:110}}>Giá vốn BQ đ/kg</th><th style={{width:130}}>Tổng Vốn VND</th>
                          <th style={{width:90}}>MinStock</th>
                        </tr>
                        <tr style={{background:'#e2e8f0'}}>
                          <td colSpan={3} style={{textAlign:'right',paddingRight:9,color:'#334155',fontSize:'.68rem',fontWeight:900}}>TỔNG ({invSkuGrouped.length} SKU){excludePO&&poData.length>0&&<span style={{color:'#7c3aed',marginLeft:4}}>· đã trừ PO</span>}</td>
                          <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#0d9488',fontWeight:900,fontSize:'.82rem'}}>{fv(totNet)} kg</td>
                          <td/>
                          <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#1d4ed8',fontWeight:800,fontSize:'.8rem'}}>{fv(totVND)}</td>
                          <td/>
                        </tr>
                      </thead>
                      <tbody>
                        {invSkuGrouped.length===0?(<tr><td colSpan={7} style={{textAlign:'center',padding:20,color:'#94a3b8',fontWeight:600}}>Không có SKU nào đạt điều kiện lọc.</td></tr>):invSkuGrouped.map((g,i)=>{
                          const over=g.maxStock!=null&&g.maxStock>0&&g.net>g.maxStock;
                          return(
                          <tr key={g.key} style={{background:over?'#faf5ff':i<3?'#fffbeb':''}}>
                            <td style={{textAlign:'center',color:'#64748b',fontSize:'.75rem',fontWeight:700}} className="mono">{i+1}</td>
                            <td style={{paddingLeft:8,minWidth:210,fontWeight:700}}>{g.label}</td>
                            <td style={{textAlign:'center',color:'#64748b',fontSize:'.75rem'}} className="mono">{g.lines}</td>
                            <td style={{textAlign:'right',paddingRight:9}}>
                              <div className="mono" style={{color:'#0d9488',fontSize:'.85rem',fontWeight:900}}>{fv(g.net)}</div>
                              <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:1,fontSize:'.6rem',fontWeight:700}}>
                                <span style={{color:'#16a34a'}}>🟢 {fv(g.netStock)}</span>
                                <span style={{color:'#d97706'}}>🟡 {fv(g.netTransit)}</span>
                              </div>
                              {g.poCut>0&&<div style={{fontSize:'.55rem',fontWeight:700,color:'#7c3aed',textAlign:'right'}}>📑 −{fv(g.poCut)} PO</div>}
                            </td>
                            <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#475569',fontWeight:700}}>{fv(g.avgCost)}</td>
                            <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#1d4ed8',fontWeight:800}}>{fv(g.totalVND)}</td>
                            <td className="mono" style={{textAlign:'center',color:'#7c3aed',fontWeight:700}}>{g.minStock>0?fv(g.minStock):'—'}{over&&<div style={{fontSize:'.55rem',color:'#9333ea',fontWeight:800}}>▲ quá max</div>}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                );
              })()}
              {!invGroupView&&(
              <table className="tbl" style={{background:bg2,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                <thead>
                  <tr><th>#</th><th style={{textAlign:'left',paddingLeft:5}}>SKU</th><th style={{width:90}}>Status</th><th style={{width:95}}>KL kg</th><th style={{width:105}}>Giá vốn đ/kg</th><th style={{width:115}}>Tổng Vốn VND</th><th style={{width:75}}>MinStock</th><th style={{width:115}}>Thiếu/Dư kg</th><th style={{width:100}}>Dự Kiến</th><th style={{width:28}}></th></tr>
                  {/* III.1: Summary row at top */}
                  <tr style={{background:'#e2e8f0'}}>
                    <td colSpan={3} style={{textAlign:'right',paddingRight:9,color:'#334155',fontSize:'.68rem',fontWeight:900}}>TỔNG ({filteredInventory.length} dòng){excludePO&&poData.length>0&&<span style={{color:'#7c3aed',marginLeft:4}}>· đã trừ PO</span>}</td>
                    <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#15803d',fontWeight:800,fontSize:'.8rem'}}>{fv(filteredInventory.reduce((s,r)=>s+(excludePO?(invAlloc[r.id]?invAlloc[r.id].available:(parseFloat(r.qtyKg)||0)):(parseFloat(r.qtyKg)||0)),0))} kg</td>
                    <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#475569',fontWeight:800,fontSize:'.8rem'}}>{fv(weightedAvg(filteredInventory.map(r=>({qtyKg:excludePO?(invAlloc[r.id]?invAlloc[r.id].available:(parseFloat(r.qtyKg)||0)):(parseFloat(r.qtyKg)||0),avgCost:parseFloat(r.avgCost)||0}))))} avg</td>
                    <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#1d4ed8',fontWeight:800,fontSize:'.8rem'}}>{fv(filteredInventory.reduce((s,r)=>s+(excludePO?(invAlloc[r.id]?invAlloc[r.id].available:(parseFloat(r.qtyKg)||0)):(parseFloat(r.qtyKg)||0))*(parseFloat(r.avgCost)||0),0))}</td>
                    <td/><td/><td/><td/>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((r,i)=>{
                    const k=skuKey(r),ms=minStockMap[k]||0;
                    const al=invAlloc[r.id]||{alloc:0,available:parseFloat(r.qtyKg)||0};
                    const usePO=excludePO&&poData.length>0;
                    const rowAlloc=al.alloc||0;
                    const rowQty=parseFloat(r.qtyKg)||0;
                    const rowAvail=usePO?al.available:rowQty;   // KL hiển thị (sau trừ nếu bật)
                    // Tổng nhóm = tổng khả dụng (đã trừ PO nếu bật) để tính Min/Max cho đúng thực tế bán
                    const grpQty=inventory.filter(x=>skuKey(x)===k).reduce((s,x)=>s+(usePO?((invAlloc[x.id]||{available:parseFloat(x.qtyKg)||0}).available):(parseFloat(x.qtyKg)||0)),0);
                    const ratio=ms>0?grpQty/ms:null;const delta=ms>0?grpQty-ms:null;
                    const rowBg=usePO&&rowAlloc>0?'#faf5ff':ratio!==null&&ratio<0.8?'#fef2f2':ratio!==null&&ratio<1?'#fffbeb':'';
                    return(
                      <tr key={r.id} style={{background:rowBg}}>
                        <td style={{textAlign:'center',color:'#64748b',fontSize:'.72rem',fontWeight:700}} className="mono">{i+1}</td>
                        <td style={{paddingLeft:8,minWidth:200}}><SkuLabelCell row={r}/></td>
                        {/* III.2: Single status button — show only current state, click to toggle */}
                        <td style={{textAlign:'center'}}>
                          <button
                            className={`status-btn ${r.status==='IN_STOCK'?'s-stock':'s-transit'}`}
                            style={{padding:'3px 8px',fontSize:'.65rem',width:'100%',fontWeight:800}}
                            onClick={()=>setInv(r.id,{status:r.status==='IN_STOCK'?'IN_TRANSIT':'IN_STOCK'})}>
                            {r.status==='IN_STOCK'?'🟢 Kho':'🟡 Đường'}
                          </button>
                        </td>
                        <td>
                          {usePO?(
                            <div style={{textAlign:'right'}}>
                              <div className="mono" style={{fontWeight:800,color:rowAvail>0?'#15803d':'#b91c1c',fontSize:'.82rem'}}>{fv(rowAvail)}</div>
                              {rowAlloc>0&&<div className="mono" style={{fontSize:'.55rem',color:'#7c3aed',fontWeight:700,marginTop:1}}>gốc {fv(rowQty)} · PO −{fv(rowAlloc)}</div>}
                            </div>
                          ):(
                            <input className="inp inp-xs mono" style={{textAlign:'right',color:'#15803d',fontWeight:700}} value={fv(r.qtyKg)} onChange={e=>setInv(r.id,{qtyKg:pn(e.target.value)})}/>
                          )}
                        </td>
                        <td><input className="inp inp-xs mono" style={{textAlign:'right',fontWeight:600}} value={fv(r.avgCost)} onChange={e=>setInv(r.id,{avgCost:pn(e.target.value)})}/></td>
                        <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#2563eb',fontSize:'.78rem',fontWeight:700}}>{fv(rowAvail*(parseFloat(r.avgCost)||0))}</td>
                        <td style={{textAlign:'center'}}>{ms>0?(<div><div style={{fontSize:'.63rem',color:ratio<0.8?'#dc2626':ratio<1?'#d97706':ratio>2?'#6d28d9':'#16a34a',fontWeight:800}}>{Math.round((ratio||0)*100)}%</div><div style={{fontSize:'.57rem',color:'#475569',fontWeight:600}}>{fv(ms)}</div></div>):<span style={{color:'#64748b',fontSize:'.63rem'}}>—</span>}</td>
                        <td style={{textAlign:'right',paddingRight:9}}>{delta!=null?(<span className="mono" style={{fontSize:'.72rem',fontWeight:800,color:delta>=0?'#15803d':'#b91c1c'}}>{delta>=0?'▲+':'▼'}{fv(Math.abs(delta))}</span>):<span style={{color:'#64748b',fontSize:'.63rem'}}>—</span>}</td>
                        <td style={{textAlign:'center',padding:'4px 6px',fontSize:'.75rem',fontWeight:500,color:'#334155'}}>{r.expectedDeliveryDate||'—'}</td>
                        <td><button className="btn-danger" onClick={()=>delInv(r.id)}><Ic.X/></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          </div>
        )}

        {/* ════ TAB MIN/MAX STOCK ════ */}
        {tab==='minstock'&&(
          <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
            <div style={{maxWidth:'1060px',margin:'0 auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div><h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>📏 Min/Max Stock per SKU</h2><p style={{fontSize:'.78rem',color:'#475569',fontWeight:600,marginTop:3}}>Ô trống maxstockkg = không giới hạn (∞) · Đề xuất mua do TP Kinh doanh nhập trên GSheet</p></div>
                <div style={{display:'flex',gap:8}}>
                  {/* SỬA #6 (R6): Trừ TL có PO khỏi tồn hiện tại */}
                  <button className={`btn btn-sm ${excludePOMs?'btn-purple':'btn-ghost'}`} onClick={()=>setExcludePOMs(v=>!v)} disabled={poData.length===0} title={poData.length===0?'Cần Sync PO trước (tab 📑 PO đã ký)':'Trừ trọng lượng PO chưa giao khỏi Tồn hiện tại'} style={{border:excludePOMs?undefined:'1px solid #c4b5fd',color:excludePOMs?undefined:'#6d28d9'}}>{excludePOMs?'✓ Đang trừ PO':'➖ Trừ TL có PO'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>syncGoogleSheet('ms')} disabled={dbStatus.loading||!ghVerified}>{dbStatus.loading?<div className="spinner"/>:<Ic.Refresh/>} Sync</button>
                  <button className="btn btn-ghost btn-sm" onClick={addMS}><Ic.Plus/> Thêm SKU</button>
                </div>
              </div>
              <FilterBar filter={msFilter} setFilter={setMsFilter} alloys={uniqueMsAlloys} showStatus={false} showCoating={true} showStockAlert={true} showOverAlert={false} total={minStockRows.length} filtered={filteredMs.length}/>
              {/* Lọc đề xuất mua chưa giải quyết */}
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:11,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:6,padding:'7px 12px'}}>
                <span style={{fontSize:'.72rem',fontWeight:800,color:'#92400e'}}>🛒 Đề xuất mua:</span>
                {msBuyReqCount>0?<span className="tag" style={{background:'#fef3c7',color:'#92400e',border:'1px solid #fcd34d',fontWeight:800}}>{msBuyReqCount} mã chưa giải quyết</span>:<span style={{fontSize:'.72rem',color:'#15803d',fontWeight:700}}>✓ Không có đề xuất nào đang chờ</span>}
                <label style={{display:'flex',alignItems:'center',gap:5,fontSize:'.72rem',fontWeight:700,color:'#b45309',cursor:'pointer',marginLeft:'auto'}}>
                  <input type="checkbox" checked={msFilter.onlyBuyReq} onChange={e=>setMsFilter(f=>({...f,onlyBuyReq:e.target.checked}))}/> Chỉ hiện mã có đề xuất mua
                </label>
                <span style={{fontSize:'.62rem',color:'#92400e',fontWeight:600}}>TP duyệt xong → xóa ở GSheet (cột yeucaumua, tuanyeucau) rồi Sync</span>
              </div>
              <table className="tbl" style={{background:bg2,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                <thead>
                  <tr>
                    <th>#</th><th style={{textAlign:'left',paddingLeft:5}}>SKU</th><th>Min Stock kg</th><th>Max Stock kg</th><th>Tồn hiện tại kg<div style={{fontSize:'.52rem',fontWeight:600,opacity:.85}}>🟢 kho · 🟡 đang về</div></th><th>% đạt min</th><th>Thiếu / Dư kg</th><th style={{background:'#fffbeb',color:'#92400e'}}>🛒 Đề xuất mua</th><th style={{background:'#fffbeb',color:'#92400e'}}>Tuần đề xuất</th><th></th>
                  </tr>
                  <tr style={{background:'#e2e8f0'}}>
                    <td colSpan={2} style={{textAlign:'right',paddingRight:9,color:'#334155',fontSize:'.68rem',fontWeight:900}}>TỔNG ({filteredMs.length} dòng){excludePOMs&&poData.length>0&&<span style={{color:'#7c3aed',marginLeft:4}}>· đã trừ PO</span>}</td>
                    <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#7c3aed',fontWeight:800,fontSize:'.8rem'}}>{fv(filtMsTotalMin)} kg min</td>
                    <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#6d28d9',fontWeight:800,fontSize:'.8rem'}}>{filtMsTotalMax>0?fv(filtMsTotalMax)+' kg max':'—'}</td>
                    <td style={{textAlign:'right',paddingRight:9}}>
                      <div className="mono" style={{color:'#2563eb',fontWeight:800,fontSize:'.8rem'}}>{fv(filtMsTotalKg)} kg</div>
                      <div style={{fontSize:'.58rem',fontWeight:700}}><span style={{color:'#16a34a'}}>🟢 {fv(filtMsTotalStock)}</span> · <span style={{color:'#d97706'}}>🟡 {fv(filtMsTotalTransit)}</span></div>
                    </td>
                    <td/>
                    <td className="mono" style={{textAlign:'right',paddingRight:9,fontWeight:900,color:filtMsDelta>=0?'#15803d':'#b91c1c',fontSize:'.8rem'}}>{filtMsDelta>=0?'▲ dư +':'▼ thiếu '}{fv(Math.abs(filtMsDelta))} kg</td>
                    {/* SỬA #1 (R6): Tổng 🛒 Đề xuất mua */}
                    <td style={{textAlign:'center',background:'#fef3c7'}}>{filtMsTotalBuyReq>0?<div><div className="mono" style={{fontSize:'.8rem',fontWeight:900,color:'#92400e'}}>🛒 {fv(filtMsTotalBuyReq)} kg</div><div style={{fontSize:'.55rem',fontWeight:700,color:'#b45309'}}>{filtMsBuyReqRows} mã</div></div>:<span style={{color:'#cbd5e1',fontSize:'.7rem'}}>—</span>}</td>
                    <td colSpan={2}/>
                  </tr>
                </thead>
                <tbody>
                  {filteredMs.map((r,i)=>{
                    const k=skuKey(r);const grp=groupBySku(inventory).find(g=>g.key===k);
                    const grossStock=grp?grp.inStock.reduce((s,x)=>s+(parseFloat(x.qtyKg)||0),0):0;
                    const grossTransit=grp?grp.inTransit.reduce((s,x)=>s+(parseFloat(x.qtyKg)||0),0):0;
                    // SỬA #6 (R6): trừ TL PO chưa giao (kho trước → đang về sau)
                    const poRem=excludePOMs?((poByKey[skuKeyNorm(r)]||{}).remaining||0):0;
                    const qtyStock=Math.max(grossStock-poRem,0);
                    const qtyTransit=Math.max(grossTransit-Math.max(poRem-grossStock,0),0);
                    const poCut=(grossStock+grossTransit)-(qtyStock+qtyTransit); // thực trừ
                    const curQty=qtyStock+qtyTransit;   // Tổng = kho + đang về (đã trừ PO nếu bật)
                    const ratio=r.minStockKg>0?curQty/r.minStockKg:null;const mx=r.maxStockKg;
                    const isOver=mx!==null&&mx>0&&curQty>mx;const delta=r.minStockKg>0?curQty-r.minStockKg:null;
                    const hasReq=String(r.buyRequest||'').trim()!=='';
                    return(
                      <tr key={r.id} style={{background:hasReq?'#fffbeb':isOver?'#faf5ff':ratio!==null&&ratio<0.8?'#fef2f2':ratio!==null&&ratio<1?'#fffef5':''}}>
                        <td style={{textAlign:'center',color:'#64748b',fontSize:'.75rem',fontWeight:700}} className="mono">{i+1}</td>
                        <td style={{paddingLeft:8,minWidth:210}}><SkuLabelCell row={r}/></td>
                        <td style={{width:120}}><input className="inp inp-xs mono" style={{textAlign:'right',color:'#7c3aed',fontWeight:800}} value={fv(r.minStockKg)} onChange={e=>setMS(r.id,{minStockKg:pn(e.target.value)})}/></td>
                        <td style={{width:120}}><input className="inp inp-xs mono" style={{textAlign:'right',color:'#6d28d9',fontWeight:800}} value={r.maxStockKg===null||r.maxStockKg===undefined?'':fv(r.maxStockKg)} onChange={e=>{const v=e.target.value.trim();setMS(r.id,{maxStockKg:v===''?null:pn(v)});}} placeholder="∞ không giới hạn"/></td>
                        <td style={{textAlign:'right',paddingRight:9}}>
                          <div className="mono" style={{color:'#2563eb',fontSize:'.82rem',fontWeight:800}}>{fv(curQty)}</div>
                          <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:1,fontSize:'.6rem',fontWeight:700}}>
                            <span style={{color:'#16a34a'}} title="Hàng thật trong kho (bán được ngay)">🟢 {fv(qtyStock)}</span>
                            <span style={{color:'#d97706'}} title="Hàng đã mua đang trên đường về">🟡 {fv(qtyTransit)}</span>
                          </div>
                          {poCut>0&&<div style={{fontSize:'.55rem',fontWeight:700,color:'#7c3aed',textAlign:'right'}} title="Đã trừ PO chưa giao">📑 −{fv(poCut)} PO</div>}
                        </td>
                        <td style={{textAlign:'center',width:90}}>{ratio!==null?(<div><div className="stock-bar" style={{height:5,margin:'0 8px 2px'}}><div className="stock-bar-fill" style={{width:`${Math.min((ratio/2.5)*100,100)}%`,background:isOver?'#6d28d9':ratio<0.8?'#dc2626':ratio<1?'#d97706':ratio>2?'#4f46e5':'#16a34a'}}/></div><span className="mono" style={{fontSize:'.72rem',fontWeight:800,color:isOver?'#6d28d9':ratio<0.8?'#dc2626':ratio<1?'#d97706':ratio>2?'#4f46e5':'#16a34a'}}>{Math.round(ratio*100)}%</span></div>):<span style={{color:'#64748b'}}>—</span>}</td>
                        <td style={{textAlign:'right',paddingRight:9,width:155}}>{isOver?(<span className="mono" style={{fontSize:'.78rem',fontWeight:800,color:'#6d28d9'}}>▲ quá max +{fv(curQty-mx)} kg</span>):delta!=null?(<span className="mono" style={{fontSize:'.78rem',fontWeight:800,color:delta>=0?'#15803d':'#b91c1c'}}>{delta>=0?'▲ dư +':'▼ thiếu '}{fv(Math.abs(delta))} kg</span>):<span style={{color:'#64748b'}}>—</span>}</td>
                        <td style={{textAlign:'center',background:hasReq?'#fef3c7':'transparent'}}>{hasReq?<span style={{fontSize:'.82rem',fontWeight:900,color:'#92400e'}}>🛒 {r.buyRequest}</span>:<span style={{color:'#cbd5e1',fontSize:'.7rem'}}>—</span>}</td>
                        <td style={{textAlign:'center',background:hasReq?'#fef3c7':'transparent'}}>{r.buyRequestWeek?<span style={{fontSize:'.78rem',fontWeight:800,color:'#b45309'}}>{r.buyRequestWeek}</span>:<span style={{color:'#cbd5e1',fontSize:'.7rem'}}>—</span>}</td>
                        <td><button className="btn-danger" onClick={()=>delMS(r.id)}><Ic.X/></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════ TAB GIÁ SÀN v5.7 ════ */}
        {tab==='floor'&&(
          <div style={{flex:1,padding:'14px 18px',overflowY:'auto',background:bg1}}>
            <div style={{maxWidth:'1600px',margin:'0 auto'}}>

              {/* HEADER + VIEWS */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                <div>
                  <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a',display:'flex',alignItems:'center',gap:8}}>
                    <span style={{background:'linear-gradient(135deg,#0d9488,#0891b2)',borderRadius:6,padding:'3px 8px',color:'#fff',fontSize:'.82rem'}}>💹 GIÁ SÀN 5.7</span>
                    Phân tích giá sàn hòa vốn + Đối thủ
                  </h2>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                  <div style={{background:'#f0fdfa',border:'1px solid #5eead4',borderRadius:6,padding:'5px 10px',fontSize:'.7rem',fontWeight:700,color:'#0f766e'}}>
                    {(()=>{
                      const latestDate=updatedImportPrices[0]?.updateDate||'';
                      const latestTs=parseVNDate(latestDate);
                      const daysDiff=latestTs>0?Math.round((Date.now()-latestTs)/86400000):null;
                      const isStale=daysDiff!==null&&daysDiff>7;
                      return(
                          <span title={`Hệ thống tự động chỉ lấy dữ liệu ngày gần nhất trong GSheet. Nhấn Sync để cập nhật.`}>
                            📅 Giá nhập ngày: <strong style={{color:isStale?'#b45309':'#0f766e'}}>{latestDate||'—'}</strong>
                            <span style={{marginLeft:4,color:'#0d9488'}}>({updatedImportPrices.length} dòng)</span>
                            {isStale&&<span style={{marginLeft:4,background:'#fef3c7',color:'#b45309',border:'1px solid #fde047',borderRadius:3,padding:'1px 4px',fontSize:'.65rem'}}>⚠</span>}
                            {!isStale&&daysDiff!==null&&<span style={{marginLeft:4,color:'#16a34a',fontSize:'.75rem',fontWeight:800}}>✓</span>}
                          </span>
                        );
                    })()}
                  </div>
                  <button className="btn btn-teal btn-sm" onClick={()=>syncGoogleSheet('uip')} disabled={dbStatus.loading||!ghVerified}>{dbStatus.loading?<div className="spinner"/>:<Ic.Refresh/>} Sync</button>
					{/* Chính sách Giá Sàn — inline compact */}
                  <div style={{display:'flex',gap:4,alignItems:'center',background:'#f0fdfa',border:'1px solid #99f6e4',borderRadius:5,padding:'4px 8px',flexWrap:'wrap'}}>
                    {[{f:'storageCostPct',l:'LK%',c:'#7c3aed',def:2},{f:'baseFinCostPct',l:'TC%',c:'#b45309',def:1.5},{f:'opsCostPct',l:'HĐKD%',c:'#b91c1c',def:4.5}].map(x=>(
                      <div key={x.f} style={{display:'flex',alignItems:'center',gap:2}}>
                        <label style={{fontSize:'.62rem',color:x.c,fontWeight:800,whiteSpace:'nowrap'}}>{x.l}</label>
                        <input type="number" step=".1" className="inp inp-xs mono" style={{width:52,color:x.c,fontWeight:700,padding:'2px 4px'}} value={inputs[x.f]??x.def} onChange={e=>setInp(x.f,parseFloat(e.target.value)||0)}/>
                      </div>
                    ))}
                    {/* CN mode + value */}
                    <div style={{display:'flex',alignItems:'center',gap:2}}>
                      <label style={{fontSize:'.62rem',color:'#0369a1',fontWeight:800,whiteSpace:'nowrap'}}>CN%</label>
                      <select className="inp inp-xs" style={{width:70,fontSize:'.62rem',padding:'2px 4px'}} value={inputs.creditMode} onChange={e=>setInp('creditMode',e.target.value)}>
                        <option value="none">Không</option>
                        <option value="fixed">Cố định</option>
                        <option value="credit">Theo ngày</option>
                      </select>
                      {inputs.creditMode==='fixed'&&(
                        <input type="number" step=".1" className="inp inp-xs mono" style={{width:52,color:'#0369a1',fontWeight:700,padding:'2px 4px'}} value={inputs.finCostPct??1.5} onChange={e=>setInp('finCostPct',parseFloat(e.target.value)||0)}/>
                      )}
                      {inputs.creditMode==='credit'&&(
                        <input type="number" className="inp inp-xs mono" style={{width:52,color:'#0369a1',fontWeight:700,padding:'2px 4px'}} placeholder="ngày" value={inputs.customCreditDays||''} onChange={e=>setInp('customCreditDays',parseInt(e.target.value)||0)} title="Số ngày công nợ"/>
                      )}
                    </div>
                    <div style={{width:1,height:18,background:'#99f6e4',flexShrink:0}}/>
                    {[{f:'marginCore',l:'A%',c:'#1d4ed8'},{f:'marginLoyal',l:'B%',c:'#7c3aed'},{f:'marginNew',l:'C%',c:'#ea580c'}].map(x=>(
                      <div key={x.f} style={{display:'flex',alignItems:'center',gap:2}}>
                        <label style={{fontSize:'.62rem',color:x.c,fontWeight:800,whiteSpace:'nowrap'}}>{x.l}</label>
                        <input type="number" step=".1" className="inp inp-xs mono" style={{width:46,color:x.c,fontWeight:700,padding:'2px 4px'}} value={inputs[x.f]??0} onChange={e=>setInp(x.f,parseFloat(e.target.value)||0)}/>
                      </div>
                    ))}
                  </div>
                  <div className="toggle-group">
                    <button className={`toggle-btn ${fpView==='detail'?'active':''}`} onClick={()=>setFpView('detail')} title="Chi tiết từng SKU">
                      <Ic.List/> Chi tiết
                    </button>
                    <button className={`toggle-btn ${fpView==='mgmt'?'active':''}`} onClick={()=>setFpView('mgmt')} title="Tổng hợp cho quản lý">
                      <Ic.Users/> Quản lý
                    </button>
                  </div>
                </div>
              </div>

              {/* ──── VIEW: CHI TIẾT ──── */}
              {fpView==='detail'&&(
                <>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:11,background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:6,padding:'7px 10px'}}>
                    <span style={{fontSize:'.65rem',color:'#475569',fontWeight:800,display:'flex',alignItems:'center',gap:4}}><Ic.Filter/> Lọc:</span>
                    <select className="inp inp-xs" style={{width:'auto',minWidth:100}} value={fpFilter.alloy||'ALL'} onChange={e=>setFpFilter(f=>({...f,alloy:e.target.value}))}>
                      <option value="ALL">Tất cả mác</option>
                      {uniqueFpAlloys.map(a=><option key={a} value={a}>{a}</option>)}
                    </select>
                    <select className="inp inp-xs" style={{width:'auto',minWidth:110}} value={fpFilter.coating||'ALL'} onChange={e=>setFpFilter(f=>({...f,coating:e.target.value}))}>
                      <option value="ALL">Tất cả coating</option>
                      <option value="1E">🎨 PE (1E)</option>
                      <option value="KP">⬜ NOPE (KP)</option>
                    </select>
                    <div style={{display:'flex',alignItems:'center',gap:4,background:'#fff',border:'1px solid #cbd5e1',borderRadius:4,padding:'2px 6px'}}>
                      <span style={{fontSize:'.62rem',color:'#475569',fontWeight:800,whiteSpace:'nowrap'}}>Dày mm:</span>
                      <input className="inp inp-xs mono" style={{width:50,textAlign:'center',color:'#b45309',fontWeight:700,border:'none',padding:'2px 4px'}} placeholder="min" value={fpFilter.thickMin||''} onChange={e=>setFpFilter(f=>({...f,thickMin:e.target.value}))}/>
                      <span style={{color:'#94a3b8',fontSize:'.7rem'}}>–</span>
                      <input className="inp inp-xs mono" style={{width:50,textAlign:'center',color:'#b45309',fontWeight:700,border:'none',padding:'2px 4px'}} placeholder="max" value={fpFilter.thickMax||''} onChange={e=>setFpFilter(f=>({...f,thickMax:e.target.value}))}/>
                    </div>
                    <input className="inp inp-xs" style={{minWidth:140,flex:1}} placeholder="🔍 Tìm kiếm SKU… (gõ x thay ×)" value={fpFilter.search||''} onChange={e=>setFpFilter(f=>({...f,search:e.target.value}))}/>
                    {(fpFilter.search||fpFilter.alloy!=='ALL'||fpFilter.coating!=='ALL'||fpFilter.thickMin||fpFilter.thickMax)&&(
                      <button className="btn btn-xs btn-ghost" onClick={()=>setFpFilter({alloy:'ALL',coating:'ALL',search:'',thickMin:'',thickMax:''})}>✕ Xóa lọc</button>
                    )}
                    <span style={{fontSize:'.65rem',color:'#64748b',fontWeight:700,whiteSpace:'nowrap'}}>{filteredFp.length}/{floorPriceData.length} dòng</span>
                  </div>

                  {filteredFp.length===0?(
                    <div style={{textAlign:'center',padding:50,color:'#64748b',fontWeight:700}}>Chưa có dữ liệu tồn kho. Vào tab 📦 để nhập hàng.</div>
                  ):(
                    <div style={{overflowX:'auto'}}>
                      <table className="tbl" style={{background:bg2,borderRadius:8,overflow:'hidden',minWidth:1050,boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                        <thead>
                          <tr>
                            <th rowSpan={2} style={{background:'#e2e8f0',width:30,minWidth:30}}>#</th>
                            <th rowSpan={2} style={{textAlign:'left',paddingLeft:8,background:'#e2e8f0',width:'100%',minWidth:220}}>SKU</th>
                            <th rowSpan={2} style={{background:'#e2e8f0',width:85,minWidth:85}}>Tồn (kg)</th>
                            <th rowSpan={2} style={{background:'#fee2e2',color:'#991b1b',width:100,minWidth:100}}>⚖️ Thiếu/Dư<div style={{fontSize:'.5rem',fontWeight:600,opacity:.8,marginTop:1}}>vs Min</div></th>
                            <th rowSpan={2} style={{background:'#f0fdf4',color:'#14532d',width:105,minWidth:105}}>Giá vốn<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8,marginTop:1}}>thuần</div></th>
                            <th rowSpan={2} style={{background:'#dcfce7',color:'#14532d',width:115,minWidth:115,fontWeight:900}}>
                              🔒 Sàn HV
                              <div style={{fontSize:'.5rem',fontWeight:600,opacity:.8,marginTop:1}}>{inputs.storageCostPct ?? 2}+{inputs.baseFinCostPct ?? 1.5}+{inputs.opsCostPct}%</div>
                            </th>
                            <th rowSpan={2} style={{background:'#fafafa',color:'#b8a060',width:95,minWidth:95,fontWeight:400,fontSize:'.66rem',opacity:.7}}>🏭 Đối thủ</th>
                            <th rowSpan={2} style={{background:'#fafafa',color:'#b8a060',width:95,minWidth:95,fontWeight:400,fontSize:'.66rem',opacity:.7}}>🔻 Sàn ĐT</th>
                            <th colSpan={3} style={{background:'#eff6ff',color:'#1e3a8a',borderBottom:'1px solid #bfdbfe'}}>Giá theo nhóm KH</th>
                          </tr>
                          <tr>
                            <th style={{background:'#dbeafe',color:'#1e3a8a',fontSize:'.63rem',width:105,minWidth:105}}>A Group (+{inputs.marginCore}%)</th>
                            <th style={{background:'#ede9fe',color:'#5b21b6',fontSize:'.63rem',width:105,minWidth:105}}>B Group (+{inputs.marginLoyal}%)</th>
                            <th style={{background:'#ffedd5',color:'#9a3412',fontSize:'.63rem',width:105,minWidth:105}}>C Group (+{inputs.marginNew}%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFp.map((r,i)=>{
                            const diffComp=r.competitorPrice>0?r.floorAbsolute-r.competitorPrice:null;
                            const diffCompFloor=r.competitorFloorPrice>0?r.floorAbsolute-r.competitorFloorPrice:null;
                            const minKg=minStockMap[r.skuKey]||0;
                            const stockDelta=minKg>0?r.totalQty-minKg:null;
                            return(
                              <tr key={r.skuKey}>
                                <td style={{textAlign:'center',color:'#64748b',fontSize:'.72rem',fontWeight:700}} className="mono">{i+1}</td>
                                <td style={{paddingLeft:8}}>
                                  <div style={{fontWeight:800,fontSize:'.82rem',color:'#0f172a'}}>{r.alloy} {r.temper}</div>
                                  <div style={{fontSize:'.68rem',color:'#475569',fontFamily:'JetBrains Mono',marginTop:1}}>{r.thickness}x{r.width}x{r.length}</div>
                                  <div style={{fontSize:'.6rem',color:r.coating==='1E'?'#0f766e':'#854d0e',fontWeight:700,marginTop:1}}>{r.coating==='1E'?'🎨 PE':'⬜ NOPE'}</div>
                                </td>
                                <td style={{textAlign:'right',paddingRight:6}}>
                                  <div className="mono" style={{fontWeight:700,color:'#15803d',fontSize:'.8rem'}}>{fv(r.totalQty)}</div>
                                  <div style={{fontSize:'.6rem',color:'#475569',fontWeight:600}}>🟢{fv(r.qtyStock)} 🟡{fv(r.qtyTransit)}</div>
                                </td>
                                <td style={{textAlign:'right',paddingRight:6,background:'#fef2f2'}}>
                                  {stockDelta!==null?(
                                    <span className="mono" style={{fontSize:'.75rem',fontWeight:800,color:stockDelta>=0?'#15803d':'#b91c1c'}}>{stockDelta>=0?'▲+':'▼'}{fv(Math.abs(stockDelta))}</span>
                                  ):<span style={{color:'#94a3b8',fontSize:'.65rem'}}>—</span>}
                                  {minKg>0&&<div style={{fontSize:'.55rem',color:'#64748b',fontWeight:600}}>min:{fv(minKg)}</div>}
                                </td>
                                <td style={{textAlign:'right',paddingRight:6,background:'#f0fdf4'}}>
                                  <div className="mono" style={{fontWeight:800,color:'#15803d',fontSize:'.82rem'}}>{fv(r.costBasisPhysical)}</div>
                                </td>
                                <td style={{textAlign:'right',paddingRight:6,background:'#dcfce7',borderLeft:'2px solid #86efac',borderRight:'2px solid #86efac'}}>
                                  <div className="mono" style={{fontWeight:900,color:'#15803d',fontSize:'.92rem'}}>{fv(r.floorAbsolute)}</div>
                                  <div style={{fontSize:'.57rem',color:'#475569',fontWeight:600}}>+{(r.totalCostRate*100).toFixed(2)}% GV</div>
                                </td>
                                <td style={{textAlign:'right',paddingRight:6,background:'#fafafa',opacity:.65}}>
                                  {r.competitorPrice>0?(
                                    <>
                                      <div className="mono" style={{fontWeight:400,color:'#92400e',fontSize:'.78rem',fontStyle:'italic'}}>{fv(r.competitorPrice)}</div>
                                      {diffComp!==null&&<div style={{fontSize:'.55rem',fontWeight:400,color:diffComp>0?'#dc2626':'#15803d'}}>{diffComp>0?'▲':'▼'}{fv(Math.abs(diffComp))}</div>}
                                    </>
                                  ):<span style={{color:'#94a3b8',fontSize:'.7rem'}}>—</span>}
                                </td>
                                <td style={{textAlign:'right',paddingRight:6,background:'#fafafa',opacity:.65}}>
                                  {r.competitorFloorPrice>0?(
                                    <>
                                      <div className="mono" style={{fontWeight:400,color:'#92400e',fontSize:'.78rem',fontStyle:'italic'}}>{fv(r.competitorFloorPrice)}</div>
                                      {diffCompFloor!==null&&<div style={{fontSize:'.55rem',fontWeight:400,color:diffCompFloor>0?'#dc2626':'#15803d'}}>{diffCompFloor>0?'▲':'▼'}{fv(Math.abs(diffCompFloor))}</div>}
                                    </>
                                  ):<span style={{color:'#94a3b8',fontSize:'.7rem'}}>—</span>}
                                </td>
                                <td style={{textAlign:'right',paddingRight:6,background:'#eff6ff'}}><div className="mono" style={{fontWeight:800,color:'#1d4ed8',fontSize:'.82rem'}}>{fv(r.priceCore)}</div></td>
                                <td style={{textAlign:'right',paddingRight:6,background:'#ede9fe'}}><div className="mono" style={{fontWeight:800,color:'#7c3aed',fontSize:'.82rem'}}>{fv(r.priceLoyal)}</div></td>
                                <td style={{textAlign:'right',paddingRight:6,background:'#fff7ed'}}><div className="mono" style={{fontWeight:800,color:'#ea580c',fontSize:'.82rem'}}>{fv(r.priceNew)}</div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {fpFooter&&(
                          <tfoot>
                            <tr>
                              <td colSpan={2} style={{textAlign:'right',paddingRight:8,fontSize:'.68rem',color:'#334155',fontWeight:900}}>TỔNG / BQ WA ({filteredFp.length} SKU)</td>
                              <td style={{textAlign:'right',paddingRight:8,background:'#f0fdf4'}}>
                                <div className="mono" style={{fontWeight:900,color:'#15803d',fontSize:'.85rem'}}>{fv(fpFooter.totalQty)}</div>
                                <div style={{fontSize:'.6rem',color:'#475569',fontWeight:600}}>kg</div>
                              </td>
                              <td style={{background:'#fef2f2'}}/>
                              <td style={{textAlign:'right',paddingRight:8,background:'#f0fdf4'}}>
                                <div className="mono" style={{fontWeight:900,color:'#15803d',fontSize:'.85rem'}}>{fv(fpFooter.avgCostBasis)}</div>
                                <div style={{fontSize:'.6rem',color:'#475569',fontWeight:600}}>BQ WA</div>
                              </td>
                              <td style={{textAlign:'right',paddingRight:8,background:'#dcfce7',borderLeft:'2px solid #86efac',borderRight:'2px solid #86efac'}}>
                                <div className="mono" style={{fontWeight:900,color:'#15803d',fontSize:'.88rem'}}>{fv(fpFooter.avgFloor)}</div>
                                <div style={{fontSize:'.6rem',color:'#065f46',fontWeight:700}}>BQ WA Sàn</div>
                              </td>
                              <td style={{background:'#fffbeb'}}/><td style={{background:'#fef9c3'}}/>
                              <td style={{textAlign:'right',paddingRight:8,background:'#eff6ff'}}>
                                <div className="mono" style={{fontWeight:900,color:'#1d4ed8',fontSize:'.85rem'}}>{fv(fpFooter.avgCore)}</div>
                              </td>
                              <td style={{textAlign:'right',paddingRight:8,background:'#ede9fe'}}>
                                <div className="mono" style={{fontWeight:900,color:'#7c3aed',fontSize:'.85rem'}}>{fv(fpFooter.avgLoyal)}</div>
                              </td>
                              <td style={{textAlign:'right',paddingRight:8,background:'#fff7ed'}}>
                                <div className="mono" style={{fontWeight:900,color:'#ea580c',fontSize:'.85rem'}}>{fv(fpFooter.avgNew)}</div>
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* ──── VIEW: QUẢN LÝ ──── */}
              {fpView==='mgmt'&&(
                <>
                  <div style={{background:'#fef9c3',border:'1px solid #fde047',borderRadius:7,padding:'9px 13px',marginBottom:13,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <Ic.Users/>
                    <div style={{fontSize:'.75rem',color:'#713f12',fontWeight:700}}>
                      <strong>Chế độ Quản lý</strong> — GV blend là giá vốn gốc (chưa cộng CP). <em>Điểm hòa vốn</em> = Sàn tự động (Đã cộng % LK + CPHĐKD + CPTC + CN).
                      <em>Sàn ban hành</em> = nhập tay, hiển thị % so với BQ GV, dùng làm cơ sở tính giá KH.
                    </div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                      {/* SỬA #6 (R2): Ô nhập Tỷ giá ngay trong tab Giá sàn — dùng chung inputs.exchangeRate với PAKD Mua (tự đồng bộ) */}
                      <div style={{display:'flex',alignItems:'center',gap:4,background:'#ecfeff',border:'1px solid #a5f3fc',borderRadius:5,padding:'3px 7px'}}>
                        <span style={{fontSize:'.67rem',color:'#155e75',fontWeight:800,whiteSpace:'nowrap'}}>💱 Tỷ giá:</span>
                        <input className="inp inp-xs mono" type="text" inputMode="numeric" style={{width:78,color:'#0e7490',fontWeight:800,border:'1px solid #a5f3fc',background:'#fff',textAlign:'right'}} placeholder="VD 26000" value={inputs.exchangeRate?Number(inputs.exchangeRate).toLocaleString('vi-VN'):''} onChange={e=>{const v=parseFloat(e.target.value.replace(/[^\d]/g,''))||0;setInputs(p=>({...p,exchangeRate:v}));}} title="Tỷ giá USD/VND — đồng bộ với tab PAKD Mua"/>
                      </div>
                      <button className={`btn btn-xs ${excludePOFloor?'btn-purple':'btn-ghost'}`} onClick={()=>setExcludePOFloor(v=>!v)} disabled={poData.length===0} title={poData.length===0?'Cần Sync PO trước (tab 📑 PO đã ký)':'Trừ trọng lượng PO chưa giao khỏi khối lượng tính giá sàn'} style={{border:excludePOFloor?undefined:'1px solid #c4b5fd',color:excludePOFloor?undefined:'#6d28d9'}}>{excludePOFloor?'✓ Đang trừ PO':'➖ Trừ TL có PO'}</button>
                      <div style={{display:'flex',alignItems:'center',gap:4,background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:5,padding:'3px 7px'}}>
                        <span style={{fontSize:'.67rem',color:'#6d28d9',fontWeight:800,whiteSpace:'nowrap'}}>👤 Người lập PDF:</span>
                        <input className="inp inp-xs mono" style={{width:130,color:'#581c87',fontWeight:700,border:'1px solid #d8b4fe',background:'#faf5ff'}} placeholder={inputs.creator||'Nhập tên…'} value={pdfSignerName} onChange={e=>setPdfSignerName(e.target.value)}/>
                        <button className="btn btn-purple btn-xs" onClick={()=>exportFloorPDF(null,pdfSignerName||inputs.creator)}>📄 PDF</button>
                      </div>
                      {/* SỬA #1 (R2): chỉ còn Nháp local trình duyệt — bỏ nút "Lưu local" cũ (lưu lịch sử GSheet) */}
                      <button className="btn btn-sm" onClick={saveFloorLocal} title="Lưu nháp Giá sàn vào máy này (tải lại y nguyên trạng thái)" style={{fontSize:'.72rem',background:'#f59e0b',color:'#fff',border:'1px solid #d97706'}}>💾 Lưu nháp Sàn</button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setFloorDraftModalOpen(true)} title="Mở danh sách nháp Giá sàn đã lưu trên máy" style={{fontSize:'.72rem'}}>🗂 Sàn nháp ({floorDrafts.length})</button>
                      {/* ─── Luồng duyệt Sàn (Cloud) ─── */}
                      <span style={{width:1,height:18,background:'#cbd5e1',margin:'0 4px'}}/>
                      <button className="btn btn-purple btn-sm" onClick={()=>submitFloorToGithub(mgmtData)} disabled={floorStatus.loading||!ghConfig.token} title={ghConfig.token?'Gửi Sàn tuần này lên GitHub để duyệt theo luồng':'Cần cấu hình GitHub trước (⚙️ GitHub ở header)'} style={{fontSize:'.72rem'}}>
                        {floorStatus.loading?<div className="spinner" style={{width:11,height:11}}/>:'📤'} Gửi duyệt
                      </button>
                      <button className="btn btn-teal btn-sm" onClick={listFloorSubmissions} disabled={floorStatus.loading||!ghConfig.token} title="Xem luồng duyệt Sàn (chờ duyệt + đã duyệt) và tải về app" style={{fontSize:'.72rem'}}>
                        🔄 Luồng duyệt Sàn
                      </button>
                    </div>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table className="tbl" style={{background:bg2,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                      <thead>
                        <tr>
                          <th style={{textAlign:'left',paddingLeft:8,minWidth:180}}>Nhóm hàng</th>
                          <th style={{width:62}}>SKUs</th>
                          <th style={{width:90}}>Tồn (kg)</th>
                          <th style={{background:'#f0fdf4',color:'#14532d',width:100}}>BQ GV<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>(chưa CP)</div></th>
                          <th style={{background:'#dcfce7',color:'#14532d',width:105,fontWeight:900}}>📍 Điểm HV<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>tự động</div></th>
                          <th style={{background:'#bfdbfe',color:'#1e40af',width:100}}>💰 Giá nhập<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>tuần trước</div></th>
                          <th style={{background:'#e0f2fe',color:'#075985',width:100}}>💰 Giá nhập HT<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>từ GSheet</div></th>
                          <th style={{background:'#fef3c7',color:'#b8a060',width:95,fontWeight:400,fontSize:'.66rem',opacity:.75}}>🏭 BQ ĐT</th>
                          <th style={{background:'#fde68a',color:'#b8a060',width:95,fontWeight:400,fontSize:'.66rem',opacity:.75}}>🔻 Sàn ĐT</th>
                          <th style={{background:'#fef9c3',color:'#b8a060',width:100,fontWeight:400,fontSize:'.66rem',opacity:.75}}>🕐 Sàn trước<div style={{fontSize:'.52rem',fontWeight:400,opacity:.8}}>từ lịch sử</div></th>
                          <th style={{background:'#fef08a',color:'#713f12',width:115,fontWeight:900}}>✏️ Sàn BH<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>nhập tay·%GV</div></th>
                          <th style={{background:'#dbeafe',color:'#1e3a8a',width:100}}>A Group<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>A%·%GV</div></th>
                          <th style={{background:'#ede9fe',color:'#5b21b6',width:100}}>B Group<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>B%·%GV</div></th>
                          <th style={{background:'#ffedd5',color:'#9a3412',width:100}}>C Group<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>C%·%GV</div></th>
                        </tr>
                      </thead>
                      <tbody>
                        {mgmtData.map((g,i)=>{
                          const gv=g.avgCost;
                          const pctFloor=pctVsGV(g.avgFloor, gv);
                          const pctCore=pctVsGV(g.corePrice, gv);
                          const pctLoyal=pctVsGV(g.loyalPrice, gv);
                          const pctNew=pctVsGV(g.newPrice, gv);
                          const pctPublished=g.publishedFloor?pctVsGV(g.publishedFloor, gv):null;
                          const isExpanded=expandedMgmtGroups[g.id]||false;
                          // I.2: Giá nhập tuần trước
                          const prevWeekMatch=(()=>{
                            if(!prevWeekImportPrices||prevWeekImportPrices.length===0) return null;
                            const skuDetails2=floorPriceData.filter(r=>{
                              if(r.alloy!==g.alloy) return false;
                              if(g.temper&&r.temper!==g.temper) return false;
                              const t=parseFloat(r.thickness)||0;
                              return t>=g.minThick&&t<=g.maxThick;
                            });
                            if(skuDetails2.length===0) return null;
                            const matches=skuDetails2.map(r=>{
                              const thick=parseFloat(r.thickness)||0;
                              return prevWeekImportPrices.find(p=>p.alloy===r.alloy&&p.temper===r.temper&&thick>=(parseFloat(p.minThick)||0)&&thick<=(parseFloat(p.maxThick)||999));
                            }).filter(Boolean);
                            if(matches.length===0) return null;
                            // WA by qty
                            const totQty=skuDetails2.reduce((s,r)=>s+r.totalQty,0);
                            const exR=parseFloat(inputs.exchangeRate)||0;
                            const priceVND=exR<=0?0:skuDetails2.reduce((s,r,idx)=>{
                              const m=matches[idx];
                              return s+r.totalQty*(m?(m.priceFC||0)/1000*exR*(m.importCoef||1):0);
                            },0);
                            const priceFc=skuDetails2.reduce((s,r,idx)=>{
                              const m=matches[idx];return s+r.totalQty*(m?m.priceFC||0:0);
                            },0);
                            return{priceVND:totQty>0?priceVND/totQty:0,priceFC:totQty>0?priceFc/totQty:0,date:matches[0]?.updateDate||''};
                          })();
                          // I.3: Sàn trước đây
                          const lastFloor=lastPublishedFloorByGroup[g.label]||null;
                          // SKU detail rows for this group
                          const skuDetails=floorPriceData.filter(r=>{
                            if(r.alloy!==g.alloy) return false;
                            if(g.temper&&r.temper!==g.temper) return false;
                            const t=parseFloat(r.thickness)||0;
                            return t>=g.minThick&&t<=g.maxThick;
                          });
                          const isExcluded=id=>excludedMgmtSkus[g.id]&&excludedMgmtSkus[g.id].includes(id);
                          return(
                          <React.Fragment key={g.id}>
                          <tr style={{background:i%2===0?'#ffffff':'#f8fafc'}}>
                            <td style={{paddingLeft:8}}>
                              <div style={{fontWeight:900,fontSize:'.84rem',color:'#0f172a'}}>{g.label}</div>
                              <div style={{fontSize:'.62rem',color:'#475569',fontWeight:600,marginTop:2}}>
                                {g.alloy}{g.temper?` ${g.temper}`:''} · {g.minThick}–{g.maxThick} mm
                              </div>
                            </td>
                            <td style={{textAlign:'center'}}>
                              {/* III.3: Click SKU count to expand/collapse */}
                              <button
                                onClick={()=>setExpandedMgmtGroups(p=>({...p,[g.id]:!p[g.id]}))}
                                style={{background:isExpanded?'#1d4ed8':'#dbeafe',border:`1px solid ${isExpanded?'#1e3a8a':'#93c5fd'}`,color:isExpanded?'#fff':'#1e3a8a',borderRadius:4,padding:'2px 8px',fontSize:'.68rem',fontWeight:900,cursor:'pointer',transition:'all .12s'}}>
                                {g.skus} {isExpanded?'▲':'▼'}
                              </button>
                            </td>
                            <td style={{textAlign:'right',paddingRight:8}}>
                              <div className="mono" style={{fontWeight:700,color:'#15803d'}}>{fv(g.totalQty)}</div>
                              <div style={{fontSize:'.6rem',color:'#475569',fontWeight:600}}>kg</div>
                            </td>
                            {/* BQ Giá vốn */}
                            <td style={{textAlign:'right',paddingRight:8,background:'#f0fdf4'}}>
                              <div className="mono" style={{fontWeight:800,color:'#15803d',fontSize:'.88rem'}}>{g.skus>0?fv(gv):'—'}</div>
                              <div style={{fontSize:'.55rem',color:'#475569',fontWeight:600}}>đ/kg blend thuần</div>
                            </td>
                            {/* 📍 Điểm hòa vốn (tự động) */}
                            <td style={{textAlign:'right',paddingRight:8,background:'#dcfce7',borderLeft:'2px solid #86efac',borderRight:'2px solid #86efac'}}>
                              <div className="mono" style={{fontWeight:900,color:'#15803d',fontSize:'.92rem'}}>{g.skus>0?fv(g.avgFloor):'—'}</div>
                              {g.skus>0&&pctFloor!=null&&(
                                <div style={{fontSize:'.57rem',color:pctFloor>=0?'#15803d':'#dc2626',fontWeight:800}}>
                                  {pctFloor>=0?'+':''}{pctFloor.toFixed(2)}% GV
                                </div>
                              )}
                            </td>
                            {/* 💰 Giá nhập tuần trước (I.2) */}
                            <td style={{textAlign:'right',paddingRight:6,background:'#dbeafe'}}>
                              {(parseFloat(inputs.exchangeRate)||0)<=0
                                ?<span style={{color:'#b45309',fontSize:'.6rem',fontStyle:'italic',fontWeight:700}}>⚠ nhập tỷ giá</span>
                                :prevWeekMatch&&prevWeekMatch.priceVND>0?(
                                <>
                                  <div className="mono" style={{fontWeight:800,color:'#1e40af',fontSize:'.82rem'}}>{fv(prevWeekMatch.priceVND)}</div>
                                  <div style={{fontSize:'.55rem',color:'#475569',fontWeight:600}}>{prevWeekMatch.date}</div>
                                </>
                              ):<span style={{color:'#94a3b8',fontSize:'.65rem',fontStyle:'italic'}} title="Không có dữ liệu giá nhập trong tuần trước (theo lịch). Kiểm tra cột UpdateDate trên GSheet tab Giá nhập.">— không có tuần trước</span>}
                            </td>
                            {/* 💰 Giá nhập HT */}
                            <td style={{textAlign:'right',paddingRight:6,background:'#e0f2fe'}}>
                              {(parseFloat(inputs.exchangeRate)||0)<=0
                                ?<div style={{fontSize:'.6rem',color:'#b45309',fontWeight:700,fontStyle:'italic'}}>⚠ nhập tỷ giá</div>
                                :<>
                                  <div className="mono" style={{fontWeight:800,color:'#0369a1',fontSize:'.82rem'}}>{g.avgNewImportPrice>0?fv(g.avgNewImportPrice):'—'}</div>
                                  {g.avgNewImportPrice>0&&prevWeekMatch&&prevWeekMatch.priceVND>0&&(
                                    <div style={{fontSize:'.55rem',color:g.avgNewImportPrice>prevWeekMatch.priceVND?'#dc2626':'#15803d',fontWeight:700}}>
                                      {g.avgNewImportPrice>prevWeekMatch.priceVND?'▲':'▼'}{fv(Math.abs(g.avgNewImportPrice-prevWeekMatch.priceVND))}
                                    </div>
                                  )}
                                </>}
                            </td>
                            {/* 🏭 BQ Đối thủ */}
                            <td style={{textAlign:'right',paddingRight:6,background:'#fafafa',opacity:.65}}>
                              <div className="mono" style={{fontWeight:400,color:'#92400e',fontSize:'.78rem',fontStyle:'italic'}}>{g.avgCompPrice>0?fv(g.avgCompPrice):'—'}</div>
                              {g.avgCompPrice>0&&g.skus>0&&(
                                <div style={{fontSize:'.55rem',fontWeight:400,color:g.avgFloor>g.avgCompPrice?'#dc2626':'#15803d'}}>
                                  {g.avgFloor>g.avgCompPrice?`▲${fv(g.avgFloor-g.avgCompPrice)}`:`▼${fv(g.avgCompPrice-g.avgFloor)}`}
                                </div>
                              )}
                            </td>
                            {/* 🔻 BQ Sàn ĐT */}
                            <td style={{textAlign:'right',paddingRight:6,background:'#fafafa',opacity:.65}}>
                              <div className="mono" style={{fontWeight:400,color:'#92400e',fontSize:'.78rem',fontStyle:'italic'}}>{g.avgCompFloor>0?fv(g.avgCompFloor):'—'}</div>
                              {g.avgCompFloor>0&&g.skus>0&&(
                                <div style={{fontSize:'.55rem',fontWeight:400,color:g.avgFloor>g.avgCompFloor?'#dc2626':'#15803d'}}>
                                  {g.avgFloor>g.avgCompFloor?`▲${fv(g.avgFloor-g.avgCompFloor)}`:`▼${fv(g.avgCompFloor-g.avgFloor)}`}
                                </div>
                              )}
                            </td>
                            {/* 🕐 Sàn trước đây (I.3) */}
                            <td style={{textAlign:'right',paddingRight:6,background:'#fafafa',opacity:.65}}>
                              {lastFloor?(
                                <>
                                  <div className="mono" style={{fontWeight:400,color:'#92400e',fontSize:'.78rem',fontStyle:'italic'}}>{fv(lastFloor.publishedFloor)}</div>
                                  <div style={{fontSize:'.55rem',color:'#94a3b8',fontWeight:400}}>{lastFloor.issuedDate}</div>
                                </>
                              ):<span style={{color:'#94a3b8',fontSize:'.65rem',fontStyle:'italic'}}>—</span>}
                            </td>
                            {/* ✏️ Sàn ban hành */}
                            <td style={{textAlign:'center',paddingLeft:3,paddingRight:3,background:'#ffffff'}}>
                              <input
                                className="inp inp-xs mono"
                                style={{textAlign:'right',color:'#713f12',fontWeight:900,fontSize:'.82rem',background:'#ffffff',border:`1px solid ${g.publishedFloor?'#fde047':'#94a3b8'}`}}
                                placeholder="—"
                                value={mgmtFloorOverride[g.id]!=null?fv(mgmtFloorOverride[g.id]):(g.isDefaultFromHistory&&g.publishedFloor?fv(g.publishedFloor):'')}
                                onChange={e=>{const v=e.target.value.replace(/\./g,'').replace(/,/g,'');const n=parseFloat(v)||0;setMgmtFloorOverride(p=>({...p,[g.id]:n>0?n:null}));}}
                              />
                              {g.publishedFloor&&pctPublished!=null&&(
                                <div style={{fontSize:'.55rem',color:pctPublished>=0?'#15803d':'#dc2626',fontWeight:900,marginTop:2}}>
                                  {pctPublished>=0?'+':''}{pctPublished.toFixed(2)}% GV {g.isDefaultFromHistory&&mgmtFloorOverride[g.id]==null?'🕐':'✓'}
                                </div>
                              )}
                              {!g.publishedFloor&&g.skus>0&&(
                                <div style={{fontSize:'.52rem',color:'#94a3b8',fontWeight:600,marginTop:1}}>chưa BH</div>
                              )}
                            </td>
                            {/* 👥 A Group */}
                            <td style={{textAlign:'right',paddingRight:8,background:'#eff6ff'}}>
                              <div className="mono" style={{fontWeight:800,color:'#1d4ed8',fontSize:'.88rem'}}>{g.skus>0?fv(g.corePrice):'—'}</div>
                              {g.skus>0&&pctCore!=null&&(
                                <div style={{fontSize:'.57rem',color:pctCore>=0?'#1d4ed8':'#dc2626',fontWeight:800}}>
                                  {pctCore>=0?'+':''}{pctCore.toFixed(2)}% GV
                                </div>
                              )}
                              {g.publishedFloor&&<div style={{fontSize:'.52rem',color:'#1d4ed8',fontWeight:700}}>từ sàn BH</div>}
                            </td>
                            {/* 💛 B Group */}
                            <td style={{textAlign:'right',paddingRight:8,background:'#ede9fe'}}>
                              <div className="mono" style={{fontWeight:800,color:'#7c3aed',fontSize:'.88rem'}}>{g.skus>0?fv(g.loyalPrice):'—'}</div>
                              {g.skus>0&&pctLoyal!=null&&(
                                <div style={{fontSize:'.57rem',color:pctLoyal>=0?'#7c3aed':'#dc2626',fontWeight:800}}>
                                  {pctLoyal>=0?'+':''}{pctLoyal.toFixed(2)}% GV
                                </div>
                              )}
                              {g.publishedFloor&&<div style={{fontSize:'.52rem',color:'#7c3aed',fontWeight:700}}>từ sàn BH</div>}
                            </td>
                            {/* 🆕 C Group */}
                            <td style={{textAlign:'right',paddingRight:8,background:'#fff7ed'}}>
                              <div className="mono" style={{fontWeight:800,color:'#ea580c',fontSize:'.88rem'}}>{g.skus>0?fv(g.newPrice):'—'}</div>
                              {g.skus>0&&pctNew!=null&&(
                                <div style={{fontSize:'.57rem',color:pctNew>=0?'#ea580c':'#dc2626',fontWeight:800}}>
                                  {pctNew>=0?'+':''}{pctNew.toFixed(2)}% GV
                                </div>
                              )}
                              {g.publishedFloor&&<div style={{fontSize:'.52rem',color:'#ea580c',fontWeight:700}}>từ sàn BH</div>}
                            </td>
                          </tr>
                          {/* III.3: Expanded SKU detail rows */}
                          {isExpanded&&skuDetails.map((r,si)=>{
                            const excl=isExcluded(r.skuKey);
                            return(
                              <tr key={r.skuKey} style={{background:excl?'#fef2f2':'#f0f9ff',opacity:excl?0.55:1}}>
                                <td style={{paddingLeft:24,fontSize:'.75rem',color:'#334155',fontWeight:600}}>
                                  <span style={{color:'#94a3b8',marginRight:4}}>└</span>
                                  {r.alloy} {r.temper} {r.thickness}×{r.width}×{r.length} [{r.coating==='1E'?'PE':'NOPE'}]
                                </td>
                                <td style={{textAlign:'center'}}>
                                  <button
                                    onClick={()=>setExcludedMgmtSkus(p=>{const cur=p[g.id]||[];const next=cur.includes(r.skuKey)?cur.filter(x=>x!==r.skuKey):[...cur,r.skuKey];return{...p,[g.id]:next};})}
                                    style={{background:excl?'#fee2e2':'#f1f5f9',border:`1px solid ${excl?'#fca5a5':'#94a3b8'}`,color:excl?'#b91c1c':'#475569',borderRadius:3,padding:'1px 7px',fontSize:'.65rem',fontWeight:800,cursor:'pointer'}}>
                                    {excl?'✕ Bỏ':'✓ Tính'}
                                  </button>
                                </td>
                                <td style={{textAlign:'right',paddingRight:8,fontSize:'.75rem'}} className="mono">{fv(r.totalQty)}</td>
                                <td style={{textAlign:'right',paddingRight:8,background:'#f0fdf4',fontSize:'.75rem'}} className="mono">{fv(r.costBasisPhysical)}</td>
                                <td style={{textAlign:'right',paddingRight:8,background:'#dcfce7',fontSize:'.78rem',fontWeight:800}} className="mono">{fv(r.floorAbsolute)}</td>
                                <td style={{background:'#dbeafe'}}/>
                                <td style={{textAlign:'right',paddingRight:8,background:'#e0f2fe',fontSize:'.75rem'}} className="mono">{r.newImportPriceVND>0?fv(r.newImportPriceVND):'—'}</td>
                                <td style={{textAlign:'right',paddingRight:8,background:'#fffbeb',fontSize:'.75rem'}} className="mono">{r.competitorPrice>0?fv(r.competitorPrice):'—'}</td>
                                <td style={{textAlign:'right',paddingRight:8,background:'#fef9c3',fontSize:'.75rem'}} className="mono">{r.competitorFloorPrice>0?fv(r.competitorFloorPrice):'—'}</td>
                                <td style={{background:'#fef9c3'}}/>
                                <td style={{background:'#fefce8'}}/>
                                <td style={{textAlign:'right',paddingRight:8,background:'#eff6ff',fontSize:'.75rem'}} className="mono">{fv(r.priceCore)}</td>
                                <td style={{textAlign:'right',paddingRight:8,background:'#ede9fe',fontSize:'.75rem'}} className="mono">{fv(r.priceLoyal)}</td>
                                <td style={{textAlign:'right',paddingRight:8,background:'#fff7ed',fontSize:'.75rem'}} className="mono">{fv(r.priceNew)}</td>
                              </tr>
                            );
                          })}
                          </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2} style={{textAlign:'right',paddingRight:8,fontSize:'.68rem',color:'#334155',fontWeight:900}}>
                            TỔNG ({mgmtData.filter(g=>g.skus>0).length} nhóm có dữ liệu)
                          </td>
                          <td style={{textAlign:'right',paddingRight:8}}>
                            <div className="mono" style={{fontWeight:900,color:'#15803d'}}>{fv(mgmtData.reduce((s,g)=>s+g.totalQty,0))}</div>
                          </td>
                          <td colSpan={11}/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div style={{marginTop:12,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:7,padding:'10px 14px',fontSize:'.72rem',color:'#475569',fontWeight:600,lineHeight:1.8}}>
                    💡 <strong>BQ Giá vốn</strong> = GV blend thuần (không bao gồm CPLK). <strong>📍 Điểm hòa vốn</strong> = Sàn HV tự động = GV × (1 + LK + CPHĐKD + CPTC + CN).
                    <strong>✏️ Sàn ban hành</strong> = nhập tay để làm cơ sở chính thức; % hiển thị so với BQ GV.
                    <strong>👥💛🆕 Giá KH</strong> = Sàn BH × (1 + margin%) — % hiển thị so với BQ GV.
                    Nhấn <strong>Sync</strong> để cập nhật dữ liệu đối thủ.
                  </div>
                </>
              )}

            </div>
          </div>
        )}

        {/* ════ TAB BÁO CÁO ════ */}
        {tab==='report'&&(()=>{
          const TARGET_ALLOYS=['A1050','A3003','A5052'];
          const allMonths=[...new Set(monthlyRevenue.map(r=>r.thang))].sort((a,b)=>b.localeCompare(a));
          const last3Months=allMonths.slice(0,3);
          const getRevForAlloyMonth=(alloy,thang)=>{
            const rows=monthlyRevenue.filter(r=>r.thang===thang&&r.macNhom&&r.macNhom.toUpperCase().includes(alloy.replace('A','')));
            const sl=rows.reduce((s,r)=>s+r.sanLuong,0);
            const dt=rows.reduce((s,r)=>s+r.doanhThu,0);
            return{sanLuong:sl,doanhThu:dt,donGia:sl>0?rows.reduce((s,r)=>s+r.sanLuong*(r.donGiaBanTB||0),0)/sl:0};
          };
          const getAlloyStock=(alloy)=>{
            const inStock=inventory.filter(r=>r.alloy===alloy&&r.status==='IN_STOCK');
            const inTransit=inventory.filter(r=>r.alloy===alloy&&r.status==='IN_TRANSIT');
            const qtyStock=inStock.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
            const valStock=inStock.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
            const qtyTransit=inTransit.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0);
            const valTransit=inTransit.reduce((s,r)=>s+(parseFloat(r.qtyKg)||0)*(parseFloat(r.avgCost)||0),0);
            return{qtyStock,valStock,qtyTransit,valTransit};
          };
          const getAlloyStockAlert=(alloy)=>{
            const {qtyStock,qtyTransit}=getAlloyStock(alloy);
            const total=qtyStock+qtyTransit;
            const msRows=minStockRows.filter(r=>r.alloy===alloy);
            const totalMin=msRows.reduce((s,r)=>s+(parseFloat(r.minStockKg)||0),0);
            const totalMax=msRows.reduce((s,r)=>s+(r.maxStockKg?parseFloat(r.maxStockKg):0),0);
            // Tính từng SKU: dư và thiếu KHÔNG bù trừ nhau
            let tongDu=0, tongThieu=0;
            const skuDetails=[];
            const skuGroups=groupBySku(inventory.filter(r=>r.alloy===alloy));
            msRows.forEach(ms=>{
              const k=skuKey(ms);
              const grp=skuGroups.find(g=>g.key===k);
              const cur=grp?[...grp.inStock,...grp.inTransit].reduce((s,r)=>s+(parseFloat(r.qtyKg)||0),0):0;
              const min=parseFloat(ms.minStockKg)||0;
              const max=ms.maxStockKg?parseFloat(ms.maxStockKg):null;
              const delta=min>0?cur-min:null;
              const isOverMax=max!==null&&cur>max;
              if(isOverMax) tongDu+=cur-(max||0);
              else if(delta!==null&&delta<0) tongThieu+=Math.abs(delta);
              else if(delta!==null&&delta>0&&!isOverMax) tongDu+=delta;
              skuDetails.push({k,cur,min,max,delta,isOverMax});
            });
            const isOver=totalMax>0&&total>totalMax;
            const isLow=tongThieu>0;
            const isNear=!isLow&&totalMin>0&&total>=totalMin*0.8&&total<totalMin;
            return{total,totalMin,totalMax,tongDu,tongThieu,isOver,isLow,isNear,skuDetails};
          };
          const getStockCoeff=(alloy)=>{
            const {qtyStock,valStock,qtyTransit,valTransit}=getAlloyStock(alloy);
            const total=qtyStock+qtyTransit;
            const totalVal=valStock+valTransit;
            // hệ số tồn = tồn tháng này / SL hoặc DT từng tháng (không BQ)
            return{total,totalVal};
          };

          return(
          <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
            <div style={{maxWidth:'1340px',margin:'0 auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>📈 Báo cáo Tồn kho & Doanh thu</h2>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn btn-purple btn-sm" onClick={()=>syncGoogleSheet('lim')} disabled={dbStatus.loading||!ghVerified}><Ic.Refresh/> Sync Hạn mức</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>syncGoogleSheet('all')} disabled={dbStatus.loading||!ghVerified}><Ic.Refresh/> Sync All</button>
                </div>
              </div>

              {/* ══════════ KHỐI 🌐 TOÀN KHO ══════════ */}
              <div style={{background:'#ffffff',border:'2px solid #bfdbfe',borderRadius:12,padding:'16px 20px',marginBottom:16,boxShadow:'0 2px 8px rgba(0,0,0,0.07)'}}>
                <div style={{fontSize:'.72rem',color:'#1d4ed8',fontWeight:900,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14,display:'flex',alignItems:'center',gap:8}}>
                  🌐 TOÀN KHO — TỔNG QUAN NHANH
                  {monthlyRevenue.length===0&&<span style={{fontSize:'.65rem',color:'#b45309',fontWeight:700,background:'#fef3c7',border:'1px solid #fde047',borderRadius:4,padding:'2px 8px'}}>⚠ Chưa có DT — nhấn Sync All</span>}
                </div>

                {/* ROW 1: KPI toàn kho — Tổng KL & Vốn tồn kho (chi tiết Trong kho / Đi đường) */}
                {(()=>{
                  const stockKg=reportData.stockKg||0;
                  const transitKg=reportData.transitKg||0;
                  const totalKg=stockKg+transitKg;
                  const stockVal=reportData.stockCostValue||0;
                  const transitValRaw=reportData.transitCostValue||0;
                  const transitValAdj=transitValRaw*0.9; // Đi đường x 0.9 theo yêu cầu giám đốc
                  const totalValAdj=stockVal+transitValAdj;
                  return(
                  <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:14}}>
                    {/* THẺ 1: TỔNG KL TỒN KHO */}
                    <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 13px'}}>
                      <div style={{fontSize:'.66rem',color:'#475569',fontWeight:800,marginBottom:6,textTransform:'uppercase',letterSpacing:'.04em'}}>📦 Tổng KL tồn kho</div>
                      <div className="mono" style={{fontSize:'1.15rem',fontWeight:900,color:'#15803d',marginBottom:6}}>{fv(totalKg)} kg</div>
                      <div style={{borderTop:'1px solid #bbf7d0',paddingTop:5,display:'flex',flexDirection:'column',gap:3}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:'.62rem',fontWeight:700,color:'#15803d'}}>🟢 Trong kho</span>
                          <span className="mono" style={{fontSize:'.78rem',fontWeight:900,color:'#15803d'}}>{fv(stockKg)} kg</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:'.62rem',fontWeight:700,color:'#b45309'}}>🟡 Đi đường</span>
                          <span className="mono" style={{fontSize:'.78rem',fontWeight:900,color:'#b45309'}}>{fv(transitKg)} kg</span>
                        </div>
                      </div>
                    </div>
                    {/* THẺ 2: TỔNG VỐN TỒN KHO */}
                    <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'10px 13px'}}>
                      <div style={{fontSize:'.66rem',color:'#475569',fontWeight:800,marginBottom:6,textTransform:'uppercase',letterSpacing:'.04em'}}>💰 Tổng vốn tồn kho</div>
                      <div className="mono" style={{fontSize:'1.15rem',fontWeight:900,color:'#1d4ed8',marginBottom:6}}>{fv(totalValAdj)}đ</div>
                      <div style={{borderTop:'1px solid #bfdbfe',paddingTop:5,display:'flex',flexDirection:'column',gap:3}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:'.62rem',fontWeight:700,color:'#1d4ed8'}}>🟢 Vốn trong kho</span>
                          <span className="mono" style={{fontSize:'.78rem',fontWeight:900,color:'#1d4ed8'}}>{fv(stockVal)}đ</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:'.62rem',fontWeight:700,color:'#b45309'}}>🟡 Vốn đi đường (×0.9)</span>
                          <span className="mono" style={{fontSize:'.78rem',fontWeight:900,color:'#b45309'}}>{fv(transitValAdj)}đ</span>
                        </div>
                        <div style={{fontSize:'.55rem',fontStyle:'italic',color:'#64748b',marginTop:2,lineHeight:1.4}}>
                          * Hàng đi đường nhân hệ số 0.9 do chưa về kho, giảm rủi ro định giá. Vốn gốc đi đường: {fv(transitValRaw)}đ
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {/* ROW 1b: TỔNG DOANH THU NHÔM (A1050+A3003+A5052) — 3 cột: T hiện tại | T-1 | T-2 */}
                {(()=>{
                  // Lấy tháng hiện tại theo định dạng MM/YYYY (giống dữ liệu trong GSheet)
                  const now=new Date();
                  const curMonthLabel=`${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
                  // 2 tháng gần nhất đã có dữ liệu (loại tháng hiện tại nếu trùng)
                  const closedMonths=allMonths.filter(m=>m!==curMonthLabel).slice(0,2);
                  // displayMonths: [T hiện tại, T-1, T-2]
                  const displayMonths=[curMonthLabel,...closedMonths];
                  if(displayMonths.filter(Boolean).length===0) return null;
                  // Helper: trích M/YYYY từ chuỗi "Tháng 3/2026" hoặc "Tháng 03/2026"
                  const parseThangLabel=(s)=>{
                    if(!s) return null;
                    const m=String(s).match(/(\d{1,2})\s*[\/\-]\s*(\d{4})/);
                    if(!m) return null;
                    return `${String(parseInt(m[1])).padStart(2,'0')}/${m[2]}`;
                  };
                  // Gộp CashFlow theo tháng: trả về {"03/2026":{tongThu,tongMua}, ...}
                  const cfByMonth={};
                  (cashFlowData||[]).forEach(r=>{
                    const key=parseThangLabel(r.thang);
                    if(!key) return;
                    if(!cfByMonth[key]) cfByMonth[key]={tongThu:0,tongMua:0,hasData:false};
                    if(r.tongThu!=null){cfByMonth[key].tongThu+=r.tongThu;cfByMonth[key].hasData=true;}
                    if(r.tongMua!=null){cfByMonth[key].tongMua+=r.tongMua;cfByMonth[key].hasData=true;}
                  });
                  // Tính KPI từng tháng
                  const totals=displayMonths.map(m=>{
                    if(!m) return null;
                    let sl=0,dt=0;
                    TARGET_ALLOYS.forEach(al=>{
                      const rv=getRevForAlloyMonth(al,m);
                      sl+=rv.sanLuong; dt+=rv.doanhThu;
                    });
                    const donGia=sl>0?dt/sl:0;
                    // Tự động lấy Tổng thu & Tổng mua trong tháng từ CashFlow (gộp các tuần)
                    const cf=cfByMonth[m]||{tongThu:0,tongMua:0,hasData:false};
                    const tongThu=cf.tongThu||0;
                    const tongMua=cf.tongMua||0;
                    // Kết chuyển sang T+1 = Tổng thu − Tổng nhu cầu mua trong tháng
                    const ketChuyen=cf.hasData?(tongThu-tongMua):0;
                    return{m,sl,dt,donGia,tongThu,tongMua,ketChuyen,hasCFData:cf.hasData};
                  });
                  // % chênh lệch so với tháng trước (kế tiếp trong mảng)
                  const pctChange=(cur,prev)=>(prev&&prev>0&&cur>0)?((cur-prev)/prev*100):null;
                  return(
                  <div style={{background:'#f0f4ff',border:'2px solid #a5b4fc',borderRadius:9,padding:'11px 14px',marginBottom:14}}>
                    <div style={{fontSize:'.68rem',color:'#3730a3',fontWeight:900,marginBottom:10,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                      📊 TỔNG DOANH THU NHÔM (A1050 + A3003 + A5052) — 3 tháng gần nhất
                      <span style={{fontSize:'.6rem',color:'#6366f1',fontWeight:700,background:'#e0e7ff',borderRadius:3,padding:'1px 7px'}}>T hiện tại · T-1 · T-2</span>
                      <span style={{fontSize:'.58rem',color:'#065f46',fontWeight:600,background:'#d1fae5',borderRadius:3,padding:'1px 6px'}}>🔗 Kết chuyển HM tự tính từ CashFlow</span>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:`repeat(${totals.length},1fr)`,gap:9}}>
                      {totals.map((t,ti)=>{
                        if(!t) return <div key={ti}/>;
                        const isCur=ti===0;
                        const prev=totals[ti+1];
                        const dtPct=isCur||!prev?null:pctChange(t.dt,prev?.dt);
                        const dgPct=isCur||!prev?null:pctChange(t.donGia,prev?.donGia);
                        // For current month, compare with closest closed month
                        const curDtPct=isCur?pctChange(t.dt,totals[1]?.dt):null;
                        const curDgPct=isCur?pctChange(t.donGia,totals[1]?.donGia):null;
                        const showDtPct=isCur?curDtPct:dtPct;
                        const showDgPct=isCur?curDgPct:dgPct;
                        return(
                        <div key={ti} style={{background:isCur?'#fef9c3':'#ffffff',border:`2px solid ${isCur?'#facc15':'#c7d2fe'}`,borderRadius:7,padding:'9px 11px',display:'flex',flexDirection:'column',gap:6}}>
                          {/* Header */}
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span style={{fontWeight:900,fontSize:'.78rem',color:isCur?'#854d0e':'#3730a3'}}>{t.m}</span>
                            {isCur
                              ?<span style={{fontSize:'.55rem',color:'#854d0e',fontWeight:800,background:'#fde68a',borderRadius:3,padding:'1px 5px'}}>DT CẬP NHẬT ĐẾN HÔM NAY</span>
                              :ti===1?<span style={{fontSize:'.55rem',color:'#4f46e5',fontWeight:700,background:'#c7d2fe',borderRadius:3,padding:'1px 5px'}}>Tháng trước</span>
                              :<span style={{fontSize:'.55rem',color:'#64748b',fontWeight:700,background:'#e2e8f0',borderRadius:3,padding:'1px 5px'}}>T-2</span>}
                          </div>
                          {/* KPI: Sản lượng / Doanh thu / Đơn giá BQ */}
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                            <div>
                              <div style={{fontSize:'.55rem',color:'#64748b',fontWeight:600}}>Sản lượng</div>
                              <div className="mono" style={{fontSize:'.78rem',fontWeight:900,color:'#15803d'}}>{t.sl>0?fv(t.sl)+' kg':'—'}</div>
                            </div>
                            <div>
                              <div style={{fontSize:'.55rem',color:'#64748b',fontWeight:600}}>Doanh thu</div>
                              <div className="mono" style={{fontSize:'.78rem',fontWeight:900,color:'#1d4ed8'}}>{t.dt>0?fv(t.dt)+'đ':'—'}</div>
                              {showDtPct!==null&&!isNaN(showDtPct)&&<div style={{fontSize:'.58rem',fontWeight:800,color:showDtPct>=0?'#15803d':'#dc2626'}}>{showDtPct>=0?'▲':'▼'} {Math.abs(showDtPct).toFixed(1)}%</div>}
                            </div>
                            <div>
                              <div style={{fontSize:'.55rem',color:'#64748b',fontWeight:600}}>Đơn giá BQ</div>
                              <div className="mono" style={{fontSize:'.78rem',fontWeight:800,color:'#854d0e'}}>{t.donGia>0?fv(t.donGia)+'đ':'—'}</div>
                              {showDgPct!==null&&!isNaN(showDgPct)&&<div style={{fontSize:'.58rem',fontWeight:800,color:showDgPct>=0?'#15803d':'#dc2626'}}>{showDgPct>=0?'▲':'▼'} {Math.abs(showDgPct).toFixed(1)}%</div>}
                            </div>
                            <div>
                              <div style={{fontSize:'.55rem',color:'#64748b',fontWeight:600}}>Hệ số SL/DT</div>
                              <div className="mono" style={{fontSize:'.65rem',fontWeight:700,color:'#475569'}}>
                                {t.sl>0?(reportData.globalKg/t.sl).toFixed(2)+'×':'—'}
                                {' / '}
                                {t.dt>0?(reportData.globalCostValue/t.dt).toFixed(2)+'×':'—'}
                              </div>
                            </div>
                          </div>
                          {/* Tự động: Tổng thu + Tổng nhu cầu mua + Kết chuyển HM (lấy từ CashFlow) */}
                          <div style={{borderTop:'1px dashed '+(isCur?'#facc15':'#c7d2fe'),paddingTop:6,display:'flex',flexDirection:'column',gap:3}}>
                            {!t.hasCFData?(
                              <div style={{fontSize:'.58rem',color:'#92400e',fontWeight:700,background:'#fef3c7',border:'1px solid #fde047',borderRadius:4,padding:'4px 7px'}}>
                                ⚠ Chưa có dữ liệu CashFlow tháng {t.m} – nhấn <strong>Sync CF</strong> ở tab Dòng Tiền
                              </div>
                            ):(
                            <>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#ecfdf5',border:'1px solid #a7f3d0',borderRadius:4,padding:'3px 7px'}}>
                                <span style={{fontSize:'.58rem',fontWeight:700,color:'#065f46'}}>💰 Tổng thu</span>
                                <span className="mono" style={{fontSize:'.72rem',fontWeight:900,color:'#065f46'}}>{t.tongThu>0?fv(t.tongThu)+'đ':'—'}</span>
                              </div>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:4,padding:'3px 7px'}}>
                                <span style={{fontSize:'.58rem',fontWeight:700,color:'#991b1b'}}>🛒 Tổng nhu cầu mua</span>
                                <span className="mono" style={{fontSize:'.72rem',fontWeight:900,color:'#991b1b'}}>{t.tongMua>0?fv(t.tongMua)+'đ':'—'}</span>
                              </div>
                              <div style={{background:t.ketChuyen>=0?'#dcfce7':'#fee2e2',border:'1px solid '+(t.ketChuyen>=0?'#86efac':'#fca5a5'),borderRadius:4,padding:'4px 8px',marginTop:2}}>
                                <div style={{fontSize:'.53rem',fontWeight:800,color:t.ketChuyen>=0?'#14532d':'#991b1b',textTransform:'uppercase',letterSpacing:'.04em',display:'flex',justifyContent:'space-between'}}>
                                  <span>↪ Kết chuyển sang T+1</span>
                                  <span style={{fontStyle:'italic',opacity:.75}}>= Thu − Mua</span>
                                </div>
                                <div className="mono" style={{fontSize:'.78rem',fontWeight:900,color:t.ketChuyen>=0?'#14532d':'#991b1b'}}>
                                  {t.ketChuyen>=0?'+':''}{fv(t.ketChuyen)}đ
                                </div>
                              </div>
                            </>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    {/* Tổng kết Kết chuyển từ tháng trước → cộng vào HM hiệu lực tháng hiện tại */}
                    {totals[0]&&totals[1]&&totals[1].hasCFData&&(
                      <div style={{marginTop:10,background:totals[1].ketChuyen>=0?'#fef3c7':'#fee2e2',border:'1px solid '+(totals[1].ketChuyen>=0?'#fcd34d':'#fca5a5'),borderRadius:6,padding:'8px 12px',fontSize:'.72rem',fontWeight:700,color:totals[1].ketChuyen>=0?'#854d0e':'#991b1b'}}>
                        ⚡ <strong>Kết chuyển từ {totals[1].m} sang {totals[0].m}:</strong> <span className="mono" style={{fontWeight:900,color:totals[1].ketChuyen>=0?'#15803d':'#991b1b',marginLeft:4}}>{totals[1].ketChuyen>=0?'+':''}{fv(totals[1].ketChuyen)}đ</span>
                        <div style={{fontSize:'.62rem',fontWeight:600,marginTop:3,color:'#475569'}}>
                          = Tổng thu {totals[1].m} ({fv(totals[1].tongThu)}đ) − Tổng nhu cầu mua {totals[1].m} ({fv(totals[1].tongMua)}đ).
                          {totals[1].ketChuyen>=0?' Phần dư này sẽ cộng vào HM hiệu lực tháng hiện tại.':' Phần thiếu này sẽ trừ vào HM hiệu lực tháng hiện tại.'}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}

                {/* ROW 2: BẢNG CHI TIẾT A1050 / A3003 / A5052 — mỗi mác 1 block dọc */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:14}}>
                  {TARGET_ALLOYS.map(alloy=>{
                    const {qtyStock,valStock,qtyTransit,valTransit}=getAlloyStock(alloy);
                    const alert=getAlloyStockAlert(alloy);
                    const {totalVal}=getStockCoeff(alloy);
                    const g=reportData.alloyStats.find(x=>x.alloy===alloy)||{avgBefore:0,avgAfter:0,plainKg:0,coatedKg:0,plainCostValue:0,coatedCostValue:0};
                    let borderColor='#cbd5e1',headerBg='#f1f5f9',headerC='#334155';
                    let alertTag=null;
                    const hasDu=alert.tongDu>0;
                    const hasThieu=alert.tongThieu>0;
                    if(hasDu&&hasThieu){
                      // Vừa có dư vừa có thiếu ở các SKU khác nhau
                      borderColor='#f97316';headerBg='#fff7ed';headerC='#9a3412';
                      alertTag=<div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        <span style={{background:'#fee2e2',color:'#b91c1c',border:'1px solid #fca5a5',borderRadius:4,padding:'1px 6px',fontSize:'.62rem',fontWeight:900}}>🔴 Thiếu {fv(alert.tongThieu)}kg</span>
                        <span style={{background:'#f3e8ff',color:'#6d28d9',border:'1px solid #d8b4fe',borderRadius:4,padding:'1px 6px',fontSize:'.62rem',fontWeight:900}}>🟣 Dư {fv(alert.tongDu)}kg</span>
                      </div>;
                    } else if(hasThieu){
                      borderColor='#fca5a5';headerBg='#fef2f2';headerC='#991b1b';
                      alertTag=<span style={{background:'#fee2e2',color:'#b91c1c',border:'1px solid #fca5a5',borderRadius:4,padding:'2px 8px',fontSize:'.67rem',fontWeight:900}}>🔴 THIẾU {fv(alert.tongThieu)}kg</span>;
                    } else if(hasDu){
                      borderColor='#d8b4fe';headerBg='#f3e8ff';headerC='#581c87';
                      alertTag=<span style={{background:'#f3e8ff',color:'#6d28d9',border:'1px solid #d8b4fe',borderRadius:4,padding:'2px 8px',fontSize:'.67rem',fontWeight:900}}>🟣 DƯ {fv(alert.tongDu)}kg</span>;
                    } else if(alert.isNear){
                      borderColor='#fdba74';headerBg='#fff7ed';headerC='#92400e';
                      alertTag=<span style={{background:'#ffedd5',color:'#9a3412',border:'1px solid #fdba74',borderRadius:4,padding:'2px 8px',fontSize:'.67rem',fontWeight:900}}>🟡 SẮP THIẾU</span>;
                    } else if(alert.totalMin>0){
                      alertTag=<span style={{background:'#dcfce7',color:'#14532d',border:'1px solid #86efac',borderRadius:4,padding:'2px 8px',fontSize:'.67rem',fontWeight:900}}>✓ ĐỦ KẾ HOẠCH</span>;
                    }
                    return(
                    <div key={alloy} style={{border:`2px solid ${borderColor}`,borderRadius:10,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.07)'}}>
                      {/* Header mác */}
                      <div style={{background:headerBg,padding:'8px 13px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`1px solid ${borderColor}`}}>
                        <span style={{fontWeight:900,fontSize:'1rem',color:headerC}}>{alloy}</span>
                        {alertTag}
                      </div>
                      <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
                        {/* Tồn: Trong kho + Đi đường */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:6,padding:'7px 10px'}}>
                            <div style={{fontSize:'.6rem',fontWeight:800,color:'#15803d',marginBottom:3}}>🟢 Trong kho</div>
                            <div className="mono" style={{fontSize:'.92rem',fontWeight:900,color:'#15803d'}}>{fv(qtyStock)}<span style={{fontSize:'.65rem',marginLeft:3,fontWeight:600}}>kg</span></div>
                            <div className="mono" style={{fontSize:'.7rem',fontWeight:700,color:'#16a34a',marginTop:2}}>{fv(valStock)}<span style={{fontSize:'.6rem',marginLeft:1}}>đ</span></div>
                          </div>
                          <div style={{background:'#fefce8',border:'1px solid #fef08a',borderRadius:6,padding:'7px 10px'}}>
                            <div style={{fontSize:'.6rem',fontWeight:800,color:'#854d0e',marginBottom:3}}>🟡 Đi đường</div>
                            <div className="mono" style={{fontSize:'.92rem',fontWeight:900,color:'#d97706'}}>{fv(qtyTransit)}<span style={{fontSize:'.65rem',marginLeft:3,fontWeight:600}}>kg</span></div>
                            <div className="mono" style={{fontSize:'.7rem',fontWeight:700,color:'#b45309',marginTop:2}}>{fv(valTransit)}<span style={{fontSize:'.6rem',marginLeft:1}}>đ</span></div>
                          </div>
                        </div>
                        {/* GV + PE/NOPE */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:5}}>
                          <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:5,padding:'5px 7px'}}>
                            <div style={{fontSize:'.55rem',color:'#64748b',fontWeight:700}}>GV BQ HT</div>
                            <div className="mono" style={{fontSize:'.78rem',fontWeight:800,color:'#334155'}}>{fv(g.avgBefore)}</div>
                          </div>
                          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:5,padding:'5px 7px'}}>
                            <div style={{fontSize:'.55rem',color:'#1d4ed8',fontWeight:700}}>GV sau nhập</div>
                            <div className="mono" style={{fontSize:'.78rem',fontWeight:800,color:g.avgAfter>g.avgBefore?'#dc2626':'#1d4ed8'}}>{fv(g.avgAfter)}</div>
                          </div>
                          <div style={{background:'#fef08a',border:'1px solid #fde047',borderRadius:5,padding:'5px 7px'}}>
                            <div style={{fontSize:'.55rem',color:'#854d0e',fontWeight:700}}>⬜ NOPE</div>
                            <div className="mono" style={{fontSize:'.72rem',fontWeight:800,color:'#a16207'}}>{fv(g.plainKg)} kg</div>
                            <div className="mono" style={{fontSize:'.65rem',color:'#a16207',fontWeight:600}}>{fv(g.plainCostValue)}đ</div>
                          </div>
                          <div style={{background:'#ccfbf1',border:'1px solid #99f6e4',borderRadius:5,padding:'5px 7px'}}>
                            <div style={{fontSize:'.55rem',color:'#0f766e',fontWeight:700}}>🎨 PE</div>
                            <div className="mono" style={{fontSize:'.72rem',fontWeight:800,color:'#0f766e'}}>{fv(g.coatedKg)} kg</div>
                            <div className="mono" style={{fontSize:'.65rem',color:'#0f766e',fontWeight:600}}>{fv(g.coatedCostValue)}đ</div>
                          </div>
                        </div>
                        {/* Min/Max — dư & thiếu theo từng SKU, không bù trừ */}
                        {alert.totalMin>0&&(
                          <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:5,padding:'6px 9px'}}>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'.6rem',color:'#475569',fontWeight:700,marginBottom:3}}>
                              <span>Tổng tồn: <strong>{fv(alert.total)} kg</strong></span>
                              <span>Min: {fv(alert.totalMin)}{alert.totalMax>0?` · Max: ${fv(alert.totalMax)}`:''}</span>
                            </div>
                            <div className="stock-bar" style={{height:5,marginBottom:5}}><div className="stock-bar-fill" style={{width:`${Math.min((alert.total/alert.totalMin)*100,100)}%`,background:alert.tongThieu>0?'#dc2626':alert.isNear?'#d97706':alert.tongDu>0&&!alert.tongThieu?'#7c3aed':'#16a34a'}}/></div>
                            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                              {alert.tongThieu>0&&<div style={{fontSize:'.58rem',fontWeight:800,color:'#b91c1c',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:3,padding:'1px 6px'}}>
                                🔴 SKU thiếu min: <span className="mono">{fv(alert.tongThieu)} kg</span>
                              </div>}
                              {alert.tongDu>0&&<div style={{fontSize:'.58rem',fontWeight:800,color:'#6d28d9',background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:3,padding:'1px 6px'}}>
                                🟣 SKU dư min: <span className="mono">{fv(alert.tongDu)} kg</span>
                              </div>}
                              {!alert.tongThieu&&!alert.tongDu&&<div style={{fontSize:'.58rem',fontWeight:700,color:'#15803d'}}>✓ Tất cả SKU đạt kế hoạch</div>}
                            </div>
                          </div>
                        )}
                        {/* DOANH THU TỪNG THÁNG */}
                        <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:6,padding:'7px 10px'}}>
                          <div style={{fontSize:'.6rem',color:'#0369a1',fontWeight:900,marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span>📊 Doanh thu theo tháng</span>
                            <span style={{fontSize:'.58rem',color:'#64748b',fontWeight:600}}>SL · DT · Đơn giá BQ</span>
                          </div>
                          {last3Months.length>0?(
                            <div style={{display:'flex',flexDirection:'column',gap:4}}>
                              {last3Months.map((m,mi)=>{
                                const rv=getRevForAlloyMonth(alloy,m);
                                const coeffSL=rv.sanLuong>0?(alert.total/rv.sanLuong):null;
                                const coeffDT=rv.doanhThu>0?(totalVal/rv.doanhThu):null;
                                return(
                                <div key={mi} style={{background:mi===0?'#e0f2fe':'#ffffff',border:'1px solid #bae6fd',borderRadius:5,padding:'5px 8px'}}>
                                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                                    <span style={{fontWeight:900,fontSize:'.65rem',color:'#0369a1'}}>{m}</span>
                                    {mi===0&&<span style={{fontSize:'.58rem',color:'#0284c7',fontWeight:700,background:'#bae6fd',borderRadius:3,padding:'1px 5px'}}>Gần nhất</span>}
                                  </div>
                                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4}}>
                                    <div>
                                      <div style={{fontSize:'.55rem',color:'#64748b',fontWeight:600}}>Sản lượng</div>
                                      <div className="mono" style={{fontSize:'.72rem',fontWeight:800,color:'#15803d'}}>{rv.sanLuong>0?fv(rv.sanLuong)+' kg':'—'}</div>
                                    </div>
                                    <div>
                                      <div style={{fontSize:'.55rem',color:'#64748b',fontWeight:600}}>Doanh thu</div>
                                      <div className="mono" style={{fontSize:'.72rem',fontWeight:800,color:'#1d4ed8'}}>{rv.doanhThu>0?fv(rv.doanhThu)+'đ':'—'}</div>
                                    </div>
                                    <div>
                                      <div style={{fontSize:'.55rem',color:'#64748b',fontWeight:600}}>Đơn giá BQ</div>
                                      <div className="mono" style={{fontSize:'.72rem',fontWeight:800,color:'#854d0e'}}>{rv.donGia>0?fv(rv.donGia):'—'}</div>
                                    </div>
                                  </div>
                                  {/* Hệ số tồn so với tháng đó */}
                                  {(coeffSL!==null||coeffDT!==null)&&(
                                    <div style={{marginTop:4,display:'flex',gap:8,borderTop:'1px solid #bae6fd',paddingTop:3}}>
                                      {coeffSL!==null&&<div style={{fontSize:'.58rem',color:'#475569',fontWeight:600}}>
                                        Hệ số SL: <span className="mono" style={{fontWeight:900,color:coeffSL>3?'#7c3aed':coeffSL>1.5?'#d97706':'#15803d'}}>{coeffSL.toFixed(2)}×</span>
                                      </div>}
                                      {coeffDT!==null&&<div style={{fontSize:'.58rem',color:'#475569',fontWeight:600}}>
                                        Hệ số GT: <span className="mono" style={{fontWeight:900,color:coeffDT>3?'#7c3aed':coeffDT>1.5?'#d97706':'#15803d'}}>{coeffDT.toFixed(2)}×</span>
                                      </div>}
                                    </div>
                                  )}
                                </div>
                                );
                              })}
                            </div>
                          ):(
                            <div style={{textAlign:'center',padding:'8px',color:'#94a3b8',fontSize:'.65rem',fontWeight:600}}>Chưa có dữ liệu — nhấn Sync All</div>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* ROW 3: Hạn mức */}
                <div style={{borderTop:`1px solid ${border1}`,paddingTop:12}}>
                  <div style={{fontSize:'.63rem',color:'#1e293b',fontWeight:900,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8,display:'flex',alignItems:'center',gap:5}}>
                    <Ic.Alert/> Hạn mức tổng {limitsWarnings.totalAlerts>0&&<span className="tag tr" style={{fontSize:'.6rem',marginLeft:4}}>{limitsWarnings.totalAlerts} vi phạm</span>}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                    {[
                      {bg:limitsWarnings.warnOverKg,label:'📦 Kho tồn (kg)',actual:limitsWarnings.totalKg,limit:limitsWarnings.inventoryMaxKg,unit:' kg',extra:limitsWarnings.inventoryMinKg>0?`MinKg: ${fv(limitsWarnings.inventoryMinKg)} · ${limitsWarnings.warnUnderKg?`▼ Thiếu ${fv(limitsWarnings.inventoryMinKg-limitsWarnings.totalKg)} kg`:'✓ Đạt'}`:null,lbl:`MaxKg: ${fv(limitsWarnings.inventoryMaxKg)}`,f1:'inventoryMaxKg',f2:'inventoryMinKg',v1:limitsWarnings.inventoryMaxKg,v2:limitsWarnings.inventoryMinKg,l1:'Max Kg',l2:'Min Kg'},
                      {bg:limitsWarnings.warnOverAP,label:'🏦 Công nợ (AP)',actual:limitsWarnings.actualAP,limit:limitsWarnings.apLimit,unit:'đ',extra:null,lbl:`APLimit: ${fv(limitsWarnings.apLimit)}đ`,f1:'accountsPayableLimit',f2:'actualAccountsPayable',v1:limitsWarnings.apLimit,v2:limitsWarnings.actualAP,l1:'AP Limit',l2:'CN thực tế'},
                      {bg:limitsWarnings.warnOverCredit,label:'💳 Credit Max',actual:limitsWarnings.totalUsed,limit:limitsWarnings.totalCreditMax,unit:'đ',extra:limitsWarnings.totalCreditMin>0?`Min: ${fv(limitsWarnings.totalCreditMin)}đ · ${limitsWarnings.warnUnderCredit?'▼ Dưới min':'✓ OK'}`:null,lbl:`Max: ${fv(limitsWarnings.totalCreditMax)}đ`,f1:'totalCreditMax',f2:'totalCreditMin',v1:limitsWarnings.totalCreditMax,v2:limitsWarnings.totalCreditMin,l1:'Credit Max',l2:'Credit Min'},
                    ].map((box,bi)=>(
                      <div key={bi} style={{background:box.bg?'#fef2f2':bg4,border:`1px solid ${box.bg?'#fca5a5':border2}`,borderRadius:6,padding:'9px 10px'}}>
                        <div style={{fontSize:'.62rem',fontWeight:900,color:box.bg?'#dc2626':'#334155',marginBottom:6}}>{box.bg&&'⚠ '}{box.label}</div>
                        <LimitBar actual={box.actual} limit={box.limit} label={box.lbl} unit={box.unit}/>
                        {box.extra&&<div style={{marginTop:6,fontSize:'.62rem',fontWeight:700,color:'#475569'}}>{box.extra}</div>}
                        <div style={{marginTop:6,display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                          <div><label className="lbl" style={{fontSize:'.53rem'}}>{box.l1}</label><input className="inp inp-xs mono" style={{fontSize:'.72rem'}} value={fv(box.v1)} onChange={e=>setLimField(box.f1,e.target.value)}/></div>
                          <div><label className="lbl" style={{fontSize:'.53rem'}}>{box.l2}</label><input className="inp inp-xs mono" style={{fontSize:'.72rem'}} value={fv(box.v2)} onChange={e=>setLimField(box.f2,e.target.value)}/></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* CÁC MÁC KHÁC (không phải 3 mác chính) */}
              {reportData.alloyStats.filter(g=>!TARGET_ALLOYS.includes(g.alloy)).length>0&&(
                <>
                  <div style={{fontSize:'.72rem',fontWeight:900,color:'#1e293b',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:11}}>Các mác khác</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:11}}>
                    {reportData.alloyStats.filter(g=>!TARGET_ALLOYS.includes(g.alloy)).map((g,i)=>(
                      <div key={i} style={{background:bg2,border:`1px solid ${border2}`,borderRadius:8,padding:'13px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                        <div style={{fontWeight:900,fontSize:'1rem',color:'#0f172a',marginBottom:10}}>{g.alloy}</div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginBottom:9}}>
                          {[{l:'KL tồn kho',v:fv(g.totalKg)+' kg',c:'#15803d'},{l:'Vốn TK',v:fv(g.totalCostValue)+'đ',c:'#1d4ed8'},{l:'BQ GV hiện tại',v:fv(g.avgBefore)+' đ/kg',c:'#334155'},{l:'BQ Sau nhập',v:fv(g.avgAfter)+' đ/kg',c:g.avgAfter>g.avgBefore?'#dc2626':'#2563eb'}].map((x,j)=>(
                            <div key={j} style={{background:bg4,borderRadius:5,padding:'7px 9px',border:`1px solid ${border1}`}}>
                              <div style={{fontSize:'.6rem',color:'#475569',fontWeight:700,marginBottom:2}}>{x.l}</div>
                              <div className="mono" style={{fontSize:'.85rem',fontWeight:800,color:x.c}}>{x.v}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                          <div style={{background:'#fef08a',border:'1px solid #fde047',borderRadius:5,padding:'6px 8px'}}><div style={{fontSize:'.6rem',color:'#854d0e',fontWeight:800}}>⬜ NOPE</div><div className="mono" style={{fontSize:'.78rem',fontWeight:800,color:'#a16207'}}>{fv(g.plainKg)} kg · {fv(g.plainCostValue)}đ</div></div>
                          <div style={{background:'#ccfbf1',border:'1px solid #99f6e4',borderRadius:5,padding:'6px 8px'}}><div style={{fontSize:'.6rem',color:'#0f766e',fontWeight:800}}>🎨 PE</div><div className="mono" style={{fontSize:'.78rem',fontWeight:800,color:'#0f766e'}}>{fv(g.coatedKg)} kg · {fv(g.coatedCostValue)}đ</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          );
        })()}

        {/* ════ TAB SCENARIOS — ĐÃ BỎ (thay bằng nút 💾 Lưu Local / 📁 Nháp Local) ════ */}
        {false&&(
          <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
            <div style={{maxWidth:'1060px',margin:'0 auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:15}}>
                <div>
                  <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>💾 Scenarios lưu trữ</h2>
                  <p style={{fontSize:'.72rem',color:'#475569',fontWeight:600,marginTop:3}}>
                    {scenarios.length} scenario{scenarios.length!==1?'s':''} · <span style={{color:'#15803d',fontWeight:700}}>✓ Lưu local — giữ nguyên khi tắt máy</span>
                  </p>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  {scenarios.length>0&&(
                    <button className="btn btn-xs" style={{background:'#fee2e2',border:'1px solid #fca5a5',color:'#b91c1c',fontWeight:800}}
                      onClick={()=>{if(window.confirm(`Xóa toàn bộ ${scenarios.length} scenario?\nKhông thể khôi phục.`)){setScenarios([]);try{localStorage.removeItem('pakd_scenarios');}catch(e){}}}}>
                      🗑️ Xóa tất cả
                    </button>
                  )}
                  <button className="btn btn-success btn-sm" onClick={saveScenario}><Ic.Save/> Lưu scenario</button>
                </div>
              </div>
              {/* Info bar */}
              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:6,padding:'8px 13px',marginBottom:13,fontSize:'.72rem',color:'#14532d',fontWeight:600,display:'flex',alignItems:'center',gap:8}}>
                💡 Scenarios được lưu vào <strong>localStorage trình duyệt</strong> — tồn tại khi tắt máy, mở lại vẫn còn. Nhấn <strong>Tải</strong> để khôi phục lô hàng & thông số vào tab PAKD Mua.
              </div>
              {scenarios.length===0?(
                <div className="card" style={{textAlign:'center',padding:44,border:`1px dashed ${border2}`}}>
                  <div style={{fontSize:'2rem',marginBottom:11}}>💾</div>
                  <div style={{color:'#64748b',fontWeight:700,fontSize:'.9rem'}}>Chưa có scenario nào được lưu</div>
                  <div style={{color:'#94a3b8',fontWeight:600,fontSize:'.78rem',marginTop:6}}>Nhấn <strong>Lưu</strong> hoặc <strong>Lưu scenario</strong> để lưu phương án hiện tại</div>
                </div>
              ):(
                <table className="tbl" style={{background:bg2,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                  <thead><tr>
                    <th>#</th>
                    <th style={{textAlign:'left',paddingLeft:9}}>Tên · Ngày · Giờ</th>
                    <th>KL kg</th>
                    <th>Invoice USD</th>
                    <th>BQ Trước</th>
                    <th>BQ Sau nhập</th>
                    <th>Lãi/kg BQ</th>
                    <th>Tổng Lãi VND</th>
                    <th>Rủi ro</th>
                    <th></th>
                  </tr></thead>
                  <tbody>
                    {scenarios.map((s,i)=>(
                      <tr key={s.id}>
                        <td style={{textAlign:'center',color:'#64748b',fontSize:'.75rem',fontWeight:700}} className="mono">{i+1}</td>
                        <td style={{paddingLeft:9}}>
                          <div style={{fontWeight:800,fontSize:'.82rem',color:'#0f172a'}}>{s.name}</div>
                          <div style={{fontSize:'.67rem',color:'#64748b',marginTop:1,fontWeight:600}}>{s.date}{s.time?` · ${s.time}`:''}</div>
                        </td>
                        <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#15803d',fontWeight:700}}>{fv(s.totalKg)}</td>
                        <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#b45309',fontWeight:700}}>{fu(s.invoiceUSD)}</td>
                        <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#475569',fontWeight:700}}>{fv(s.globalAvgBefore)}</td>
                        <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#1d4ed8',fontWeight:800}}>{fv(s.globalAvgAfter)}</td>
                        <td className="mono" style={{textAlign:'right',paddingRight:9,fontWeight:800,color:s.avgProfitPerKg!=null?(s.avgProfitPerKg>=0?'#15803d':'#dc2626'):'#94a3b8'}}>
                          {s.avgProfitPerKg!=null?(s.avgProfitPerKg>=0?'+':'')+fv(s.avgProfitPerKg):'—'}
                        </td>
                        <td className="mono" style={{textAlign:'right',paddingRight:9,fontWeight:800,color:s.totalGrossProfit>=0?'#15803d':'#dc2626'}}>
                          {s.totalGrossProfit!=null?(s.totalGrossProfit>=0?'+':'')+fv(s.totalGrossProfit):'—'}
                        </td>
                        <td style={{textAlign:'center'}}><span className={`tag ${s.hasRisk?'tr':'tg'}`}>{s.hasRisk?'⚠ Rủi ro':'✓ An toàn'}</span></td>
                        <td style={{textAlign:'center'}}>
                          <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                            <button className="btn btn-solid btn-xs" title="Tải lại lô hàng & thông số vào tab PAKD Mua" onClick={()=>{setProducts(s.products);setInputs(s.inputs);setTab('main');}}>📂 Tải</button>
                            <button className="btn-danger" title="Xóa scenario này" onClick={()=>{
                              setScenarios(prev=>{
                                const updated=prev.filter(x=>x.id!==s.id);
                                try{localStorage.setItem('pakd_scenarios',JSON.stringify(updated));}catch(e){}
                                return updated;
                              });
                            }}><Ic.X/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
        {/* ════ TAB FLOOR HISTORY ════ */}
        {tab==='floorhistory'&&(
          <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
            <div style={{maxWidth:'1200px',margin:'0 auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:15}}>
                <div>
                  <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>🗓️ Lịch sử ban hành Giá Sàn (Cloud)</h2>
                  <p style={{fontSize:'.72rem',color:'#475569',fontWeight:600,marginTop:3}}>📚 Đọc trực tiếp từ <code>/floor/history.json</code> trên GitHub — chỉ hiển thị các Sàn đã được Giám đốc duyệt.</p>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button className="btn btn-teal btn-sm" onClick={loadFloorHistoryFromGithub} disabled={floorStatus.loading||!ghVerified} title={ghVerified?'Tải lịch sử Sàn đã duyệt từ GitHub':'Cần xác thực GitHub trước (⚙️ GitHub)'}>{floorStatus.loading?<div className="spinner"/>:'☁️'} Tải lịch sử Cloud</button>
                </div>
              </div>

              {/* Hướng dẫn workflow mới (Cloud only) */}
              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:7,padding:'9px 14px',marginBottom:13,fontSize:'.72rem',color:'#14532d',lineHeight:1.8,fontWeight:600}}>
                📋 <strong>Quy trình mới (chỉ Cloud, không còn GSheet):</strong>
                &nbsp;① Tab <strong>💹 Giá Sàn</strong> → nhập Sàn → nhấn <strong>📤 Gửi GĐ duyệt</strong> →
                &nbsp;② Giám đốc vào Tab Giá Sàn → <strong>📂 Sàn cloud</strong> → ✓ Duyệt + PIN →
                &nbsp;③ File tự append vào <code>/floor/history.json</code> → hiển thị ở tab này.
              </div>

              {/* Filter bar */}
              <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:6,padding:'7px 11px'}}>
                <span style={{fontSize:'.65rem',color:'#475569',fontWeight:800}}>🔎 Lọc:</span>
                <select className="inp inp-xs" style={{width:'auto',minWidth:180}} value={histFilter.group} onChange={e=>setHistFilter(f=>({...f,group:e.target.value}))}>
                  <option value="ALL">Tất cả nhóm hàng</option>
                  {[...new Set(floorHistory.flatMap(e=>(e.groups||[]).map(g=>g.label)))].map(l=><option key={l} value={l}>{l}</option>)}
                </select>
                <label style={{fontSize:'.65rem',color:'#475569',fontWeight:700}}>Từ ngày:</label>
                <input type="date" className="inp inp-xs" style={{width:'auto'}} value={histFilter.dateFrom} onChange={e=>setHistFilter(f=>({...f,dateFrom:e.target.value}))}/>
                <label style={{fontSize:'.65rem',color:'#475569',fontWeight:700}}>Đến ngày:</label>
                <input type="date" className="inp inp-xs" style={{width:'auto'}} value={histFilter.dateTo} onChange={e=>setHistFilter(f=>({...f,dateTo:e.target.value}))}/>
                {(histFilter.group!=='ALL'||histFilter.dateFrom||histFilter.dateTo)&&<button className="btn btn-ghost btn-xs" onClick={()=>setHistFilter({group:'ALL',dateFrom:'',dateTo:''})}>✕ Xóa lọc</button>}
              </div>

              {floorHistory.length===0?(
                <div className="card" style={{textAlign:'center',padding:44,border:`1px dashed ${border2}`}}>
                  <div style={{fontSize:'2rem',marginBottom:11}}>🗓️</div>
                  <div style={{color:'#64748b',fontWeight:700,fontSize:'.9rem'}}>Chưa có lịch sử ban hành</div>
                  <div style={{color:'#94a3b8',fontWeight:600,fontSize:'.78rem',marginTop:6}}>Vào tab <strong>💹 Giá Sàn → Chế độ Quản lý</strong>, nhập Sàn ban hành rồi nhấn <strong>"Lưu lịch sử"</strong></div>
                </div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  {floorHistory.filter(e=>{
                    if(histFilter.group!=='ALL'&&!(e.groups||[]).some(g=>g.label===histFilter.group)) return false;
                    if(histFilter.dateFrom||histFilter.dateTo){
                      const d=e.issuedISO?new Date(e.issuedISO):null;
                      if(!d) return true;
                      if(histFilter.dateFrom&&d<new Date(histFilter.dateFrom)) return false;
                      if(histFilter.dateTo&&d>new Date(histFilter.dateTo+'T23:59:59')) return false;
                    }
                    return true;
                  }).map((entry,ei)=>{
                    const groups=(entry.groups||[]).filter(g=>histFilter.group==='ALL'||g.label===histFilter.group);
                    return(
                      <div key={entry.id} style={{background:bg2,border:`1px solid ${border2}`,borderRadius:9,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.07)'}}>
                        {/* Entry header */}
                        <div style={{background:'#fefce8',borderBottom:`1px solid #fde047`,padding:'9px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{display:'flex',gap:16,alignItems:'center'}}>
                            <div>
                              <span style={{fontWeight:900,fontSize:'.92rem',color:'#0f172a'}}>📅 {entry.issuedDate}</span>
                              <span style={{fontWeight:700,fontSize:'.75rem',color:'#475569',marginLeft:7}}>{entry.issuedTime}</span>
                            </div>
                            <span className="tag ts" style={{fontSize:'.65rem'}}>👤 {entry.issuedBy||'—'}</span>
                            <span className="tag tb" style={{fontSize:'.65rem'}}>💱 {fv(entry.exchangeRate)} đ/USD</span>
                            <span className="tag ts" style={{fontSize:'.62rem'}}>LK {entry.storageCostPct}% · TC {entry.baseFinCostPct}% · HĐKD {entry.opsCostPct}%</span>
                            <span className="tag tg" style={{fontSize:'.65rem'}}>{groups.length} nhóm</span>
                          </div>
                          <div style={{display:'flex',gap:6}}>
                            <button className="btn btn-ghost btn-xs" onClick={()=>exportFloorCSV(entry)}>⬇️ CSV</button>
                            <button className="btn-danger" style={{padding:'3px 7px'}} onClick={()=>{const updated=floorHistory.filter(e2=>e2.id!==entry.id);setFloorHistory(updated);try{localStorage.setItem('pakd_floor_history',JSON.stringify(updated));}catch(e){}}}><Ic.X/></button>
                          </div>
                        </div>
                        {/* Data table */}
                        <div style={{overflowX:'auto'}}>
                          <table className="tbl" style={{fontSize:'.77rem'}}>
                            <thead>
                              <tr>
                                <th style={{textAlign:'left',paddingLeft:10,minWidth:160}}>Nhóm hàng</th>
                                <th style={{width:55}}>SKUs</th>
                                <th style={{minWidth:90}}>Tồn (kg)</th>
                                <th style={{background:'#f0fdf4',color:'#14532d',minWidth:100}}>BQ GV<div style={{fontSize:'.5rem',fontWeight:600,opacity:.8}}>(chưa cộng CP)</div></th>
                                <th style={{background:'#dcfce7',color:'#14532d',fontWeight:900,minWidth:110}}>📍 Điểm hòa vốn<div style={{fontSize:'.5rem',fontWeight:600,opacity:.8}}>tự động</div></th>
                                <th style={{background:'#e0f2fe',color:'#075985',minWidth:90}}>💰 Giá nhập HT<div style={{fontSize:'.5rem',fontWeight:600,opacity:.8}}>từ GSheet</div></th>
                                <th style={{background:'#fef3c7',color:'#92400e',minWidth:90}}>🏭 BQ Đối thủ</th>
                                <th style={{background:'#fde68a',color:'#92400e',minWidth:90}}>🔻 BQ Sàn ĐT</th>
                                <th style={{background:'#fefce8',color:'#713f12',fontWeight:900,minWidth:110}}>✏️ Sàn ban hành</th>
                                <th style={{background:'#eff6ff',color:'#1e3a8a',minWidth:100}}>👥 BQ A Group<div style={{fontSize:'.5rem',fontWeight:600,opacity:.8}}>% vs GV</div></th>
                                <th style={{background:'#ede9fe',color:'#5b21b6',minWidth:100}}>💛 BQ B Group<div style={{fontSize:'.5rem',fontWeight:600,opacity:.8}}>% vs GV</div></th>
                                <th style={{background:'#fff7ed',color:'#9a3412',minWidth:100}}>🆕 BQ C Group<div style={{fontSize:'.5rem',fontWeight:600,opacity:.8}}>% vs GV</div></th>
                              </tr>
                            </thead>
                            <tbody>
                              {groups.map((g,gi)=>{
                                const gv=g.avgCost||0;
                                const pctPub=g.publishedFloor&&gv>0?((g.publishedFloor-gv)/gv*100):null;
                                const pctCore=g.corePrice&&gv>0?((g.corePrice-gv)/gv*100):null;
                                const pctLoyal=g.loyalPrice&&gv>0?((g.loyalPrice-gv)/gv*100):null;
                                const pctNew=g.newPrice&&gv>0?((g.newPrice-gv)/gv*100):null;
                                return(
                                  <tr key={gi} style={{background:gi%2===0?'#ffffff':'#f8fafc'}}>
                                    <td style={{paddingLeft:10}}>
                                      <div style={{fontWeight:800,fontSize:'.8rem',color:'#0f172a'}}>{g.label}</div>
                                      <div style={{fontSize:'.6rem',color:'#475569',fontWeight:600}}>{g.alloy}{g.temper?` ${g.temper}`:''} · {g.minThick}–{g.maxThick}mm</div>
                                    </td>
                                    <td style={{textAlign:'center'}}><span className="tag tb" style={{fontSize:'.65rem'}}>{g.skus}</span></td>
                                    <td style={{textAlign:'right',paddingRight:8}}><div className="mono" style={{fontWeight:700,color:'#15803d',fontSize:'.78rem'}}>{fv(g.totalQty)}</div></td>
                                    <td style={{textAlign:'right',paddingRight:8,background:'#f0fdf4'}}><div className="mono" style={{fontWeight:800,color:'#15803d',fontSize:'.82rem'}}>{fv(g.avgCost)}</div></td>
                                    <td style={{textAlign:'right',paddingRight:8,background:'#dcfce7'}}><div className="mono" style={{fontWeight:800,color:'#15803d',fontSize:'.82rem'}}>{fv(g.autoFloor)}</div></td>
                                    {/* 💰 Giá nhập HT — không lưu trong snapshot, hiển thị — */}
                                    <td style={{textAlign:'center',background:'#e0f2fe'}}><span style={{color:'#94a3b8',fontSize:'.7rem',fontStyle:'italic'}}>—</span></td>
                                    <td style={{textAlign:'right',paddingRight:8,background:'#fef3c7'}}><div className="mono" style={{fontWeight:700,color:'#92400e',fontSize:'.78rem'}}>{g.avgCompPrice>0?fv(g.avgCompPrice):'—'}</div></td>
                                    <td style={{textAlign:'right',paddingRight:8,background:'#fde68a'}}><div className="mono" style={{fontWeight:700,color:'#92400e',fontSize:'.78rem'}}>{g.avgCompFloor>0?fv(g.avgCompFloor):'—'}</div></td>
                                    <td style={{textAlign:'right',paddingRight:8,background:'#fefce8'}}>
                                      <div className="mono" style={{fontWeight:900,color:g.publishedFloor?'#713f12':'#94a3b8',fontSize:'.88rem'}}>{g.publishedFloor?fv(g.publishedFloor):'—'}</div>
                                      {pctPub!=null&&<div style={{fontSize:'.55rem',color:pctPub>=0?'#15803d':'#dc2626',fontWeight:800}}>{pctPub>=0?'+':''}{pctPub.toFixed(2)}% GV</div>}
                                    </td>
                                    <td style={{textAlign:'right',paddingRight:8,background:'#eff6ff'}}>
                                      <div className="mono" style={{fontWeight:800,color:'#1d4ed8',fontSize:'.82rem'}}>{fv(g.corePrice)}</div>
                                      {pctCore!=null&&<div style={{fontSize:'.55rem',color:pctCore>=0?'#1d4ed8':'#dc2626',fontWeight:800}}>{pctCore>=0?'+':''}{pctCore.toFixed(2)}% GV</div>}
                                    </td>
                                    <td style={{textAlign:'right',paddingRight:8,background:'#ede9fe'}}>
                                      <div className="mono" style={{fontWeight:800,color:'#7c3aed',fontSize:'.82rem'}}>{fv(g.loyalPrice)}</div>
                                      {pctLoyal!=null&&<div style={{fontSize:'.55rem',color:pctLoyal>=0?'#7c3aed':'#dc2626',fontWeight:800}}>{pctLoyal>=0?'+':''}{pctLoyal.toFixed(2)}% GV</div>}
                                    </td>
                                    <td style={{textAlign:'right',paddingRight:8,background:'#fff7ed'}}>
                                      <div className="mono" style={{fontWeight:800,color:'#ea580c',fontSize:'.82rem'}}>{fv(g.newPrice)}</div>
                                      {pctNew!=null&&<div style={{fontSize:'.55rem',color:pctNew>=0?'#ea580c':'#dc2626',fontWeight:800}}>{pctNew>=0?'+':''}{pctNew.toFixed(2)}% GV</div>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Cấu trúc cột GSheet */}
              <div style={{marginTop:16,background:'#f0fdf4',border:'1px solid #86efac',borderRadius:7,padding:'9px 14px',fontSize:'.7rem',color:'#14532d',lineHeight:1.8,fontWeight:600}}>
                📊 <strong>Cấu trúc header GSheet tab "Lịch sử Sàn" (22 cột — đặt ở hàng 1):</strong><br/>
                <span style={{fontFamily:'JetBrains Mono',fontSize:'.65rem',background:'#dcfce7',padding:'2px 6px',borderRadius:3,display:'inline-block',marginTop:4,lineHeight:2}}>
                  Ngày ban hành | Giờ | Người lập | Tỷ giá USD | LK% | CPTC% | HĐKD% | Nhóm hàng | Mác | Temper | Dày min | Dày max | SKUs | Tồn kho (kg) | BQ GV (đ/kg) | Sàn tự động (đ/kg) | Sàn ban hành (đ/kg) | A Group (đ/kg) | B Group (đ/kg) | C Group (đ/kg) | BQ ĐT (đ/kg) | Sàn ĐT (đ/kg)
                </span>
              </div>
            </div>
          </div>
        )}

        {tab==='cashflow'&&<CashFlowTab result={result} inputs={inputs} cashFlowData={cashFlowData} cfMode={cfMode} setCFMode={setCFMode} cfManualWeek={cfManualWeek} setCFManualWeek={setCFManualWeek} limitsData={limitsData} syncGoogleSheet={syncGoogleSheet} dbStatus={dbStatus} ghVerified={ghVerified} bg1={bg1} bg2={bg2} border1={border1} border2={border2}/>}

        {/* ════ TAB PO ĐÃ KÝ ════ */}
        {tab==='po'&&(
          <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
            <div style={{maxWidth:'1200px',margin:'0 auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
                <div>
                  <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>📑 Quản lý PO đã ký</h2>
                  <p style={{fontSize:'.72rem',color:'#475569',fontWeight:600,marginTop:2}}>Đơn khách đã ký (THACO, KIM LONG…) · kho để dành giao · đang về · còn thiếu cần đặt mua (GSheet gid=2015387961)</p>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>syncGoogleSheet('po')} disabled={dbStatus.loading||!ghVerified}>{dbStatus.loading?<div className="spinner"/>:<Ic.Refresh/>} Sync PO</button>
                  {poData.length===0?<span className="tag tr pulse">⚠ Chưa có dữ liệu – nhấn Sync</span>:<span className="tag tg">✓ {poData.length} dòng PO</span>}
                </div>
              </div>

              {poData.length>0&&(()=>{
                const list=poEnriched.filter(p=>{
                  if(poFilter.supplier!=='ALL'&&p.supplier!==poFilter.supplier) return false;
                  if(poFilter.onlyShort&&p.needBuy<=0) return false;
                  if(poFilter.search){const s=poFilter.search.toLowerCase();const lbl=`${p.po} ${p.alloy} ${p.temper} ${p.thickness} ${p.width} ${p.length}`.toLowerCase();if(!lbl.includes(s)) return false;}
                  return true;
                });
                const sumRemain=list.reduce((s,p)=>s+p.remaining,0);
                const sumNeed=list.reduce((s,p)=>s+p.needBuy,0);
                const suppliers=[...new Set(poData.map(p=>p.supplier))];
                // group by PO
                const groups={};list.forEach(p=>{(groups[p.po]=groups[p.po]||[]).push(p);});
                return(
                  <>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
                      {[
                        {l:'Số PO',v:[...new Set(list.map(p=>p.po))].length,c:'#1d4ed8'},
                        {l:'Dòng SKU',v:list.length,c:'#0369a1'},
                        {l:'Tổng còn thiếu (kg)',v:fv(sumRemain),c:'#b45309'},
                        {l:'Cần đặt thêm (kg)',v:fv(sumNeed),c:sumNeed>0?'#b91c1c':'#15803d'},
                      ].map((x,i)=><div key={i} className="kpi" style={{borderColor:x.c,borderLeftWidth:4}}><div className="kpi-l">{x.l}</div><div className="kpi-v" style={{color:x.c,fontSize:'1rem'}}>{x.v}</div></div>)}
                    </div>
                    <div className="card" style={{marginBottom:12,padding:'8px 12px',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                      <span style={{fontSize:'.72rem',fontWeight:800,color:'#334155'}}>Lọc:</span>
                      <select className="inp inp-xs" style={{width:'auto'}} value={poFilter.supplier} onChange={e=>setPoFilter(p=>({...p,supplier:e.target.value}))}>
                        <option value="ALL">Tất cả khách hàng</option>
                        {suppliers.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                      <input className="inp inp-xs" style={{width:200}} placeholder="🔍 Tìm PO / mác / quy cách..." value={poFilter.search} onChange={e=>setPoFilter(p=>({...p,search:e.target.value}))}/>
                      <label style={{display:'flex',alignItems:'center',gap:5,fontSize:'.72rem',fontWeight:700,color:'#b91c1c',cursor:'pointer'}}>
                        <input type="checkbox" checked={poFilter.onlyShort} onChange={e=>setPoFilter(p=>({...p,onlyShort:e.target.checked}))}/> Chỉ hiện SKU cần đặt thêm
                      </label>
                    </div>
                    {Object.keys(groups).length===0?(
                      <div className="card" style={{textAlign:'center',padding:30,color:'#64748b',fontWeight:600}}>Không có dòng PO khớp bộ lọc.</div>
                    ):Object.entries(groups).map(([po,items])=>(
                      <div key={po} className="card" style={{marginBottom:10,padding:0,overflow:'hidden'}}>
                        <div style={{background:'#eff6ff',borderBottom:'1px solid #bfdbfe',padding:'7px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{fontWeight:900,fontSize:'.84rem',color:'#1e40af'}}>📄 {po} <span style={{fontSize:'.66rem',fontWeight:700,color:'#475569'}}>· {items[0].supplier}{items[0].poDate?` · ${items[0].poDate}`:''}</span></div>
                          <span className="tag tb" style={{fontSize:'.66rem'}}>{items.length} SKU · còn thiếu {fv(items.reduce((s,p)=>s+p.remaining,0))} kg</span>
                        </div>
                        <table className="tbl" style={{fontSize:'.72rem'}}>
                          <thead><tr>
                            <th style={{textAlign:'left'}}>SKU</th><th style={{background:'#ecfdf5',color:'#065f46'}}>💰 Đơn giá bán KH<div style={{fontSize:'.52rem',fontWeight:600,opacity:.8}}>đ/kg</div></th><th>TL đặt</th><th>Đã giao</th><th>Còn thiếu</th><th>Kho đáp ứng</th><th>Đang về</th><th>Cần đặt thêm</th>
                          </tr></thead>
                          <tbody>
                            {items.map((p,i)=>(
                              <tr key={i} style={p.needBuy>0?{background:'#fff7ed'}:{}}>
                                <td style={{textAlign:'left'}}><SkuLabelCell row={p}/></td>
                                {/* SỬA #2 (R7): Đơn giá bán cho khách (cột Đơn giá trong sheet PO) */}
                                <td className="mono" style={{textAlign:'right',fontWeight:900,color:p.price>0?'#047857':'#cbd5e1',background:'#f0fdf4'}}>{p.price>0?fv(p.price):'—'}</td>
                                <td className="mono" style={{textAlign:'right'}}>{fv(p.ordered)}</td>
                                <td className="mono" style={{textAlign:'right',color:'#15803d'}}>{fv(p.delivered)}</td>
                                <td className="mono" style={{textAlign:'right',fontWeight:800,color:p.remaining>0?'#b45309':'#64748b'}}>{fv(p.remaining)}</td>
                                <td className="mono" style={{textAlign:'right',color:'#16a34a'}}>{fv(p.coverStock)}</td>
                                <td className="mono" style={{textAlign:'right',color:'#d97706'}}>{fv(p.coverTransit)}</td>
                                <td className="mono" style={{textAlign:'right',fontWeight:900,color:p.needBuy>0?'#b91c1c':'#15803d'}}>{p.needBuy>0?'⚠ '+fv(p.needBuy):'✓ đủ'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                );
              })()}

              {poData.length===0&&(
                <div className="card" style={{textAlign:'center',padding:44}}>
                  <div style={{fontSize:'2rem',marginBottom:8}}>📑</div>
                  <div style={{color:'#64748b',fontWeight:700}}>Chưa có dữ liệu PO</div>
                  <div style={{color:'#94a3b8',fontSize:'.75rem',marginTop:4}}>Nhập dữ liệu vào tab Gsheet (gid=2015387961) rồi nhấn <strong>Sync PO</strong>.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {result&&(
        <div className="print-container">
          <div className="print-title">BÁO CÁO PHƯƠNG ÁN MUA HÀNG (PAKD 7.0)</div>
          <div className="print-subtitle">Ngày in: {new Date().toLocaleDateString('vi-VN')} | Đơn vị: VNĐ & Kg</div>
          <div className="print-section">
            <div className="print-section-title">I. Thông số</div>
            <div className="print-grid-4">
              <div className="print-box"><div className="print-box-title">Tỷ giá USD</div><div className="print-box-value">{fv(inputs.exchangeRate)}</div></div>
              <div className="print-box"><div className="print-box-title">CP về kho %</div><div className="print-box-value" style={{fontSize:'12pt',color:'#6d28d9'}}>{inputs.managementFee}%</div></div>
              <div className="print-box"><div className="print-box-title">Thanh toán</div><div className="print-box-value text-blue">{inputs.paymentMethod}</div></div>
              <div className="print-box"><div className="print-box-title">Tổng khối lượng</div><div className="print-box-value text-green">{fv(result.totalKg)} kg</div></div>
            </div>
            {/* SỬA #1 (R7): NCC + PTTT NCC + Thời gian giao hàng */}
            <div className="print-grid-4" style={{marginTop:6}}>
              <div className="print-box"><div className="print-box-title">Nhà cung cấp</div><div className="print-box-value" style={{fontSize:'11pt',color:'#0f766e'}}>{inputs.supplierName||'—'}</div></div>
              <div className="print-box" style={{gridColumn:'span 2'}}><div className="print-box-title">Phương thức thanh toán (NCC)</div><div className="print-box-value" style={{fontSize:'10pt',color:'#7c3aed'}}>{inputs.supplierPaymentTerms||'—'}</div></div>
              <div className="print-box"><div className="print-box-title">Thời gian giao hàng</div><div className="print-box-value text-blue" style={{fontSize:'11pt'}}>{cfMode==='manual'&&cfManualWeek?cfManualWeek:getCurrentWeekLabel()}</div></div>
            </div>
          </div>
          <div className="print-section">
            <div className="print-section-title">II. Phân tích SKU lô mua</div>
            <table className="print-table-a4">
              <thead>
                <tr>
                  <th>Mác-Cứng</th>
                  <th>Quy cách</th>
                  <th>KL (kg)</th>
                  <th>Giá CIF (USD/Tấn)</th>
                  <th>Về kho (đ/kg)</th>
                  <th>GV BQ sau nhập</th>
                  <th>Giá bán tham chiếu</th>
                  <th>Lãi/kg</th>
                  <th>% Lãi/GV BQ</th>
                  <th>Tồn sau nhập (kg)</th>
                  <th>Thiếu/Dư KH</th>
                </tr>
              </thead>
              <tbody>
                {result.blends.map((b,i)=>{
                  const minKg=b.minStock||0;
                  const delta=minKg>0?b.qtyAfter-minKg:null;
                  const pctLai=b.hasSellPrice&&b.avgAfter>0?((b.sellPrice-b.avgAfter)/b.avgAfter*100):null;
                  return(
                    <tr key={i}>
                      <td style={{textAlign:'left'}}>{b.alloy} {b.temper}</td>
                      <td>{b.thickness}×{b.width}×{b.length} [{b.coating==='1E'?'PE':'NOPE'}]</td>
                      <td>{fv(b.qtyKg)}</td>
                      <td>{fv(b.priceFC)}</td>
                      <td>{fv(b.veKhoPerKg)}</td>
                      <td style={{fontWeight:'bold',color:'#1d4ed8'}}>{fv(b.avgAfter)}</td>
                      <td style={{fontWeight:'bold',color:'#15803d'}}>{b.hasSellPrice?fv(b.sellPrice):'—'}</td>
                      <td className={b.hasSellPrice?(b.realProfitPerKg>=0?'text-green':'text-red'):''}>
                        {b.hasSellPrice?(b.realProfitPerKg>=0?'+':'')+fv(b.realProfitPerKg):'—'}
                      </td>
                      <td className={pctLai!==null?(pctLai>=0?'text-green':'text-red'):''}>
                        {pctLai!==null?(pctLai>=0?'+':'')+pctLai.toFixed(2)+'%':'—'}
                      </td>
                      <td>{fv(b.qtyAfter)}</td>
                      <td className={delta===null?'':delta>=0?'text-green':'text-red'}>
                        {delta!==null?(delta>=0?'Dư +':'Thiếu ')+fv(Math.abs(delta)):'—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{textAlign:'right'}}>TỔNG / BQ</td>
                  <td>{fv(result.totalKg)}</td>
                  <td></td>
                  <td>{fv(result.blends.reduce((s,b)=>s+b.qtyKg*(b.veKhoPerKg||0),0)/(result.totalKg||1))}</td>
                  <td style={{color:'#1d4ed8',fontWeight:'bold'}}>{fv(result.globalAvgAfter)}</td>
                  <td style={{color:'#15803d',fontWeight:'bold'}}>{(()=>{const priced=result.blends.filter(b=>b.hasSellPrice);const totKg=priced.reduce((s,b)=>s+(b.qtyKg||0),0);return totKg>0?fv(priced.reduce((s,b)=>s+(b.qtyKg||0)*(b.sellPrice||0),0)/totKg):'—';})()}</td>
                  <td className={result.avgProfitPerKg>=0?'text-green':'text-red'}>
                    {result.avgProfitPerKg!=null?(result.avgProfitPerKg>=0?'+':'')+fv(result.avgProfitPerKg):'—'}
                  </td>
                  <td className={(()=>{const p=result.avgProfitPerKg!=null&&result.globalAvgAfter>0?(result.avgProfitPerKg/result.globalAvgAfter*100):null;return p===null?'':p>=0?'text-green':'text-red';})()}>
                    {(()=>{const p=result.avgProfitPerKg!=null&&result.globalAvgAfter>0?(result.avgProfitPerKg/result.globalAvgAfter*100):null;return p!==null?(p>=0?'+':'')+p.toFixed(2)+'%':'—';})()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="print-section" style={{pageBreakInside:'avoid'}}>
            <div className="print-section-title">III. Kết quả Đơn hàng</div>
            <div className="print-grid-4">
              <div className="print-box">
                <div className="print-box-title">Lợi nhuận Đơn hàng</div>
                <div className="print-box-value" style={{color:result.totalGrossProfit>=0?'#166534':'#991b1b',fontSize:'13pt'}}>
                  {result.totalGrossProfit!=null?(result.totalGrossProfit>=0?'+':'')+fv(result.totalGrossProfit)+'đ':'—'}
                </div>
              </div>
              <div className="print-box">
                <div className="print-box-title">BQ Lãi/kg</div>
                <div className="print-box-value" style={{color:result.avgProfitPerKg>=0?'#166534':'#991b1b',fontSize:'13pt'}}>
                  {result.avgProfitPerKg!=null?(result.avgProfitPerKg>=0?'+':'')+fv(result.avgProfitPerKg)+'đ':'—'}
                </div>
              </div>
              <div className="print-box">
                <div className="print-box-title">% Lãi/GV BQ</div>
                <div className="print-box-value" style={{fontSize:'13pt',color:(()=>{
                  const pct=result.avgProfitPerKg!=null&&result.globalAvgAfter>0?(result.avgProfitPerKg/result.globalAvgAfter*100):null;
                  return pct===null?'#334155':pct>=0?'#166534':'#991b1b';
                })()}}>
                  {(()=>{
                    const pct=result.avgProfitPerKg!=null&&result.globalAvgAfter>0?(result.avgProfitPerKg/result.globalAvgAfter*100):null;
                    return pct!==null?(pct>=0?'+':'')+pct.toFixed(2)+'%':'—';
                  })()}
                </div>
              </div>
              <div className="print-box">
                <div className="print-box-title">Container</div>
                <div className="print-box-value" style={{color:result.containerOk?'#166534':result.totalContainer<24?'#991b1b':'#92400e'}}>
                  {result.totalContainer.toFixed(2)} T {result.containerOk?'✓':'⚠'}
                </div>
              </div>
            </div>
          </div>
          {/* IV. Dòng tiền tuần thanh toán đã chọn */}
          {(()=>{
            const targetWeek=cfMode==='manual'&&cfManualWeek?cfManualWeek:getCurrentWeekLabel();
            const cfRow=cashFlowData.find(r=>matchWeekLabel(r.tuan,targetWeek));
            const tongMua=result.invoiceVND||0;
            const vat=tongMua*0.1;
            const paMua=tongMua+vat;                       // PA Mua (gồm VAT)
            const hanMucKH=cfRow?(cfRow.hanMuc||0):0;       // Hạn mức tuần (KH)
            // Hạn mức sau khi mua PA này = Hạn mức tuần (KH) − PA Mua (gồm VAT)
            const balanceAfterBuy=cfRow?(hanMucKH-paMua):null;
            return(
              <div className="print-section" style={{pageBreakInside:'avoid'}}>
                <div className="print-section-title">IV. Dòng tiền tuần thanh toán — {targetWeek}{cfRow?` (${cfRow.thang||''})`:''}</div>
                {cfRow?(
                  <>
                    <div className="print-grid-4">
                      <div className="print-box"><div className="print-box-title">Tuần thanh toán</div><div className="print-box-value text-blue">{targetWeek}</div></div>
                      <div className="print-box"><div className="print-box-title">PA mua (gồm VAT)</div><div className="print-box-value text-blue">{fv(paMua)}đ</div></div>
                      <div className="print-box"><div className="print-box-title">Tổng chi KH (tuần)</div><div className="print-box-value">{fv(cfRow.tongChi||0)}đ</div></div>
                      <div className="print-box"><div className="print-box-title">Tổng thu KH (tuần)</div><div className="print-box-value text-green">{fv(cfRow.tongThu||0)}đ</div></div>
                    </div>
                    <table className="print-table-a4" style={{marginTop:10}}>
                      <thead><tr><th>Hạn mức tuần (KH)</th><th>PA Mua (gồm VAT)</th><th>Hạn mức sau khi mua PA này</th><th>Dòng ròng KH (Thu − Chi)</th></tr></thead>
                      <tbody><tr>
                        <td className={hanMucKH>=0?'text-green':'text-red'} style={{fontWeight:'bold'}}>{fv(hanMucKH)}đ</td>
                        <td className="text-blue" style={{fontWeight:'bold'}}>{fv(paMua)}đ</td>
                        <td className={balanceAfterBuy!=null&&balanceAfterBuy>=0?'text-green':'text-red'} style={{fontWeight:'bold'}}>{balanceAfterBuy!=null?fv(balanceAfterBuy)+'đ':'—'}{balanceAfterBuy!=null&&balanceAfterBuy<0?' ⚠ HỤT DÒNG':''}</td>
                        <td className={(cfRow.rong||0)>=0?'text-green':'text-red'} style={{fontWeight:'bold'}}>{fv(cfRow.rong||0)}đ</td>
                      </tr></tbody>
                    </table>
                    <div style={{fontSize:'8.5pt',fontStyle:'italic',marginTop:4,color:'#444'}}>Ghi chú: Hạn mức sau khi mua = Hạn mức tuần (KH) − PA Mua (gồm VAT). Tổng chi tuần đã gồm chi HĐ + chi ĐĐ + chi nội + chi khác.</div>
                  </>
                ):(
                  <div style={{padding:'8px 0',fontStyle:'italic'}}>Không có dữ liệu Kế hoạch dòng tiền cho {targetWeek}. Vào tab Dòng Tiền để chọn tuần và Sync dữ liệu.</div>
                )}
              </div>
            );
          })()}
          {/* V. Chi tiết SKU lô mua (cho người duyệt) */}
          {result?.blends?.length>0&&(
            <div className="print-section">
              <div className="print-section-title">V. Chi tiết từng SKU (người duyệt xem)</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px'}}>
                {result.blends.map((b,i)=>{
                  const minKg=b.minStock||0;
                  const minDelta=minKg>0?b.qtyAfter-minKg:null;
                  const isOverMax=b.maxStock!=null&&b.qtyAfter>b.maxStock;
                  return(
                    <div key={b.skuKey+'_print_'+i} style={{border:'1px solid #000',borderRadius:4,padding:'8px 10px',pageBreakInside:'avoid',fontSize:'9pt'}}>
                      <div style={{display:'flex',justifyContent:'space-between',borderBottom:'1px solid #999',paddingBottom:4,marginBottom:5}}>
                        <div><strong style={{fontSize:'10.5pt'}}>{b.alloy} {b.temper}</strong> <span style={{fontFamily:'monospace'}}>{b.thickness}×{b.width}×{b.length} [{b.coating==='1E'?'PE':'NOPE'}]</span></div>
                        <div style={{fontWeight:'bold'}}>{b.hasSellPrice?(b.isRisk?'LỖ':b.realProfitPerKg>0?'LÃI':'HÒA'):'Chưa có giá'}</div>
                      </div>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'8.5pt'}}>
                        <tbody>
                          <tr><td style={{padding:'2px 4px'}}>Trong kho</td><td style={{textAlign:'right',fontFamily:'monospace'}}>{fv(b.qtyStock)} kg @ {fv(b.avgStock)}</td><td style={{padding:'2px 4px'}}>Đang về</td><td style={{textAlign:'right',fontFamily:'monospace'}}>{fv(b.qtyTransit)} kg @ {fv(b.avgTransit)}</td></tr>
                          <tr><td style={{padding:'2px 4px'}}>Lô mới</td><td style={{textAlign:'right',fontFamily:'monospace'}}>{fv(b.qtyKg)} kg @ {fv(b.veKhoPerKg)}</td><td style={{padding:'2px 4px'}}>GV BQ HT</td><td style={{textAlign:'right',fontFamily:'monospace'}}>{fv(b.avgCurrent)}</td></tr>
                          <tr><td style={{padding:'2px 4px'}}>GV BQ sau nhập</td><td style={{textAlign:'right',fontFamily:'monospace',fontWeight:'bold',color:'#1d4ed8'}}>{fv(b.avgAfter)}</td><td style={{padding:'2px 4px'}}>Giá bán tham chiếu</td><td style={{textAlign:'right',fontFamily:'monospace',fontWeight:'bold',color:'#15803d'}}>{b.hasSellPrice?fv(b.sellPrice):'—'}</td></tr>
                          <tr><td style={{padding:'2px 4px'}}>Lãi/kg</td><td style={{textAlign:'right',fontFamily:'monospace',fontWeight:'bold'}} className={b.hasSellPrice?(b.realProfitPerKg>=0?'text-green':'text-red'):''}>{b.hasSellPrice?(b.realProfitPerKg>=0?'+':'')+fv(b.realProfitPerKg):'—'}</td><td style={{padding:'2px 4px'}}>% Lãi/BQSN</td><td style={{textAlign:'right',fontFamily:'monospace',fontWeight:'bold'}} className={b.profitPct==null?'':b.profitPct>=0?'text-green':'text-red'}>{b.profitPct!=null?(b.profitPct>=0?'+':'')+b.profitPct.toFixed(1)+'%':'—'}</td></tr>
                          <tr><td style={{padding:'2px 4px'}}>Tổng lãi lô</td><td style={{textAlign:'right',fontFamily:'monospace',fontWeight:'bold'}} className={b.hasSellPrice?(b.grossProfitVND>=0?'text-green':'text-red'):''}>{b.hasSellPrice?(b.grossProfitVND>=0?'+':'')+fv(b.grossProfitVND)+'đ':'—'}</td><td style={{padding:'2px 4px'}}>Tồn sau nhập</td><td style={{textAlign:'right',fontFamily:'monospace'}}>{fv(b.qtyAfter)} kg{minKg>0?(isOverMax?' (quá max)':minDelta>=0?` (dư +${fv(minDelta)})`:` (thiếu ${fv(Math.abs(minDelta))})`):''}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(()=>{
            // Khối ký: nếu PA đang tải có ý kiến điện tử (approvals) thì in tên + ý kiến + ngày của từng cấp.
            const findApv=(kw)=>(loadedApprovals||[]).find(a=>String(a.role||'').toLowerCase().includes(kw));
            const boxes=[
              {title:'Lập / Đề xuất (Mua hàng)',apv:findApv('mua')},
              {title:'Trưởng Phòng Kinh Doanh',apv:findApv('kinh doanh')||findApv('tp')},
              {title:'Giám Đốc Phê Duyệt',apv:findApv('giám đốc')||findApv('giam doc')},
            ];
            const fmtD=s=>{try{return new Date(s).toLocaleDateString('vi-VN');}catch(e){return '';}};
            return(
              <div style={{display:'flex',justifyContent:'space-around',marginTop:'34px',textAlign:'center',pageBreakInside:'avoid'}}>
                {boxes.map((b,i)=>(
                  <div key={i} style={{width:'30%'}}>
                    <strong>{b.title}</strong>
                    <div style={{fontSize:'8.5pt',fontStyle:'italic',color:'#555'}}>(Ký, ghi rõ họ tên{i>0?', đóng dấu':''})</div>
                    {b.apv?(
                      <div style={{marginTop:6,fontSize:'8.5pt',lineHeight:1.4}}>
                        <div style={{fontWeight:'bold',color:b.apv.decision==='approved'?'#166534':'#991b1b'}}>{b.apv.decision==='approved'?'✓ ĐÃ DUYỆT':'✗ TỪ CHỐI'} (điện tử)</div>
                        {b.apv.opinion?<div style={{fontStyle:'italic',color:'#333',margin:'2px 6px'}}>“{b.apv.opinion}”</div>:<div style={{height:6}}/>}
                        <div style={{borderTop:'1px solid #000',width:'85%',margin:'6px auto 2px'}}/>
                        <div style={{fontWeight:'bold'}}>{b.apv.name}</div>
                        <div style={{fontSize:'7.5pt',color:'#555'}}>{fmtD(b.apv.at)}</div>
                      </div>
                    ):(
                      <><br/><br/><br/><br/><div style={{borderTop:'1px dotted #000',width:'85%',margin:'0 auto'}}/></>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* MODAL: GITHUB CONFIG */}
      {ghStatus.configOpen&&(
        <div onClick={()=>setGhStatus(p=>({...p,configOpen:false}))} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:560,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
              <h3 style={{fontWeight:900,fontSize:'1rem',color:'#0f172a'}}>⚙️ Cấu hình GitHub</h3>
              <button onClick={()=>setGhStatus(p=>({...p,configOpen:false}))} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:11}}>
              <div><label className="lbl">GitHub Username</label><input type="text" className="inp" placeholder="vd: toolaihdsteel-commits" value={ghConfig.owner} onChange={e=>setGhConfig(p=>({...p,owner:e.target.value.trim()}))}/></div>
              <div><label className="lbl">Tên Repo</label><input type="text" className="inp" placeholder="pakd-data" value={ghConfig.repo} onChange={e=>setGhConfig(p=>({...p,repo:e.target.value.trim()}))}/></div>
              <div><label className="lbl">Personal Access Token</label><input type="password" className="inp" placeholder="github_pat_..." value={ghConfig.token} onChange={e=>setGhConfig(p=>({...p,token:e.target.value.trim()}))} style={{fontFamily:'JetBrains Mono',fontSize:'.74rem'}}/><div style={{fontSize:'.65rem',color:'#64748b',marginTop:4,lineHeight:1.5}}>ℹ️ Token chỉ lưu trong trình duyệt (localStorage).</div></div>
              <div><label className="lbl">Branch</label><input type="text" className="inp" placeholder="main" value={ghConfig.branch||'main'} onChange={e=>setGhConfig(p=>({...p,branch:e.target.value.trim()||'main'}))}/></div>
              <div style={{display:'flex',gap:8,marginTop:6,justifyContent:'flex-end'}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setGhConfig({owner:'',repo:'pakd-data',token:'',branch:'main'});try{localStorage.removeItem('pakd_gh_config');}catch(e){}}}>🗑 Xóa</button>
                <button className="btn btn-success btn-sm" disabled={ghVerifying} onClick={async()=>{
                  saveGhConfig(ghConfig);
                  // Tự verify ngay sau khi lưu để mở khóa Sync GSheet
                  const ok=await verifyGithubToken(false);
                  if(ok){setGhStatus(p=>({...p,configOpen:false}));}
                }}>{ghVerifying?'⏳ Đang xác thực...':'💾 Lưu & Xác thực'}</button>
              </div>
              {/* Quản lý người duyệt (Việc 1) */}
              <div style={{marginTop:14,paddingTop:14,borderTop:'2px dashed #cbd5e1'}}>
                <div style={{fontSize:'.78rem',fontWeight:900,color:'#0f172a',marginBottom:8}}>🔐 Người duyệt (quy trình tuần tự)</div>
                <div style={{fontSize:'.7rem',color:'#475569',marginBottom:8,lineHeight:1.5}}>
                  Mỗi người duyệt có 1 PIN riêng (Mua hàng → TP Kinh doanh → Giám đốc). Lưu tại <code style={{background:'#f1f5f9',padding:'1px 4px',borderRadius:3}}>/config/approvers.json</code>. Thêm người sau này chỉ cần mở bảng dưới đây — không sửa code.
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <button className="btn btn-purple btn-sm" onClick={async()=>{await loadApprovers();setApvStatus(p=>({...p,manageOpen:true}));setGhStatus(p=>({...p,configOpen:false}));}} disabled={!ghConfig.token}>👥 Quản lý người duyệt</button>
                  <span style={{fontSize:'.7rem',color:'#475569',fontWeight:700}}>{approvers.length>0?`✓ ${approvers.length} người`:'Chưa thiết lập'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUẢN LÝ NGƯỜI DUYỆT (Việc 1) */}
      {apvStatus.manageOpen&&(
        <div onClick={()=>setApvStatus(p=>({...p,manageOpen:false}))} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:640,width:'100%',maxHeight:'88vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
              <h3 style={{fontWeight:900,fontSize:'1rem',color:'#0f172a'}}>👥 Quản lý người duyệt</h3>
              <button onClick={()=>setApvStatus(p=>({...p,manageOpen:false}))} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
            </div>
            <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'9px 12px',marginBottom:14,fontSize:'.72rem',color:'#1e40af',lineHeight:1.6,fontWeight:600}}>
              Quy trình duyệt PAKD Mua &amp; Giá sàn diễn ra <strong>tuần tự theo thứ tự dưới đây</strong>. Mỗi người dùng PIN riêng để ký ý kiến.<br/>
              🔐 <strong>Thêm/Xóa người duyệt cần PIN của Giám đốc hoặc Quản trị.</strong> Người đầu tiên nên là <em>Quản trị</em> (sẽ giữ quyền quản lý danh sách). Người đầu tiên thêm không cần PIN.
            </div>
            {/* Danh sách hiện có */}
            <div style={{fontSize:'.78rem',fontWeight:900,color:'#0f172a',marginBottom:8}}>Danh sách hiện tại ({approvers.length})</div>
            {approvers.length===0?(
              <div style={{textAlign:'center',padding:'18px',color:'#94a3b8',fontWeight:600,fontSize:'.78rem',background:'#f8fafc',borderRadius:6,marginBottom:14}}>Chưa có người duyệt nào. Thêm bên dưới (theo thứ tự: Mua hàng → TP Kinh doanh → Giám đốc).</div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                {approvers.map((a,i)=>{
                  const sb=(a.stepBuy!==undefined&&a.stepBuy!==null&&a.stepBuy!=='')?parseInt(a.stepBuy)||0:(parseInt(a.order)||0);
                  const sf=parseInt(a.stepFloor)||0;
                  const adm=a.isAdmin||/giamdoc|quantri|admin/.test(stripVN(a.role||''));
                  return(
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,background:adm?'#faf5ff':'#f8fafc',border:`1px solid ${adm?'#d8b4fe':'#e2e8f0'}`,borderRadius:7,padding:'8px 12px'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:'.84rem',color:'#0f172a'}}>{a.name} {adm&&<span style={{fontSize:'.58rem',fontWeight:900,background:'#f3e8ff',color:'#6d28d9',border:'1px solid #d8b4fe',borderRadius:4,padding:'1px 5px',marginLeft:4}}>QUẢN TRỊ</span>}</div>
                      <div style={{fontSize:'.68rem',color:'#475569',fontWeight:600,marginBottom:4}}>{a.role} · 🔒 PIN đã đặt</div>
                      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                        <label style={{fontSize:'.64rem',fontWeight:700,color:'#1d4ed8',display:'flex',alignItems:'center',gap:3}}>Mua:
                          <select value={String(sb)} onChange={e=>updateApproverFields(a.id,{stepBuy:parseInt(e.target.value)||0})} className="inp inp-xs" style={{width:'auto',padding:'1px 4px',fontSize:'.64rem'}}>{['0','1','2','3','4','5'].map(s=><option key={s} value={s}>{s==='0'?'—':'B'+s}</option>)}</select>
                        </label>
                        <label style={{fontSize:'.64rem',fontWeight:700,color:'#0d9488',display:'flex',alignItems:'center',gap:3}}>Sàn:
                          <select value={String(sf)} onChange={e=>updateApproverFields(a.id,{stepFloor:parseInt(e.target.value)||0})} className="inp inp-xs" style={{width:'auto',padding:'1px 4px',fontSize:'.64rem'}}>{['0','1','2','3','4','5'].map(s=><option key={s} value={s}>{s==='0'?'—':'B'+s}</option>)}</select>
                        </label>
                        <label style={{fontSize:'.64rem',fontWeight:700,color:'#6d28d9',display:'flex',alignItems:'center',gap:3,cursor:'pointer'}}>
                          <input type="checkbox" checked={!!a.isAdmin} onChange={e=>updateApproverFields(a.id,{isAdmin:e.target.checked})}/> Quản trị
                        </label>
                      </div>
                    </div>
                    <button className="btn-danger" onClick={()=>removeApprover(a.id)} disabled={apvStatus.loading} title="Xóa người này"><Ic.X/></button>
                  </div>);})}
              </div>
            )}
            {/* Form thêm người */}
            <div style={{borderTop:'2px dashed #cbd5e1',paddingTop:12}}>
              <div style={{fontSize:'.78rem',fontWeight:900,color:'#0f172a',marginBottom:8}}>➕ Thêm người duyệt</div>
              <ApproverAddForm loading={apvStatus.loading} onAdd={addApprover}/>
            </div>
            {apvStatus.error&&<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:5,padding:'7px 10px',fontSize:'.72rem',color:'#991b1b',fontWeight:600,marginTop:10}}>❌ {apvStatus.error}</div>}
          </div>
        </div>
      )}

      {/* MODAL: THIẾT LẬP PIN LẦN ĐẦU */}
      {pinStatus.setupOpen&&(
        <div onClick={()=>setPinStatus(p=>({...p,setupOpen:false}))} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.75)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:480,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
              <h3 style={{fontWeight:900,fontSize:'1rem',color:'#0f172a'}}>🔐 Thiết lập PIN duyệt</h3>
              <button onClick={()=>setPinStatus(p=>({...p,setupOpen:false}))} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
            </div>
            <div style={{background:'#fef9c3',border:'1px solid #fde047',borderRadius:6,padding:'10px 12px',marginBottom:14,fontSize:'.72rem',color:'#854d0e',lineHeight:1.6,fontWeight:600}}>
              ⚠️ Đây là PIN <strong>VĨNH VIỄN</strong> để xác thực Giám đốc khi duyệt PA/Lịch sử Sàn.<br/>
              • Chỉ thiết lập 1 lần (không đổi qua app)<br/>
              • PIN 4-8 chữ số<br/>
              • Chỉ Giám đốc giữ — đừng share<br/>
              • Muốn đổi sau: xóa file <code>/config/approver.json</code> trên GitHub
            </div>
            <PinSetupForm onSubmit={setupPin} loading={pinStatus.loading}/>
            {pinStatus.error&&<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:5,padding:'7px 10px',fontSize:'.72rem',color:'#991b1b',fontWeight:600,marginTop:8}}>❌ {pinStatus.error}</div>}
          </div>
        </div>
      )}
      {/* MODAL: DANH SÁCH PA TỪ GITHUB */}
      {ghStatus.loadOpen&&(
        <div onClick={()=>setGhStatus(p=>({...p,loadOpen:false}))} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:720,width:'100%',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <h3 style={{fontWeight:900,fontSize:'1rem',color:'#0f172a'}}>🔄 Luồng duyệt Mua ({ghStatus.plansList.length})</h3>
                {/* SỬA #1 (R5): Nút Refresh lên ĐẦU */}
                <button className="btn btn-ghost btn-xs" onClick={listPAsFromGithub} disabled={ghStatus.loading} title="Tải lại danh sách từ GitHub" style={{fontSize:'.66rem'}}>🔄 Refresh</button>
                {/* SỬA #2 (R5): Nhãn phân biệt nguồn dữ liệu */}
                <span style={{fontSize:'.58rem',fontWeight:800,background:'#dbeafe',color:'#1e40af',border:'1px solid #93c5fd',borderRadius:10,padding:'1px 8px'}}>☁️ CLOUD (GitHub)</span>
              </div>
              <button onClick={()=>setGhStatus(p=>({...p,loadOpen:false}))} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
            </div>
            <div style={{fontSize:'.64rem',color:'#475569',marginBottom:12,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'6px 10px',lineHeight:1.5}}>☁️ Đây là PA lưu trên <strong>GitHub (cloud)</strong> — cả nhóm cùng thấy. Nút 🗑 Xóa ở đây chỉ xóa file cloud, <strong>KHÔNG</strong> ảnh hưởng "Nháp Local" trong trình duyệt của bạn.</div>
            {ghStatus.plansList.length===0?(<div style={{textAlign:'center',padding:30,color:'#94a3b8',fontWeight:600}}>Chưa có PA nào.</div>):(
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <div style={{display:'flex',gap:4,marginBottom:6,padding:4,background:'#f1f5f9',borderRadius:6}}>
                  {(()=>{
                    const cur=ghStatus.filterStatus||'all';
                    const counts={
                      all:ghStatus.plansList.length,
                      draft:ghStatus.plansList.filter(f=>f._status==='draft').length,
                      pending:ghStatus.plansList.filter(f=>f._status==='pending').length,
                      approved:ghStatus.plansList.filter(f=>f._status==='approved').length,
                      rejected:ghStatus.plansList.filter(f=>f._status==='rejected').length,
                    };
                    return[
                      {k:'all',l:`Tất cả (${counts.all})`,c:'#475569'},
                      {k:'draft',l:`📝 Nháp (${counts.draft})`,c:'#475569'},
                      {k:'pending',l:`⏳ Chờ (${counts.pending})`,c:'#854d0e'},
                      {k:'approved',l:`✓ Duyệt (${counts.approved})`,c:'#14532d'},
                      {k:'rejected',l:`✗ Từ chối (${counts.rejected})`,c:'#991b1b'},
                    ].map(t=>(<button key={t.k} onClick={()=>setGhStatus(p=>({...p,filterStatus:t.k}))} style={{flex:1,padding:'5px 6px',fontSize:'.66rem',fontWeight:800,border:'none',borderRadius:4,cursor:'pointer',background:cur===t.k?'#2563eb':'transparent',color:cur===t.k?'#fff':t.c}}>{t.l}</button>));
                  })()}
                </div>
                {ghStatus.plansList.filter(f=>{const fs=ghStatus.filterStatus||'all';return fs==='all'||f._status===fs;}).map((f,i)=>{
                  const st=f._status||'pending';
                  const badge=st==='approved'?{bg:'#dcfce7',br:'#86efac',c:'#14532d',t:'✓ ĐÃ DUYỆT'}:st==='rejected'?{bg:'#fee2e2',br:'#fca5a5',c:'#991b1b',t:'✗ TỪ CHỐI'}:st==='draft'?{bg:'#f1f5f9',br:'#cbd5e1',c:'#475569',t:'📝 NHÁP (chưa trình)'}:st==='error'?{bg:'#f1f5f9',br:'#cbd5e1',c:'#475569',t:'⚠ Lỗi'}:{bg:'#fef3c7',br:'#fcd34d',c:'#854d0e',t:'⏳ CHỜ DUYỆT'};
                  return(
                    <div key={i} style={{background:'#fff',border:`2px solid ${badge.br}`,borderRadius:7,padding:'10px 13px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                            <span className="mono" style={{fontSize:'.76rem',fontWeight:800,color:'#1d4ed8'}}>{f.name}</span>
                            <span style={{fontSize:'.6rem',fontWeight:900,background:badge.bg,color:badge.c,border:`1px solid ${badge.br}`,borderRadius:3,padding:'1px 6px'}}>{badge.t}</span>
                          </div>
                          <div style={{fontSize:'.66rem',color:'#0f172a',marginTop:3,fontWeight:700}}>
                            👤 Gửi: <span style={{color:'#1d4ed8'}}>{f._requestedBy}</span>
                            {f._totalVND>0&&<span style={{marginLeft:10,color:'#475569',fontWeight:600}}>💰 {fv(f._totalVND/1e6)}tr · 📦 {fv(f._totalKg)}kg</span>}
                          </div>
                          {f._requestNote&&<div style={{fontSize:'.65rem',color:'#854d0e',background:'#fef9c3',border:'1px solid #fde047',borderRadius:4,padding:'3px 7px',marginTop:3,fontStyle:'italic'}}>📝 {f._requestNote}</div>}
                          {/* Thanh tiến trình duyệt tuần tự */}
                          {approvers.length>0&&(()=>{
                            const acts=f._approvals||[];
                            const prog=approvalProgress(approvers,acts,'buy');
                            if(prog.empty) return <div style={{fontSize:'.6rem',color:'#b45309',fontWeight:700,marginTop:4}}>⚠ Chưa đặt bước duyệt luồng MUA</div>;
                            return(
                              <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:5,alignItems:'center'}}>
                                {prog.chain.map(ap=>{
                                  const act=acts.find(a=>a.id===ap.id);
                                  const isNext=prog.nextApprover&&prog.nextApprover.id===ap.id&&!prog.rejected;
                                  const bg=act?(act.decision==='approved'?'#dcfce7':'#fee2e2'):isNext?'#fef9c3':'#f1f5f9';
                                  const bc=act?(act.decision==='approved'?'#16a34a':'#dc2626'):isNext?'#f59e0b':'#cbd5e1';
                                  const ic=act?(act.decision==='approved'?'✓':'✗'):isNext?'⏳':'•';
                                  return <span key={ap.id} title={act?`${ap.name}: ${act.decision==='approved'?'Đồng ý':'Từ chối'}${act.opinion?' — '+act.opinion:''}`:isNext?`Đang chờ ${ap.name}`:ap.name} style={{fontSize:'.58rem',fontWeight:800,padding:'1px 6px',borderRadius:10,background:bg,border:`1px solid ${bc}`,color:act?(act.decision==='approved'?'#14532d':'#991b1b'):isNext?'#92400e':'#64748b'}}>{ic} {ap.name.replace(/^(Ms|Mr|Mrs)\.?\s*/i,'')}</span>;
                                })}
                              </div>
                            );
                          })()}
                          {/* Ý kiến đã ghi */}
                          {(f._approvals||[]).map((a,ai)=>(
                            <div key={ai} style={{fontSize:'.62rem',marginTop:2,color:a.decision==='approved'?'#14532d':'#991b1b',fontWeight:600}}>
                              {a.decision==='approved'?'✓':'✗'} <strong>{a.name}</strong> ({a.role}){a.opinion?`: "${a.opinion}"`:''}
                            </div>
                          ))}
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
                          <button className="btn btn-purple btn-xs" onClick={()=>loadPAFromGithub(f)} disabled={ghStatus.loading} style={{fontSize:'.65rem'}}>⬇ Tải</button>
                          {(()=>{
                            const acts=f._approvals||[];
                            const prog=approvalProgress(approvers,acts,'buy');
                            if(approvers.length===0||prog.empty) return <span style={{fontSize:'.58rem',color:'#b45309',fontWeight:700,maxWidth:90,textAlign:'right'}}>⚠ Chưa đặt bước MUA</span>;
                            if(prog.rejected) return <span style={{fontSize:'.6rem',color:'#991b1b',fontWeight:800}}>Đã từ chối</span>;
                            if(prog.done) return <span style={{fontSize:'.6rem',color:'#14532d',fontWeight:800}}>✓ Duyệt đủ cấp</span>;
                            const nx=prog.nextApprover;
                            return <button className="btn btn-success btn-xs" onClick={()=>setApproveModal({open:true,file:f,approver:nx})} disabled={ghStatus.loading} style={{fontSize:'.62rem'}} title={`Duyệt / cho ý kiến — nhập PIN để xác nhận. Đang chờ: ${nx.name} (${nx.role})`}>✍ Duyệt / Cho ý kiến</button>;
                          })()}
                          {/* SỬA #1 (R4): Xóa PA — cần PIN quản trị/Giám đốc */}
                          <button onClick={()=>deletePAFromGithub(f)} disabled={ghStatus.loading} title="Xóa phương án này (cần PIN Quản trị/Giám đốc)" style={{fontSize:'.6rem',background:'#fef2f2',color:'#b91c1c',border:'1px solid #fca5a5',padding:'2px 7px',fontWeight:800,borderRadius:5,cursor:'pointer'}}>🗑 Xóa</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{marginTop:12,display:'flex',justifyContent:'flex-start',alignItems:'center',borderTop:'1px solid #e2e8f0',paddingTop:10}}>
              <span style={{fontSize:'.68rem',color:'#64748b'}}>⚠️ Tải PA sẽ ghi đè PA hiện tại.</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NHẬP PIN ẨN CHỮ */}
      {pinPrompt.open&&(
        <PinPromptModal message={pinPrompt.message} onSubmit={pin=>closePinPrompt(pin)} onCancel={()=>closePinPrompt(null)}/>
      )}

      {/* MODAL: NHÁP LOCAL (thay tab Scenarios) */}
      {draftModalOpen&&(
        <div onClick={()=>setDraftModalOpen(false)} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:640,width:'100%',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <h3 style={{fontWeight:900,fontSize:'1rem',color:'#0f172a'}}>📁 Bản nháp PA trên máy ({localDrafts.length})</h3>
                <span style={{fontSize:'.58rem',fontWeight:800,background:'#fef9c3',color:'#854d0e',border:'1px solid #fde047',borderRadius:10,padding:'1px 8px'}}>💻 LOCAL (trình duyệt)</span>
              </div>
              <button onClick={()=>setDraftModalOpen(false)} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
            </div>
            <div style={{fontSize:'.7rem',color:'#475569',marginBottom:12,background:'#f1f5f9',borderRadius:6,padding:'8px 12px',lineHeight:1.5}}>💡 Bản nháp chỉ lưu trên trình duyệt máy này (không lên GitHub). Tải về để chỉnh tiếp hoặc Trình duyệt.</div>
            {localDrafts.length===0?(
              <div style={{textAlign:'center',padding:30,color:'#94a3b8',fontWeight:600}}>Chưa có bản nháp nào. Nhấn "💾 Lưu Local" để tạo.</div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {localDrafts.map((d,i)=>(
                  <div key={d.id} style={{display:'flex',alignItems:'center',gap:10,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:7,padding:'9px 12px'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:'.82rem',color:'#0f172a'}}>{d.label}</div>
                      <div style={{fontSize:'.66rem',color:'#475569',fontWeight:600,marginTop:2}}>{d.savedAt?new Date(d.savedAt).toLocaleString('vi-VN'):''} · {d.snapshot?fv(d.snapshot.totalKg)+'kg · '+fv((d.snapshot.totalVND||0)/1e6)+'tr':''}</div>
                    </div>
                    <button className="btn btn-purple btn-xs" onClick={()=>{if(d.inputs)setInputs(d.inputs);if(d.products)setProducts(d.products);if(Array.isArray(d.sellingPrices)&&d.sellingPrices.length>0)setSP(d.sellingPrices);setDraftModalOpen(false);setTab('main');alert('✓ Đã tải nháp "'+d.label+'" vào màn hình.');}} style={{fontSize:'.65rem'}}>⬇ Tải</button>
                    <button className="btn-danger" onClick={()=>{const next=localDrafts.filter(x=>x.id!==d.id);setLocalDrafts(next);try{localStorage.setItem('pakd_local_drafts',JSON.stringify(next));}catch(e){}}} title="Xóa nháp này"><Ic.X/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SỬA #4: MODAL Nháp Giá sàn trên máy */}
      {floorDraftModalOpen&&(
        <div onClick={()=>setFloorDraftModalOpen(false)} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:680,width:'100%',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <h3 style={{fontWeight:900,fontSize:'1rem',color:'#0f172a'}}>🗂 Bản nháp Giá sàn trên máy ({floorDrafts.length})</h3>
                <span style={{fontSize:'.58rem',fontWeight:800,background:'#fef9c3',color:'#854d0e',border:'1px solid #fde047',borderRadius:10,padding:'1px 8px'}}>💻 LOCAL (trình duyệt)</span>
              </div>
              <button onClick={()=>setFloorDraftModalOpen(false)} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
            </div>
            <div style={{fontSize:'.7rem',color:'#475569',marginBottom:12,background:'#f1f5f9',borderRadius:6,padding:'8px 12px',lineHeight:1.5}}>💡 Nháp Sàn chỉ lưu trên trình duyệt máy này (không lên GitHub). Tải lại sẽ khôi phục y nguyên: tỷ giá, các %, Sàn ban hành đã nhập, SKU loại trừ, cờ trừ PO.</div>
            {floorDrafts.length===0?(
              <div style={{textAlign:'center',padding:30,color:'#94a3b8',fontWeight:600}}>Chưa có nháp Sàn nào. Vào tab 💹 Giá Sàn → nhấn "💾 Lưu nháp Sàn".</div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {floorDrafts.map((d)=>(
                  <div key={d.id} style={{display:'flex',alignItems:'center',gap:10,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:7,padding:'9px 12px'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:'.82rem',color:'#0f172a'}}>{d.label}</div>
                      <div style={{fontSize:'.66rem',color:'#475569',fontWeight:600,marginTop:2}}>{d.savedAt?new Date(d.savedAt).toLocaleString('vi-VN'):''}{d.snapshot?` · 📊 ${d.snapshot.groupsCount||0} nhóm · ✅ ${d.snapshot.publishedCount||0} ban hành · 💱 ${d.snapshot.exchangeRate?Number(d.snapshot.exchangeRate).toLocaleString('vi-VN'):'?'}`:''}</div>
                    </div>
                    <button className="btn btn-purple btn-xs" onClick={()=>loadFloorLocal(d)} style={{fontSize:'.65rem'}}>⬇ Tải</button>
                    <button className="btn-danger" onClick={()=>{const next=floorDrafts.filter(x=>x.id!==d.id);setFloorDrafts(next);try{localStorage.setItem('pakd_floor_drafts',JSON.stringify(next));}catch(e){}}} title="Xóa nháp này"><Ic.X/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CHO Ý KIẾN / DUYỆT TUẦN TỰ (Việc 1 đợt 2) */}
      {approveModal.open&&approveModal.approver&&(
        <ApprovalModal
          file={approveModal.file}
          approver={approveModal.approver}
          loading={ghStatus.loading}
          onClose={()=>setApproveModal({open:false,file:null,approver:null})}
          onSubmit={async(decision,opinion,pin)=>{
            const ok=await submitApproval(approveModal.file,decision,opinion,pin);
            if(ok) setApproveModal({open:false,file:null,approver:null});
          }}
        />
      )}

      {/* MODAL: SÀN PENDING / APPROVED */}
      {floorStatus.viewOpen&&(
        <div onClick={()=>setFloorStatus(p=>({...p,viewOpen:false}))} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:880,width:'100%',maxHeight:'88vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <h3 style={{fontWeight:900,fontSize:'1rem',color:'#0f172a'}}>🔄 Luồng duyệt Sàn</h3>
                {/* SỬA #1 (R5): Nút Refresh lên ĐẦU */}
                <button className="btn btn-ghost btn-xs" onClick={listFloorSubmissions} disabled={floorStatus.loading} title="Tải lại danh sách Sàn từ GitHub" style={{fontSize:'.66rem'}}>🔄 Refresh</button>
                {/* SỬA #2 (R5): Nhãn phân biệt nguồn */}
                <span style={{fontSize:'.58rem',fontWeight:800,background:'#dbeafe',color:'#1e40af',border:'1px solid #93c5fd',borderRadius:10,padding:'1px 8px'}}>☁️ CLOUD (GitHub)</span>
              </div>
              <button onClick={()=>setFloorStatus(p=>({...p,viewOpen:false}))} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
            </div>
            <div style={{fontSize:'.64rem',color:'#475569',marginBottom:10,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'6px 10px',lineHeight:1.5}}>☁️ PA Sàn lưu trên <strong>GitHub (cloud)</strong> — cả nhóm cùng thấy. Nút 🗑 Xóa ở đây chỉ xóa file cloud, <strong>KHÔNG</strong> ảnh hưởng "🗂 Sàn nháp" trong trình duyệt của bạn.</div>
            <div style={{display:'flex',gap:4,marginBottom:12,padding:4,background:'#f1f5f9',borderRadius:6}}>
              <button onClick={()=>setFloorStatus(p=>({...p,activeTab:'pending'}))} style={{flex:1,padding:'6px 10px',fontSize:'.74rem',fontWeight:800,border:'none',borderRadius:4,cursor:'pointer',background:floorStatus.activeTab==='pending'?'#facc15':'transparent',color:floorStatus.activeTab==='pending'?'#0f172a':'#854d0e'}}>⏳ Chờ duyệt ({floorStatus.pendingList.length})</button>
              <button onClick={()=>setFloorStatus(p=>({...p,activeTab:'approved'}))} style={{flex:1,padding:'6px 10px',fontSize:'.74rem',fontWeight:800,border:'none',borderRadius:4,cursor:'pointer',background:floorStatus.activeTab==='approved'?'#16a34a':'transparent',color:floorStatus.activeTab==='approved'?'#fff':'#14532d'}}>✓ Đã duyệt ({floorStatus.approvedList.length})</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:'55vh',overflowY:'auto'}}>
              {(()=>{
                const list=floorStatus.activeTab==='pending'?floorStatus.pendingList:floorStatus.approvedList;
                if(list.length===0) return <div style={{textAlign:'center',padding:30,color:'#94a3b8',fontWeight:600}}>Chưa có file nào.</div>;
                return list.map((f,i)=>{
                  const d=f._data||{};
                  const isPending=floorStatus.activeTab==='pending'&&d.status!=='rejected';
                  const isRejected=d.status==='rejected';
                  const isApproved=floorStatus.activeTab==='approved';
                  const badge=isApproved?{bg:'#dcfce7',br:'#86efac',c:'#14532d',t:'✓ ĐÃ DUYỆT'}:isRejected?{bg:'#fee2e2',br:'#fca5a5',c:'#991b1b',t:'✗ TỪ CHỐI'}:{bg:'#fef3c7',br:'#fcd34d',c:'#854d0e',t:'⏳ CHỜ DUYỆT'};
                  return(
                    <div key={i} style={{background:'#fff',border:`2px solid ${badge.br}`,borderRadius:7,padding:'10px 13px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                            {/* SỬA #2 (R4): Hiện NGÀY GỬI chính xác dd/mm/yyyy + (tuần) thay vì chỉ W.. */}
                            <span style={{fontSize:'.86rem',fontWeight:900,color:'#1d4ed8'}}>🗓 {d.savedAt?new Date(d.savedAt).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}):f.name.replace('.json','')}{d.weekLabel?` (${d.weekLabel.replace(/^\d{4}-/,'')})`:''}</span>
                            <span style={{fontSize:'.6rem',fontWeight:900,background:badge.bg,color:badge.c,border:`1px solid ${badge.br}`,borderRadius:3,padding:'1px 6px'}}>{badge.t}</span>
                          </div>
                          <div style={{fontSize:'.66rem',color:'#0f172a',marginTop:3,fontWeight:700}}>
                            👤 Gửi: <span style={{color:'#1d4ed8'}}>{d.requestedBy||d.savedBy||'?'}</span>
                            <span style={{marginLeft:10,color:'#475569',fontWeight:600}}>📊 {d.groupsCount||0} nhóm</span>
                          </div>
                          {d.requestNote&&<div style={{fontSize:'.65rem',color:'#854d0e',background:'#fef9c3',border:'1px solid #fde047',borderRadius:4,padding:'3px 7px',marginTop:3,fontStyle:'italic'}}>📝 {d.requestNote}</div>}
                          {d.approvedBy&&<div style={{fontSize:'.62rem',color:'#14532d',marginTop:2,fontWeight:600}}>✓ Duyệt: <strong>{d.approvedBy}</strong></div>}
                          {/* SỬA #1 (R3): Thanh tiến trình duyệt Sàn + người duyệt tiếp theo */}
                          {approvers.length>0&&(()=>{
                            const acts=d.approvals||[];
                            const prog=approvalProgress(approvers,acts,'floor');
                            if(prog.empty) return <div style={{fontSize:'.6rem',color:'#b45309',fontWeight:700,marginTop:4}}>⚠ Chưa đặt bước duyệt luồng SÀN</div>;
                            return(
                              <div style={{marginTop:5}}>
                                <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
                                  {prog.chain.map(ap=>{
                                    const act=acts.find(a=>a.id===ap.id);
                                    const passed=prog.topSigned>0&&stepOf(ap,'floor')<prog.topSigned&&!act; // bị bỏ qua
                                    const isNext=prog.nextApprover&&prog.nextApprover.id===ap.id&&!prog.rejected&&!prog.done;
                                    const bg=act?(act.decision==='approved'?'#dcfce7':'#fee2e2'):isNext?'#fef9c3':passed?'#f8fafc':'#f1f5f9';
                                    const bc=act?(act.decision==='approved'?'#16a34a':'#dc2626'):isNext?'#f59e0b':'#cbd5e1';
                                    const ic=act?(act.decision==='approved'?'✓':'✗'):isNext?'⏳':passed?'⤼':'•';
                                    return <span key={ap.id} title={act?`${ap.name}: ${act.decision==='approved'?'Đồng ý':'Bác'}${act.opinion?' — '+act.opinion:''}`:isNext?`Đang chờ ${ap.name}`:passed?`${ap.name}: đã bỏ qua (bước thấp hơn)`:ap.name} style={{fontSize:'.58rem',fontWeight:800,padding:'1px 6px',borderRadius:10,background:bg,border:`1px solid ${bc}`,color:act?(act.decision==='approved'?'#14532d':'#991b1b'):isNext?'#92400e':'#94a3b8',textDecoration:passed?'line-through':'none'}}>{ic} {ap.name.replace(/^(Ms|Mr|Mrs)\.?\s*/i,'')}<span style={{opacity:.6}}> ·B{stepOf(ap,'floor')}</span></span>;
                                  })}
                                </div>
                                <div style={{fontSize:'.6rem',marginTop:3,fontWeight:700,color:prog.done?'#14532d':prog.rejected?'#991b1b':'#92400e'}}>
                                  {prog.done?'✓ Đã duyệt đủ cấp (bước cao nhất đã ký)':prog.rejected?'✗ Đã bị bác':prog.nextApprover?`⏳ Chờ duyệt: ${prog.nextApprover.name} (${prog.nextApprover.role} · bước ${stepOf(prog.nextApprover,'floor')})`:'⏳ Chờ duyệt'}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
                          {/* SỬA #2: Xem chi tiết + Tải nội dung Sàn (giống PAKD Mua) */}
                          {(()=>{const key=(f._folder||floorStatus.activeTab)+'/'+f.name;const open=floorStatus.expandFloorKey===key;return(
                          <button onClick={()=>setFloorStatus(p=>({...p,expandFloorKey:open?null:key}))} style={{fontSize:'.65rem',background:open?'#e0e7ff':'#eef2ff',color:'#3730a3',border:'1px solid #c7d2fe',padding:'3px 8px',fontWeight:800,borderRadius:5,cursor:'pointer'}}>{open?'▲ Ẩn':'👁 Xem'}</button>
                          );})()}
                          <button onClick={()=>loadFloorSubmissionToApp(d,f.name)} title="Tải Sàn này vào màn hình (tỷ giá, Sàn ban hành, cờ trừ PO)" style={{fontSize:'.65rem',background:'#dcfce7',color:'#14532d',border:'1px solid #86efac',padding:'3px 8px',fontWeight:800,borderRadius:5,cursor:'pointer'}}>⬇ Tải về app</button>
                          {isPending&&<button className="btn btn-success btn-xs" onClick={()=>reviewFloorSubmission(f,'pending','approved')} disabled={floorStatus.loading} style={{fontSize:'.65rem'}}>✓ Duyệt</button>}
                          {isPending&&<button onClick={()=>reviewFloorSubmission(f,'pending','rejected')} disabled={floorStatus.loading} style={{fontSize:'.65rem',background:'#fee2e2',color:'#991b1b',border:'1px solid #fca5a5',padding:'3px 8px',fontWeight:800,borderRadius:5,cursor:'pointer'}}>✗ Bác</button>}
                          {/* SỬA #1 (R4): Xóa PA Sàn — cần PIN quản trị/Giám đốc */}
                          <button onClick={()=>deleteFloorSubmission(f,floorStatus.activeTab)} disabled={floorStatus.loading} title="Xóa phương án Sàn này (cần PIN Quản trị/Giám đốc)" style={{fontSize:'.6rem',background:'#fef2f2',color:'#b91c1c',border:'1px solid #fca5a5',padding:'2px 7px',fontWeight:800,borderRadius:5,cursor:'pointer'}}>🗑 Xóa</button>
                        </div>
                      </div>
                      {/* SỬA #2: Bảng chi tiết các nhóm giá sàn (đọc d.groups) */}
                      {floorStatus.expandFloorKey===((f._folder||floorStatus.activeTab)+'/'+f.name)&&(
                        <div style={{marginTop:8,paddingTop:8,borderTop:'1px dashed #cbd5e1'}}>
                          <div style={{fontSize:'.66rem',color:'#475569',fontWeight:700,marginBottom:5}}>💱 Tỷ giá: <strong>{d.exchangeRate?Number(d.exchangeRate).toLocaleString('vi-VN'):'?'}</strong> · 📊 {(d.groups||[]).length} nhóm ban hành</div>
                          <div style={{overflowX:'auto'}}>
                            <table className="tbl" style={{fontSize:'.66rem',width:'100%'}}>
                              <thead><tr>
                                <th style={{textAlign:'left'}}>Nhóm</th>
                                <th style={{textAlign:'right'}}>Mác</th>
                                <th style={{textAlign:'right'}}>Dày (mm)</th>
                                <th style={{textAlign:'right'}}>TL (kg)</th>
                                <th style={{textAlign:'right'}}>Sàn tự động</th>
                                <th style={{textAlign:'right'}}>Sàn ban hành</th>
                                <th style={{textAlign:'right'}}>A Group</th>
                                <th style={{textAlign:'right'}}>B Group</th>
                                <th style={{textAlign:'right'}}>C Group</th>
                              </tr></thead>
                              <tbody>
                                {(d.groups||[]).map((g,gi)=>(
                                  <tr key={gi}>
                                    <td style={{textAlign:'left',fontWeight:700}}>{g.label||g.id}</td>
                                    <td style={{textAlign:'right'}}>{g.alloy||''}{g.temper?(' '+g.temper):''}</td>
                                    <td style={{textAlign:'right'}}>{g.minThick}{g.maxThick&&g.maxThick!==g.minThick?('–'+g.maxThick):''}</td>
                                    <td style={{textAlign:'right'}}>{g.totalQty?Number(g.totalQty).toLocaleString('vi-VN'):''}</td>
                                    <td style={{textAlign:'right',color:'#64748b'}}>{g.autoFloor?Number(g.autoFloor).toLocaleString('vi-VN'):''}</td>
                                    <td style={{textAlign:'right',fontWeight:900,color:'#7c3aed'}}>{g.publishedFloor?Number(g.publishedFloor).toLocaleString('vi-VN'):''}</td>
                                    <td style={{textAlign:'right'}}>{g.corePrice?Number(g.corePrice).toLocaleString('vi-VN'):''}</td>
                                    <td style={{textAlign:'right'}}>{g.loyalPrice?Number(g.loyalPrice).toLocaleString('vi-VN'):''}</td>
                                    <td style={{textAlign:'right'}}>{g.newPrice?Number(g.newPrice).toLocaleString('vi-VN'):''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {Array.isArray(d.approvals)&&d.approvals.length>0&&(
                            <div style={{marginTop:6,fontSize:'.62rem',color:'#334155'}}>
                              {d.approvals.map((a,ai)=>(
                                <div key={ai} style={{marginTop:2}}>{a.decision==='rejected'?'✗':'✓'} <strong>{a.name}</strong> ({a.role}) — {a.at?new Date(a.at).toLocaleString('vi-VN'):''}{a.opinion?(': '+a.opinion):''}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
            <div style={{marginTop:12,display:'flex',justifyContent:'flex-start',alignItems:'center',borderTop:'1px solid #e2e8f0',paddingTop:10}}>
              <span style={{fontSize:'.68rem',color:'#64748b'}}>💡 Duyệt đủ cấp → ban hành + lưu lịch sử.</span>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: LỊCH SỬ SÀN ĐÃ DUYỆT (có expand chi tiết) */}
      {floorStatus.historyOpen&&(
        <div onClick={()=>setFloorStatus(p=>({...p,historyOpen:false,expandedIdx:null}))} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:1100,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
              <h3 style={{fontWeight:900,fontSize:'1rem',color:'#0f172a'}}>📚 Lịch sử Sàn đã duyệt ({floorStatus.history.length}) — Click để xem chi tiết</h3>
              <button onClick={()=>setFloorStatus(p=>({...p,historyOpen:false,expandedIdx:null}))} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
            </div>
            {floorStatus.history.length===0?(
              <div style={{textAlign:'center',padding:30,color:'#94a3b8',fontWeight:600}}>Chưa có Sàn nào được duyệt.</div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:'70vh',overflowY:'auto'}}>
                {floorStatus.history.map((h,i)=>{
                  const isExpanded=floorStatus.expandedIdx===i;
                  return(
                  <div key={i} style={{background:isExpanded?'#fff':'#f0fdf4',border:`2px solid ${isExpanded?'#16a34a':'#86efac'}`,borderRadius:7,overflow:'hidden'}}>
                    <div onClick={()=>setFloorStatus(p=>({...p,expandedIdx:isExpanded?null:i}))} style={{padding:'10px 13px',cursor:'pointer',background:isExpanded?'#dcfce7':'transparent'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5,flexWrap:'wrap',gap:5}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:'1rem',color:'#14532d'}}>{isExpanded?'▼':'▶'}</span>
                          <span style={{fontSize:'.92rem',fontWeight:900,color:'#14532d'}}>🗓 {h.weekLabel}</span>
                          <span style={{fontSize:'.6rem',fontWeight:900,background:'#dcfce7',color:'#14532d',border:'1px solid #86efac',borderRadius:3,padding:'1px 6px'}}>✓ ĐÃ DUYỆT</span>
                        </div>
                        <span style={{fontSize:'.65rem',color:'#15803d',fontWeight:700}}>{h.approvedAt?new Date(h.approvedAt).toLocaleString('vi-VN'):''}</span>
                      </div>
                      <div style={{fontSize:'.7rem',color:'#0f172a',marginLeft:24}}>
                        👤 Gửi: <strong>{h.requestedBy}</strong> · ✓ Duyệt: <strong>{h.approvedBy}</strong> · 📊 <strong>{h.groupsCount||(h.groups||[]).length}</strong> nhóm · 💱 Tỷ giá: <strong>{h.exchangeRate?Number(h.exchangeRate).toLocaleString('vi-VN'):'?'}</strong>
                      </div>
                      {h.requestNote&&<div style={{fontSize:'.66rem',color:'#854d0e',background:'#fef9c3',border:'1px solid #fde047',borderRadius:4,padding:'3px 7px',marginTop:4,fontStyle:'italic',marginLeft:24}}>📝 {h.requestNote}</div>}
                    </div>
                    {isExpanded&&(
                      <div style={{padding:'8px 13px 13px',background:'#fff',borderTop:'1px dashed #86efac'}}>
                        <div style={{fontSize:'.72rem',fontWeight:800,color:'#14532d',marginBottom:6}}>📊 Chi tiết {(h.groups||[]).length} nhóm:</div>
                        <div style={{overflowX:'auto'}}>
                          <table className="tbl" style={{fontSize:'.7rem'}}>
                            <thead>
                              <tr>
                                <th style={{textAlign:'left'}}>Nhóm</th>
                                <th style={{textAlign:'right'}}>Mác</th>
                                <th style={{textAlign:'right'}}>Dày</th>
                                <th style={{textAlign:'right'}}>Tồn (kg)</th>
                                <th style={{textAlign:'right',background:'#fef9c3',color:'#713f12'}}>Sàn BH</th>
                                <th style={{textAlign:'right',background:'#eff6ff',color:'#1d4ed8'}}>A Group</th>
                                <th style={{textAlign:'right',background:'#faf5ff',color:'#7c3aed'}}>B Group</th>
                                <th style={{textAlign:'right',background:'#fff7ed',color:'#ea580c'}}>C Group</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(h.groups||[]).map((g,gi)=>(
                                <tr key={gi}>
                                  <td style={{paddingLeft:6,fontWeight:700,color:'#0f172a'}}>{g.label}</td>
                                  <td style={{textAlign:'right'}}>{g.alloy} {g.temper}</td>
                                  <td style={{textAlign:'right'}} className="mono">{g.minThick}-{g.maxThick}</td>
                                  <td style={{textAlign:'right'}} className="mono">{g.totalQty?fv(g.totalQty):'—'}</td>
                                  <td style={{textAlign:'right',background:'#fef9c3',fontWeight:900,color:'#713f12'}} className="mono">{g.publishedFloor?fv(g.publishedFloor):'—'}</td>
                                  <td style={{textAlign:'right',background:'#eff6ff',color:'#1d4ed8'}} className="mono">{g.corePrice?fv(g.corePrice):'—'}</td>
                                  <td style={{textAlign:'right',background:'#faf5ff',color:'#7c3aed'}} className="mono">{g.loyalPrice?fv(g.loyalPrice):'—'}</td>
                                  <td style={{textAlign:'right',background:'#fff7ed',color:'#ea580c'}} className="mono">{g.newPrice?fv(g.newPrice):'—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
            <div style={{marginTop:12,display:'flex',justifyContent:'flex-end',borderTop:'1px solid #e2e8f0',paddingTop:10}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setFloorStatus(p=>({...p,historyOpen:false,expandedIdx:null}))}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export {App};
