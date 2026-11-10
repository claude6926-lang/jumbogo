'use strict';

const vehicles = {
  box: { name: 'กระบะตู้ทึบ', image: 'pickup-box.jpg', description: 'พื้นที่บรรทุกแบบปิด เหมาะกับการขนย้ายของใช้ในบ้าน กล่องสัมภาระ และสินค้าที่ต้องการหลีกเลี่ยงแดดและฝน', use: 'ย้ายบ้าน · คอนโด · ของใช้ทั่วไป', feature: 'กระบะพร้อมตู้บรรทุกแบบปิด' },
  pickup: { name: 'กระบะ', image: 'pickup.jpg', description: 'คล่องตัวสำหรับงานขนย้ายขนาดเล็ก พื้นที่กระบะเปิดช่วยให้จัดวางและยกสิ่งของได้สะดวก', use: 'ของใช้ไม่มาก · สินค้าชิ้นเล็ก', feature: 'กระบะเปิดโล่ง เข้าถึงของได้ง่าย' },
  cage: { name: 'กระบะคอก', image: 'pickup-cage.jpg', description: 'กระบะพร้อมโครงคอก เหมาะกับสิ่งของที่ต้องการพื้นที่จัดเรียง ควรแจ้งขนาดและลักษณะสิ่งของก่อนเลือกใช้บริการ', use: 'กล่องสินค้า · สิ่งของหลายชิ้น', feature: 'โครงคอกสูง พื้นที่บรรทุกเปิด' },
  jumbo: { name: 'จัมโบ้', image: 'truck-jumbo.jpg', description: 'รถตู้บรรทุกสำหรับงานที่ต้องการพื้นที่มากกว่ากระบะ เหมาะกับการขนย้ายเฟอร์นิเจอร์และสิ่งของหลายรายการ', use: 'เฟอร์นิเจอร์ · อุปกรณ์สำนักงาน', feature: 'ตู้บรรทุกแบบปิดขนาดกลาง' },
  large: { name: 'รถบรรทุกขนาดใหญ่', image: 'truck-large.jpg', description: 'ทางเลือกสำหรับงานขนส่งปริมาณมาก ควรตรวจสอบพื้นที่จอด จุดเข้ารับ และเส้นทางให้เหมาะกับขนาดรถ', use: 'สินค้าปริมาณมาก · งานขนย้ายใหญ่', feature: 'ตู้บรรทุกแบบปิดขนาดใหญ่' }
};
const $ = (selector) => document.querySelector(selector);
const tabs = [...document.querySelectorAll('[data-vehicle]')];
let selectedVehicle = 'box';

function selectVehicle(key) {
  const vehicle = vehicles[key];
  if (!vehicle) return;
  selectedVehicle = key;
  tabs.forEach((tab) => {
    const active = tab.dataset.vehicle === key;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $('#vehicle-panel').setAttribute('aria-labelledby', `tab-${key}`);
  $('#vehicle-image').src = `assets/${vehicle.image}`;
  $('#vehicle-image').alt = `รถ${vehicle.name} JUMBO GO`;
  $('#vehicle-name').textContent = vehicle.name;
  $('#vehicle-description').textContent = vehicle.description;
  $('#vehicle-use').textContent = vehicle.use;
  $('#vehicle-feature').textContent = vehicle.feature;
  $('#choose-name').textContent = vehicle.name;
  $('#vehicle-index').textContent = `0${Object.keys(vehicles).indexOf(key) + 1} / 05`;
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectVehicle(tab.dataset.vehicle));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].focus();
    selectVehicle(tabs[next].dataset.vehicle);
  });
});

$('#choose-vehicle').addEventListener('click', () => {
  $('#plan-vehicle').value = selectedVehicle;
});

const menu = $('.menu-toggle');
function closeMenu() {
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'เปิดเมนู');
  $('#navigation').classList.remove('open');
}
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
  $('#navigation').classList.toggle('open', open);
});
document.querySelectorAll('#navigation a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
});
window.matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
$('#move-date').min = today();
['#origin', '#destination', '#move-date'].forEach((selector) => {
  $(selector).addEventListener('input', () => $(selector).setCustomValidity(''));
});
let summaryText = '';
$('#plan-form').addEventListener('submit', (event) => {
  event.preventDefault();
  $('#move-date').min = today();
  for (const selector of ['#origin', '#destination']) {
    const input = $(selector);
    input.value = input.value.trim();
    input.setCustomValidity(input.value ? '' : 'กรุณาระบุสถานที่');
  }
  if (!event.currentTarget.reportValidity()) return;
  const date = new Date(`${$('#move-date').value}T12:00:00`);
  const rows = [
    ['จุดรับของ', $('#origin').value],
    ['จุดส่งของ', $('#destination').value],
    ['วันที่ขนย้าย', date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['ประเภทรถ', vehicles[$('#plan-vehicle').value].name]
  ];
  $('#plan-summary').replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    return row;
  }));
  summaryText = `แผนขนย้าย JUMBO GO\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\nข้อมูลเบื้องต้น ยังไม่ใช่การยืนยันการจอง`;
  $('#copy-status').textContent = '';
  $('#copy-fallback').hidden = true;
  $('#plan-dialog').showModal();
});
$('#close-dialog').addEventListener('click', () => $('#plan-dialog').close());
$('#plan-dialog').addEventListener('click', (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) event.currentTarget.close();
});
$('#copy-plan').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(summaryText);
    $('#copy-status').textContent = 'คัดลอกรายละเอียดแล้ว พร้อมนำไปใช้ในการจอง';
  } catch {
    const fallback = $('#copy-fallback');
    fallback.value = summaryText;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    $('#copy-status').textContent = 'เลือกข้อความด้านล่างแล้วกดคัดลอกบนอุปกรณ์ของคุณ';
  }
});
