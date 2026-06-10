import React from 'react';
const {useState,useEffect,useRef,useMemo,useCallback,Component}=React;
// ─── ERROR BOUNDARY ── tránh trắng trang khi 1 phần crash ──
class ErrorBoundary extends Component{
  constructor(props){super(props);this.state={hasError:false,error:null};}
  static getDerivedStateFromError(error){return{hasError:true,error};}
  componentDidCatch(error,info){console.error('PAKD Error Boundary:',error,info);}
  render(){
    if(this.state.hasError){
      return(
        <div style={{padding:'24px',maxWidth:'780px',margin:'40px auto',background:'#fff',border:'2px solid #fca5a5',borderRadius:'10px',fontFamily:'Inter,sans-serif'}}>
          <h2 style={{color:'#991b1b',fontWeight:900,fontSize:'1.1rem',marginBottom:'10px'}}>⚠ Đã xảy ra lỗi khi hiển thị</h2>
          <div style={{background:'#fef2f2',padding:'10px 14px',borderRadius:'6px',color:'#7f1d1d',fontFamily:'JetBrains Mono,monospace',fontSize:'.78rem',marginBottom:'12px',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{String(this.state.error&&(this.state.error.stack||this.state.error.message||this.state.error))}</div>
          <button onClick={()=>{this.setState({hasError:false,error:null});location.reload();}} style={{background:'#2563eb',color:'#fff',border:'none',padding:'8px 18px',borderRadius:'6px',fontWeight:800,cursor:'pointer'}}>🔄 Tải lại trang</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Component nhỏ cho form thiết lập PIN
function PinSetupForm({onSubmit,loading}){
  const [p1,setP1]=useState('');
  const [p2,setP2]=useState('');
  const [name,setName]=useState('');
  return (
    <div style={{display:'flex',flexDirection:'column',gap:11}}>
      <div>
        <label className="lbl">Tên người thiết lập (lưu vào log)</label>
        <input type="text" className="inp" placeholder="Ví dụ: Giám đốc Dương" value={name} onChange={e=>setName(e.target.value)}/>
      </div>
      <div>
        <label className="lbl">PIN mới (4-8 chữ số)</label>
        <input type="password" className="inp" placeholder="Ví dụ: 285619" value={p1} onChange={e=>setP1(e.target.value.replace(/\D/g,'').substring(0,8))} style={{fontFamily:'JetBrains Mono',fontSize:'.95rem',letterSpacing:'.2em',textAlign:'center'}}/>
      </div>
      <div>
        <label className="lbl">Xác nhận lại PIN</label>
        <input type="password" className="inp" placeholder="Nhập lại PIN trên" value={p2} onChange={e=>setP2(e.target.value.replace(/\D/g,'').substring(0,8))} style={{fontFamily:'JetBrains Mono',fontSize:'.95rem',letterSpacing:'.2em',textAlign:'center'}}/>
        {p1&&p2&&p1!==p2&&<div style={{fontSize:'.65rem',color:'#dc2626',marginTop:3,fontWeight:700}}>❌ 2 PIN không khớp</div>}
        {p1&&p2&&p1===p2&&<div style={{fontSize:'.65rem',color:'#16a34a',marginTop:3,fontWeight:700}}>✓ PIN khớp</div>}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <button className="btn btn-success btn-sm" disabled={loading||!p1||p1!==p2||!name.trim()} onClick={()=>onSubmit(p1,p2,name.trim())}>{loading?'⏳ Đang lưu...':'💾 Thiết lập PIN (vĩnh viễn)'}</button>
      </div>
    </div>
  );
}

// Form thêm 1 người duyệt (Việc 1)
function ApproverAddForm({onAdd,loading}){
  const [name,setName]=useState('');
  const [role,setRole]=useState('');
  const [pin,setPin]=useState('');
  const [isAdmin,setIsAdmin]=useState(false);
  const [stepBuy,setStepBuy]=useState('0');
  const [stepFloor,setStepFloor]=useState('0');
  const ROLES=['Quản trị viên','Mua hàng','TP Kinh doanh','Giám đốc','Kế toán','Khác'];
  const STEPS=['0','1','2','3','4','5'];
  const ok=name.trim()&&role.trim()&&/^\d{4,8}$/.test(pin);
  return(
    <div style={{display:'flex',flexDirection:'column',gap:9}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><label className="lbl">Tên người duyệt</label><input type="text" className="inp" placeholder="Ví dụ: Ms Hương" value={name} onChange={e=>setName(e.target.value)}/></div>
        <div><label className="lbl">Vai trò</label>
          <input list="role-list" className="inp" placeholder="Chọn / gõ vai trò" value={role} onChange={e=>setRole(e.target.value)}/>
          <datalist id="role-list">{ROLES.map(r=><option key={r} value={r}/>)}</datalist>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><label className="lbl">Bước duyệt — luồng MUA (0 = không tham gia)</label>
          <select className="inp" value={stepBuy} onChange={e=>setStepBuy(e.target.value)}>{STEPS.map(s=><option key={s} value={s}>{s==='0'?'0 — không tham gia':'Bước '+s}</option>)}</select>
        </div>
        <div><label className="lbl">Bước duyệt — luồng GIÁ SÀN (0 = không)</label>
          <select className="inp" value={stepFloor} onChange={e=>setStepFloor(e.target.value)}>{STEPS.map(s=><option key={s} value={s}>{s==='0'?'0 — không tham gia':'Bước '+s}</option>)}</select>
        </div>
      </div>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'.75rem',fontWeight:700,color:'#6d28d9',cursor:'pointer'}}>
        <input type="checkbox" checked={isAdmin} onChange={e=>setIsAdmin(e.target.checked)}/> Là Quản trị (được quyền thêm/xóa/đổi bước người duyệt)
      </label>
      <div>
        <label className="lbl">PIN riêng của người này (4–8 chữ số)</label>
        <input type="password" className="inp" placeholder="Ví dụ: 1234" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').substring(0,8))} style={{fontFamily:'JetBrains Mono',fontSize:'.95rem',letterSpacing:'.2em',textAlign:'center'}}/>
        {pin&&!/^\d{4,8}$/.test(pin)&&<div style={{fontSize:'.65rem',color:'#dc2626',marginTop:3,fontWeight:700}}>PIN phải 4–8 chữ số</div>}
      </div>
      <div style={{fontSize:'.66rem',color:'#64748b',lineHeight:1.4}}>💡 Quản trị viên thường để cả 2 bước = 0 (chỉ quản lý, không phải ký). Nếu kiêm duyệt thì đặt bước cho luồng tương ứng.</div>
      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <button className="btn btn-success btn-sm" disabled={loading||!ok} onClick={async()=>{const done=await onAdd({name:name.trim(),role:role.trim(),pin,isAdmin,stepBuy,stepFloor});if(done){setName('');setRole('');setPin('');setIsAdmin(false);setStepBuy('0');setStepFloor('0');}}}>{loading?'⏳ Đang lưu...':'➕ Thêm người duyệt'}</button>
      </div>
    </div>
  );
}

// Modal nhập PIN ẩn chữ (thay window.prompt) — trả PIN qua onSubmit / null qua onCancel
function PinPromptModal({message,onSubmit,onCancel}){
  const [pin,setPin]=useState('');
  const submit=()=>{onSubmit(pin);};
  return(
    <div onClick={onCancel} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.72)',zIndex:10001,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:420,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.35)'}}>
        <div style={{fontSize:'.86rem',fontWeight:800,color:'#0f172a',marginBottom:12,lineHeight:1.5}}>{message}</div>
        <input autoFocus type="password" inputMode="numeric" className="inp" placeholder="Nhập PIN ●●●●" value={pin}
          onChange={e=>setPin(e.target.value.replace(/\D/g,'').substring(0,8))}
          onKeyDown={e=>{if(e.key==='Enter'&&pin)submit();if(e.key==='Escape')onCancel();}}
          style={{fontFamily:'JetBrains Mono',fontSize:'1.1rem',letterSpacing:'.35em',textAlign:'center'}}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Hủy</button>
          <button className="btn btn-success btn-sm" disabled={!pin} onClick={submit}>Xác nhận</button>
        </div>
      </div>
    </div>
  );
}

// Modal cho ý kiến/duyệt 1 cấp (Việc 1 đợt 2)
function ApprovalModal({file,approver,loading,onClose,onSubmit}){
  const [opinion,setOpinion]=useState('');
  const [pin,setPin]=useState('');
  const pinOk=/^\d{4,8}$/.test(pin);
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.7)',zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:10,padding:'22px 26px',maxWidth:460,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,borderBottom:'2px solid #e2e8f0',paddingBottom:10}}>
          <h3 style={{fontWeight:900,fontSize:'.96rem',color:'#0f172a'}}>✍ Cho ý kiến PAKD Mua</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer',color:'#64748b'}}>×</button>
        </div>
        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:'.74rem',color:'#1e40af',fontWeight:700,lineHeight:1.5}}>
          🔐 Nhập PIN của bạn — hệ thống tự nhận diện bạn là ai & bước duyệt.<br/>
          {approver&&<span style={{fontSize:'.66rem',fontWeight:600,color:'#475569'}}>Đang chờ bước kế: <strong>{approver.name} — {approver.role}</strong>. (Bước cao hơn có thể duyệt vượt.)<br/></span>}
          <span style={{fontSize:'.66rem',fontWeight:600,color:'#475569'}}>File: {file?.name}</span>
        </div>
        <div style={{marginBottom:10}}>
          <label className="lbl">Ý kiến (tùy chọn nếu đồng ý, nên ghi nếu từ chối)</label>
          <textarea className="inp" rows={3} placeholder="Ví dụ: Đồng ý mua, giá tốt. / Cần xem lại giá CIF mác A5052." value={opinion} onChange={e=>setOpinion(e.target.value)} style={{resize:'vertical',lineHeight:1.4}}/>
        </div>
        <div style={{marginBottom:14}}>
          <label className="lbl">PIN của bạn (4–8 số)</label>
          <input type="password" className="inp" placeholder="Nhập PIN 4–8 số" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').substring(0,8))} style={{fontFamily:'JetBrains Mono',fontSize:'.95rem',letterSpacing:'.2em',textAlign:'center'}}/>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button className="btn btn-sm" disabled={loading||!pinOk} onClick={()=>onSubmit('rejected',opinion,pin)} style={{background:'#fee2e2',color:'#991b1b',border:'1px solid #fca5a5',fontWeight:800}}>✗ Từ chối</button>
          <button className="btn btn-success btn-sm" disabled={loading||!pinOk} onClick={()=>onSubmit('approved',opinion,pin)}>{loading?'⏳ Đang ghi...':'✓ Đồng ý / Duyệt'}</button>
        </div>
      </div>
    </div>
  );
}

export {ApprovalModal,ApproverAddForm,ErrorBoundary,PinPromptModal,PinSetupForm};
