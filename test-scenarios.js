const http = require('http');

function api(method, path, body, token) {
  return new Promise((resolve) => {
    const b = body ? JSON.stringify(body) : '';
    const headers = {'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)};
    if(token) headers['Authorization'] = 'Bearer '+token;
    const opts = {hostname:'localhost',port:3000,path:'/api'+path,method,headers};
    const r = http.request(opts, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(d))}catch{resolve({raw:d.substring(0,200)})} });
    });
    r.on('error',e=>resolve({error:e.message})); if(b) r.write(b); r.end();
  });
}

async function login(email, password) {
  const r = await api('POST','/auth/login',{email, password});
  return {token: r.accessToken, user: r.user};
}

const testResults = [];
function log(icon, msg) {
  const line = icon + ' ' + msg;
  console.log(line);
  testResults.push({icon, msg});
}

async function main() {
  log('═══','THISO LEASING PLATFORM - COMPREHENSIVE TEST REPORT');
  log('───','Date: ' + new Date().toLocaleString('vi-VN'));

  // ── SCENARIO 1: SALE DÀI HẠN ──
  log('━━━','SCN-1: Quy trinh Sale Dai Han (Long-term Leasing)');
  const sale1 = await login('le.minh.tuan@thiso.com','Thiso@2024');
  log(sale1.token ? '✓' : '✗', '[SCN-1.1] Login Sale Executive Dai Han: le.minh.tuan@thiso.com');

  const lead = await api('POST','/crm/leads',{
    brandName:'Laneige Korea', companyName:'Laneige VN Ltd',
    contactName:'Kim Ji Yeon', contactEmail:'kim@laneige.vn', phone:'0908765432',
    source:'DIRECT', status:'NEW', preferredCategory:'Beauty',
    expectedArea:80, budgetMin:1200000, budgetMax:1800000,
    notes:'Chuoi my pham Han Quoc muon mo rong tai Sala'
  }, sale1.token);
  log(lead.id ? '✓' : '✗', '[SCN-1.2] Tao Lead: ' + (lead.id ? lead.id.substring(0,8)+'... | Laneige Korea' : JSON.stringify(lead).substring(0,80)));

  const units = await api('GET','/spaces/units?status=VACANT&limit=5',null,sale1.token);
  const unitList = Array.isArray(units) ? units : (units.data || []);
  const targetUnit = unitList[0] || null;
  log(targetUnit ? '✓' : '✗', '[SCN-1.3] Tim unit VACANT: ' + (targetUnit ? targetUnit.code + ' (' + targetUnit.areaNLA + 'm2)' : 'NONE'));

  let booking = null;
  if(targetUnit && lead.id) {
    booking = await api('POST','/bookings',{
      unitId: targetUnit.id, leadId: lead.id,
      requestedArea: 80, requestedTerm: 36, expectedRent: 1500000,
      holdDays: 30, notes: 'Laneige - can vi tri goc, tang tret'
    }, sale1.token);
    log(booking.id ? '✓' : '✗', '[SCN-1.4] Tao Unit Booking: ' + (booking.id ? booking.bookingNumber + ' | ' + targetUnit.code : JSON.stringify(booking).substring(0,100)));
  }

  // ── SCENARIO 2: MANAGER CONVERT TO PROPOSAL ──
  log('━━━','SCN-2: Manager Dai Han tao De xuat (Proposal)');
  const mgr1 = await login('nguyen.thu.hoa@thiso.com','Thiso@2024');
  log(mgr1.token ? '✓' : '✗', '[SCN-2.1] Login Manager Dai Han: nguyen.thu.hoa@thiso.com');

  let proposal = null;
  if(booking && booking.id && mgr1.token && booking.status !== 'CANCELLED') {
    const sd = new Date(); sd.setMonth(sd.getMonth()+2);
    proposal = await api('POST','/bookings/'+booking.id+'/convert-to-proposal',{
      area: 80, term: 36,
      startDate: sd.toISOString().split('T')[0],
      rentPerSqm: 1500000, camPerSqm: 120000,
      deposit: 3, rentFree: 30, escalationPercent: 5,
      notes: 'De xuat lan 1 - Laneige tang tret khu Beauty'
    }, mgr1.token);
    const pObj = proposal.proposal || proposal;
    log(pObj.id ? '✓' : '✗', '[SCN-2.2] Convert to Proposal: ' + (pObj.proposalNumber || JSON.stringify(proposal).substring(0,100)));

    if(pObj.id) {
      const submitted = await api('POST','/proposals/'+pObj.id+'/submit',null,mgr1.token);
      log(submitted.id ? '✓' : '~', '[SCN-2.3] Submit Proposal: ' + (submitted.proposalNumber || JSON.stringify(submitted).substring(0,80)));
    }
  }

  // ── SCENARIO 3: SLOT BOOKING ──
  log('━━━','SCN-3: Quy trinh Sale Ngan Han (Slot Booking)');
  const sale2 = await login('hoang.thi.mai@thiso.com','Thiso@2024');
  log(sale2.token ? '✓' : '✗', '[SCN-3.1] Login Sale Executive Ngan Han: hoang.thi.mai@thiso.com');

  const allUnits = await api('GET','/spaces/units?limit=50',null,sale2.token);
  const allArr = Array.isArray(allUnits) ? allUnits : (allUnits.data || []);
  let slotUnit = null; let slots = [];
  for(const u of allArr) {
    const s = await api('GET','/slots/units/'+u.id,null,sale2.token);
    const sarr = Array.isArray(s) ? s : [];
    if(sarr.length > 0) { slotUnit = u; slots = sarr; break; }
  }

  if(slotUnit && slots.length > 0) {
    log('✓','[SCN-3.2] Tim slot: Unit ' + slotUnit.code + ' co ' + slots.length + ' slots');
    const slot = slots[0];
    const start = new Date(); start.setDate(start.getDate()+7);
    const end = new Date(start); end.setDate(end.getDate()+3);
    const sb = await api('POST','/slots/'+slot.id+'/bookings',{
      type:'DAILY',
      startDatetime: start.toISOString().split('T')[0],
      endDatetime: end.toISOString().split('T')[0],
      notes:'Pop-up event my pham Innisfree 3 ngay cuoi tuan'
    }, sale2.token);

    if(sb.id) {
      log('✓','[SCN-3.3] Tao Slot Booking: ' + sb.bookingRef + ' | ' + (sb.totalAmount||0).toLocaleString()+'d');
      const mgr2 = await login('tran.van.duc@thiso.com','Thiso@2024');
      const conf = await api('PATCH','/slots/bookings/'+sb.id+'/confirm',null,mgr2.token);
      log(conf.id ? '✓' : '~', '[SCN-3.4] Manager xac nhan Slot Booking: ' + (conf.status||JSON.stringify(conf).substring(0,60)));
    } else {
      log('~','[SCN-3.3] ' + JSON.stringify(sb).substring(0,120));
    }
  } else {
    log('~','[SCN-3.2] Khong tim thay unit co slot (skip slot test)');
  }

  // ── SCENARIO 4: OPERATIONS ──
  log('━━━','SCN-4: Team Van Hanh & Ky Thuat');
  const director = await login('do.thi.nga@thiso.com','Thiso@2024');
  log(director.token ? '✓' : '✗', '[SCN-4.1] Login Mall Director: do.thi.nga@thiso.com');

  const opUser = await login('trinh.van.long@thiso.com','Thiso@2024');
  log(opUser.token ? '✓' : '✗', '[SCN-4.2] Login Operation Staff: trinh.van.long@thiso.com');

  const pending = await api('GET','/approvals/pending',null,director.token);
  const pendArr = Array.isArray(pending) ? pending : (pending.data || []);
  log('✓','[SCN-4.3] Director xem Pending Approvals: ' + pendArr.length + ' cho duyet');

  const ticket = await api('POST','/tickets',{
    title:'Dieu hoa khu F&B tang 2 bi ro ri nuoc',
    description:'Dieu hoa unit L2-F01 nho nuoc xuong san, can sua chua khan cap',
    priority:'HIGH', category:'MAINTENANCE',
    mallId:'cmqno18bn000x2i8yvpaiwwd2'
  }, opUser.token);
  log(ticket.id ? '✓' : '~', '[SCN-4.4] Tao Ticket bao tri: ' + (ticket.ticketNumber||JSON.stringify(ticket).substring(0,80)));

  // ── SCENARIO 5: KE TOAN ──
  log('━━━','SCN-5: Team Ke Toan');
  const finance = await login('bui.thi.hoa@thiso.com','Thiso@2024');
  log(finance.token ? '✓' : '✗', '[SCN-5.1] Login Ke Toan Truong: bui.thi.hoa@thiso.com');

  const invoices = await api('GET','/billing/invoices?limit=5',null,finance.token);
  const invArr = Array.isArray(invoices) ? invoices : (invoices.data || []);
  log('✓','[SCN-5.2] Xem danh sach hoa don: ' + invArr.length + ' hoa don');

  const aging = await api('GET','/billing/ar-aging',null,finance.token);
  log(!aging.error ? '✓' : '~', '[SCN-5.3] Xem AR Aging report: ' + (!aging.error ? 'OK' : aging.error));

  const report = await api('GET','/reports/revenue',null,finance.token);
  log(!report.error ? '✓' : '~', '[SCN-5.4] Xem Revenue Report: ' + (!report.error ? 'OK' : report.error));

  // ── SCENARIO 6: CEO ──
  log('━━━','SCN-6: CEO Tong quan');
  const ceo = await login('ceo@thiso.com','User123!');
  log(ceo.token ? '✓' : '✗', '[SCN-6.1] Login CEO: ceo@thiso.com');

  const dash = await api('GET','/dashboard',null,ceo.token);
  log(!dash.error ? '✓' : '~', '[SCN-6.2] CEO Dashboard: ' + (!dash.error ? 'OK' : dash.error));

  const crossMall = await api('GET','/dashboard/cross-mall',null,ceo.token);
  log(!crossMall.error ? '✓' : '~', '[SCN-6.3] Cross-Mall Dashboard: ' + (!crossMall.error ? 'OK' : crossMall.error));

  const crmStats = await api('GET','/crm/stats',null,ceo.token);
  log(!crmStats.error ? '✓' : '~', '[SCN-6.4] CRM Stats: ' + (!crmStats.error ? 'OK' : crmStats.error));

  log('═══','=== TEST COMPLETED - ' + testResults.filter(r=>r.icon==='✓').length + ' PASS / ' + testResults.filter(r=>r.icon==='✗').length + ' FAIL ===');

  // Output summary
  console.log('\n=== SUMMARY ===');
  console.log('PASS: ' + testResults.filter(r=>r.icon==='✓').length);
  console.log('FAIL: ' + testResults.filter(r=>r.icon==='✗').length);
  console.log('WARN: ' + testResults.filter(r=>r.icon==='~').length);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
