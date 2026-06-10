import React from 'react';
const {useState,useEffect,useRef,useMemo,useCallback,Component}=React;
import Chart from 'chart.js/auto';
import {fv,normThick} from '../lib/core';
// ─── ICONS ────────────────────────────────────────────────────
const Ic={
  Plus:()=><svg style={{width:13,height:13}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>,
  X:()=><svg style={{width:12,height:12}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  Ship:()=><svg style={{width:15,height:15}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  Save:()=><svg style={{width:15,height:15}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>,
  Tag:()=><svg style={{width:15,height:15}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>,
  Print:()=><svg style={{width:15,height:15}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>,
  Refresh:()=><svg style={{width:13,height:13}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>,
  Alert:()=><svg style={{width:13,height:13}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>,
  Database:()=><svg style={{width:13,height:13}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582 4-8 4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/></svg>,
  Money:()=><svg style={{width:15,height:15}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  Filter:()=><svg style={{width:13,height:13}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>,
  Users:()=><svg style={{width:14,height:14}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  List:()=><svg style={{width:14,height:14}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>,
};

const FilterBar=({filter,setFilter,alloys,showStatus=false,showCoating=true,showStockAlert=false,showOverAlert=false,total,filtered})=>{
  const bg4='#f1f5f9',border1='#e2e8f0';
  return(
    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:11,background:bg4,border:`1px solid ${border1}`,borderRadius:6,padding:'7px 10px'}}>
      <span style={{fontSize:'.65rem',color:'#475569',fontWeight:800,display:'flex',alignItems:'center',gap:4}}><Ic.Filter/> Lọc:</span>
      {showStatus&&(
        <select className="inp inp-xs" style={{width:'auto',minWidth:110}} value={filter.status||'ALL'} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}>
          <option value="ALL">Tất cả trạng thái</option>
          <option value="IN_STOCK">🟢 Trong kho</option>
          <option value="IN_TRANSIT">🟡 Đang về</option>
        </select>
      )}
      <select className="inp inp-xs" style={{width:'auto',minWidth:100}} value={filter.alloy||'ALL'} onChange={e=>setFilter(f=>({...f,alloy:e.target.value}))}>
        <option value="ALL">Tất cả mác</option>
        {alloys.map(a=><option key={a} value={a}>{a}</option>)}
      </select>
      {showCoating&&(
        <select className="inp inp-xs" style={{width:'auto',minWidth:110}} value={filter.coating||'ALL'} onChange={e=>setFilter(f=>({...f,coating:e.target.value}))}>
          <option value="ALL">Tất cả coating</option>
          <option value="1E">🎨 PE (1E)</option>
          <option value="KP">⬜ NOPE (KP)</option>
        </select>
      )}
      {showStockAlert&&(
        <select className="inp inp-xs" style={{width:'auto',minWidth:130}} value={filter.stockAlert||'ALL'} onChange={e=>setFilter(f=>({...f,stockAlert:e.target.value}))}>
          <option value="ALL">Tất cả tồn kho</option>
          <option value="LOW">🔴 Thiếu hàng (&lt;80%)</option>
          <option value="NEAR">🟡 Gần min (80–100%)</option>
          <option value="OK">🟢 Đạt min</option>
          <option value="EXCESS">🔵 Dư nhiều (&gt;200%)</option>
          {showOverAlert&&<option value="OVER">🟣 Quá max</option>}
        </select>
      )}
      <input className="inp inp-xs" style={{minWidth:140,flex:1}} placeholder="🔍 Tìm kiếm SKU…" value={filter.search||''} onChange={e=>setFilter(f=>({...f,search:e.target.value}))}/>
      {filter.search||filter.alloy!=='ALL'||filter.coating!=='ALL'||(filter.status&&filter.status!=='ALL')||(filter.stockAlert&&filter.stockAlert!=='ALL')?(
        <button className="btn btn-xs btn-ghost" onClick={()=>setFilter(f=>({...f,status:'ALL',alloy:'ALL',coating:'ALL',stockAlert:'ALL',search:''}))}>✕ Xóa lọc</button>
      ):null}
      <span style={{fontSize:'.65rem',color:'#64748b',fontWeight:700,whiteSpace:'nowrap'}}>{filtered}/{total} dòng</span>
    </div>
  );
};

const SkuSel=({row,onChange,showCoating=true})=>{
  const S=(f,v)=>onChange({...row,[f]:v});
  return(
    <div style={{display:'flex',gap:'3px',alignItems:'center',flexWrap:'nowrap'}}>
      <input list="alloy-list" className="inp inp-xs font-bold" style={{width:76}} value={row.alloy} onChange={e=>S('alloy',e.target.value)} placeholder="Mác"/>
      <input list="temper-list" className="inp inp-xs font-semibold" style={{width:58,color:'#2563eb'}} value={row.temper} onChange={e=>S('temper',e.target.value)} placeholder="Cứng"/>
      <span style={{color:'#334155',fontSize:'.8rem',fontWeight:'bold',flexShrink:0}}>•</span>
      <input list="thick-list" className="inp inp-xs font-semibold" style={{width:65,color:'#b45309'}} value={row.thickness} onChange={e=>S('thickness',e.target.value)} onBlur={e=>S('thickness',normThick(e.target.value))} placeholder="Dày" title="Số nguyên sẽ tự thêm .0 (vd 2 → 2.0)"/>
      <span style={{color:'#334155',fontSize:'.8rem',fontWeight:'bold',flexShrink:0}}>x</span>
      <input list="width-list" className="inp inp-xs font-semibold" style={{width:60,color:'#b45309'}} value={row.width} onChange={e=>S('width',e.target.value)} placeholder="Rộng"/>
      <span style={{color:'#334155',fontSize:'.8rem',fontWeight:'bold',flexShrink:0}}>x</span>
      <input list="length-list" className="inp inp-xs font-semibold" style={{width:68,color:'#b45309'}} value={row.length} onChange={e=>S('length',e.target.value)} placeholder="Dài"/>
      {showCoating&&<button onClick={()=>S('coating',row.coating==='1E'?'KP':'1E')} className={`status-btn ${row.coating==='1E'?'s-coated':'s-plain'} off`} style={{padding:'2px 5px',fontSize:'.62rem',flexShrink:0,minWidth:44}}>{row.coating==='1E'?'PE':'—'}</button>}
    </div>
  );
};

// Hiển thị SKU gọn, RÕ kích thước, dễ đọc cho người lớn tuổi — KHÔNG nhập tay
const SkuLabelCell=({row,size='md'})=>{
  const lenTxt=(()=>{const l=String(row.length||'').trim().toUpperCase();return (l===''||l==='C'||l==='COIL'||l==='CUON'||l==='CUỘN')?'cuộn':l;})();
  const isPE=(row.coating||'KP')==='1E';
  const big=size==='lg';
  return(
    <div style={{display:'flex',flexDirection:'column',gap:1,lineHeight:1.15}}>
      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
        <span style={{fontWeight:900,fontSize:big?'1rem':'.9rem',color:'#0f172a'}}>{row.alloy}</span>
        <span style={{fontWeight:800,fontSize:big?'.85rem':'.78rem',color:'#2563eb'}}>{row.temper}</span>
        <span style={{fontSize:'.62rem',fontWeight:800,padding:'1px 6px',borderRadius:4,background:isPE?'#ccfbf1':'#fef3c7',color:isPE?'#0f766e':'#a16207',border:`1px solid ${isPE?'#5eead4':'#fcd34d'}`}}>{isPE?'PE':'NOPE'}</span>
      </div>
      <div style={{fontFamily:'JetBrains Mono',fontSize:big?'.84rem':'.78rem',fontWeight:700,color:'#334155',letterSpacing:'.01em'}}>
        {row.thickness}<span style={{color:'#94a3b8',margin:'0 3px'}}>×</span>{row.width}<span style={{color:'#94a3b8',margin:'0 3px'}}>×</span>{lenTxt}<span style={{color:'#64748b',fontSize:'.62rem',fontWeight:600,marginLeft:4}}>(mm)</span>
      </div>
    </div>
  );
};

const LimitBar=({actual,limit,label,unit='đ'})=>{
  if(!limit||limit<=0) return(
    <div>
      <div style={{fontSize:'.65rem',color:'#94a3b8',fontWeight:600,marginBottom:4}}>{label}</div>
      <div style={{fontSize:'.62rem',color:'#94a3b8',fontWeight:600,fontStyle:'italic'}}>Chưa có dữ liệu</div>
    </div>
  );
  const pct=Math.round(actual/limit*100);
  const over=actual>limit,near=actual>limit*0.85&&!over;
  const c=over?'#dc2626':near?'#d97706':'#16a34a';
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:'.65rem',color:'#334155',marginBottom:2,fontWeight:600}}>
        <span>{label}</span><span style={{color:c,fontWeight:800}}>{pct}% hạn mức</span>
      </div>
      <div className="stock-bar" style={{height:6}}><div className="stock-bar-fill" style={{width:`${Math.min(pct,100)}%`,background:c}}/></div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:'.65rem',marginTop:3,fontWeight:600}}>
        <span className="mono" style={{color:'#1d4ed8'}}>{fv(actual)}{unit}</span>
        {over?<span style={{color:'#b91c1c',fontWeight:800}}>▲ Vượt {fv(actual-limit)}{unit}</span>
          :near?<span style={{color:'#b45309',fontWeight:800}}>⚡ Còn {fv(limit-actual)}{unit}</span>
          :<span style={{color:'#15803d',fontWeight:800}}>▼ Còn {fv(limit-actual)}{unit}</span>}
      </div>
    </div>
  );
};

const CreditModeSelector=({inputs,setInp})=>{
  const modes=[
    {v:'none',  l:'Không CN', desc:'Bỏ CP công nợ'},
    {v:'fixed', l:'CN cố định',desc:`${inputs.finCostPct}%/năm`},
    {v:'credit',l:'CN theo ngày',desc:`${inputs.customCreditDays} ngày`},
  ];
  return(
    <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:6,padding:'9px 11px',marginBottom:8}}>
      <div style={{fontSize:'.63rem',color:'#0369a1',fontWeight:900,marginBottom:7}}>💳 Chế độ Công nợ KH (CN)</div>
      <div style={{display:'flex',gap:4,marginBottom:8}}>
        {modes.map(m=>(
          <button key={m.v} onClick={()=>setInp('creditMode',m.v)}
            style={{flex:1,padding:'5px 4px',fontSize:'.65rem',fontWeight:800,borderRadius:5,cursor:'pointer',border:`1.5px solid ${inputs.creditMode===m.v?'#0284c7':'#cbd5e1'}`,background:inputs.creditMode===m.v?'#0284c7':'#fff',color:inputs.creditMode===m.v?'#fff':'#475569',transition:'all .12s'}}>
            <div>{m.l}</div>
            <div style={{fontSize:'.57rem',opacity:.85,marginTop:1}}>{m.desc}</div>
          </button>
        ))}
      </div>
      {inputs.creditMode==='fixed'&&(
        <div>
          <label className="lbl" style={{color:'#0369a1',fontSize:'.6rem'}}>CP Công nợ (CN) %/năm</label>
          <input type="number" step=".1" className="inp inp-xs mono" style={{color:'#0369a1',fontWeight:700}} value={inputs.finCostPct} onChange={e=>setInp('finCostPct',parseFloat(e.target.value)||0)}/>
        </div>
      )}
      {inputs.creditMode==='credit'&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
          <div>
            <label className="lbl" style={{color:'#0369a1',fontSize:'.6rem'}}>Lãi suất %/năm</label>
            <input type="number" step=".1" className="inp inp-xs mono" style={{color:'#0369a1',fontWeight:700}} value={inputs.lendingRate} onChange={e=>setInp('lendingRate',parseFloat(e.target.value)||0)}/>
          </div>
          <div>
            <label className="lbl" style={{color:'#0369a1',fontSize:'.6rem'}}>Số ngày CN</label>
            <input type="number" className="inp inp-xs mono" style={{color:'#0369a1',fontWeight:700}} value={inputs.customCreditDays} onChange={e=>setInp('customCreditDays',parseInt(e.target.value)||0)}/>
          </div>
        </div>
      )}
    </div>
  );
};


// ─── BIỂU ĐỒ DÒNG TIỀN: 2 đường Thu/Chi, vùng tô giữa (xanh=dư, đỏ=hụt) ───
const CashFlowChart=({cashFlowData,targetWeek})=>{
  const ref=React.useRef(null);
  const inst=React.useRef(null);
  React.useEffect(()=>{
    if(typeof Chart==='undefined'||!ref.current) return;
    const rows=cashFlowData.filter(r=>r.week);
    const labels=rows.map(r=>r.tuan.replace('Tuần','T'));
    const thu=rows.map(r=>(r.tongThu||0)/1e9);
    const chi=rows.map(r=>(r.tongChi||0)/1e9);
    if(inst.current) inst.current.destroy();
    try{
      inst.current=new Chart(ref.current.getContext('2d'),{
        type:'line',
        data:{labels,datasets:[
          // Đường CHI (đỏ) vẽ trước làm mốc fill
          {label:'Tổng chi',data:chi,borderColor:'#dc2626',backgroundColor:'rgba(220,38,38,0.10)',
           borderWidth:2,pointRadius:2,pointBackgroundColor:'#dc2626',tension:0.25,fill:false,order:2},
          // Đường THU (xanh) fill xuống đường chi: xanh khi thu>chi, đỏ khi thu<chi
          {label:'Tổng thu',data:thu,borderColor:'#16a34a',borderWidth:2,pointRadius:2,
           pointBackgroundColor:'#16a34a',tension:0.25,order:1,
           fill:{target:'-1',
             above:'rgba(22,163,74,0.20)',   // thu > chi → dư dòng (xanh)
             below:'rgba(220,38,38,0.22)'},  // thu < chi → hụt dòng (đỏ)
          },
        ]},
        options:{
          responsive:true,maintainAspectRatio:false,
          interaction:{mode:'index',intersect:false},
          plugins:{
            legend:{labels:{boxWidth:12,font:{size:11,weight:'700'}}},
            tooltip:{callbacks:{
              label:c=>c.dataset.label+': '+c.parsed.y.toFixed(2)+' tỷ',
              afterbody:(items)=>{
                const i=items[0].dataIndex;
                const hm=(thu[i]-chi[i]);
                return (hm>=0?'⚖️ Dư dòng: +':'⚠️ Hụt dòng: ')+hm.toFixed(2)+' tỷ';
              }
            }}
          },
          scales:{
            y:{title:{display:true,text:'Tỷ VNĐ',font:{size:10}},ticks:{font:{size:10}}},
            x:{ticks:{font:{size:9},maxRotation:90,minRotation:45}}
          }
        }
      });
    }catch(e){console.error('Lỗi vẽ biểu đồ dòng tiền:',e);}
    return ()=>{if(inst.current){inst.current.destroy();inst.current=null;}};
  },[cashFlowData,targetWeek]);
  return <div style={{height:240}}><canvas ref={ref}></canvas></div>;
};

export {CashFlowChart,CreditModeSelector,FilterBar,Ic,LimitBar,SkuLabelCell,SkuSel};
