import React from 'react';
const {useState,useEffect,useRef,useMemo,useCallback,Component}=React;
import Chart from 'chart.js/auto';
import {getCurrentWeekLabel,matchWeekLabel} from '../lib/cashflow';
import {CashFlowChart,Ic} from './ui';
import {fu,fv} from '../lib/core';
// ─── CASH FLOW TAB COMPONENT ─────────────────────────────────────────────
const CashFlowTab=({result,inputs,cashFlowData,cfMode,setCFMode,cfManualWeek,setCFManualWeek,limitsData,syncGoogleSheet,dbStatus,ghVerified,bg1,bg2,border1,border2})=>{
  const nhapNgoaiVal=result?(result.invoiceVND||0):0;
  const tongMuaVal=nhapNgoaiVal;
  const vatVal=result?(result.invoiceVND*0.1):0;
  const totalPayVal=tongMuaVal+vatVal;
  const autoWeek=getCurrentWeekLabel();
  const targetWeek=cfMode==='manual'&&cfManualWeek?cfManualWeek:autoWeek;
  const cfRow=cashFlowData.find(r=>matchWeekLabel(r.tuan,targetWeek));
  const planned_nhapNgoai=cfRow?cfRow.nhapNgoai||0:0;
  const planned_muaNoi=cfRow?cfRow.muaNoi||0:0;
  const planned_chiKhac=cfRow?cfRow.chiKhac||0:0; // SỬA (R8b): Chi khác — trước đây bị bỏ sót khỏi Tổng chi
  // SỬA (R8b): Tổng chi LẤY ĐÚNG cfRow.tongChi (gồm Chi khác), KHÔNG dùng nhapNgoai+muaNoi (thiếu Chi khác → sai như tuần 33)
  const planned_tong=cfRow?(cfRow.tongChi!=null?cfRow.tongChi:(cfRow.nhapNgoai||0)+(cfRow.muaNoi||0)+(cfRow.chiKhac||0)):0;
  const planned_thu=cfRow?cfRow.tongThu||0:0;
  const planned_dtTM=cfRow?cfRow.dtTM||0:0;
  const planned_thuCN=cfRow?cfRow.thuCN||0:0;
  const planned_rong=cfRow?cfRow.rong||0:0;
  const planned_balance=cfRow?cfRow.hanMuc||0:0;  // TỔNG HẠN MỨC tuần đích (âm = hụt dòng)
  const planned_hmHD=cfRow?cfRow.hmHD||0:0;
  const planned_hmDD=cfRow?cfRow.hmDD||0:0;
  // Số dư SAU khi duyệt PA mua — SỬA (R8): PA là khoản chi THÊM, dùng tổng phải trả gồm VAT.
  const balanceAfterBuy=cfRow?(planned_balance-totalPayVal):null;
  // Đáy năm (số dư thấp nhất) để cảnh báo
  const minBalance=cashFlowData.length?Math.min(...cashFlowData.map(r=>r.balance!=null?r.balance:Infinity)):null;
  const delta_nhapNgoai=nhapNgoaiVal-planned_nhapNgoai;
  const delta_tong=tongMuaVal-planned_tong;
  const tongThuKH=planned_thu;
  const affordPct=tongThuKH>0?(tongMuaVal/tongThuKH*100):null;
  const creditLimit=limitsData.length>0?limitsData[0]:null;
  const totalCreditMax=creditLimit?creditLimit.totalCreditMax:0;
  const actualAP=creditLimit?creditLimit.actualAccountsPayable:0;
  const apAfter=actualAP+tongMuaVal;
  const apOk=totalCreditMax>0?apAfter<=totalCreditMax:null;
  const allWeeks=[...new Set(cashFlowData.map(r=>r.tuan).filter(t=>t&&String(t).trim()!==''))];
  const fB=(v)=>{
    if(v==null) return '—';
    const abs=Math.abs(v);
    const sign=v<0?'-':'';
    if(abs>=1e9) return sign+(abs/1e9).toFixed(2).replace(/\.?0+$/,'')+' tỷ';
    if(abs>=1e6) return sign+(abs/1e6).toFixed(1).replace(/\.?0+$/,'')+' triệu';
    if(abs>=1e3) return sign+(abs/1e3).toFixed(0)+'k';
    return sign+abs.toFixed(0);
  };
  return(
  <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
    <div style={{maxWidth:'1100px',margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div>
          <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>💰 Phân tích Dòng Tiền – Phương án mua</h2>
          <p style={{fontSize:'.72rem',color:'#475569',fontWeight:600,marginTop:2}}>So sánh PA mua với Kế hoạch dòng tiền (GSheet tab CashFlow · gid=127496102)</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>syncGoogleSheet('cf')} disabled={dbStatus.loading||!ghVerified}>
            {dbStatus.loading?<div className="spinner"/>:<Ic.Refresh/>} Sync CF
          </button>
          {cashFlowData.length===0
            ?<span className="tag tr pulse">⚠ Chưa có dữ liệu – nhấn Sync</span>
            :<span className="tag tg">✓ {cashFlowData.length} tuần</span>}
        </div>
      </div>
      <div className="card" style={{marginBottom:12,background:'#eff6ff',border:'1px solid #bfdbfe',padding:'10px 14px'}}>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:'.72rem',fontWeight:800,color:'#1e40af'}}>⏰ Tuần thanh toán:</span>
          <div style={{display:'flex',border:'1px solid #93c5fd',borderRadius:6,overflow:'hidden',background:'#fff'}}>
            <button onClick={()=>setCFMode('auto')} style={{padding:'4px 11px',fontSize:'.72rem',fontWeight:800,border:'none',background:cfMode==='auto'?'#2563eb':'transparent',color:cfMode==='auto'?'#fff':'#1d4ed8',cursor:'pointer'}}>🤖 Tuần hiện tại</button>
            <button onClick={()=>setCFMode('manual')} style={{padding:'4px 11px',fontSize:'.72rem',fontWeight:800,border:'none',background:cfMode==='manual'?'#7c3aed':'transparent',color:cfMode==='manual'?'#fff':'#7c3aed',cursor:'pointer'}}>✏️ Chọn tuần</button>
          </div>
          {cfMode==='manual'&&(
            <select className="inp" style={{width:'auto',minWidth:150}} value={cfManualWeek} onChange={e=>setCFManualWeek(e.target.value)}>
              <option value="">-- Chọn tuần --</option>
              {allWeeks.map(w=><option key={w} value={w}>{w}</option>)}
            </select>
          )}
          <span className="tag tb" style={{fontSize:'.82rem',fontWeight:900}}>{targetWeek}</span>
          {cfRow?<span className="tag tg" style={{fontSize:'.65rem'}}>✓ Có trong KH</span>:<span className="tag ty" style={{fontSize:'.65rem'}}>Không có dữ liệu tuần này</span>}
        </div>
      </div>
      {!result&&(
        <div className="card" style={{textAlign:'center',padding:44}}>
          <div style={{fontSize:'2rem',marginBottom:8}}>📊</div>
          <div style={{color:'#64748b',fontWeight:700}}>Chưa có Phương án mua</div>
          <div style={{color:'#94a3b8',fontSize:'.75rem',marginTop:4}}>Vào tab 📊 PAKD Mua để nhập phương án</div>
        </div>
      )}
      {result&&(
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="card">
            <div className="sh"><Ic.Ship/>Phương án mua – Giá trị thanh toán</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
              {[
                {l:'Giá trị hóa đơn (trước VAT)',v:fB(nhapNgoaiVal),sub:fu(result.invoiceUSD||0)+' USD',c:'#1d4ed8'},
                {l:'Khối lượng',v:fv(result.totalKg)+' kg',sub:(result.totalKg/1000).toFixed(2)+' tấn',c:'#0369a1'},
                {l:'VAT (10%)',v:fB(vatVal),c:'#475569'},
                {l:'Tổng cần thanh toán',v:fB(totalPayVal),sub:'Bao gồm VAT',c:'#7c3aed'},
              ].map((x,i)=>(
                <div key={i} className="kpi" style={{borderColor:x.c,borderLeftWidth:4}}>
                  <div className="kpi-l">{x.l}</div>
                  <div className="kpi-v" style={{color:x.c,fontSize:'.95rem'}}>{x.v}</div>
                  {x.sub&&<div className="kpi-s">{x.sub}</div>}
                </div>
              ))}
            </div>
            <table className="tbl" style={{fontSize:'.72rem'}}>
              <thead><tr><th style={{textAlign:'left'}}>Mác</th><th>KL (kg)</th><th>Giá FC</th><th>VND</th></tr></thead>
              <tbody>
                {(result.rows||[]).map((r,i)=>(
                  <tr key={i}>
                    <td><div style={{fontWeight:700}}>{r.alloy} {r.temper}</div><div style={{fontSize:'.6rem',color:'#64748b'}}>{r.thickness}×{r.width}×{r.length}</div></td>
                    <td className="mono" style={{textAlign:'right',fontWeight:700}}>{fv(r.qtyKg)}</td>
                    <td className="mono" style={{textAlign:'right',color:'#0369a1',fontWeight:700}}>{fu(r.priceFC||0)}</td>
                    <td className="mono" style={{textAlign:'right',color:'#1d4ed8',fontWeight:800}}>{fB((r.qtyKg/1000)*(r.priceFC||0)*(inputs.exchangeRate||26000))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{borderLeft:'4px solid '+(apOk===false?'#dc2626':apOk===true?'#16a34a':'#94a3b8')}}>
            <div className="sh"><Ic.Alert/>Hạn mức tín dụng</div>
            {creditLimit?(
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                  {[
                    {l:'Tổng hạn mức',v:fB(totalCreditMax),c:'#1d4ed8'},
                    {l:'CN hiện tại',v:fB(actualAP),c:'#475569'},
                    {l:'CN sau khi mua',v:fB(apAfter),c:apOk===false?'#dc2626':'#16a34a'},
                  ].map((x,i)=><div key={i} className="kpi" style={{borderColor:x.c,borderLeftWidth:3,padding:'8px 10px'}}><div className="kpi-l">{x.l}</div><div className="kpi-v" style={{color:x.c,fontSize:'.88rem'}}>{x.v}</div></div>)}
                </div>
                <div style={{background:apOk===false?'#fee2e2':apOk===true?'#dcfce7':'#f1f5f9',border:'1px solid '+(apOk===false?'#fca5a5':apOk===true?'#86efac':'#cbd5e1'),borderRadius:6,padding:'7px 12px',fontSize:'.75rem',fontWeight:700,color:apOk===false?'#991b1b':apOk===true?'#14532d':'#334155'}}>
                  {apOk===false?'⚠ VƯỢT HẠN MỨC – thiếu '+fB(apAfter-totalCreditMax)
                    :apOk===true?'✓ Còn dư '+fB(totalCreditMax-apAfter):'Không có dữ liệu hạn mức'}
                </div>
                {totalCreditMax>0&&<div>
                  <div style={{fontSize:'.62rem',color:'#475569',fontWeight:700,marginBottom:2}}>Đã dùng: {(apAfter/totalCreditMax*100).toFixed(1)}%</div>
                  <div className="stock-bar"><div className="stock-bar-fill" style={{width:Math.min(100,apAfter/totalCreditMax*100)+'%',background:apOk===false?'#dc2626':apAfter/totalCreditMax>0.85?'#f59e0b':'#16a34a'}}/></div>
                </div>}
              </div>
            ):<div style={{color:'#94a3b8',fontSize:'.75rem',fontWeight:600}}>Sync GSheet để xem hạn mức</div>}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="card" style={{borderLeft:'4px solid #7c3aed'}}>
            <div className="sh" style={{color:'#7c3aed'}}>📅 So sánh KH dòng tiền – {targetWeek}</div>
            {cashFlowData.length===0?(
              <div style={{textAlign:'center',padding:16,color:'#94a3b8',fontSize:'.75rem',fontWeight:600}}>
                <div style={{marginBottom:8}}>Chưa có dữ liệu KH dòng tiền</div>
                <button className="btn btn-solid btn-sm" onClick={()=>syncGoogleSheet('cf')}>🔄 Sync ngay</button>
              </div>
            ):!cfRow?(
              <div style={{background:'#fef9c3',border:'1px solid #fde047',borderRadius:6,padding:'10px 12px',fontSize:'.75rem',fontWeight:700,color:'#92400e'}}>
                ⚠ Không có dữ liệu cho {targetWeek}. Chọn tuần khác hoặc kiểm tra GSheet.
              </div>
            ):(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{background:'#faf5ff',border:'1px solid #e9d5ff',borderRadius:5,padding:'6px 10px',fontSize:'.7rem',fontWeight:700,color:'#6b21a8'}}>
                {cfRow.thang} – {cfRow.tuan}
              </div>
              {/* SỬA (R8): Bảng 3 cột KH | + PA mua | = Tổng sau duyệt — logic tài chính cho người duyệt */}
              {(()=>{
                const tongChiAfter=planned_tong+totalPayVal;          // chi tuần sau khi thêm PA (gồm VAT)
                const rongAfter=planned_rong-totalPayVal;             // ròng Thu−Chi sau PA
                const finalLimit=planned_balance-totalPayVal;         // TỔNG HẠN MỨC sau khi duyệt PA này
                const rows=[
                  {l:'🛒 Nhập ngoại (HĐ+ĐĐ)',kh:planned_nhapNgoai,pa:nhapNgoaiVal,tong:planned_nhapNgoai+nhapNgoaiVal},
                  {l:'🏭 Mua & trả nợ nội',kh:planned_muaNoi,pa:null,tong:planned_muaNoi},
                  {l:'📋 Chi khác (theo KH)',kh:planned_chiKhac,pa:null,tong:planned_chiKhac,muted:true},
                  {l:'🧾 VAT 10% (của PA mua)',kh:null,pa:vatVal,tong:null,muted:true},
                  {l:'📦 TỔNG CHI tuần (gồm VAT)',kh:planned_tong,pa:totalPayVal,tong:tongChiAfter,bold:true},
                  {l:'💵 Thu công nợ',kh:planned_thuCN,pa:null,tong:planned_thuCN},
                  {l:'📈 Thu theo KH bán',kh:planned_dtTM,pa:null,tong:planned_dtTM},
                  {l:'💰 TỔNG THU KH',kh:planned_thu,pa:null,tong:planned_thu,bold:true},
                  {l:'➖ Chênh lệch Thu−Chi tuần',kh:planned_rong,pa:-totalPayVal,tong:rongAfter,signed:true},
                  {l:'   ↳ Hạn mức HĐ',kh:planned_hmHD,pa:null,tong:null,muted:true,signedKh:true},
                  {l:'   ↳ Hạn mức ĐĐ',kh:planned_hmDD,pa:null,tong:null,muted:true,signedKh:true},
                  {l:'⚖️ TỔNG HẠN MỨC',kh:planned_balance,pa:-totalPayVal,tong:finalLimit,signed:true,bold:true,hl:true},
                ];
                return(<>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{textAlign:'left',width:'34%'}}>Chỉ tiêu</th>
                      <th style={{background:'#dbeafe',color:'#1e3a8a'}}>KH ({targetWeek})</th>
                      <th style={{background:'#f3e8ff',color:'#581c87'}}>+ PA mua (này)</th>
                      <th style={{background:'#fef9c3',color:'#854d0e'}}>= Tổng sau duyệt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row,i)=>(
                      <tr key={i} style={{background:row.hl?'#fffbeb':i%2?'#f8fafc':'#fff',fontWeight:row.bold?800:500,borderTop:row.hl?'2px solid #fcd34d':undefined}}>
                        <td style={{paddingLeft:8,fontSize:'.74rem'}}>{row.l}</td>
                        <td style={{textAlign:'right',paddingRight:6}}>
                          {row.kh!=null?<span className="mono" style={{fontSize:'.74rem',fontWeight:700,color:(row.signed||row.signedKh)?(row.kh<0?'#dc2626':'#16a34a'):'#1d4ed8'}}>{fB(row.kh)}</span>:<span style={{color:'#cbd5e1',fontSize:'.7rem'}}>—</span>}
                        </td>
                        <td style={{textAlign:'right',paddingRight:6}}>
                          {row.pa!=null?<span className="mono" style={{fontSize:'.74rem',fontWeight:800,color:'#7c3aed'}}>{row.pa>0?'+':''}{fB(row.pa)}</span>:<span style={{color:'#cbd5e1',fontSize:'.7rem'}}>—</span>}
                        </td>
                        <td style={{textAlign:'right',paddingRight:6,background:row.hl?'#fef3c7':undefined}}>
                          {row.tong!=null?<span className="mono" style={{fontSize:row.hl?'.82rem':'.74rem',fontWeight:row.hl?900:800,color:row.signed?(row.tong<0?'#dc2626':'#16a34a'):'#0f172a'}}>{fB(row.tong)}</span>:<span style={{color:'#cbd5e1',fontSize:'.7rem'}}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* HỘP KẾT LUẬN cho người duyệt */}
                <div style={{background:finalLimit<0?'#fef2f2':'#f0fdf4',border:'2px solid '+(finalLimit<0?'#fca5a5':'#86efac'),borderRadius:8,padding:'11px 14px',marginTop:4}}>
                  <div style={{fontSize:'.84rem',fontWeight:900,color:finalLimit<0?'#991b1b':'#14532d',marginBottom:5}}>
                    {finalLimit<0?`🔴 Sau khi duyệt PA này, tuần ${targetWeek} HỤT DÒNG ${fB(Math.abs(finalLimit))}`:`✅ Sau khi duyệt PA này, tuần ${targetWeek} vẫn DƯ DÒNG ${fB(finalLimit)}`}
                  </div>
                  <div style={{fontSize:'.7rem',fontWeight:700,color:'#475569',lineHeight:1.6}}>
                    Hạn mức tuần (KH): <strong style={{color:planned_balance<0?'#dc2626':'#16a34a'}}>{fB(planned_balance)}</strong>
                    &nbsp;−&nbsp; PA mua phải trả (gồm VAT): <strong style={{color:'#7c3aed'}}>{fB(totalPayVal)}</strong>
                    &nbsp;=&nbsp; <strong style={{color:finalLimit<0?'#dc2626':'#16a34a'}}>{fB(finalLimit)}</strong>
                  </div>
                  {/* THƯỚC ĐO trước/sau */}
                  {(()=>{
                    const scale=Math.max(Math.abs(planned_balance),Math.abs(finalLimit),totalPayVal,1);
                    const pct=v=>Math.min(100,Math.abs(v)/scale*100);
                    const Bar=({label,val})=>(
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                        <span style={{fontSize:'.6rem',fontWeight:700,color:'#64748b',width:64,flexShrink:0}}>{label}</span>
                        <div style={{flex:1,height:12,background:'#f1f5f9',borderRadius:3,position:'relative',overflow:'hidden'}}>
                          <div style={{position:'absolute',top:0,bottom:0,left:0,width:pct(val)+'%',background:val<0?'#dc2626':'#16a34a',opacity:.85}}/>
                        </div>
                        <span className="mono" style={{fontSize:'.66rem',fontWeight:800,color:val<0?'#dc2626':'#16a34a',width:72,textAlign:'right',flexShrink:0}}>{fB(val)}</span>
                      </div>
                    );
                    return(<div style={{marginTop:7,borderTop:'1px dashed '+(finalLimit<0?'#fca5a5':'#86efac'),paddingTop:6}}>
                      <Bar label="Trước PA" val={planned_balance}/>
                      <Bar label="Sau PA" val={finalLimit}/>
                    </div>);
                  })()}
                  {affordPct!=null&&<div style={{fontSize:'.64rem',color:'#64748b',fontWeight:600,marginTop:6}}>💡 PA mua (gồm VAT) chiếm <strong style={{color:affordPct>100?'#dc2626':affordPct>80?'#b45309':'#15803d'}}>{((totalPayVal/(tongThuKH||1))*100).toFixed(1)}%</strong> tổng thu KH tuần ({fB(tongThuKH)}).</div>}
                </div>
                </>);
              })()}
            </div>
            )}
          </div>
          {cashFlowData.length>0&&(
          <div className="card">
            <div className="sh">📈 Biểu đồ dòng tiền — Thu / Chi theo tuần</div>
            <CashFlowChart cashFlowData={cashFlowData} targetWeek={targetWeek}/>
            <div style={{fontSize:'.6rem',color:'#64748b',marginTop:4,lineHeight:1.5}}>
              Vùng <span style={{color:'#16a34a',fontWeight:800}}>xanh</span> = thu vượt chi (dư dòng) · Vùng <span style={{color:'#dc2626',fontWeight:800}}>đỏ</span> = chi vượt thu (hụt dòng). Khoảng cách giữa 2 đường chính là mức dương/âm của Tổng hạn mức tuần đó.
            </div>
          </div>
          )}
          <div className="card">
            <div className="sh">📊 Timeline dòng tiền</div>
            {cashFlowData.length===0?(
              <div style={{color:'#94a3b8',fontSize:'.72rem',fontWeight:600,textAlign:'center',padding:16}}>Chưa có dữ liệu – nhấn Sync CF</div>
            ):(
            <div style={{overflowX:'auto'}}>
              <table className="tbl" style={{fontSize:'.7rem'}}>
                <thead>
                  <tr>
                    <th style={{textAlign:'left'}}>Tuần</th>
                    <th style={{color:'#dc2626'}}>Tổng chi</th>
                    <th style={{color:'#16a34a'}}>Tổng thu</th>
                    <th style={{color:'#7c3aed'}}>Thu − Chi</th>
                    <th>Tổng hạn mức</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlowData.map((r,i)=>{
                    const isCur=matchWeekLabel(r.tuan,targetWeek);
                    const showThang=i===0||r.thang!==cashFlowData[i-1].thang;
                    const isHut=r.hanMuc!=null&&r.hanMuc<0;                  // hạn mức âm = tuần hụt dòng
                    return(
                      <tr key={i} style={{background:isCur?'#eff6ff':isHut?'#fef2f2':'',fontWeight:isCur?800:400}}>
                        <td style={{paddingLeft:6}}>
                          {showThang&&<div style={{fontSize:'.57rem',color:'#7c3aed',fontWeight:900,marginBottom:1}}>{r.thang}</div>}
                          {isCur&&<span style={{color:'#1d4ed8',marginRight:3}}>▶</span>}
                          <span style={{color:isCur?'#1d4ed8':'#334155'}}>{r.tuan}</span>
                          {isHut&&<span title="Tuần hụt dòng (hạn mức âm)" style={{marginLeft:3}}>🔴</span>}
                          {r.thieuThuNo&&<span title="Thiếu KH doanh thu" style={{marginLeft:3}}>⚠️</span>}
                        </td>
                        <td style={{textAlign:'right',color:'#dc2626'}}>{fB(r.tongChi)}</td>
                        <td style={{textAlign:'right',color:'#16a34a'}}>{fB(r.tongThu)}</td>
                        <td style={{textAlign:'right',fontWeight:700,color:r.rong!=null&&r.rong<0?'#dc2626':'#16a34a'}}>{r.rong>=0?'+':''}{fB(r.rong)}</td>
                        <td style={{textAlign:'right',fontWeight:800,color:r.hanMuc!=null&&r.hanMuc<0?'#dc2626':r.hanMuc!=null&&r.hanMuc<=2e9?'#f59e0b':'#16a34a'}}>{fB(r.hanMuc)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      </div>
      )}
      {result&&(
      <div style={{marginTop:12,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'10px 14px'}}>
        <div style={{fontWeight:900,fontSize:'.75rem',color:'#1e40af',marginBottom:6}}>💡 Nhận xét</div>
        <div style={{display:'flex',flexDirection:'column',gap:4,fontSize:'.73rem',fontWeight:600,color:'#1e3a8a'}}>
          {cashFlowData.length===0&&<div>• ⚠ Chưa sync dữ liệu KH dòng tiền – nhấn <strong>Sync CF</strong> để tải từ GSheet</div>}
          {cfRow&&delta_nhapNgoai>0&&<div>• ⚠ Nhập ngoại vượt KH <strong>{fB(delta_nhapNgoai)}</strong> – cân nhắc dời sang tuần khác</div>}
          {cfRow&&delta_nhapNgoai<=0&&<div>• ✓ Nhập ngoại nằm trong KH (KH: {fB(planned_nhapNgoai)} · PA: {fB(nhapNgoaiVal)})</div>}
          {cfRow&&<div>• ⚖️ Tổng hạn mức {targetWeek}: <strong style={{color:planned_balance<0?'#dc2626':'#16a34a'}}>{fB(planned_balance)}</strong> {planned_balance<0?<span style={{color:'#b45309'}}>(🔴 tuần HỤT dòng – cần đẩy bán & thu hồi công nợ)</span>:<span style={{color:'#15803d'}}>(✓ dư dòng)</span>}</div>}
          {cfRow&&balanceAfterBuy!=null&&<div>• 🛒 Nếu lấy cont này vào {targetWeek}, hạn mức còn <strong style={{color:balanceAfterBuy<0?'#dc2626':balanceAfterBuy<2e9?'#f59e0b':'#16a34a'}}>{fB(balanceAfterBuy)}</strong>{balanceAfterBuy<0?' – 🔴 VỠ KẾ HOẠCH: phải đẩy thu hồi công nợ + bán hàng, hoặc giãn cont sang tuần khác':balanceAfterBuy<2e9?' – ⚠️ hạn mức mỏng, thận trọng':' – ✓ đủ nguồn lực lấy hàng'}</div>}
          {cfRow&&minBalance!=null&&planned_balance<=minBalance*1.05&&<div>• 🔴 {targetWeek} là vùng <strong>hụt sâu nhất</strong> – tuần căng nhất, ưu tiên thu hồi công nợ + đẩy bán trước khi nhận cont</div>}
          {cfRow&&cfRow.thieuThuNo&&<div>• ⚠️ {targetWeek}: chưa nhập KH doanh thu – hạn mức thực tế có thể cao hơn hiển thị (cần nhập sheet "Kế hoạch dòng theo DT dự kiến")</div>}
          {apOk===false&&<div>• 🔴 Công nợ sau mua vượt hạn mức – cần thu hồi CN hoặc tăng hạn mức</div>}
          {apOk===true&&<div>• ✓ Hạn mức tín dụng đủ (còn dư {fB(totalCreditMax-apAfter)})</div>}
          {!cfRow&&cashFlowData.length>0&&<div>• ℹ Không có KH cho {targetWeek} – chọn tuần khác để xem so sánh</div>}
        </div>
      </div>
      )}
    </div>
  </div>
  );
};

export {CashFlowTab};
